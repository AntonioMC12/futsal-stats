# Sidebar fijo y métricas del perfil de jugador

## Rama y objetivo

Rama local: `fix/player-profile-layout-and-fixed-sidebar`, creada desde `develop` local alineada con `master`. La rama remota `develop` seguía por detrás al comenzar; no se publicó ningún cambio remoto.

La iteración mantiene visible la navegación lateral de escritorio mientras se desplaza la vista activa y separa Paradas de Faltas recibidas en el perfil.

## Cambios y decisiones

- `src/app/shared/components/app-shell/app-shell.scss`: el shell de escritorio ocupa `100dvh`, contiene el overflow y deja `.shell__main` como área desplazable. El sidebar conserva el alto del viewport. Las reglas especiales de Live Match y Strategy Designer mantienen su control de overflow.
- `src/app/features/player-profiles/domain/player-profile-statistics.ts`: `statisticsV2Matches` sustituye al contador implícito basado en disparos. La cobertura se determina mediante `Match.statisticsSchemaVersion === 2`; los valores de disparos, paradas y faltas recibidas siguen sumándose desde eventos distintos. Los snapshots legacy permanecen excluidos de los totales completos.
- `src/app/features/player-profiles/ui/player-profile-page.html`, `.ts`, `.scss` y `src/styles.scss`: tarjetas separadas, orden de lectura por métricas principales/rendimiento/contexto, `0` frente a `—`, singular/plural de cobertura, destaque de Paradas para posiciones de portero y paradas registradas en su histórico compacto. Los estilos globales del destaque están acotados al perfil para respetar el presupuesto de tamaño del componente.
- `src/app/features/player-profiles/domain/player-profile-statistics.spec.ts` y `ui/player-profile-page.spec.ts`: agregación independiente, temporadas con y sin cobertura v2, cero frente a ausencia, orden de tarjetas y comportamiento de portero.
- `src/app/core/sync/offline-sync.service.spec.ts`: las expectativas de sincronización esperan el reintento asíncrono que puede iniciarse tras `initialize()`. Corrige una carrera intermitente de esa prueba sin cambiar producción.
- `README.md` y `docs/player-profiles.md`: comportamiento y semántica actualizados.

## Verificación y pendientes

- `npm test`: 98 archivos y 522 pruebas correctas.
- `npm run build`: correcto. Persisten la advertencia del bundle inicial (790,11 kB frente a 500 kB) y la advertencia de `eval` de una dependencia. No hay advertencia de presupuesto de estilos del perfil.
- `npm run lint`: no existe el script en `package.json`. Prettier pasa en el código modificado y `git diff --check` no detecta errores.
- Validación visual real en desktop, iPad y móvil: pendiente; no había un navegador conectado a esta sesión. Las pruebas de componente no miden desplazamiento, doble scrollbar ni solapamientos visuales. Debe comprobarse además la altura disponible del sidebar en ventanas de escritorio especialmente bajas.
