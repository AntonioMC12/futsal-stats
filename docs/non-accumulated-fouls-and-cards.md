# Faltas no acumulables y tarjetas

El contador del marcador se deriva exclusivamente de eventos `FOUL` para los que
`countsAsAccumulatedFoul` sea `true`. La función pura
`countsAsAccumulatedFoul(event)` es la única regla de compatibilidad: los eventos
históricos `FOUL` sin el campo nuevo conservan su semántica acumulable anterior;
ningún evento de tarjeta se interpreta como falta.

Los eventos nuevos distinguen:

- `FOUL`: incluye `countsAsAccumulatedFoul`, `restart`, una sanción opcional y
  `relatedEventId` opcional heredado del evento base.
- `DISCIPLINE`: tarjeta aislada a un jugador en pista o rival, con `reason`, sin
  efecto sobre las faltas acumuladas.
- `BENCH_DISCIPLINE`: tarjeta a suplente o staff; siempre tiene
  `countsAsAccumulatedFoul: false`.

La pantalla de falta permite elegir entre una falta/infracción acumulable o no
acumulable y un registro de solo tarjeta. Las expulsiones aisladas conservan la
lógica de inferioridad numérica, pero no modifican el contador de faltas.

## CSV

El esquema `futsal-stats-csv/2` añade en la sección `EVENTOS` las columnas
`countsAsAccumulatedFoul`, `restartType`, `disciplinaryAction`, `relatedEventId`
y `reason`. Los metadatos JSON siguen siendo la representación canónica del
evento. El importador acepta la versión 1, migra `accumulated` al campo nuevo y
muestra un aviso si un `FOUL` antiguo no aporta ninguna clasificación.
