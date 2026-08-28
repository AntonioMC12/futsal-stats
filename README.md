# Prompt maestro — Futsal Stats PWA

Quiero desarrollar una aplicación llamada **Futsal Stats**, una **PWA con Angular 22**, orientada a recoger estadísticas de un partido de fútbol sala en tiempo real.

El desarrollo se realizará mediante un flujo de trabajo **ChatGPT + Codex**, por lo que debes actuar como un **arquitecto de software senior, product engineer y experto en Angular**, proponiendo una arquitectura mantenible y después implementándola de manera incremental.

## 1. Objetivo del producto

La aplicación debe permitir a un entrenador, analista o miembro del staff controlar un partido de fútbol sala desde un dispositivo móvil, tablet u ordenador y registrar eventos mientras se disputa el encuentro.

Las funcionalidades principales del MVP son:

* Temporizador oficial del partido.
* Control del quinteto que está actualmente en pista.
* Registro del tiempo jugado por cada jugador.
* Registro de sustituciones.
* Registro de faltas.
* Registro de goles a favor y en contra.
* Saber qué quinteto estaba en pista cuando se produce cada gol.
* Histórico cronológico de eventos del partido.
* Posibilidad de corregir errores durante el partido.
* Persistencia local para evitar perder datos.
* Arquitectura preparada para añadir nuevas estadísticas en el futuro.

La prioridad absoluta de la aplicación es que sea **rápida y extremadamente sencilla de operar durante un partido**.

---

# 2. Stack tecnológico

Utilizar:

* Angular 22
* TypeScript
* Standalone Components
* Angular Signals como mecanismo principal de estado reactivo
* Angular Router
* Reactive Forms cuando sean necesarios
* PWA / Service Worker
* IndexedDB para persistencia local
* CSS moderno o SCSS
* Vitest para tests unitarios
* Playwright para tests end-to-end

Evitar dependencias innecesarias.

No introducir NgRx salvo que exista una justificación técnica clara.

Preferir APIs y patrones nativos de Angular.

Aplicar TypeScript estricto.

---

# 3. Enfoque arquitectónico

Diseñar la aplicación siguiendo una arquitectura basada en dominio y features.

Una estructura orientativa:

src/app/

core/

* persistence/
* services/
* utils/

shared/

* components/
* models/
* pipes/

features/

teams/

* domain/
* application/
* ui/

players/

* domain/
* application/
* ui/

matches/

* domain/
* application/
* ui/

live-match/

* domain/
* application/
* ui/

statistics/

* domain/
* application/
* ui/

La lógica de negocio importante NO debe residir directamente en componentes visuales.

Los componentes deben centrarse principalmente en:

* representar estado;
* recibir interacción;
* llamar servicios/casos de uso.

La lógica del partido debe poder probarse sin renderizar Angular.

---

# 4. Modelo de dominio inicial

Diseña tipos/interfaces para al menos las siguientes entidades.

## Team

* id
* name
* shortName
* logo opcional

## Player

* id
* teamId
* number
* name
* position opcional
* active

## Match

* id
* homeTeam
* awayTeam
* date
* status
* currentPeriod
* score
* clock
* events
* createdAt
* updatedAt

Estados posibles:

* setup
* ready
* firstHalf
* halftime
* secondHalf
* finished

## Lineup

Representa el quinteto actual.

Debe contener exactamente 5 jugadores cuando el partido está activo.

También debe poder reconstruirse históricamente a partir de los eventos registrados.

---

# 5. Modelo basado en eventos

Una decisión arquitectónica importante:

**el estado de un partido debe poder reconstruirse a partir de una secuencia cronológica de eventos.**

Crear una abstracción MatchEvent.

Todos los eventos deben contener:

* id
* matchId
* type
* period
* gameClock
* timestamp real
* sequence
* metadata

Tipos iniciales de eventos:

MATCH_STARTED

CLOCK_STARTED

CLOCK_STOPPED

PERIOD_STARTED

PERIOD_ENDED

PLAYER_ENTERED

PLAYER_LEFT

SUBSTITUTION

FOUL

GOAL_FOR

GOAL_AGAINST

EVENT_UNDONE

MATCH_FINISHED

Diseñar el modelo para que en el futuro podamos añadir eventos como:

* shot
* shotOnTarget
* save
* corner
* turnover
* recovery
* assist
* yellowCard
* redCard
* timeout
* penalty
* tenMeterPenalty
* customStatistic

No construir todavía toda esa funcionalidad, pero asegurar que la arquitectura permita añadir nuevos tipos de evento fácilmente.

---

# 6. Temporizador del partido

Esta es una de las funcionalidades más importantes.

En fútbol sala cada periodo empieza en:

20:00

y cuenta hacia atrás hasta:

00:00.

El reloj NO debe avanzar cuando el juego está detenido.

Debe permitir:

START

STOP

RESET

FINALIZAR PERIODO

INICIAR SEGUNDA PARTE

El partido tendrá inicialmente:

2 periodos de 20 minutos.

El diseño debe permitir configurar en el futuro:

* duración del periodo;
* número de periodos;
* prórroga.

## Requisito crítico del reloj

NO implementar el reloj simplemente restando 1 segundo mediante setInterval.

Ese sistema genera drift y deja de ser fiable cuando:

* el navegador pierde foco;
* la aplicación pasa a segundo plano;
* el dispositivo reduce timers;
* la app se reanuda.

Implementar el reloj utilizando timestamps.

Cuando el reloj empieza, guardar algo equivalente a:

startedAt = performance.now()

y calcular:

remainingTime = baseRemainingTime - elapsedTime

Al detenerlo:

actualizar baseRemainingTime

y eliminar startedAt.

El tiempo mostrado debe ser una proyección del estado real del reloj, no la fuente de verdad.

El tiempo debe conservarse correctamente incluso si la aplicación pierde el foco.

---

# 7. Representación del tiempo

Internamente almacenar el tiempo preferiblemente en milisegundos.

Ejemplo:

20 minutos = 1_200_000 ms.

Crear utilidades puras para:

formatGameClock()

parseGameClock()

remainingToElapsed()

elapsedToRemaining()

Ejemplo visual:

19:43

03:12

00:00

Registrar cada evento con el tiempo de partido exacto en el momento en que ocurre.

Ejemplo:

GOAL_FOR

period: 1

gameClock: 12:34

---

# 8. Quinteto actual

La aplicación debe mostrar siempre claramente los 5 jugadores que están actualmente en pista.

Vista sugerida:

EN PISTA

#1 Juan
#4 Pedro
#7 Alex
#10 Carlos
#12 David

BANQUILLO

#2 Pablo
#3 Mario
#5 Luis
...

Para hacer un cambio:

1. seleccionar jugador que sale;
2. seleccionar jugador que entra;
3. confirmar sustitución.

Al confirmar debe registrarse un evento SUBSTITUTION.

El estado debe actualizarse inmediatamente.

La aplicación debe impedir:

* más de 5 jugadores en pista;
* menos de 5 jugadores durante juego activo, salvo estados transitorios controlados;
* introducir un jugador que ya está en pista;
* sacar un jugador que no está en pista.

La UX debe minimizar el número de pulsaciones.

---

# 9. Minutos jugados

Los minutos jugados NO deberían almacenarse como un contador independiente que se incremente cada segundo.

Deben calcularse principalmente a partir de:

* PLAYER_ENTERED
* PLAYER_LEFT
* SUBSTITUTION
* comienzo/parada de periodos
* reloj del partido

De esta forma podremos reconstruir los minutos exactos de cada jugador.

Para cada jugador mostrar:

* minutos totales;
* segundos totales;
* número de entradas en pista;
* porcentaje de minutos disponibles.

Ejemplo:

Jugador | Minutos
Juan | 18:32
Pedro | 16:41
Alex | 12:09

Los jugadores que están actualmente en pista deben seguir acumulando tiempo en función del reloj activo.

---

# 10. Goles

Debe existir una acción muy visible:

* GOL A FAVOR

y

* GOL EN CONTRA

Al registrar un gol guardar:

* periodo;
* tiempo del reloj;
* quinteto actual;
* marcador antes;
* marcador después.

Ejemplo:

GOAL_FOR

period: 1

gameClock: 08:42

lineup:

[player1, player4, player7, player10, player12]

scoreBefore:

2-1

scoreAfter:

3-1

Esto permitirá calcular posteriormente estadísticas como:

+/- por jugador

goles a favor estando en pista

goles en contra estando en pista

diferencial de goles

efectividad de quintetos.

---

# 11. Faltas

Añadir acciones rápidas:

* FALTA PROPIA

* FALTA RIVAL

Guardar:

* periodo;
* tiempo;
* equipo;
* jugador opcional;
* número de falta acumulada del periodo.

Mostrar claramente el número de faltas acumuladas.

Ejemplo:

NOSOTROS

4 faltas

RIVAL

3 faltas

Las faltas deben reiniciarse por periodo según las reglas configuradas.

---

# 12. Timeline del partido

Mantener un historial cronológico de eventos.

Ejemplo:

18:42 — Cambio: Juan OUT → Pedro IN

17:31 — Falta propia

14:08 — Gol a favor — 1-0

12:55 — Cambio: Alex OUT → Luis IN

10:21 — Gol en contra — 1-1

El usuario debe poder tocar un evento para:

* ver detalles;
* editarlo cuando sea posible;
* eliminarlo;
* deshacerlo.

Preferir un sistema de undo basado en eventos.

No borrar silenciosamente información si puede conservarse el histórico mediante EVENT_UNDONE.

---

# 13. Corrección de errores

Durante un partido es muy fácil pulsar algo incorrecto.

Por ello debe existir una acción:

DESHACER

que revierta el último evento relevante.

Ejemplo:

se registra por error un gol.

DESHACER

El marcador vuelve al estado anterior y el evento queda marcado como revertido.

Diseñar esta funcionalidad desde el principio.

---

# 14. Pantalla principal del partido

Debe estar diseñada principalmente para uso táctil.

Distribución conceptual:

---

PRIMERA PARTE

12:43

[ PARAR ]

MARCADOR

NOSOTROS 2 - 1 RIVAL

---

QUINTETO

#1 #4 #7 #10 #12

[ HACER CAMBIO ]

---

[ + GOL ]
[ - GOL EN CONTRA ]

[ + FALTA ]
[ FALTA RIVAL ]

---

FALTAS

NOSOTROS 3 | RIVAL 2

---

ÚLTIMOS EVENTOS

14:21 Gol a favor
13:58 Cambio
12:44 Falta

---

Priorizar botones grandes.

Evitar menús complejos mientras el partido está activo.

---

# 15. Estados derivados

Crear selectors o computed signals para calcular:

currentLineup

benchPlayers

score

teamFouls

opponentFouls

playerPlayingTime

activePlayersPlayingTime

goalsForByPlayer

goalsAgainstByPlayer

plusMinusByPlayer

lineupStatistics

currentGameClock

matchElapsedTime

Todas estas estadísticas deberían derivarse del estado/eventos siempre que sea razonable.

---

# 16. Estadísticas de quintetos

Preparar la arquitectura para calcular estadísticas por quinteto.

Un quinteto es una combinación única de 5 jugadores.

Para cada quinteto podremos calcular:

* tiempo total en pista;
* goles a favor;
* goles en contra;
* diferencial;
* número de posesiones en el futuro.

Ejemplo:

Quinteto:

1-4-7-10-12

Tiempo:

04:32

GF:

2

GC:

0

+/-:

+2

Crear una función que genere un identificador estable del quinteto ordenando los IDs de los jugadores.

---

# 17. Persistencia

La aplicación debe funcionar sin conexión.

Utilizar IndexedDB.

Persistir como mínimo:

* equipos;
* jugadores;
* partidos;
* eventos;
* estado actual del reloj.

La aplicación debe poder cerrarse accidentalmente y recuperar el partido.

Al volver a abrir:

mostrar opción:

CONTINUAR PARTIDO

Nunca perder los eventos ya registrados.

---

# 18. PWA

Configurar la aplicación como Progressive Web App.

Debe poder:

* instalarse en móvil;
* funcionar offline;
* recuperar un partido;
* adaptarse a móvil y tablet.

La interfaz debe funcionar correctamente en:

375px

768px

1024px

Desktop.

La prioridad es smartphone y tablet.

---

# 19. Arquitectura extensible de estadísticas

Crear un sistema que permita añadir nuevas estadísticas sin reestructurar la aplicación.

Evitar estructuras rígidas como:

match.shots
match.corners
match.saves
match.turnovers

Preferir eventos tipados.

Ejemplo:

type MatchEvent =
| GoalEvent
| SubstitutionEvent
| FoulEvent
| ShotEvent
| SaveEvent
| CustomStatisticEvent;

El estado derivado se obtiene procesando eventos.

---

# 20. Testing

Crear tests desde el principio.

Especial atención a la lógica del reloj.

Tests necesarios:

## Clock

* empieza en 20:00;
* baja correctamente;
* STOP congela el tiempo;
* START continúa desde el tiempo correcto;
* múltiples start/stop no generan drift;
* nunca baja de 00:00.

## Sustituciones

* siempre hay 5 jugadores;
* jugador que sale deja de acumular tiempo;
* jugador que entra empieza a acumular;
* no se puede meter un jugador ya activo.

## Goles

* actualiza marcador;
* captura quinteto;
* captura tiempo;
* undo restaura marcador.

## Minutos

Comprobar cálculo de tiempo con escenarios como:

Jugador A:

entra 20:00

sale 15:00

entra 10:00

sale 05:00

resultado:

10 minutos jugados.

---

# 21. UX durante el partido

La interfaz debe diseñarse pensando en que una persona está mirando el partido y dispone de pocos segundos para interactuar.

Principios:

* botones grandes;
* pocas pulsaciones;
* feedback visual inmediato;
* confirmaciones solo cuando sean realmente necesarias;
* undo accesible;
* interfaz limpia;
* alto contraste;
* reloj extremadamente visible.

No utilizar modales para todo.

Preferir bottom sheets o paneles rápidos en dispositivos móviles.

---

# 22. Flujo inicial de usuario

## Crear equipo

Nombre del equipo.

Añadir jugadores:

número
nombre

## Crear partido

Seleccionar equipo.

Introducir rival.

Seleccionar jugadores convocados.

Elegir quinteto inicial.

## Empezar partido

Reloj:

20:00

Botón:

INICIAR PARTIDO

Al iniciar:

* registrar PERIOD_STARTED;
* registrar quinteto inicial;
* iniciar reloj.

---

# 23. Final del periodo

Cuando el reloj llega a:

00:00

detener automáticamente el reloj.

Mostrar:

FINALIZAR PRIMERA PARTE

Después:

DESCANSO

y posteriormente:

INICIAR SEGUNDA PARTE

Segunda parte:

20:00

Las estadísticas del partido continúan acumulándose.

---

# 24. Estado global del partido

Crear un servicio/fachada equivalente a:

LiveMatchStore

utilizando Angular Signals.

Responsabilidades:

* mantener partido activo;
* recibir comandos;
* crear eventos;
* calcular estado derivado;
* persistir cambios.

Ejemplo conceptual:

startClock()

stopClock()

registerGoalFor()

registerGoalAgainst()

registerFoul()

makeSubstitution()

undoLastEvent()

startPeriod()

finishPeriod()

finishMatch()

No acoplar los componentes directamente a IndexedDB.

---

# 25. Separación Command / Event

Cuando sea útil aplicar una separación conceptual:

UI

↓

Command

↓

Domain validation

↓

MatchEvent

↓

Event Store

↓

Derived State

Ejemplo:

UI:

makeSubstitution(outPlayer, inPlayer)

Dominio valida:

outPlayer está en pista.

inPlayer está en banquillo.

Después genera:

SUBSTITUTION

El estado se recalcula.

---

# 26. Identificadores

Usar UUIDs mediante:

crypto.randomUUID()

cuando esté disponible.

Evitar IDs incrementales dependientes de base de datos.

---

# 27. Calidad del código

Requisitos:

* TypeScript strict;
* evitar any;
* funciones pequeñas;
* lógica de dominio pura cuando sea posible;
* componentes Angular pequeños;
* Signals y computed;
* evitar subscriptions manuales innecesarias;
* nombres claros;
* evitar overengineering;
* documentar decisiones arquitectónicas importantes.

No generar abstracciones innecesarias antes de necesitarlas.

---

# 28. Git y flujo de trabajo ChatGPT + Codex

Trabajaremos mediante pequeños incrementos.

Nunca intentes construir toda la aplicación de una sola vez.

Para cada iteración:

1. analiza el estado actual del repositorio;
2. explica brevemente qué se va a implementar;
3. identifica los archivos afectados;
4. implementa únicamente el alcance solicitado;
5. ejecuta tests;
6. ejecuta lint/build;
7. corrige los errores encontrados;
8. resume los cambios realizados;
9. propone el siguiente incremento lógico.

Evitar cambios masivos no relacionados con la tarea actual.

No modificar código que funcione sin una razón clara.

---

# 29. Roadmap inicial

Propón el desarrollo en estas fases.

## Fase 1 — Skeleton

Angular 22.

PWA.

Routing.

Layout principal.

IndexedDB.

Modelos básicos.

## Fase 2 — Equipos y jugadores

Crear equipo.

Añadir jugadores.

Editar jugadores.

Lista de plantilla.

## Fase 3 — Crear partido

Seleccionar jugadores.

Seleccionar quinteto inicial.

Crear partido.

## Fase 4 — Motor de reloj

Implementar MatchClock.

Tests exhaustivos.

START / STOP.

Cambio de periodo.

## Fase 5 — Motor de eventos

MatchEvent.

Event Store.

Derived State.

Timeline.

## Fase 6 — Quinteto

Quinteto actual.

Banquillo.

Sustituciones.

Minutos jugados.

## Fase 7 — Goles

Goles a favor.

Goles en contra.

Marcador.

Snapshot del quinteto.

## Fase 8 — Faltas

Faltas acumuladas.

Faltas por periodo.

## Fase 9 — Estadísticas

Minutos.

+/-

GF estando en pista.

GC estando en pista.

Estadísticas por quinteto.

## Fase 10 — UX y resiliencia

Undo.

Recuperación del partido.

Offline completo.

Optimización móvil.

---

# 30. Primera tarea

Antes de escribir código:

1. analiza los requisitos;
2. propón la arquitectura final;
3. define el modelo de dominio;
4. define el sistema de eventos;
5. define cómo se implementará el reloj sin drift;
6. propone la estructura de carpetas;
7. identifica decisiones técnicas importantes;
8. identifica posibles errores de diseño;
9. crea un roadmap técnico por pequeños incrementos.

No empieces todavía a implementar toda la aplicación.

Después de presentar la arquitectura, comienza únicamente con el **primer incremento mínimo**, dejando el proyecto compilando y con tests verdes.

Cada decisión debe priorizar:

1. fiabilidad durante el partido;
2. rapidez de uso;
3. integridad de los datos;
4. capacidad de corregir errores;
5. extensibilidad futura;
6. simplicidad del código.
