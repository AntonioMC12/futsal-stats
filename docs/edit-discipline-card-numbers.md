# Reasignación de tarjetas amarillas

La pantalla de Disciplina muestra cada amarilla propia asociada a un jugador con
su minuto, periodo y una acción **Editar**. El selector usa exclusivamente los
jugadores convocados del partido y obtiene dorsal y nombre de ese snapshot.

`EditYellowCardUseCase` valida el partido, el evento y el nuevo jugador antes de
llamar a `MatchEventRepository.updateEvent`. La actualización sustituye el evento
con el mismo `id`; conserva periodo, reloj, fecha, motivo y `relatedEventId`. Los
partidos finalizados continúan en modo de solo lectura.

Cuando la amarilla está embebida en un evento `FOUL`, `foulPlayerId` conserva el
autor original de la falta y `playerId` pasa a identificar al receptor corregido
de la tarjeta. De esta forma, la reasignación no altera la falta, su clasificación
acumulable ni el contador del equipo. La interfaz advierte que se cambiará solo
la tarjeta.

Las estadísticas y la cronología se recalculan desde los eventos. La persistencia
local, cloud y la cola offline actualizan el mismo evento; una exportación CSV
posterior contiene el jugador y dorsal corregidos, además de `foulPlayerId` cuando
sea necesario reconstruir una falta vinculada.
