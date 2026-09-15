# Importación de partidos CSV

Futsal Stats acepta como copia portable los CSV creados por la opción **Exportar CSV**. La importación se abre desde **Partidos → Importar partido** y siempre crea un partido finalizado en el equipo activo.

## Formato y versiones

El formato actual es `futsal-stats-csv/1`. Conserva una primera tabla legible de estadísticas por jugador y tres secciones:

- `EVENTOS`: historial completo; el campo `metadata` contiene los datos primarios del `MatchEvent`.
- `QUINTETOS`: proyección de los quintetos usados, empleada para validar y presentar el resumen.
- `METADATOS`: versión, ID original, abreviación del rival y descripción.

Los CSV anteriores a la sección `METADATOS` siguen siendo compatibles. Los campos ausentes no se inventan: el usuario ve advertencias y el rival recibe una abreviación derivada solo para la referencia visual local.

Son obligatorias las columnas `fecha`, `equipo`, `rival`, `dorsal`, `jugador` y `titular`. El analizador admite campos RFC 4180 entrecomillados, comas, saltos de línea, tildes y BOM UTF-8. Rechaza archivos mayores de 5 MB, estructura corrupta, fechas o jugadores inválidos, eventos ilegibles, IDs duplicados y referencias rotas. El contenido se trata siempre como texto y nunca se evalúa.

## Flujo

1. El navegador lee el archivo una vez, sin persistir datos.
2. El adaptador normaliza el documento y clasifica incidencias como `info`, `warning`, `error` o `fatal`.
3. La vista previa muestra partido, recuentos y avisos.
4. Cada jugador se vincula por ID estable, por dorsal + nombre normalizado, se sugiere manualmente por nombre o se crea. Un nombre aislado nunca se vincula silenciosamente.
5. El caso de uso valida de nuevo, remapea IDs de partido, jugadores y eventos a UUID locales y guarda jugadores, partido y eventos atómicamente.
6. Las estadísticas se obtienen de `MatchEvent`; los agregados del CSV solo sirven para detectar inconsistencias, como un marcador distinto.

## Duplicados y atomicidad

La detección prioriza el ID original y después un fingerprint SHA-256 determinista de fecha, rival, jugadores y eventos. El fingerprint y los datos de procedencia se guardan en `Match.importMetadata`. No hay sobrescritura: una coincidencia dirige al partido existente.

`MatchEventRepository.importMatch` representa la unidad atómica. Dexie incluye jugadores, partido y eventos en una única transacción. El repositorio offline incluye también sus operaciones de sincronización. Cloud usa la función transaccional `import_match_from_csv` de la migración `0006_match_csv_import.sql`; un índice único protege el fingerprint ante carreras. Si la operación falla no queda ninguna de esas entidades parcialmente creada.

## Compatibilidad export/import

El contrato principal es `Match → buildMatchStatisticsExport → serializeMatchCsv → CsvMatchImportParser → ImportMatchFromCsvUseCase`. Los UUID locales pueden cambiar, pero convocatoria, titulares, eventos, sustituciones, marcador y proyecciones estadísticas conservan su significado. Los quintetos se recalculan desde los eventos; la sección exportada se usa como comprobación y resumen, no como segunda fuente de verdad.

Para añadir una versión, implemente otro `CsvImportAdapter` que produzca `ImportedMatchDto` sin acoplar el dominio al CSV. Excel, proveedores externos, merge y overwrite quedan fuera de este formato.

