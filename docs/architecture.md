# Futsal Stats — arquitectura

Documento de decisiones para el MVP. Prioridad: fiabilidad en partido, rapidez de uso, integridad de datos, undo, extensibilidad, simplicidad.

## Principio

El partido es un **agregado basado en eventos**. El estado visible (marcador, quinteto, faltas, minutos) se **deriva** de la secuencia de `MatchEvent`. El reloj es la excepción controlada: se persiste un snapshot porque el tiempo transcurre aunque no haya eventos de usuario.

```
UI → Command → validación de dominio → MatchEvent → Event Store
                                                      ↓
                                               estado derivado (puro)
                                                      ↓
                                               persistencia (Dexie)
```

Los componentes Angular no contienen reglas de fútbol sala. Llaman a `LiveMatchStore` (Signals) y pintan.

## Capas

| Capa                     | Qué vive ahí                             | Qué no                                       |
| ------------------------ | ---------------------------------------- | -------------------------------------------- |
| `features/*/ui`          | Pantallas, botones, layout táctil        | Validación de quinteto, minutos, marcador    |
| `features/*/application` | Facades (`LiveMatchStore`), casos de uso | Acceso directo a IndexedDB desde componentes |
| `features/*/domain`      | Comandos, reducer, invariantes           | Angular, Dexie, DOM                          |
| `core/clock`             | Reloj sin drift (funciones puras)        | `setInterval` como fuente de verdad          |
| `core/persistence`       | Dexie, repositorios                      | Lógica de partido                            |
| `shared`                 | Modelos, pipes, UI genérica              | Features concretas                           |

La lógica de partido debe poder testearse con Vitest **sin** `TestBed`.

## Límite de persistencia

Las features consumen contratos TypeScript puros desde `core/persistence/ports` mediante los
tokens `TEAM_REPOSITORY`, `PLAYER_REPOSITORY`, `MATCH_REPOSITORY` y
`MATCH_EVENT_REPOSITORY`. Ningún consumidor de UI, aplicación o dominio conoce Dexie ni
`FutsalStatsDb`.

`provideLocalPersistence()` selecciona actualmente los adapters `Dexie*Repository`. Solo esos
adapters y el inicializador local integrado acceden a `FutsalStatsDb`; una estrategia cloud o
híbrida podrá sustituir los providers sin cambiar las features.

```text
UI → Application/Stores → Repository ports → Angular DI → Dexie adapters → IndexedDB
```

Las fronteras transaccionales pertenecen a los contratos orientados al agregado:

- `MatchEventRepository.commit(match, events)` escribe eventos nuevos y snapshot juntos.
- `MatchRepository.addIfNoActive(match)` comprueba y crea dentro de una transacción.
- `MatchRepository.delete(matchId)` elimina partido y eventos juntos, sin tocar equipos ni jugadores.

Regla arquitectónica: `features/*/{ui,application,domain}` no debe importar `dexie`,
`local/futsal-stats.db` ni adapters `Dexie*Repository`.

## Modelo persistido vs agregado

- Tabla `matches`: metadatos + `status` + snapshot del reloj + convocatoria + quinteto inicial.
- Tabla `events`: append-only. No se borra un evento; se añade `EVENT_UNDONE`.
- `Match.events` en el prompt es el **agregado en memoria**, no un array embebido en IndexedDB (evita reescrituras enormes).

El rival del MVP es un nombre (`awayTeam.name`), no un segundo club obligatorio.

## Eventos

Unión discriminada por `type`. Campos comunes: `id`, `matchId`, `type`, `period`, `gameClockMs`, `timestamp`, `sequence`, `undone`.

- `gameClockMs`: tiempo **restante** del periodo en el momento del evento (p. ej. 12:34 → 754_000 ms).
- `timestamp`: reloj de pared (`Date.now()`).
- `sequence`: entero monótono por partido (orden total si hay empate de timestamps).

Tipos MVP: `MATCH_STARTED`, `CLOCK_STARTED`, `CLOCK_STOPPED`, `CLOCK_RESET`, `PERIOD_STARTED`, `PERIOD_ENDED`, `PLAYER_ENTERED`, `PLAYER_LEFT`, `SUBSTITUTION`, `FOUL`, `GOAL_FOR`, `GOAL_AGAINST`, `EVENT_UNDONE`, `MATCH_FINISHED`.

Los eventos nuevos y el snapshot actualizado del partido se escriben en una única transacción IndexedDB. `CLOCK_RESET` es explícito porque un reinicio cambia la línea temporal necesaria para calcular minutos, aunque el snapshot del reloj siga siendo la fuente para recuperar el tiempo en marcha.

Tipos futuros se añaden a la unión y a un reducer `switch`; no hay campos `match.shots` / `match.corners`.

Undo: el último evento relevante se marca `undone: true` mediante un nuevo `EVENT_UNDONE` que referencia su `id`. El reducer ignora eventos undone.

## Reloj (sin drift)

No se resta 1 s con `setInterval`.

Estado:

- `remainingMs`: base congelada (o en el instante de START).
- `running`
- `startedAtEpochMs`: `Date.now()` al arrancar; `null` si está parado.

Proyección (lo que se pinta):

`remaining = max(0, remainingMs - (now - startedAtEpochMs))` si corre; si no, `remainingMs`.

Al STOP: se escribe `remainingMs = proyección` y `startedAtEpochMs = null`.

Por qué epoch (`Date.now`) y no solo `performance.now()`: `performance.now()` se reinicia al recargar y en segundo plano algunos motores congelan timers. El epoch sobrevive a cierre/reapertura y a pérdida de foco. En sesión, el tick de UI (rAF) solo **lee** la proyección; no acumula.

Al llegar a 0: STOP automático. El cambio de periodo es un comando explícito (`PERIOD_ENDED` / `PERIOD_STARTED`), no un efecto silencioso.

Configuración futura (`periodDurationMs`, número de periodos, prórroga) vive en el partido, no en constantes globales rígidas. El MVP usa 2 × 20:00 (`1_200_000` ms).

## Quinteto y minutos

Quinteto activo = 5 ids. Identificador estable: ids ordenados unidos por `|`.

Minutos = integral del tiempo de partido **en marcha** entre `PLAYER_ENTERED` / `SUBSTITUTION` y `PLAYER_LEFT` / `SUBSTITUTION` / fin de periodo. Quien está en pista **sigue acumulando** mientras el reloj corre (proyección, no contador ++).

## Goles y faltas

Gol: periodo, `gameClockMs`, snapshot de 5 ids, marcador antes/después (el marcador también es derivable; el snapshot evita recálculos ambiguos si hay undo).

Faltas: por periodo según reglas; acumulado de periodo se deriva. Jugador opcional.

## LiveMatchStore

Único punto de comandos (`startClock`, `registerGoalFor`, `makeSubstitution`, `undoLastEvent`, …). Persiste vía repositorios. Los computed (`score`, `currentLineup`, `playerPlayingTime`, …) se calculan con funciones puras sobre eventos + proyección de reloj.

## PWA

Service Worker de Angular en producción. IndexedDB es la fuente local. Al abrir: si hay partido no `finished`, ofrecer **Continuar partido**.

## Estrategias tácticas

El panel de estrategias usa snapshots completos de cada secuencia. Las posiciones de jugadores,
rivales y balón se guardan normalizadas en el rango `0..1`; el SVG es únicamente la proyección
responsive de esos datos. Las operaciones de edición son funciones puras del dominio y mantienen
estable el `pieceId` entre secuencias.

```text
UI SVG/Pointer Events → StrategyPlaybackStore → StrategyRepository → DexieStrategyRepository
```

La reproducción interpola snapshots en un estado temporal mediante `requestAnimationFrame`, sin
modificar las secuencias persistidas. Cada estrategia requiere un `teamId`; la tabla `strategies`
está indexada por esa frontera y se incorporó en la versión 3 de la base local.

La experiencia se divide en rutas hijas bajo `/strategies`: `designer/:strategyId?` concentra la
edición en una única pantalla y `library` ofrece búsqueda, filtros, previsualizaciones y un visor de
solo lectura. Ambas superficies reutilizan `TacticalBoard`, `StrategyControls` y el mismo
`StrategyPlaybackStore`; no existe un segundo motor de renderizado o reproducción para la
biblioteca.

## Qué no haremos aún

NgRx, sync en la nube, motor completo de estadísticas avanzadas, Playwright (se añade cuando haya flujo de partido estable).
