# Database migrations

Las migraciones se ejecutan en orden lexicográfico sobre una base PostgreSQL vacía. La aplicación
Angular todavía no las ejecuta ni se conecta a un backend.

- `0001_initial_cloud_model.sql`: modelo relacional inicial de equipos, jugadores, partidos,
  convocatorias y eventos.
- `0002_cloud_foundation.sql`: identidad anónima, memberships, RLS y repositorios cloud.
- `0003_device_enrollment.sql`: invitaciones de un uso, roles de dispositivo, auditoría y revocación.
- `0004_match_history.sql`: temporada/competición de los partidos, backfill histórico, índices y
  actualización del snapshot cloud.
- `0005_player_profiles.sql`: perfiles deportivos persistentes por jugador, RLS e inserción o
  actualización autorizada mediante RPC.

La migración está envuelta en una transacción. Ante un fallo, PostgreSQL revierte el bloque
completo. Como todavía no existe información cloud productiva, el rollback operativo consiste en
descartar la base incompleta y volver a ejecutar las migraciones desde una base vacía. Futuras
migraciones con datos deberán incorporar scripts de avance/recuperación específicos; no se
recomienda editar una migración ya aplicada. La migración `0004` es aditiva; ante una reversión del
cliente sus columnas pueden permanecer sin afectar a versiones anteriores.
