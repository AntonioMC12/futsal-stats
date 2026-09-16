# Auditoría de paridad de datos del Team

Estado observado en `feature/team-full-data-parity` antes de la implementación. En la columna RLS, «Team» significa que la política o función comprueba `private.can_access_team`; la UI por sí sola no cuenta como autorización.

| Feature | Local | Cloud | Team | Repository / origen | RLS | Storage | Offline | Otro dispositivo | Estado y acción |
|---|---|---|---|---|---|---|---|---|---|
| Team y ajustes (nombre, siglas, logo) | Dexie | `teams` | Propio | TeamRepository | Team | — | Cola | Sí | OK |
| Membership, roles, invitaciones | Caché de rol | `team_memberships`, RPC | Propio | DeviceEnrollmentService | Team/owner | — | Lectura de caché | Sí | PARTIAL: revalidar revocación y limpiar caché |
| Players | Dexie | `players` | Directo | OfflinePlayerRepository | Team | — | Cola | Sí | OK |
| PlayerProfiles | Dexie | `player_profiles` | Directo y jugador | OfflinePlayerProfileRepository | Team | — | Cola | Sí | OK, salvo foto |
| PlayerPhotos | Blob Dexie | Referencia en metadata, blob ausente | Directo en clave | DexiePlayerPhotoRepository | Ninguna para blob | Local | Solo local | No | LOCAL_ONLY: Storage privado, migración y caché |
| Matches nativos | Dexie | `matches`, `match_players` | Directo | OfflineMatchRepository | Team | — | Cola | Sí | OK |
| ImportedMatches | Dexie | `matches` y RPC de importación | Directo | OfflineMatchEventRepository | Team | — | Cola | Sí | OK |
| MatchPlayers | Dentro de Match | `match_players` | Por partido | SupabaseMatchRepository | Team | — | Cola del Match | Sí | OK |
| MatchEvents y quintetos | Dexie | `match_events`, snapshots | Por partido | OfflineMatchEventRepository | Team | — | Cola | Sí | OK |
| Estadísticas, jugador, temporada y carrera | Cálculo desde partidos/eventos | Cálculo desde snapshot cloud | Por partido | Servicios de estadísticas | Heredada | — | Caché de eventos | Sí | OK si el snapshot converge |
| Strategies, secuencias, piezas y flechas | Dexie | Ausente | `Strategy.teamId` | DexieStrategyRepository | Ausente | — | Solo local | No | LOCAL_ONLY: tabla, RLS, repositorio y cola |
| StrategyAssets | No hay adjuntos fuente | Ausente | — | Se generan en UI | — | — | — | Sí al reconstruir | OK, sin blob fuente |
| TeamSettings locales | Preferencias de UI | No corresponde | — | localStorage | — | Local | Sí | No requerido | OK |

El identificador del Team es la frontera de datos; la membership concede acceso; Dexie es almacenamiento operativo y caché; Supabase es persistencia compartida. Los cambios de estrategia y foto deben seguir la cola durable existente. La revocación debe invalidar el acceso local al Team cuando una consulta cloud confirme que ya no existe membership.

## Después de la implementación

| Recurso | Cambio | Estado verificable en código |
|---|---|---|
| Strategies, secuencias y animación | `strategies` con RLS, JSONB de fases, repositorio cloud, outbox y tombstone | Cross-device tras sync; prueba de recuperación de secuencias |
| PlayerPhotos | Bucket privado con policies de membership y jugador, upload, descarga y caché | Cross-device tras sync; prueba de migración de blob local |
| Revocación | Pull marca Teams previamente sincronizados y ahora ausentes como revocados | Workspace y rol local invalidados; prueba de ocultación |
| Resto de entidades | Se mantienen los repositorios, RPC y RLS existentes | Suite de regresión |

Validación pendiente fuera del repositorio: aplicar la migración en un proyecto Supabase, ejecutar una matriz real OWNER/EDITOR/VIEWER/sin membership, y repetir el recorrido PC ↔ iPad con fotos, estrategia, partidos, estadísticas y revocación. No hay credenciales ni dispositivos disponibles en este entorno.

## Matriz de autorización

| Recurso | OWNER | EDITOR | VIEWER | Sin membership |
|---|---|---|---|---|
| Team, players, profiles, matches, events | Lectura y escritura | Lectura y escritura deportiva | Lectura | Sin acceso |
| Strategies y secuencias JSONB | Lectura y escritura | Lectura y escritura | Lectura | Sin acceso |
| Fotos en Storage privado | Lectura, upload y borrado | Lectura, upload y borrado | Lectura | Sin acceso |
| Memberships e invitaciones | Administración | Sin administración | Sin administración | Sin acceso |
