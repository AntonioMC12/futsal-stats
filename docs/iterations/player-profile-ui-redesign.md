# Iteración `feature/player-profile-ui-redesign`

## Objetivo

Reorganizar el perfil de jugador como una herramienta compacta de análisis deportivo sin cambiar
el dominio, la persistencia ni los flujos de edición, fotografía, temporada o navegación.

## Rama

Rama recomendada para la entrega: `feature/player-profile-ui-redesign`.

## Componentes creados

- `ProfileMetricComponent`: métrica principal o compacta con variantes neutral, positiva, negativa
  y sin datos.
- `ProfileStatusBadgeComponent`: badge reutilizable para identidad y resultados.
- `SeasonSelectorComponent`: selector presentacional accesible que emite el cambio de temporada.
- `MatchHistoryRowComponent`: fila deportiva navegable con fecha, rival, marcador, aportación,
  balance y resultado.

## Componentes reutilizados

- Botones globales del design system.
- Tokens semánticos de color, espacio, radios, foco y touch targets.
- `PlayerProfileStore` y las proyecciones de estadísticas existentes.
- Flujo actual de fotografía y formulario reactivo.

## Estructura final

1. Vuelta a plantilla.
2. Player Overview unificado con avatar, identidad, badges, resumen de carrera, ficha y edición.
3. Seguimiento individual con selector de temporada.
4. Cuatro métricas principales.
5. Métricas compactas e indicadores de rendimiento derivados de datos existentes.
6. Histórico en filas deportivas compactas.

## Responsive

- Desktop e iPad landscape: overview horizontal, cuatro métricas principales y tabla deportiva.
- Tablet portrait: overview en dos bloques, métricas principales 2×2 y rendimiento a ancho completo.
- Móvil: avatar e identidad compactos, acciones apiladas, métricas a dos columnas e histórico
  reducido a rival, marcador y resultado.
- No se utilizan alturas rígidas ni posicionamiento absoluto para el layout estructural.

## Cambios visuales

- Se eliminan la cabecera y ficha lateral separadas.
- Las métricas principales dominan la jerarquía sin tarjetas sobredimensionadas.
- Los datos no disponibles muestran `Sin registro` con contraste reducido.
- El histórico deja de usar tarjetas grandes y convierte toda la fila en enlace.
- La edición se expande dentro del mismo Player Overview.

## Tests

- Render de métricas con datos y variante sin registro.
- Badges positive, neutral y negative.
- Emisión del selector de temporada.
- Fila histórica navegable.
- Identidad, dorsal, posición, pie, estado y métricas del perfil.
- Cambio de temporada, edición, errores de guardado, descarte y permisos de solo lectura.

## Archivos modificados

- `src/app/features/player-profiles/ui/player-profile-page.*`
- `src/app/features/player-profiles/ui/components/*`
- `src/styles.scss`
- `README.md`
- `docs/player-profiles.md`

## Decisiones relevantes

- No se crea un nuevo ViewModel porque `PlayerProfileStore` ya expone identidad, historial y
  agregados con la separación de capas requerida.
- Participación, impacto y resultados reutilizan agregados existentes; no se persisten insights.
- Un único badge cubre estado del jugador y resultado del partido mediante variantes semánticas.
- El SCSS de página se incluye globalmente pero queda aislado bajo `app-player-profile-page` para
  respetar el presupuesto de estilos por componente sin contaminar otras pantallas.

## Limitaciones

- No hay filtros por competición en el perfil; solo se conserva el selector de temporada existente.
- La validación visual interactiva requiere un navegador conectado a la sesión de desarrollo.
- El repositorio no dispone de un script `lint`.

## Mejoras futuras

- Regresión visual automatizada para los cinco viewports de referencia.
- Filtros de competición si se incorporan al store como requisito funcional.
- Nuevos insights únicamente cuando el dominio exponga datos fiables adicionales.
