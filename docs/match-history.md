# Historial de partidos

La Iteración 6 convierte cada partido cerrado en una vista histórica de solo lectura. El listado de
`/matches` permite filtrar por temporada, competición y estado; los partidos terminados abren
`/matches/:matchId`, donde se muestran resultado, faltas por periodo, estadísticas individuales y la
cronología completa.

## Fuente de verdad

El resultado y todos los agregados se reconstruyen al leer `match_events`. No se persiste una segunda
copia de las estadísticas. Los eventos anulados quedan conservados en almacenamiento, pero las
proyecciones de dominio los excluyen mediante el evento compensatorio `EVENT_UNDONE`.

Los partidos nuevos guardan `season` y `competition`. Los registros locales anteriores siguen siendo
legibles: la temporada se deduce de la fecha con inicio en julio y la competición aparece como
`Sin competición`. La versión 5 de IndexedDB añade índices para ambos campos sin eliminar datos.

## Cloud y despliegue

La migración `database/migrations/0004_match_history.sql` añade y rellena los metadatos históricos,
crea índices por equipo y reemplaza `upsert_match_snapshot` para conservarlos. Las consultas continúan
pasando por los repositorios y las políticas RLS existentes, por lo que otro dispositivo enrolado puede
consultar los partidos del Team sin que la UI conozca Supabase.

## Recuperación

La migración SQL es aditiva. Ante una reversión de aplicación, las columnas nuevas pueden permanecer
sin afectar a clientes anteriores. No debe eliminarse la versión 5 de IndexedDB en una reversión: Dexie
abrirá la base existente y las versiones anteriores de la aplicación deben recuperarse mediante el
flujo de exportación/restauración documentado para datos locales.
