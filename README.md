# Futsal Stats

**Versión actual: `alpha_0.1`**

Futsal Stats es una aplicación web progresiva para registrar, seguir y consultar estadísticas de partidos de fútbol sala en tiempo real. Está orientada a entrenadores, analistas y miembros del cuerpo técnico que necesitan operar con rapidez desde móvil, tablet u ordenador durante un partido.

La aplicación funciona de forma **local-first y sin backend**: equipos, jugadores, partidos y eventos se almacenan en **IndexedDB** dentro del dispositivo.

> **Estado Alpha**  
> `alpha_0.1` es la primera versión funcional de referencia. La aplicación ya cubre el flujo principal de un partido, pero continúa en evolución y puede recibir cambios de interfaz, modelo de datos y experiencia de uso entre versiones alpha.

---

## Vista general

Futsal Stats concentra en una única interfaz las operaciones principales de un partido:

- preparación de equipos, convocatoria y quinteto inicial;
- cronómetro y control del periodo;
- marcador, faltas y sanciones;
- sustituciones y quinteto actual;
- registro de eventos en directo;
- estadísticas derivadas por jugador y quinteto;
- exportación CSV;
- persistencia offline mediante IndexedDB.

La experiencia visual está diseñada alrededor de un **tema oscuro azulado**, alto contraste y controles grandes pensados para uso táctil durante el partido.

---

## Capturas de pantalla

### Gestor de partidos

Desde esta pantalla se puede continuar un partido activo, consultar partidos finalizados o iniciar uno nuevo.

![Gestor de partidos](docs/screenshots/01-partidos.png)

### Partido en directo

Vista principal para operar durante el encuentro: estadísticas, marcador, cronómetro, quinteto en pista, últimos eventos y acciones rápidas.

![Partido en directo](docs/screenshots/02-partido-en-directo.png)

### Estadísticas detalladas

Panel de estadísticas por jugador con minutos, goles, goles a favor/en contra, plus/minus, faltas, tarjetas y expulsiones, además de exportación CSV.

![Estadísticas detalladas](docs/screenshots/03-estadisticas.png)

### Registro de faltas y sanciones

Flujo contextual para seleccionar al jugador que comete la falta y, cuando corresponde, registrar la sanción disciplinaria asociada.

![Registro de falta](docs/screenshots/04-registrar-falta.png)

---

# Funcionalidades disponibles en `alpha_0.1`

## Equipos y jugadores

- Creación y edición de equipos.
- Equipo **Apaga** preconfigurado con 16 jugadores, disponible automáticamente en cada instalación.
- Gestión de dorsales, nombres, posiciones y estado de los jugadores.
- Selección de convocatoria y quinteto inicial antes de cada partido.

## Gestión de partidos

- Un único partido activo simultáneamente.
- Continuación de un partido en curso después de cerrar o recargar la aplicación.
- Histórico de partidos finalizados con fecha y resultado.
- Eliminación transaccional de partidos y sus eventos asociados.
- Flujo para abandonar un partido y comenzar otro sin conservar estado residual.

## Partido en directo

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
- Acciones rápidas para los eventos más habituales del partido.

## Estadísticas derivadas

- Minutos jugados y porcentaje de participación.
- Goles a favor y en contra con cada jugador en pista.
- Plus/minus por jugador.
- Tiempo, goles y plus/minus por quinteto.
- Snapshot del quinteto presente en cada gol.
- Exportación CSV de estadísticas legibles, sin identificadores internos, en cualquier estado del partido.

## Funcionalidad de reglamento

La funcionalidad de consulta/asistencia relacionada con el reglamento se encuentra **oculta en `alpha_0.1`** y no forma parte del flujo disponible para el usuario en esta versión.

Su reintroducción queda pospuesta hasta que la experiencia, el contenido y su compatibilidad en dispositivos móviles estén suficientemente validados.

---

# Manual de uso

## 1. Preparar los equipos

Accede a **Equipos** desde la navegación principal.

Desde aquí puedes:

1. crear un equipo nuevo;
2. editar un equipo existente;
3. gestionar su plantilla;
4. definir dorsal, nombre, posición y estado de cada jugador.

Los equipos y jugadores se guardan automáticamente en el dispositivo mediante IndexedDB.

---

## 2. Crear un partido

Desde **Partidos**, pulsa **Nuevo partido**.

El flujo de preparación permite seleccionar:

1. el equipo propio;
2. el rival y la información disponible del encuentro;
3. la convocatoria;
4. el quinteto inicial.

Una vez creado, el partido pasa a ser el único partido activo de la aplicación.

> Mientras exista un partido activo, el acceso directo a `/matches/new` está protegido para evitar crear accidentalmente un segundo partido simultáneo.

---

## 3. Continuar un partido guardado

Si cierras, recargas o vuelves más tarde a la aplicación, entra en **Partidos**.

El bloque **Partido en curso** muestra:

- equipos;
- resultado;
- periodo;
- tiempo actual del reloj.

Pulsa **Continuar partido** para volver a la vista en directo.

---

## 4. Manejar el cronómetro

En la pantalla del partido en directo encontrarás el reloj principal y su control flotante.

El flujo habitual es:

1. iniciar el reloj al comenzar el periodo;
2. detenerlo cuando el juego se interrumpe;
3. reanudarlo al volver el balón a juego;
4. realizar el cambio de periodo cuando corresponda.

El reloj utiliza un snapshot persistido y calcula el tiempo visible a partir del tiempo real para minimizar desviaciones provocadas por intervalos retrasados del navegador.

Si se recupera un partido cuyo periodo llegó a cero mientras la aplicación no estaba activa, el estado se sincroniza y se persiste la parada correspondiente.

---

## 5. Registrar un gol propio

En **Acciones rápidas**, pulsa **Gol**.

Cuando el flujo lo solicita, puedes seleccionar al goleador entre los jugadores que se encuentran en pista.

Al registrar el evento se actualizan automáticamente:

- marcador;
- goles individuales;
- goles a favor del quinteto;
- plus/minus de los jugadores presentes;
- cronología del partido.

---

## 6. Registrar un gol rival

Pulsa **Gol rival** en las acciones rápidas.

El evento actualiza el marcador y las estadísticas derivadas de los jugadores que estaban en pista en ese momento, incluyendo goles en contra y plus/minus.

---

## 7. Registrar una falta propia

Pulsa **Falta**.

Después:

1. selecciona al jugador que cometió la falta;
2. elige la sanción correspondiente cuando exista:
   - sin tarjeta;
   - amarilla;
   - segunda amarilla + expulsión;
   - roja directa.

El evento queda incorporado al historial y actualiza las estadísticas derivadas.

---

## 8. Registrar una falta rival

Pulsa **Falta rival**.

Las faltas del rival se contabilizan por periodo y se reflejan en el estado del partido.

Cuando sea necesario identificar a un rival sancionado, la aplicación permite reutilizar su dorsal durante el encuentro.

---

## 9. Registrar disciplina del banquillo

La acción **Disciplina banquillo** permite acceder al flujo específico destinado a jugadores o miembros del cuerpo técnico que no forman parte del quinteto en pista.

Utiliza esta opción para mantener separados los eventos del terreno de juego y los asociados al banquillo/cuerpo técnico.

---

## 10. Realizar una sustitución

Para realizar una sustitución rápida:

1. pulsa sobre el jugador que va a salir dentro del quinteto actual;
2. selecciona al jugador que entra;
3. confirma la sustitución cuando el flujo lo requiera.

La aplicación conserva el evento y actualiza el quinteto actual y el cálculo de minutos de juego.

---

## 11. Consultar el quinteto en pista

La parte superior derecha de la vista en directo representa el quinteto actual sobre una pista de fútbol sala.

Cada jugador aparece identificado mediante dorsal y nombre, facilitando comprobar rápidamente quién está participando antes de registrar un evento.

---

## 12. Consultar los últimos eventos

El panel **Últimos eventos** muestra las acciones recientes del partido junto con el tiempo de juego asociado.

Pulsa **Ver todos** para acceder a una visión más completa del historial cuando esté disponible en el flujo correspondiente.

Los eventos relevantes se almacenan como `MatchEvent` y se ordenan mediante `sequence` y `timestamp`.

---

## 13. Deshacer una acción

La aplicación permite deshacer eventos compatibles, como goles, faltas y sustituciones.

Internamente no se elimina el evento original. Se añade un evento compensatorio `EVENT_UNDONE`, manteniendo un historial reproducible y permitiendo reconstruir las estadísticas de forma determinista.

---

## 14. Consultar estadísticas

Desde el panel **Estadísticas**, pulsa **Ver todas**.

La vista detallada permite consultar por jugador:

- minutos;
- goles;
- goles a favor;
- goles en contra;
- plus/minus;
- faltas;
- tarjetas amarillas;
- segundas amarillas;
- rojas;
- expulsiones.

También se muestran los quintetos utilizados durante el partido y sus estadísticas derivadas.

---

## 15. Exportar estadísticas a CSV

Desde la vista completa de estadísticas pulsa **Exportar CSV**.

El archivo generado contiene datos legibles para análisis posterior y evita incluir identificadores internos innecesarios.

La exportación puede realizarse tanto durante el partido como después de finalizarlo.

---

## 16. Finalizar o abandonar un partido

Desde las opciones del partido puedes completar su ciclo de vida.

Los partidos finalizados pasan al histórico y pueden consultarse posteriormente desde **Partidos**.

Si se elimina un partido, la aplicación elimina el partido y sus eventos dentro de una única transacción IndexedDB. Los equipos y jugadores no se eliminan y pueden reutilizarse inmediatamente.

---

# PWA y funcionamiento offline

Futsal Stats incluye manifiesto y Service Worker de Angular. En una compilación de producción, los recursos necesarios se precargan para poder utilizar la aplicación sin conexión después de la primera carga correcta.

Los datos permanecen en el dispositivo mediante IndexedDB. No se envían a ningún servidor ni se sincronizan entre dispositivos.

> **Importante:** borrar los datos del sitio desde el navegador elimina equipos, jugadores, partidos y eventos almacenados localmente. El equipo incorporado Apaga vuelve a crearse en el siguiente arranque.

Para un entorno de partido se recomienda abrir la aplicación y comprobar que carga correctamente **antes de perder conectividad**.

---

# Roadmap de iteraciones

Las siguientes etapas describen la dirección prevista después de `alpha_0.1`. Son objetivos de evolución del proyecto y **no representan funcionalidades incluidas actualmente** salvo que se indique expresamente.

## Iteración 1 — Consolidación UI/UX y design system

**Objetivo:** convertir la interfaz actual en un sistema visual completamente consistente y preparado para uso intensivo durante un partido.

Trabajo previsto:

- consolidar tokens globales de color, espaciado, tipografía, bordes, radios y elevación;
- mantener el tema oscuro basado en navy, midnight blue y azules fríos;
- eliminar colores y estilos hardcoded restantes;
- homogeneizar estados `hover`, `focus-visible`, `active`, `pressed`, `disabled` y `selected`;
- revisar contraste y accesibilidad;
- eliminar CSS/SCSS duplicado o legacy;
- reducir `!important`, nesting excesivo y especificidad innecesaria;
- unificar iconografía y dimensiones de controles.

### Criterio de finalización

No deberían existir dos componentes conceptualmente equivalentes con estilos, alturas o comportamientos visuales diferentes sin una razón de diseño explícita.

---

## Iteración 2 — Rediseño de controles de partido

**Objetivo:** dejar de tratar todas las acciones como botones genéricos y convertirlas en componentes especializados para operación rápida.

Trabajo previsto:

- diferenciar `Button`, `IconButton`, `ActionButton`, `ActionTile`, `SegmentedControl` y `PlayerTile`;
- rediseñar la geometría de las acciones rápidas;
- reforzar el feedback táctil de Gol, Gol rival, Falta, Falta rival y Disciplina banquillo;
- mantener targets táctiles cercanos o superiores a 44 px cuando corresponda;
- evitar interacciones dependientes exclusivamente de `hover`;
- optimizar los estados `pressed` para iPad y móvil;
- revisar la jerarquía entre acciones frecuentes, secundarias y administrativas;
- conservar colores semánticos de sanción sin saturar grandes superficies.

### Criterio de finalización

La diferencia respecto a la interfaz anterior debe ser estructural: geometría, composición, jerarquía e interacción; no únicamente un cambio de color o sombra.

---

## Iteración 3 — Optimización específica para tablet y móvil

**Objetivo:** considerar iPad y dispositivos móviles como plataformas de primer nivel, no como una versión reducida del escritorio.

Trabajo previsto:

- revisar layouts en portrait y landscape;
- comprobar puntos de ruptura por necesidad real del contenido;
- optimizar el grid de partido en pantallas intermedias;
- mejorar áreas táctiles y separación entre acciones críticas;
- revisar `safe-area-inset-*` en iOS cuando corresponda;
- eliminar dependencias de hover;
- revisar drawers, modales y overlays en Safari iOS/iPadOS;
- validar scroll, elementos `sticky` y controles `fixed`;
- comprobar tamaños próximos a 1024, 834, 768, 430, 390 y 375 px.

### Criterio de finalización

Las operaciones principales de un partido deben poder realizarse cómodamente en iPad y móvil sin zoom, sin targets demasiado pequeños y sin pérdida de funcionalidades críticas.

---

## Iteración 4 — Robustez de datos y ciclo de vida del partido

**Objetivo:** reforzar la seguridad del flujo local-first antes de ampliar funcionalidades.

Trabajo previsto:

- ampliar tests de recuperación ante cierre/recarga;
- probar interrupciones durante operaciones de escritura;
- reforzar mensajes de error y recuperación;
- validar comportamiento offline durante un partido completo;
- revisar migraciones de esquema Dexie antes de introducir cambios de datos;
- mantener operaciones críticas dentro de transacciones;
- validar que un fallo de eliminación nunca deje el estado de memoria desincronizado respecto a IndexedDB.

---

## Iteración 5 — Estadísticas y exportación

**Objetivo:** mejorar la explotación del histórico ya registrado sin comprometer la velocidad de entrada de datos.

Posibles líneas de trabajo:

- mejorar la lectura de estadísticas por jugador y quinteto;
- añadir comparativas y resúmenes visuales donde aporten valor;
- revisar la presentación de tiempo de juego y participación;
- mejorar la experiencia de exportación CSV;
- evaluar nuevos formatos de exportación únicamente si existe una necesidad clara;
- mantener el Event Store como fuente de verdad para todas las estadísticas derivadas.

---

## Iteración 6 — Revisión de la funcionalidad de reglamento

**Objetivo:** reevaluar la funcionalidad actualmente oculta antes de volver a exponerla al usuario.

Antes de reactivarla deberá validarse:

- compatibilidad real en Safari de iPhone y iPad;
- comportamiento sin backend si se mantiene ese requisito;
- tamaño de descarga y consumo de memoria;
- funcionamiento offline;
- tiempos de inicialización;
- experiencia de consulta durante un partido;
- calidad y trazabilidad del contenido reglamentario;
- comportamiento cuando la funcionalidad no pueda inicializarse.

La aplicación principal no debe depender de esta funcionalidad para registrar un partido.

---

# Tecnologías

- Angular 22 con componentes standalone.
- TypeScript estricto.
- Angular Signals para estado reactivo.
- Angular Router y Reactive Forms.
- Dexie sobre IndexedDB para persistencia.
- Angular Service Worker para capacidades PWA.
- SCSS responsive orientado a móvil y tablet.
- Vitest y Angular Testing Utilities.

---

# Requisitos

- Node.js compatible con Angular 22.
- npm.
- El proyecto declara `npm@12.0.2` como gestor recomendado.

---

# Instalación

```bash
npm install
```

---

# Ejecutar en local

```bash
npm start
```

La aplicación estará disponible normalmente en:

```text
http://localhost:4200
```

---

# Tests

```bash
npm test
```

Los tests cubren reloj, ciclo de vida, eventos, sustituciones, goles, faltas, estadísticas, undo, recuperación, eliminación de partidos y flujos principales de UI.

---

# Build de producción

```bash
npm run build
```

El resultado se genera en:

```text
dist/futsal-stats
```

Para comprobar la instalación PWA y el comportamiento offline hay que servir el contenido compilado con un servidor HTTP local o mediante HTTPS. El Service Worker no se activa con la configuración de desarrollo de `ng serve`.

---

# Otros comandos

```bash
# Build continuo con configuración de desarrollo
npm run watch

# Ejecutar Angular CLI
npm run ng -- <comando>
```

---

# Rutas principales

| Ruta | Descripción |
| --- | --- |
| `/matches` | Gestor de partidos activos y finalizados |
| `/matches/new` | Preparación de convocatoria y quinteto inicial |
| `/live/:matchId` | Registro del partido en directo |
| `/teams` | Listado de equipos |
| `/teams/new` | Creación de un equipo |
| `/teams/:teamId` | Plantilla de un equipo |
| `/teams/:teamId/edit` | Edición de un equipo |

El acceso directo a `/matches/new` se protege cuando ya existe un partido activo.

---

# Arquitectura

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

## Persistencia

La base de datos local contiene cuatro tablas:

- `teams`
- `players`
- `matches`
- `events`

El reloj persistido forma parte del registro `Match`. Marcador, faltas, quintetos, minutos y estadísticas se calculan a partir de los eventos; no se guardan copias derivadas innecesarias.

## Event Store

Las acciones relevantes se registran como `MatchEvent`. Los eventos son append-only y se ordenan mediante `sequence` y `timestamp`.

La operación de deshacer añade un evento compensatorio `EVENT_UNDONE`, manteniendo intacto el evento original. Esto permite reconstruir de manera determinista:

- marcador;
- faltas por periodo;
- quinteto actual;
- minutos jugados;
- estadísticas de jugadores y quintetos;
- timeline visible.

## Reloj

El reloj guarda un snapshot con tiempo restante, duración del periodo, estado de ejecución y timestamp de inicio. Mientras está en marcha, el tiempo visible se proyecta desde el timestamp real para evitar drift por intervalos retrasados.

Al recuperar un partido, el estado se sincroniza con el tiempo transcurrido y se persiste una parada automática si el periodo ya llegó a cero.

## Eliminación de partidos

La eliminación de un partido y todos sus eventos se realiza dentro de una única transacción IndexedDB. Equipos y jugadores quedan fuera de esa transacción y pueden reutilizarse inmediatamente.

El estado en memoria del partido en directo solo se limpia después de que IndexedDB confirme la eliminación. Si la operación falla, el partido continúa disponible y se informa al usuario.

---

# Principios del proyecto

- Experiencia mobile-first y controles táctiles grandes.
- Un solo partido activo para evitar ambigüedades.
- IndexedDB como fuente persistente local.
- Eventos como fuente de verdad de las estadísticas.
- Cálculos de dominio puros y cubiertos por tests.
- Operaciones críticas transaccionales.
- Sin NgRx, backend ni dependencias visuales innecesarias.
- La entrada de datos durante el partido tiene prioridad sobre cualquier funcionalidad secundaria.
- Las funcionalidades experimentales no deben comprometer la estabilidad del flujo principal.

---

# Release `alpha_0.1`

Primera versión alpha de Futsal Stats centrada en establecer una base sólida para el registro y seguimiento de estadísticas durante partidos de fútbol sala.

Incluye el flujo principal de gestión de partido, persistencia local, registro de eventos, estadísticas derivadas, exportación CSV, soporte PWA y una interfaz optimizada para escritorio y dispositivos táctiles.

La funcionalidad relacionada con la consulta del reglamento permanece temporalmente oculta mientras continúa su validación.