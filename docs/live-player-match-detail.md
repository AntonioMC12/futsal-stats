# Detalle live del jugador

Desde cualquier fila de las estadísticas completas o del resumen de tablet se abre un detalle flotante del jugador. La vista conserva debajo el panel de estadísticas, su scroll y la selección de origen. El botón de cierre y Escape cierran únicamente el detalle y devuelven el foco al jugador.

El panel muestra identidad, posición disponible, estado actual, tiempo total y por mitad, último movimiento, entradas/salidas agrupadas por periodo, tramos efectivos y las métricas existentes. Los estados incluyen expulsado para no presentar como suplente disponible a un jugador sancionado. Los instantes del historial son **tiempo restante**, igual que el cronómetro de la aplicación.

## Arquitectura y archivos

Rutas relativas a `src/app/features/live-match/`:

| Archivo | Responsabilidad |
| --- | --- |
| `domain/player-playing-time.ts` | Extiende la reconstrucción existente con tramos por jugador y una proyección del segmento activo |
| `domain/match-statistics.ts` | Combina esos mismos tiempos con goles y disciplina; reutilizable por pantalla y CSV |
| `application/live-match.store.ts` | Memoriza la reconstrucción por partido/eventos y proyecta el reloj existente |
| `domain/player-match-detail.ts` | DTO de lectura y movimientos del jugador seleccionado desde eventos activos |
| `ui/player-match-detail.ts`, `.html`, `.scss` | Diálogo nativo, signals derivados, detalle y diseño adaptable |
| `ui/live-match-page.ts`, `.html`, `.scss` | Apertura desde filas y gestión de selección/cierre |
| `domain/player-match-detail.spec.ts` | Ocho pruebas del dominio y de la proyección temporal |
| `ui/live-match-page.spec.ts` | Cuatro casos adicionales de interacción, foco y reloj |

Se implementa sobre los cambios locales del hotfix anterior, que se conservan. No se ha cambiado de rama, creado un commit ni publicado un PR.

## Cálculo y rendimiento

Los tramos se abren y cierran durante la misma reconstrucción que calcula los minutos oficiales. Acumulan exclusivamente segmentos con el reloj en marcha, se cierran al terminar el periodo/partido o salir el jugador y se reabren con la alineación efectiva al comenzar el siguiente periodo. Los cambios del descanso no generan minutos ni tramos ficticios. El total y los tiempos por mitad del detalle proceden directamente de las estadísticas de la tabla.

La reconstrucción de eventos se memoriza con `computed`. Cada tick proyecta tiempo sobre el segmento activo sin volver a recorrer eventos ni recalcular goles o disciplina individual. Se reutilizan los tramos cerrados. El historial de movimientos depende del jugador seleccionado, los eventos y el roster, no del reloj. No hay temporizadores nuevos, suscripciones manuales, datos persistidos adicionales ni dependencias nuevas.

Un solo evento de sustitución produce las perspectivas «entra por» y «sale por». Los eventos deshechos se excluyen mediante el selector existente; entradas iniciales, reposiciones y salidas por expulsión también se representan. Los jugadores relacionados desconocidos tienen una etiqueta legible, sin exponer IDs técnicos.

## Verificación

- `node node_modules/@angular/cli/bin/ng.js test --watch=false`: **321 pruebas correctas en 52 archivos**, incluidas las 309 del hotfix.
- `node node_modules/@angular/cli/bin/ng.js build --configuration production`: **correcto**.
- `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.spec.json`: **correcto**.
- Prettier `--check` sobre los archivos modificados/nuevos: **correcto**.
- `git diff --check`: **correcto**.
- **Lint no configurado**: el repositorio no dispone de script ni target de lint. La comprobación de formato y tipos no equivale a un linter.

Las pruebas cubren titular sin cambios, suplente sin participación, las dos perspectivas de un cambio, cambios repetidos, descanso, suma de tramos, pausa, finalización, expulsión, nombres ausentes, deshacer y recarga. Una prueba impide explícitamente recorrer el array de eventos después de crear la proyección para verificar el comportamiento por tick.

Los casos de componente comprueban identidad, estado, ambas mitades, historial, apertura desde una celda o desde el resumen, cierre con botón/Escape/cancel, devolución de foco, conservación del scroll y ausencia de cambios en el reloj y los eventos.

## Validación en navegador

Se utilizó Chromium headless con perfil aislado y datos de prueba locales, servido mediante Angular en `127.0.0.1:4201`. Se comprobó el diálogo nativo en la capa modal del navegador, apertura con Enter, navegación con Tab, cierre con Escape, foco devuelto al jugador, cabecera fija al hacer scroll y conservación del scroll del panel de origen.

Las comprobaciones del navegador también verificaron que el reloj y los eventos permanecen idénticos al abrir/cerrar con reloj parado y corriendo, y que el tiempo visible avanza en este último caso.

| Tamaño comprobado | Resultado | Captura |
| --- | --- | --- |
| Escritorio, 1440 × 1000 | Panel centrado, dos columnas, sin desbordamiento horizontal | [Escritorio](screenshots/player-detail-desktop.png) |
| Tablet, 1024 × 768 | Panel adaptable, scroll interno y cabecera visible | [Tablet](screenshots/player-detail-tablet.png) |
| Móvil, 390 × 844 | Pantalla completa, una columna, sin scroll horizontal | [Móvil](screenshots/player-detail-mobile.png) |

La validación de tablet/móvil se hizo con tamaños emulados en Chromium; no sustituye una prueba en Safari de un iPad físico. La compilación mantiene el aviso del empaquetador sobre `eval` en un chunk generado, ya observado en el hotfix.

Los criterios funcionales, estados vacíos, fuente única de datos, pruebas y compilación quedan verificados. El criterio de lint queda pendiente de que el proyecto lo configure; la validación específica en iPad/Safari físico no se ha realizado.
