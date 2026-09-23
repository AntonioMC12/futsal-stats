# Iteración `feature/dashboard-home`

## Objetivo

Convertir `Inicio` en una Home operativa para el cuerpo técnico, manteniendo el aislamiento por
equipo, la persistencia local-first y `MatchEvent` como fuente de verdad estadística.

## Alcance entregado

- Cabecera `Resumen`, estado de sincronización y acceso al flujo existente de nuevo partido.
- KPIs de partidos, balance W/D/L, porcentaje de victorias, goles y plantilla.
- Ranking de minutos de los seis últimos partidos finalizados.
- Tarjeta del último partido con marcador, resultado y métricas disponibles.
- Cinco últimos resultados navegables y acceso al histórico completo.
- Vista rápida de cinco jugadores con dorsal, posición y estado real `active`.
- Estados de carga, error recuperable, ausencia de partidos, minutos y jugadores.
- Adaptación a escritorio, tablet y móvil sin alterar la navegación principal.

No se añadió un bloque de próximo partido, accesos al sidebar, gráficas externas ni cambios al
flujo de partido en directo.

## Arquitectura

`DashboardFacade` es la frontera de aplicación de la pantalla. Lee una vez la lista de partidos y
la plantilla del equipo activo, carga en paralelo los eventos de cada partido y entrega un único
`DashboardViewModel`. La función pura `buildDashboardViewModel` concentra la composición y puede
probarse sin Angular ni persistencia.

El componente de página solo gestiona carga, reintento y protección frente a respuestas obsoletas
al cambiar de equipo. No conoce IndexedDB, Supabase ni repositorios cloud.

## Fuentes de datos

- `MatchRepository.listByTeam`: temporada, fecha, rival, competición y estado.
- `MatchEventRepository.listByMatch`: marcador, minutos y estadísticas derivadas.
- `PlayerRepository.listByTeam`: dorsal, nombre, posición y estado activo.
- `deriveMatchState`: marcador reproducido desde eventos.
- `deriveMatchStatistics`: minutos, tiros y participación ya definidos por el dominio.
- Snapshot legacy: marcador y segundos jugados de importaciones antiguas cuando no hay eventos.

Los KPIs de resultado y goles consideran únicamente partidos finalizados de la temporada más
reciente. El total de partidos incluye todos los registros de esa temporada. El ranking usa los
seis últimos finalizados y el histórico muestra cinco.

## UI y responsive

Tailwind se incorporó como capa de utilidades para grid, flex, espaciado y breakpoints, conservando
los tokens semánticos del design system en los estilos específicos. En escritorio el contenido
forma una cuadrícula 8/4; en tablet mantiene dos columnas cuando hay espacio; en móvil se ordena
como KPIs, último partido, minutos, histórico y plantilla. El historial se transforma en filas
compactas para evitar scroll horizontal.

Los resultados incluyen texto además de color, los destinos son enlaces reales, el reintento es un
botón y todos los controles mantienen el foco visible global.

## Tests y validación

- Agregación W/D/L, goles, diferencial y porcentaje.
- Selección de temporada, último partido y últimos cinco partidos.
- Ranking real de minutos y límite de seis partidos.
- Estado vacío.
- Render de datos y estados vacíos.
- Enlaces a resumen, histórico y plantilla.
- `npm test`: 99 archivos, 526 pruebas superadas.
- `npm run build`: compilación de producción superada.

El repositorio no define un script `lint`; la compilación Angular y Prettier cubren las validaciones
estáticas disponibles en esta iteración.

## Limitaciones y deuda técnica

- La temporada activa se infiere del partido más reciente porque todavía no existe una preferencia
  de temporada activa en el workspace.
- El repositorio de eventos no ofrece lectura por lote; las lecturas por partido se paralelizan para
  evitar una cascada secuencial. Una API `listByMatchIds` reduciría operaciones en historiales largos.
- La disponibilidad deportiva solo modela `active`, por lo que se muestra `Activo`/`Inactivo`.
- Las métricas de tiros solo aparecen en partidos con esquema estadístico v2.

## Mejoras futuras

- Selector últimos 6 / últimos 10 / temporada para minutos.
- Preferencia explícita de temporada activa.
- Consulta por lote de eventos y caché compartida de agregados de dashboard/histórico.
- Capturas automatizadas de regresión visual para los breakpoints principales.
