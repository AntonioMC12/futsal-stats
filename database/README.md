# Database migrations

Las migraciones se ejecutan en orden lexicográfico mediante el flujo de migraciones de Supabase.
Angular no las ejecuta; en modo cloud utiliza el proyecto configurado por despliegue.

- `0001_initial_cloud_model.sql`: modelo relacional inicial de equipos, jugadores, partidos,
  convocatorias y eventos.
- `0002_cloud_foundation.sql`: identidad anónima, memberships, RLS y repositorios cloud.
- `0003_device_enrollment.sql`: invitaciones de un uso, roles de dispositivo, auditoría y revocación.
- `0004_match_history.sql`: temporada/competición de los partidos, backfill histórico, índices y
  actualización del snapshot cloud.
- `0005_player_profiles.sql`: perfiles deportivos persistentes por jugador, RLS e inserción o
  actualización autorizada mediante RPC.
- `0006_match_csv_import.sql`: importación CSV cloud.
- `0007_current_team_role.sql`: consulta del rol actual del Team.
- `0008_passwordless_identity.sql`: identidad recuperable por email.
- `0009_team_shared_assets.sql`: estrategias Team y bucket privado de fotos con RLS.

Cada migración se aplica en una transacción. Ante un fallo, PostgreSQL revierte ese bloque.
No se debe descartar una base con datos para recuperar una migración fallida ni editar una
migración ya aplicada; preparar una migración correctiva y una copia de seguridad. La migración
`0009` añade tablas y policies sin transformar partidos o perfiles existentes.
