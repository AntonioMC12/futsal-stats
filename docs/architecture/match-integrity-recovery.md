# Integridad y recuperación de partidos

La finalización deportiva (`match.status = finished`) y la verificación técnica son estados distintos. El cierre escribe el match, sus eventos y una operación de outbox en una transacción Dexie. La misma transacción guarda `matchIntegrity`, un manifiesto local con los IDs de eventos, de eventos con quinteto y de jugadores de plantilla esperados. La cola publica el manifiesto remoto **después** del commit de eventos mediante la migración SQL `0012_match_integrity_manifest.sql`.

## Estados

`pending` indica cierre local aún no comprobado; `mismatch` indica diferencia comprobada contra cloud; `unreachable` indica que cloud no pudo consultarse; `repairing` indica operación durable reencolada; `verified` exige consulta real a Supabase de match, IDs de eventos, alineaciones, jugadores y manifiesto publicado. `unknown` cubre partidos anteriores a esta versión sin manifiesto confiable. Un PC no declara `verified` por coincidir con su propia caché cloud.

## Verificación

`MatchIntegrityService.verify(matchId)` lee un solo match en Dexie y consulta únicamente IDs filtrados por match en Supabase. Compara conjuntos ordenados y estado `finished`, Team y firma del manifiesto. Recuentos iguales con IDs distintos son `mismatch`. El checksum se forma de IDs estables; las fechas de intento y metadatos de cola no intervienen. El estado guardado localmente es un resultado reciente para UI, nunca sustituye una verificación solicitada por el usuario.

## Reparación

`repair(matchId)` requiere el manifiesto **original local** y permiso de escritura del Team. Calcula IDs de evento/quinteto ausentes y reemplaza de forma transaccional la operación `match-events:<id>` por únicamente esos eventos, con sus IDs, tiempos y metadata originales. Reencola también `match-integrity:<id>`. Un evento remoto desconocido detiene la reparación automática para evitar sobrescritura de otro dispositivo. El RPC de eventos inserta por ID de forma idempotente; al acabar se consulta cloud de nuevo. La reparación sobrevive a cierre porque las dos operaciones se guardan en IndexedDB. El arranque y el resume intentan drenar la cola y revisar manifiestos pendientes. El worker vuelve a intentar cuando Supabase/Auth están indisponibles aunque `navigator.onLine` siga en true, y un item `failed` no detiene el temporizador de todos los pendientes.

La cola conserva `pending` durante el envío y solo borra el item después de la respuesta satisfactoria del servidor. No persiste un estado `processing`; si la PWA muere tras el envío y antes del borrado, el siguiente arranque reenvía el mismo ID y el RPC idempotente evita otra fila.

HTTP 401 se conserva como transitorio con backoff y provoca revalidación de identidad; una recuperación de acceso al Team reactiva fallos previos para un intento controlado. HTTP 403 sigue siendo un fallo de permiso que requiere restaurar acceso o intervención del usuario.

## Observabilidad y seguridad

Las trazas `[INTEGRITY]` registran match ID, Team ID, número de eventos, faltantes y resultado, sin credenciales. El cliente usa la sesión de Supabase; la tabla remota solo admite lectura para miembros del Team y el RPC de publicación comprueba permiso de escritura. No se usa service role en Angular.

## Validación en dispositivos

Después de aplicar la migración SQL en staging, iniciar un partido en iPad, registrar eventos con y sin red, finalizar offline y cerrar la PWA. Al abrirla con red, comprobar que el manifiesto y todos los IDs aparecen en Supabase, sin duplicados, y que el detalle indica `verified`. Abrir el mismo Team desde PC: debe consultar cloud y mostrar `verified` solo tras comparar el manifiesto. Repetir con 500 y 401 temporales, y con 17 eventos ausentes para comprobar el reencolado diferencial. No existe un runner E2E de navegador/iPad en este repositorio; la prueba automatizada `offline-match-recovery.integration.spec.ts` cubre el cierre offline y la reapertura de IndexedDB con un gateway simulado, no sustituye la validación real entre dispositivos.

## Limitaciones y no conformidades

- `NON-CONFORMITY OFFLINE-001/002` del [análisis forense](../debug/offline-match-events-sync-root-cause.md): mitigadas con retry de Cloud/Auth, triggers de resume y eliminación del bloqueo global por `failed`.
- Los partidos históricos sin manifiesto original quedan `unknown`. **No** se genera un manifiesto desde cloud para ellos: convertiría una copia incompleta en una falsa garantía. Si el dispositivo capturador conserva sus eventos, se requiere un procedimiento controlado para crear/publicar un manifiesto confiable.
- Al actualizar Dexie, un partido terminado con eventos locales `pending/failed` o una operación `match-events` todavía en cola sí puede reconstruir el manifiesto desde ese dispositivo; esas marcas son evidencia de captura local que una caché descargada de cloud no posee.
- La firma compara IDs, no contenido completo de metadata ni tiempos. Las correcciones locales invalidan `verified` y se sincronizan mediante el outbox existente, pero una comprobación de igualdad de payload campo a campo requeriría una firma adicional del contenido.
- Para quintetos se comparan los IDs de los eventos que poseen snapshot; todavía no se firma cada pareja evento-jugador. Una alineación remota con un jugador faltante dentro de un snapshot existente requiere auditoría de payload más detallada.
- Las consultas de PostgREST pueden paginar colecciones muy grandes; el flujo normal de partidos cabe en una respuesta, pero antes de afirmar integridad de partidos con más de 1000 eventos se debe paginar la consulta.
- La reparación automática no elimina eventos remotos inesperados. Si faltan datos locales, se necesita investigación manual del dispositivo capturador.
