# Iteración: disparos, paradas y faltas recibidas

## Objetivo y cambios

Las acciones rápidas registran `SHOT` (resultado `on_target` u `off_target`), `SAVE` y `FOUL` del rival con `receivedByPlayerId` opcional. El registro usa el repositorio de eventos existente: escritura local, outbox y sincronización idempotente. La selección y confirmación de disparos, paradas y faltas recibidas exige un jugador del quinteto actual; el receptor de una falta puede omitirse. La posición libre del jugador no permite identificar al portero con certeza, así que la parada ofrece el quinteto completo. El reloj no cambia con estas tres acciones.

Las estadísticas de partido y perfil derivan de eventos activos. `shotsTotal = shotsOnTarget + shotsOffTarget`; las faltas sin receptor no cuentan. Undo crea `EVENT_UNDONE`, sin modificar el evento original. La cronología y CSV muestran los nuevos datos.

Desde la iteración del 22 de septiembre, cada `GOAL_FOR` con goleador en un partido v2 aporta también un disparo total y un tiro a puerta al goleador desde la misma proyección. No se crea un evento `SHOT` adicional. Véase [la auditoría de la iteración](2026-09-22-goal-shot-on-target-and-shot-modal-spacing.md).

## Compatibilidad histórica

`Match.statisticsSchemaVersion = 2` se asigna al crear nuevos partidos. Un valor ausente significa métricas no registradas (`null` en dominio, celda vacía o raya en presentación). No se rellena ni se infiere para partidos anteriores. Los agregados de perfil suman solo partidos v2 y exponen `trackedMatches`; los CSV antiguos se importan sin marca. El CSV actual incluye `statisticsSchemaVersion` en metadatos, separado de la versión del formato CSV, que permanece en 2.

## Persistencia y migración

`0013_match_statistics_schema_version.sql` añade una columna nullable sin backfill. El wrapper del RPC de snapshot conserva el control de acceso anterior y persiste la marca; la tabla de eventos existente admite los nuevos tipos y metadatos. Antes del despliegue de la aplicación cloud debe aplicarse la migración. Para recuperar, se puede revertir la aplicación y conservar la columna; los clientes antiguos ignoran la marca. No eliminarla mientras existan partidos v2.

## Verificación y límites

Se añadieron pruebas de registro, proyección, undo y CSV nuevo/antiguo. Ejecutar `npm test` y `npm run build`. No hay script `lint`; se usa la comprobación de formato del repositorio. El rol de portero no tiene un valor normalizado, por eso la selección de parada es manual. No se realizó despliegue cloud ni prueba física en iPad.

Archivos principales: modelos `match.ts` y `match-event.ts`; dominio `shot-save.ts`, `foul.ts`, `match-statistics.ts`; `live-match.store.ts`; `live-match-page.ts/html`; exportador e importador CSV; perfil; mapper cloud; migración 0013.
