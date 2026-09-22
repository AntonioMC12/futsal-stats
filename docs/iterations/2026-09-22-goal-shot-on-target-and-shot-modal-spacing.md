# Iteración: gol como tiro a puerta y espaciado del modal de disparo

## Objetivo

Contar cada gol a favor atribuido como un tiro a puerta del goleador y ordenar el modal «Disparo a favor» sin cambiar el flujo de registro.

## Cambios y archivos

- `src/app/features/live-match/domain/match-statistics.ts`: la proyección suma `goals`, `shotsTotal` y `shotsOnTarget` desde un único `GOAL_FOR` activo con `scorerPlayerId` en partidos con `statisticsSchemaVersion: 2`.
- `src/app/features/live-match/ui/live-match-page.html` y `.scss`: separación uniforme entre título, selección de jugador, resultados y cancelar; altura mínima de botones y estado seleccionado con marca visible y `aria-pressed`.
- `README.md`, `docs/architecture.md` y la nota de la iteración anterior: semántica y uso actualizados.
- Pruebas en `match-statistics.spec.ts`, `live-match.store.spec.ts`, `live-match-page.spec.ts` y `player-profile-statistics.spec.ts`.

## Decisiones y compatibilidad

No se genera un evento `SHOT` para el gol. Partido en directo, detalle, periodos, perfiles y exportación CSV reutilizan la misma proyección de eventos activos. `EVENT_UNDONE` retira el gol y el tiro derivado juntos. La persistencia local identifica eventos por `id`, y la tabla cloud usa `id` como clave primaria; sincronizar el mismo evento no crea otro hecho deportivo. Un `SHOT` explícito sigue siendo otro disparo distinto. Los goles sin goleador no se asignan a ningún jugador. Los partidos anteriores sin esquema v2 conservan las métricas de disparo como no registradas.

## Verificación

- `npm test`: 98 archivos y 520 pruebas correctas. Incluye gol, disparos independientes, undo, reconstrucción, ausencia de `SHOT` adicional, perfil y acciones del modal.
- `npm run build`: correcto; mantiene la advertencia de presupuesto inicial (789,57 kB frente a 500 kB) y la advertencia de `eval` de una dependencia.
- `npm run lint`: no se puede ejecutar porque `package.json` no define el script. La comprobación Prettier de los archivos de código modificados pasa.
- Revisión visual responsive en navegador: pendiente. No había un navegador conectado para inspeccionar la aplicación en los cuatro tamaños solicitados. El CSS mantiene dos columnas de jugadores, alturas táctiles mínimas, ancho original y el límite de altura/scroll del modal compartido.
