# Hotfix: exportación, quintetos y tiempos

Aplicado sobre la rama existente `hotfix/match-export-lineups-timing`, sin cambiar de base ni modificar la persistencia. No se añaden dependencias.

La reconstrucción temporal de `player-playing-time.ts` produce ahora tiempos por jugador y combinación desde los mismos segmentos efectivos del reloj. `match-statistics.ts` reutiliza ese resultado y añade goles y disciplina. Se mantienen las combinaciones de tres y cuatro jugadores para conservar las estadísticas de inferioridad existentes.

Los quintetos repetidos se agrupan por IDs ordenados. Las pausas no crean apariciones nuevas; las sustituciones sí, incluso con duración cero. Los cambios del descanso solo determinan la alineación que inicia el siguiente periodo. Los periodos adicionales cuentan en el total, sin sumarse a ninguna mitad.

El CSV conserva las columnas anteriores en su orden, añade cuatro columnas de tiempos por mitad y las secciones EVENTOS y QUINTETOS. EVENTOS incluye el historial íntegro, los eventos deshechos y sus metadatos originales, ordenados por secuencia y timestamp. Las estadísticas siguen excluyendo acciones deshechas. Se conservan BOM, comas, CRLF y escaping.

La política de parada permite únicamente goles y faltas. El store guarda el evento, la parada y el estado del partido en la misma transacción existente. La pantalla conserva la parada al abrir los flujos de gol/falta; disciplina de banquillo y reposiciones conservan el reloj. Las sustituciones ya conservaban su estado y ahora tienen cobertura adicional.

## Archivos

- `live-match/domain/player-playing-time.ts`: cálculo temporal compartido, tiempos por mitad y apariciones.
- `live-match/domain/match-statistics.ts`: consumo del cálculo compartido.
- `live-match/domain/event-clock-policy.ts`: política explícita de parada.
- `live-match/domain/match-timeline.ts`: reutilización de descripciones de eventos en el CSV.
- `live-match/application/live-match.store.ts`: parada transaccional para goles y faltas.
- `live-match/ui/live-match-page.ts` y `.html`: política y estadísticas ampliadas.
- `matches/domain/match-export.ts` y `match-csv.ts`: proyección y serialización.
- Pruebas actualizadas en los cinco archivos `.spec.ts` correspondientes a tiempos, estadísticas, store, pantalla y CSV.

Las rutas anteriores son relativas a `src/app/features/`.

## Verificación

- `node node_modules/@angular/cli/bin/ng.js test --watch=false`: **309 pruebas, 51 archivos, todas pasan**. Se añaden ocho casos, incluida una matriz de cuatro acciones con reloj en marcha/parado y recarga.
- `node node_modules/@angular/cli/bin/ng.js build --configuration production`: **correcto**. El empaquetador avisa de uso de `eval` en un chunk generado; no impide compilar.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.spec.json`: **correcto**.
- Prettier `--check` sobre todos los archivos TS/HTML modificados y la nueva política: **correcto**.
- `git diff --check`: **correcto**.
- El intento `npm test -- --watch=false` fue rechazado por el parser de npm del entorno; se ejecutó directamente la misma CLI local de Angular.
- **Lint no disponible**: no existe script ni target de lint. Prettier y TypeScript no se presentan como sustitutos equivalentes de un linter.

## Criterios de aceptación

| Criterio | Estado / evidencia |
| --- | --- |
| CSV conserva información anterior | Verificado: cabeceras y valores anteriores, pruebas CSV |
| CSV contiene todos los eventos | Verificado: orden, recuento, operativos, sustituciones y deshacer |
| CSV contiene QUINTETOS | Verificado: misma proyección que estadísticas |
| UI muestra combinaciones | Verificado en pruebas de componente; pendiente revisión visual real |
| Quinteto repetido se agrega | Verificado: una fila, tiempo acumulado y apariciones |
| Tiempos coherentes con cambios/reloj | Verificado: cálculo compartido y pruebas temporales |
| Sustitución conserva estado | Verificado en marcha y parado, sin eventos de reloj adicionales |
| Goles detienen el reloj | Verificado en store y pantalla |
| Faltas detienen el reloj | Verificado en store y pantalla |
| Otros eventos conservan estado | Política limitada a goles/faltas; pruebas de tarjeta y sustitución |
| Cada jugador muestra total y ambas mitades | Verificado en proyección y componente |
| Total suma los periodos aplicables | Verificado: 390 + 495 = 885 segundos y periodo adicional |
| Sin tiempo durante pausas/descanso | Verificado, incluidos dos cambios consecutivos parado |
| Persistencia y recarga coherentes | Verificado con reconstrucción tras recarga y pruebas existentes de repositorios |
| Tests pasando | Sí: 309/309 |
| Lint pasando | Pendiente: proyecto sin linter configurado |
| Build de producción pasando | Sí |
| Sin regresiones conocidas | Suite completa correcta; validación visual manual pendiente |

Quedan pendientes la revisión manual en navegador de escritorio, tablet/iPad y móvil, y la apertura del CSV en Excel/LibreOffice. No se dispone de navegador de pruebas en esta sesión. Las pruebas automatizadas cubren los flujos existentes de inicio, reloj manual, goles, faltas, cambios, disciplina, periodos, finalización, estadísticas y exportación.

## PR preparado

Título: `fix(match): export full history and share lineup period timing`

Destino: `master`.

Descripción: El CSV incorpora el historial completo y los quintetos utilizados, y las estadísticas muestran tiempo total y por mitad. Un cálculo compartido conserva las pausas, agrupa combinaciones repetidas y mantiene el reloj durante cambios, tarjetas de banquillo y reposiciones; goles y faltas se guardan junto con su parada. Validación: 309 pruebas, compilación de producción, TypeScript y formato correctos. Pendientes revisión visual y lint no configurado.

PR no publicado: los cambios quedan locales y no hay CLI `gh` disponible. Tras revisar y fusionar en `master`, propagar a `develop` según el flujo del proyecto. No se ha realizado merge ni despliegue.
