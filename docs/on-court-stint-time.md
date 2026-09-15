# Tiempo del tramo actual en pista

Cada jugador del **Quinteto en pista** muestra el tiempo efectivo transcurrido
desde su entrada más reciente. El valor se deriva de `PlayerCourtStint` y se
formatea como `MM:SS`; no es el tiempo total acumulado del jugador.

La proyección de participación reproduce el historial únicamente cuando cambian
el partido o sus eventos. El ticker global del reloj aporta después el tiempo
restante actual, por lo que no existen temporizadores individuales por jugador.
Esto mantiene el contador estable al pausar, navegar, recargar o suspender la
aplicación.

Una sustitución cierra el tramo del jugador saliente y abre otro a `00:00` para
el entrante. Una reentrada crea un tramo nuevo. `PERIOD_STARTED` separa los
tramos entre periodos y `CLOCK_RESET` cierra los actuales y abre nuevos tramos
en cero sin alterar los minutos acumulados.

`LiveMatchStore.currentStintDurations` expone una consulta O(1) por jugador a la
UI. En descanso o al finalizar el partido, el último valor proyectado permanece
congelado para los jugadores que siguen formando el quinteto mostrado.
