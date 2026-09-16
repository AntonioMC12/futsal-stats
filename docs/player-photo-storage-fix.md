# Fotografías de jugador en Storage

## Diagnóstico

`database/migrations/0009_team_shared_assets.sql` creó las policies `player_photos_read`, `player_photos_insert`, `player_photos_update` y `player_photos_delete` con casts directos de `split_part(name, '/', 2)::uuid` y, para escritura, `split_part(name, '/', 4)::uuid`. En PostgreSQL, `split_part` devuelve `''` cuando falta un segmento. Una evaluación de esas policies sobre un nombre incompleto intenta convertir `''` a UUID y produce el HTTP 400 observado, en vez de denegar el acceso. El path válido comunicado contiene ambos UUID; sin trazas del servidor no se puede afirmar qué otro `name` se evaluó durante el upload con upsert.

La migración `0011_fix_player_photo_storage_policies.sql` reemplaza esas expresiones por `private.can_access_player_photo`. El helper exige una ruta completa y dos UUID sintácticamente válidos antes de cualquier cast, comprueba el jugador y su Team, y exige pertenencia de Team para lectura o rol owner/editor para escritura. Las rutas incompletas devuelven `false`. El bucket continúa privado, con máximo 5 MB y MIME JPEG, PNG o WebP. Se conservan los objetos existentes con nombre `profile`.

## Persistencia y reemplazo

El cliente valida ambos IDs y construye una ruta `teams/{teamId}/players/{playerId}/profile-{photoId}` en `player-photo-path.ts`. Cada reemplazo usa un objeto nuevo. El caso de uso guarda primero la nueva referencia en el perfil, después elimina la foto anterior; si falla el guardado del perfil, intenta eliminar solo el objeto nuevo. `photoRef` se guarda en los metadatos de `player_profiles`; `photo_url` permanece vacío para las fotos nuevas. Otro dispositivo recupera `photoRef` y descarga el objeto del bucket privado. No se persisten URLs firmadas.

En modo offline la foto y el perfil se guardan localmente y se envían por la cola existente. La confirmación inmediata indica guardado local; la sincronización remota puede fallar después y debe revisarse en el estado de sincronización. Storage y PostgreSQL no comparten una transacción: si falla la eliminación compensatoria, queda un objeto huérfano para limpieza, pero la referencia anterior no se sustituye en el perfil. La clave nueva evita sobrescribir la imagen anterior antes de confirmar el cambio.

## Aplicación y verificación

Aplicar la migración `0011` después de `0010` en el proyecto Supabase. Antes de usar el cliente actualizado, confirmar que las cuatro policies nuevas y la función privada están presentes. Probar upload, recarga, segundo dispositivo del mismo Team, reemplazo, viewer, otro Team y las rutas `teams//players/{uuid}/profile` y `teams/{uuid}/players//profile`. La instalación local no incluye un servidor PostgreSQL/Supabase, por lo que las pruebas RLS y entre dispositivos requieren el entorno conectado.
