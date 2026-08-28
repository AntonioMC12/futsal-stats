# Futsal Stats

Futsal Stats es una aplicación web progresiva para registrar y consultar estadísticas de partidos de fútbol sala en tiempo real. Está diseñada para entrenadores, analistas y miembros del cuerpo técnico que necesitan operar rápidamente desde un móvil, una tablet o un ordenador.

La aplicación funciona de forma local y no necesita backend: equipos, jugadores, partidos y eventos se guardan en IndexedDB dentro del dispositivo.

## Funcionalidades

### Equipos y jugadores

- Creación y edición de equipos.
- Gestión de dorsales, nombres, posiciones y estado de los jugadores.
- Selección de convocatoria y quinteto inicial antes de cada partido.

### Gestión de partidos

- Un único partido activo simultáneamente.
- Continuación de un partido en curso después de cerrar o recargar la aplicación.
- Histórico de partidos finalizados con fecha y resultado.
- Eliminación transaccional de partidos y sus eventos asociados.
- Flujo para abandonar un partido y comenzar otro sin conservar estado residual.

### Partido en directo

- Reloj de dos periodos con inicio, parada, reanudación y cambio de periodo.
- Cabecera compacta con tiempo, periodo y quinteto actual.
- Control flotante del reloj optimizado para uso táctil.
- Sustituciones rápidas pulsando sobre el jugador que sale y seleccionando al jugador que entra.
- Registro de goles a favor y en contra.
- Selección opcional del goleador entre los jugadores en pista, con goles individuales derivados del historial.
- Registro de faltas propias y del rival por periodo.
- Tarjetas, expulsiones e inferioridades de dos minutos de tiempo efectivo con reposición manual.
- Identificación rápida por dorsal de jugadores rivales sancionados, reutilizable durante el partido.
- Marcador y cronología de eventos actualizados inmediatamente.
- Deshacer goles, faltas y sustituciones sin eliminar el historial original.

### Estadísticas derivadas

- Minutos jugados y porcentaje de participación.
- Goles a favor y en contra con cada jugador en pista.
- Plus/minus por jugador.
- Tiempo, goles y plus/minus por quinteto.
- Snapshot del quinteto presente en cada gol.
- Exportación CSV de estadísticas legibles, sin identificadores internos, en cualquier estado del partido.

## PWA y funcionamiento offline

Futsal Stats incluye manifiesto y Service Worker de Angular. En una compilación de producción, los recursos necesarios se precargan para poder utilizar la aplicación sin conexión después de la primera carga correcta.

Los datos permanecen en el dispositivo mediante IndexedDB. No se envían a ningún servidor ni se sincronizan entre dispositivos.

> Borrar los datos del sitio desde el navegador también elimina equipos, jugadores, partidos y eventos almacenados localmente.

## Tecnologías

- Angular 22 con componentes standalone.
- TypeScript estricto.
- Angular Signals para estado reactivo.
- Angular Router y Reactive Forms.
- Dexie sobre IndexedDB para persistencia.
- Angular Service Worker para capacidades PWA.
- SCSS responsive orientado a móvil y tablet.
- Vitest y Angular Testing Utilities.

## Requisitos

- Node.js compatible con Angular 22.
- npm. El proyecto declara `npm@12.0.2` como gestor recomendado.

## Instalación

```bash
npm install
```

## Ejecutar en local

```bash
npm start
```

La aplicación estará disponible normalmente en:

```text
http://localhost:4200
```

## Tests

```bash
npm test
```

Los tests cubren reloj, ciclo de vida, eventos, sustituciones, goles, faltas, estadísticas, undo, recuperación, eliminación de partidos y flujos principales de UI.

## Build de producción

```bash
npm run build
```

El resultado se genera en:

```text
dist/futsal-stats
```

Para comprobar la instalación PWA y el comportamiento offline hay que servir el contenido compilado con un servidor HTTP local o mediante HTTPS. El Service Worker no se activa con la configuración de desarrollo de `ng serve`.

## Otros comandos

```bash
# Build continuo con configuración de desarrollo
npm run watch

# Ejecutar Angular CLI
npm run ng -- <comando>
```

## Rutas principales

| Ruta                  | Descripción                                    |
| --------------------- | ---------------------------------------------- |
| `/matches`            | Gestor de partidos activos y finalizados       |
| `/matches/new`        | Preparación de convocatoria y quinteto inicial |
| `/live/:matchId`      | Registro del partido en directo                |
| `/teams`              | Listado de equipos                             |
| `/teams/new`          | Creación de un equipo                          |
| `/teams/:teamId`      | Plantilla de un equipo                         |
| `/teams/:teamId/edit` | Edición de un equipo                           |

El acceso directo a `/matches/new` se protege cuando ya existe un partido activo.

## Arquitectura

El código se organiza por features y separa la lógica de dominio, aplicación y presentación:

```text
src/app/
├── core/
│   ├── clock/          # Motor de reloj puro
│   ├── connectivity/   # Estado online/offline
│   ├── persistence/    # Dexie y repositorios
│   └── utils/
├── features/
│   ├── teams/
│   ├── match-setup/
│   ├── matches/
│   └── live-match/
│       ├── application/
│       ├── domain/
│       └── ui/
└── shared/
    ├── components/
    └── models/
```

### Persistencia

La base de datos local contiene cuatro tablas:

- `teams`
- `players`
- `matches`
- `events`

El reloj persistido forma parte del registro `Match`. Marcador, faltas, quintetos, minutos y estadísticas se calculan a partir de los eventos; no se guardan copias derivadas innecesarias.

### Event Store

Las acciones relevantes se registran como `MatchEvent`. Los eventos son append-only y se ordenan mediante `sequence` y `timestamp`.

La operación de deshacer añade un evento compensatorio `EVENT_UNDONE`, manteniendo intacto el evento original. Esto permite reconstruir de manera determinista:

- marcador;
- faltas por periodo;
- quinteto actual;
- minutos jugados;
- estadísticas de jugadores y quintetos;
- timeline visible.

### Reloj

El reloj guarda un snapshot con tiempo restante, duración del periodo, estado de ejecución y timestamp de inicio. Mientras está en marcha, el tiempo visible se proyecta desde el timestamp real para evitar drift por intervalos retrasados.

Al recuperar un partido, el estado se sincroniza con el tiempo transcurrido y se persiste una parada automática si el periodo ya llegó a cero.

### Eliminación de partidos

La eliminación de un partido y todos sus eventos se realiza dentro de una única transacción IndexedDB. Equipos y jugadores quedan fuera de esa transacción y pueden reutilizarse inmediatamente.

El estado en memoria del partido en directo solo se limpia después de que IndexedDB confirme la eliminación. Si la operación falla, el partido continúa disponible y se informa al usuario.

## Principios del proyecto

- Experiencia mobile-first y controles táctiles grandes.
- Un solo partido activo para evitar ambigüedades.
- IndexedDB como fuente persistente local.
- Eventos como fuente de verdad de las estadísticas.
- Cálculos de dominio puros y cubiertos por tests.
- Operaciones críticas transaccionales.
- Sin NgRx, backend ni dependencias visuales innecesarias.
