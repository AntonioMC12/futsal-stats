# Perfiles de jugador

La Iteración 7 introduce una ficha deportiva persistente y una proyección estadística individual.
Cada jugador dispone de una ruta `/players/:playerId` accesible desde la plantilla.

## Datos persistidos

`PlayerProfile` es una entidad separada de `Player`. Conserva URL de foto, pie preferente, notas
técnicas, metadatos extensibles y timestamps. IndexedDB usa la versión 6 con la tabla
`playerProfiles`; PostgreSQL incorpora `player_profiles` mediante
`database/migrations/0005_player_profiles.sql`.

La lectura cloud está protegida por la pertenencia al Team. La escritura solo se concede mediante
`upsert_player_profile`, que comprueba acceso de escritura y que el jugador pertenece al mismo Team.
Un dispositivo `viewer` puede consultar el perfil y sus estadísticas, pero no modificarlo.

## Estadísticas reproducibles

No se persisten agregados. La aplicación obtiene los partidos finalizados del Team, carga sus eventos
y reutiliza las proyecciones de dominio del partido. Desde ellas calcula:

- convocatorias, apariciones y titularidades;
- tiempo total y minutos por partido;
- goles, goles por partido y goles por 40 minutos;
- goles a favor/en contra en pista y balance `+/-`;
- faltas, amarillas y expulsiones;
- victorias, empates, derrotas y porcentaje de victorias.

El selector de temporada filtra los partidos antes de agregar. La opción de carrera usa el mismo
cálculo sobre todas las temporadas, evitando mezclar datos en una vista estacional. Los eventos
anulados se excluyen mediante `EVENT_UNDONE`, igual que en el detalle de partido.

## Compatibilidad y recuperación

La migración es aditiva y los jugadores existentes funcionan sin perfil: la UI construye una ficha
vacía hasta el primer guardado. Los bundles locales nuevos incluyen perfiles y el deserializador sigue
aceptando bundles anteriores sin esa colección. Ante una reversión, la tabla cloud puede permanecer sin
afectar a clientes antiguos.
