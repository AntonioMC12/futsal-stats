# Análisis forense: eventos de partido ausentes en cloud tras uso offline en iPad

Fecha: 2026-09-21. Alcance: código del repositorio y relato de la incidencia. **No se ha inspeccionado el IndexedDB del iPad afectado, los logs de Supabase ni la revisión exacta instalada en ese dispositivo.** Por ello el mecanismo del incidente concreto sigue sin confirmar. No se ha modificado código funcional ni recuperado datos.

## 1. Resumen ejecutivo

La captura normal de un evento en modo cloud escribe **evento, snapshot de partido y operación de outbox en una transacción Dexie**. La pantalla actualiza su estado tras esperar ese commit. El worker de sincronización es un servicio de aplicación, no pertenece al componente de partido. Por tanto, la hipótesis de una cola abandonada simplemente al cerrar `LiveMatchComponent` queda descartada para el commit analizado.

Hay dos defectos demostrables que permiten pendientes duraderos: (1) si el navegador indica `online` pero la verificación de identidad o Supabase no responden, `runSync()` retorna antes de programar otro intento; (2) un fallo permanente o cinco fallos transitorios ponen un item en `failed` y `scheduleNextAttempt()` detiene **todos** los reintentos automáticos mientras exista cualquier `failed`. Además, un match inicial `ready` se puede publicar mediante `match-upsert` antes de cualquier evento. Su presencia en cloud sin eventos demuestra que la creación llegó, pero no demuestra que se haya publicado el estado final. El estado local tras finalizar es `finished`, no `ready`.

**Causa del caso concreto: POSIBLE**, con mayor probabilidad de cola pendiente/fallida o acceso/auth bloqueado. La decisión entre estas rutas requiere el estado local y `lastError` del iPad.

## 2. Commit y rama analizados

- `master`: `287f3f51984ac4c2d6b8536ef175be1bd0560aca`, igual a `origin/master` tras `git fetch --all --prune`; árbol limpio al inicio. No hacía falta `pull`.
- `develop`: `a7ec9cf`, nueve commits por delante de `origin/develop` y diez por detrás de `master`; su trabajo ya está contenido en `master`. No se cambió de rama ni se hizo merge. La implementación de outbox y sincronización que importa está en `master` (merge de `feature/team-full-data-parity`, posterior a `develop`).
- **Revisión desplegada en el iPad: desconocida.** Comparar la versión de la PWA/cache y el SHA servido antes de atribuir el incidente a este código. La descripción de Auth por email OTP tampoco coincide plenamente con `master`: [auth.service.ts](../../src/app/core/auth/auth.service.ts) usa sesión anónima de dispositivo.

## 3. Arquitectura real del flujo de persistencia

Flujo representativo de un gol, falta o transición de reloj:

```text
LiveMatchPage acción → LiveMatchStore comando/execute
→ función de dominio (Goal/Foul/.../match-lifecycle)
→ MatchEvent con createId() y matchId estable
→ OfflineMatchEventRepository.commit(match, events)
→ transacción Dexie: assert referencias → events.bulkAdd → matches.put
  → enqueueSyncOperation(match-events-commit, dedupeKey match-events:<matchId>)
→ UI actualiza signals solo tras commit; requestSync() no se espera
→ OfflineSyncService.runSync/nextReadyItem
→ SyncRemoteGateway.push → SupabaseMatchEventRepository.commit
→ RPC commit_match_events → upsert_match_snapshot + INSERT match_events
→ complete(): marcar local synced y borrar item de cola
```

Evidencia: [live-match.store.ts](../../src/app/features/live-match/application/live-match.store.ts#L894), [offline-repositories.ts](../../src/app/core/sync/offline-repositories.ts#L270), [sync-remote.gateway.ts](../../src/app/core/sync/sync-remote.gateway.ts#L43), [supabase-match-event.repository.ts](../../src/app/core/persistence/cloud/supabase-match-event.repository.ts#L21), [0002_cloud_foundation.sql](../../database/migrations/0002_cloud_foundation.sql#L231).

Errores de dominio o validación local se muestran en el store sin confirmar el cambio en UI; un error de escritura Dexie aborta la transacción. Un error remoto se conserva en cola con reintento o estado `failed`; `requestSync()` no es una confirmación cloud. El RPC lanza error al cliente cuando Supabase devuelve `error`, y `complete()` solo se ejecuta tras `push()` resuelto. El RPC de evento también escribe el snapshot de match en la misma transacción SQL. Los IDs proceden de [id.ts](../../src/app/core/utils/id.ts); la migración v4 puede remapear IDs legacy, no los actuales.

## 4. Flujo Match vs MatchEvent

| Aspecto | Match | MatchEvent |
|---|---|---|
| Persistencia local | `matches.put/add` | `events.bulkAdd`, con `matches.put` |
| Outbox | `match-upsert`, clave `match:<id>` | `match-events-commit`, clave `match-events:<id>`; múltiples commits se fusionan por ID de evento |
| Trigger | `requestSync()` tras transacción | Igual |
| Cloud | `SupabaseMatchRepository` | `SupabaseMatchEventRepository` |
| RPC | `upsert_match_snapshot` | `commit_match_events`, que llama también a `upsert_match_snapshot` |
| Retry / dedupe | Cola común; upsert idempotente por ID | Cola común; `ON CONFLICT (id) DO NOTHING` para insert |
| Startup | `recoverUnqueuedChanges()` de match pendiente | Recuperación de eventos **solo dentro de match pendiente** |
| Auth/Team | `runSync()` y `nextReadyItem()` comunes | Igual; FK y referencias de evento adicionales |

El match se crea en estado `ready` en [match-setup.ts](../../src/app/features/match-setup/domain/match-setup.ts#L73) y se encola aparte en [offline-repositories.ts](../../src/app/core/sync/offline-repositories.ts#L182). La finalización cambia a `finished` ([match-lifecycle.ts](../../src/app/features/live-match/domain/match-lifecycle.ts#L71)) y pasa por `eventStore.commit()` ([live-match.store.ts](../../src/app/features/live-match/application/live-match.store.ts#L894)); no borra eventos ni espera al cloud. Por ello el estado remoto `ready` es compatible con **solo la operación de creación sincronizada** y ninguna operación posterior.

## 5. Evidencias encontradas

- Atomicidad local: `events.bulkAdd`, `matches.put` y `enqueueSyncOperation` dentro de una sola `db.transaction('rw', …)`; también para `updateEvent`. [offline-repositories.ts](../../src/app/core/sync/offline-repositories.ts#L270). Una suspensión entre esas escrituras abortaría o confirmaría la unidad, no debería dejar medio commit.
- Cola: `pending | failed`, `attempts`, `nextAttemptAt`, `lastError`, marcas de tiempo, `operation` y `dedupeKey`; no hay `processing` persistido. [sync-operation.ts](../../src/app/core/sync/sync-operation.ts#L9), [sync-queue.ts](../../src/app/core/sync/sync-queue.ts#L10).
- `nextReadyItem()` selecciona pendientes vencidos por `createdAt` y omite Teams locales con `accessRevoked`. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L185). Un item fallido no se selecciona automáticamente.
- Tras un fallo, el worker corta el bucle de ese ciclo. A cinco intentos, o para `42501`, otros `22/23` (salvo `23505`), HTTP 400/401/403/404, el item pasa a `failed`. El backoff normal es 1, 2, 4, 8 s y tope 300 s. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L220), [sync-queue.ts](../../src/app/core/sync/sync-queue.ts#L31). No hay fecha inválida en ese cálculo ordinario.
- `scheduleNextAttempt()` retorna si `failedCount() > 0`, aunque queden otros items `pending`. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L533). Hay reintento manual `retryFailed()` en la UI ([live-match-page.ts](../../src/app/features/live-match/ui/live-match-page.ts#L660)).
- En `runSync()`, fallo de verificación de identidad, ausencia de señal `online` o Supabase no conectado causan retorno **antes** de `scheduleNextAttempt()`. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L136). No hay polling periódico global.
- El pull **no borra** eventos ausentes en cloud y evita sobrescribir registros con `syncStatus != synced`; solo itera registros remotos. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L442).
- La recuperación de entradas de cola existentes ocurre al iniciar; la reconstrucción de entradas perdidas de eventos depende de que el `match.syncStatus` sea `pending` y el evento sea `pending`. Eventos `failed` sin cola, o eventos `pending` bajo match `synced`, quedan fuera. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L300).

## 6. Estado de IndexedDB/outbox

Esquema actual: Dexie v8, base `futsal-stats`, tablas `teams`, `players`, `playerProfiles`, `playerPhotos`, `matches`, `events`, `strategies`, `syncQueue`. `matches` y `events` usan PK `id`, `events` indexa `matchId`, secuencia y `[matchId+sequence]`; cola usa PK `id`, índice único `dedupeKey`, `status`, `nextAttemptAt`, `createdAt`, `[status+nextAttemptAt]`. No hay tabla separada de alineaciones locales: el quinteto inicial vive en el snapshot de match; alineaciones en eventos via `lineupPlayerIds`. [futsal-stats.db.ts](../../src/app/core/persistence/local/futsal-stats.db.ts#L15).

No se pueden responder aún las preguntas sobre **si los eventos de este partido se guardaron localmente, si se encolaron y en qué estado están**. El PC y la base cloud no aportan ese dato. La migración v4 hace `clear()` y `bulkPut()` en la misma transacción tras validar referencias; una migración fallida debe abortar, aunque requiere verificación con la versión instalada. [cloud-data-model.migration.ts](../../src/app/core/persistence/local/cloud-data-model.migration.ts#L20). El borrado explícito del partido sí elimina eventos locales y la entrada `match-events` ([offline-repositories.ts](../../src/app/core/sync/offline-repositories.ts#L212)); finalizar no llama a esa ruta.

## 7. Comportamiento al finalizar partido

`finishMatch()` crea snapshot `finished` y posibles eventos de transición, espera el commit local y solo entonces navega fuera de la página. No cambia IDs ni limpia la cola. [live-match-page.ts](../../src/app/features/live-match/ui/live-match-page.ts#L652), [live-match.store.ts](../../src/app/features/live-match/application/live-match.store.ts#L894). El orden cloud entre `match:<id>` y `match-events:<id>` lo decide la cola por creación; la operación de evento hace upsert de su match y resuelve la FK antes del insert. No se exige cola vacía para finalizar. La UI puede indicar éxito local mientras el cloud conserva `ready`.

## 8. Comportamiento al recuperar conexión

`NetworkStatusService` es root y escucha `online/offline` globales, inicializando con `navigator.onLine`; `OfflineSyncService` es proveedor de aplicación, inicializado por [app.config.ts](../../src/app/app.config.ts#L32) después de Auth. Su `effect` llama a sync al pasar a online. No se destruye con LiveMatch. [network-status.service.ts](../../src/app/core/sync/network-status.service.ts#L3), [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L58). En arranque autenticado se ejecutan recuperación, resumen y `syncNow()` si online. No se ve trigger de `visibilitychange`/`focus` para sync; el listener de visibilidad de PWA es para actualizaciones, no para drenar cola. Si el evento `online` llega antes de que Supabase esté disponible, o la PWA reanuda con `navigator.onLine` ya `true`, puede no haber nuevo disparador. Un reinicio completo sí vuelve a intentar, siempre que Auth complete y el item siga `pending`.

## 9. Auth / RLS / Supabase

La sesión se restaura en arranque y `runSync()` revalida la identidad antes de push. Si falla, retorna sin marcar el item; después de un 401/403 durante push, `isPermanent()` lo marca `failed` y no lo reintenta automáticamente. [auth.service.ts](../../src/app/core/auth/auth.service.ts#L58), [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L560). Cambios de identidad huérfana marcan Teams `accessRevoked` y conservan la cola; recuperar membresía puede reanudarla. [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L96).

`commit_match_events` es `SECURITY DEFINER`, comprueba acceso de escritura al Team mediante `upsert_match_snapshot`, valida `match_id`, y luego inserta con PK de evento, FK a match/jugadores/eventos, `unique(match_id, sequence)`, checks de periodo y tiempo, y trigger que asigna `team_id`. Errores de acceso, FK, secuencia, tipo de datos o JSON pueden abortar todo el RPC; el repositorio cliente lanza el error. [0001_initial_cloud_model.sql](../../database/migrations/0001_initial_cloud_model.sql#L65), [0002_cloud_foundation.sql](../../database/migrations/0002_cloud_foundation.sql#L231), [0008_passwordless_identity.sql](../../database/migrations/0008_passwordless_identity.sql#L102). La política RLS permite lectura al miembro del Team; escritura RPC se gobierna principalmente por su comprobación explícita. **No se ha comprobado el esquema/políticas efectivamente desplegados**. `ON CONFLICT(id) DO NOTHING` protege reenvíos idénticos por ID, pero podría ocultar un conflicto de payload con el mismo ID; no garantiza paridad de contenido.

## 10. iPadOS / PWA lifecycle

El código no usa Background Sync ni presupone un `SyncManager`; sí depende de JS activo para `online`, el efecto Angular y `setTimeout`. El sistema operativo puede suspender esos callbacks mientras la PWA está en background. Este hecho no explica por sí solo por qué no hubo recuperación al volver a abrirla: el startup sí intenta drenar `pending`. El riesgo reproducible desde el código es no reintentar cuando la app permanece abierta y Supabase falla con `navigator.onLine=true`. No hay evidencia para atribuir el caso a Safari ni para afirmar evicción de IndexedDB.

## 11. Hipótesis descartadas y pendientes

| Hipótesis del encargo | Resultado en este commit |
|---|---|
| Worker vive en LiveMatch / retry muere al navegar | **Descartada**: servicio de aplicación |
| Solo `online` dispara sync | **Parcial**: también commit, arranque, temporizador y retry manual; falta resume/focus |
| Eventos `pending`/`failed` o `processing` | **Pendiente inspección iPad**; `processing` no existe en el tipo |
| Match y eventos usan pipelines distintos | **Confirmada**: operaciones y RPC distintos |
| Finish pone `ready` o limpia eventos/IDs/cola | **Descartada** en flujo normal: pone `finished`, no borra |
| Sesión ausente, RLS o FK rechazó eventos | **Posible**, depende de `lastError`/logs |
| Pull sobrescribió/borró pendientes | **Descartada** en código analizado |
| Item borrado pese a INSERT fallido | **Descartada** para errores devueltos por RPC; solo `complete()` tras `push()` |
| Retries agotados y `failed` permanente | **Posible y previsto por código** |
| `matchId` local/cloud distinto | **Sin evidencia** en flujo actual; comprobar IDs del iPad |
| Startup recovery no se ejecuta | **Descartada** con Auth válida; falla/omite si Auth no inicializa |

## 12. Causa raíz

- **CONFIRMADA en arquitectura**: no hay garantía de progreso eventual cuando Supabase/identidad están temporalmente inaccesibles pero el navegador permanece online, ni cuando existe cualquier item `failed` ([offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L136), [offline-sync.service.ts](../../src/app/core/sync/offline-sync.service.ts#L533)).
- **MUY PROBABLE como clase del incidente**: una operación `match-events-commit` quedó pendiente, fallida o bloqueada tras la creación remota `ready` del partido.
- **POSIBLE para el incidente específico**: error de auth/permiso, FK, 5xx repetidos, identidad revocada o ausencia de nuevo trigger tras reconexión.
- **NO CONFIRMADA**: causa concreta, datos perdidos y estado del dispositivo. Requieren forense del iPad y comparación del SHA desplegado.

## 13. Secuencia que provoca el bug

Secuencia **demostrable por código**, pendiente de reproducción en el dispositivo: creación del partido `ready` → se sincroniza `match-upsert` → eventos quedan en outbox al perder conectividad → finalizar escribe `finished` y eventos localmente → el navegador marca online, pero Supabase aún no responde → `runSync()` retorna sin temporizador → no hay nuevo evento online ni reanudación de app → cloud conserva `ready` y cero eventos. Una segunda secuencia: cinco fallos o un 401/403/42501 convierten el item en `failed`; cualquier `pending` posterior queda sin temporizador global hasta retry manual.

## 14. Riesgo de pérdida de datos

Cloud/local están inconsistentes. Si `events` y outbox persisten en IndexedDB, es **no sincronización** recuperable; si hay eventos sin cola, hay defecto de recuperación; si no hay ninguno, investigar captura fallida, borrado explícito, migración o pérdida de almacenamiento. El código no prueba pérdida real del partido. Un usuario que borre el partido local, datos del sitio o la PWA antes de extraer IndexedDB sí puede destruir la única copia. El riesgo de recurrencia es alto mientras falten reintentos de vida de app y recuperación completa.

## 15. Propuesta de solución y recuperación

Cambio mínimo: reintentar tras fallo de Cloud/Auth con backoff incluso si `navigator.onLine` sigue true; disparar flush en `visibilitychange` visible, `focus`, restauración Auth/acceso y arranque; no detener todos los pendientes porque haya un item `failed`. Mantener contadores y avisos claros. Cambio estructural: reconciliar eventos locales `pending/failed` **por evento**, independientemente de `match.syncStatus`; modelar dependencias y fallos por Team/operación; registrar intentos y confirmación servidor; probar versión real en iPad. No hace falta migración Dexie para el primer cambio; una nueva cola por evento exigiría migración con preservación de IDs y payloads.

**Recuperación del iPad, sin ejecutar todavía:**

1. Mantener PWA y datos del sitio; desactivar acciones de borrar/importar el mismo partido. Con Safari Web Inspector conectado al iPad (o una copia forense del contenedor), exportar de forma de solo lectura la base `futsal-stats` completa y verificar copia/hash. Anotar versión/SHA de PWA, match ID y hora.
2. Consultar `matches[id]`, `events.where('matchId').equals(id)`, `syncQueue.toArray()` filtrando `operation.entityId===id` y `dedupeKey` `match-events:<id>` / `match:<id>`. Registrar `status`, `attempts`, `nextAttemptAt`, `lastError`, número/IDs/secuencia de eventos y `accessRevoked` del Team. No exportar tokens ni secretos.
3. Comparar IDs/secuencias con `match_events` cloud y logs RPC. Si hay eventos sin item, reencolarlos en **copia de trabajo o mediante procedimiento controlado** con los mismos `event.id`, `matchId`, timestamps, metadata y `dedupeKey`, y un snapshot de match coherente. Si hay item `failed`, resolver primero su error y usar retry explícito. Si está `pending`, activar sync tras verificar Auth y acceso.
4. Ejecutar RPC idempotente con misma identidad autorizada; verificar todos los IDs, secuencias y metadata cloud antes de marcar localmente `synced`/retirar cola. Guardar copia forense hasta validar también desde PC. No reconstruir tiempos ni eventos manualmente.

## 16. Tests de regresión necesarios

Existen tests de atomicidad/rollback y persistencia tras reabrir Dexie en [offline-repositories.spec.ts](../../src/app/core/sync/offline-repositories.spec.ts#L55), cola/merge en [sync-queue.spec.ts](../../src/app/core/sync/sync-queue.spec.ts), y conectividad, fallos permanentes, identidad y acceso en [offline-sync.service.spec.ts](../../src/app/core/sync/offline-sync.service.spec.ts#L76). No prueban el ciclo **captura offline → finalizar → salir → volver red → verificación de todos los IDs cloud**, ni reinicio de aplicación con un match remoto `ready`, fallo Cloud mientras `online=true`, 401 renovado, cinco 5xx, `failed` anterior bloqueando otros pendientes, ni reconciliación de evento sin cola cuando el match está `synced`.

Añadir integración con fake IndexedDB y gateway controlado para los ocho casos del encargo: online normal; 10 eventos y final offline; pérdida a mitad; cierre/reapertura; background; 500 transitorio; sesión expirada/recuperada; muerte durante push. No hay estado persistido `processing`, así que ese último caso debe simular muerte tras envío remoto y antes de `complete()`, comprobando reenvío idempotente. Afirmar IDs, secuencias, estado final `finished` y cola vacía, no solo conteos.

Ejecución de verificación el 2026-09-21: `npx ng test --watch=false --include=src/app/core/sync/offline-repositories.spec.ts --include=src/app/core/sync/offline-sync.service.spec.ts` → **9 pasan, 2 fallan**. Fallan `migrates a local strategy, then restores its complete sequence on another cache` (esperaba un `push` que no ocurrió antes de la aserción) y `keeps old outbox data without pushing it under a replacement identity` (esperaba un `push`, obtuvo cero). Vitest también notificó dos `DatabaseClosedError` asíncronos tras el cierre del fixture. Esto impide considerar la suite de sync como verde; la ejecución por sí sola no demuestra el fallo de eventos del iPad. Investigar la sincronización asíncrona de los tests y el ciclo de vida del temporizador al añadir regresiones.

## 17. Plan de validación PC + iPad

En staging con mismo SHA y migraciones que producción, capturar export local antes/después y filas cloud por ID para cada escenario anterior. Usar modo avión y bloqueo real en iPad, abrir de nuevo la PWA, esperar backoff y forzar 5xx/401 controlados. Verificar que un fallo permanente de otra entidad no impide subir eventos válidos. Comparar cambios de `navigator.onLine`, estado de Cloud/Auth y cronología de push con trazas sin secretos. Repetir en PC para aislar diferencias de lifecycle. La comparación con producción exige acceso a datos del iPad que aún no está disponible.

## 18. Riesgos del fix

Reintentos más frecuentes pueden consumir batería/red y causar RPC duplicadas; conservar idempotencia por ID y limitar backoff. Reconciliación de eventos sin cola puede reenviar payload desactualizado o de identidad revocada; exigir validación de Team, snapshot y comparación cloud. Quitar el bloqueo global debe preservar orden dentro de un match y reportar fallos permanentes sin ocultarlos. Cambios de schema requieren export y rollback verificables.

## Invariantes y no conformidades

| Invariante | Estado | Evidencia/limitación |
|---|---|---|
| 1. Evento confirmado por UI en IndexedDB | GARANTIZADA en flujo normal | Store espera commit Dexie antes de actualizar signals; no cubre evicción posterior del navegador |
| 2. Evento no sincronizado con outbox durable | PARCIAL | Transacción sí; recovery de cola ausente omite match `synced` o evento `failed` |
| 3. Finalizar no elimina pendientes | GARANTIZADA | `finishMatch` llama commit, no delete |
| 4. Estado de match no invalida eventos | GARANTIZADA en push | RPC acepta snapshot `finished`; no filtro `status==='live'` |
| 5. Cerrar/reabrir conserva intención | PARCIAL | Cola Dexie durable; inicialización condicionada a Auth y storage del navegador |
| 6. Recuperar Internet provoca eventual intento | NO GARANTIZADA | Retornos tempranos y ausencia de resume/poll; `failed` bloquea timer |
| 7. `synced` solo tras confirmación servidor | PARCIAL | Se marca tras RPC sin error; no verifica filas/metadata devueltas |
| 8. Pull nunca borra pendientes locales | GARANTIZADA en código analizado | `cacheRemoteSnapshot` hace merge y no elimina ausentes |

- **NON-CONFORMITY OFFLINE-001 (crítica):** no se programa retry cuando Cloud/Auth fallan con señal online. Impacto: cola pendiente sin progreso hasta otro trigger.
- **NON-CONFORMITY OFFLINE-002 (crítica):** un `failed` cualquiera detiene el temporizador de todos los `pending`. Impacto: bloqueo global de operaciones sanas.
- **NON-CONFORMITY OFFLINE-003 (alta):** `recoverUnqueuedChanges` exige match `pending` para descubrir eventos y omite `failed`. Impacto: huecos de recuperación si hay discrepancia de metadata/cola.
- **NON-CONFORMITY OFFLINE-004 (alta):** cloud permite cabecera `ready` sin comprobar eventos ni indicar integridad del cierre. Impacto: vista PC aparentemente válida aunque el partido no se haya publicado.
- **NON-CONFORMITY OFFLINE-005 (media):** confirmación del RPC no devuelve ni compara conjunto de IDs; `ON CONFLICT DO NOTHING` no detecta payload distinto. Impacto: paridad cloud/local insuficientemente verificada.

## Preguntas de cierre

| Pregunta | Respuesta hoy |
|---|---|
| ¿Se guardaron localmente, se encolaron y en qué estado? | Desconocido; inspeccionar iPad. |
| ¿Quién debía sincronizar y por qué pudo no hacerlo? | `OfflineSyncService`; retorno Cloud/Auth, `failed`, acceso revocado o ausencia de trigger. |
| ¿Por qué llegó el match `ready`? | La creación `match-upsert` es independiente y anterior a eventos. |
| ¿Qué pasó al volver la red? | Desconocido en el incidente; el código solo reacciona a transición `online`/otros triggers descritos. |
| ¿Recupera al reiniciar? | Sí para cola `pending` con Auth/acceso válidos; no automáticamente para `failed`; reconstrucción incompleta. |
| ¿Puede repetirse y cómo impedirlo? | Sí; reintentos de vida de app, aislamiento de fallos, reconciliación por evento y tests de extremo a extremo. |

**Siguiente evidencia decisiva:** export forense de IndexedDB del iPad afectado y registros del RPC para ese `matchId`, preservando el dispositivo antes de cualquier actualización o borrado.
