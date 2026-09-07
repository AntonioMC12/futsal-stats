# Database migrations

Las migraciones se ejecutan en orden lexicográfico sobre una base PostgreSQL vacía. La aplicación
Angular todavía no las ejecuta ni se conecta a un backend.

- `0001_initial_cloud_model.sql`: modelo relacional inicial de equipos, jugadores, partidos,
  convocatorias y eventos.

La migración está envuelta en una transacción. Ante un fallo, PostgreSQL revierte el bloque
completo. Como todavía no existe información cloud productiva, el rollback operativo consiste en
descartar la base incompleta y volver a ejecutar las migraciones desde una base vacía. Futuras
migraciones con datos deberán incorporar scripts de avance/recuperación específicos; no se
recomienda editar una migración ya aplicada.
