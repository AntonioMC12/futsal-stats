# Historial de partidos en iPad y anchuras intermedias

## Problema y causa

La página `Partidos` dividía sus paneles en dos columnas desde 768 px. En tablet, el historial quedaba en una columna estrecha y cada tarjeta intentaba mantener el contenido y los controles en una sola fila. Los nombres largos competían con «Ver detalle» y el menú contextual por ese espacio.

## Solución

- `src/app/features/matches/ui/matches-page.html`: el contenido de cada tarjeta tiene una región identificable, separada de `.history-actions`.
- `src/app/features/matches/ui/matches-page.scss`: la página usa una columna hasta 1359 px y recupera dos desde 1360 px. Dentro de cada tarjeta, `flex-wrap` mueve las acciones completas a otra fila cuando su contenido y los botones no caben juntos. La región de contenido puede encogerse y partir textos largos; el rival conserva su nombre completo. El menú tiene un área táctil mínima de 44 × 44 px. No se emplean coordenadas absolutas ni reglas por dispositivo.
- `src/app/features/matches/ui/matches-page.spec.ts`: prueba tarjetas consecutivas con metadatos largos y cortos, regiones independientes, enlace y nombre accesible del menú.
- `README.md` y `docs/match-history.md`: comportamiento responsive documentado.

El modelo de partido actual no tiene campo de jornada; esta corrección conserva los metadatos realmente disponibles sin añadir uno nuevo.

## Verificación

- `npm test`: 98 archivos, 521 pruebas correctas.
- `npm run build`: correcto; advertencia existente de presupuesto inicial (789,57 kB frente a 500 kB) y advertencia de `eval` en una dependencia.
- `npm run lint`: no existe ese script en `package.json`. Prettier pasa en los archivos de código modificados; `git diff --check` no detecta errores.
- Las reglas CSS cubren los anchos de referencia de 768, 820, 834, 1024, 1180, 1194 y 1366 px, además de móvil. La comprobación visual e interacción real en esos viewports y en iPad/Safari sigue pendiente: no había ningún navegador conectado a esta sesión.

## Riesgo pendiente

La prueba de componente comprueba estructura y contenido, pero jsdom no calcula geometría. Conviene revisar en un navegador real que no haya desbordamiento y que el menú abierto mantenga una posición cómoda en iPad landscape y portrait.
