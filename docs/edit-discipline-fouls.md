# Correcciones desde Disciplina

Durante un partido, **Disciplina → Historial de faltas → Editar falta** permite
corregir el jugador propio o el dorsal rival y si la infracción es acumulada.
El historial incluye todos los periodos, aunque se hayan registrado otras acciones
después. Un dorsal rival vacío representa una falta sin jugador identificado.

**Anular solo falta** retira la infracción y conserva cualquier tarjeta asociada.
Si había una tarjeta integrada en la falta, el mismo evento se convierte en una
sanción independiente, conservando su identificador, jugador, momento y secuencia.

El editor de amarillas mantiene la reasignación de jugador o dorsal y añade
**Retirar solo amarilla**. Esta acción conserva la falta asociada. No se permite
retirar una primera amarilla cuando existe una expulsión por segunda amarilla
del mismo jugador, para evitar una disciplina incoherente.

Las correcciones usan `MatchEventRepository.updateEvent`, con la persistencia
local, cloud y offline existente. Los contadores y estadísticas se recalculan a
partir de los eventos; el reloj y las acciones posteriores se conservan. Los
partidos finalizados siguen siendo de solo lectura.

Las pruebas de `live-match-page.spec.ts` cubren la edición desde la interfaz,
recarga, atribución independiente de falta y tarjeta, faltas rivales sin dorsal,
anulaciones, acciones posteriores y las validaciones anteriores.
