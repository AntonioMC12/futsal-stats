# Actualizaciones de la PWA

Futsal Stats usa Angular Service Worker en builds de producción. Al detectar y descargar una versión, la aplicación muestra un aviso persistente y deja que el usuario decida cuándo recargar.

## Seguridad durante partidos

Antes de ofrecer o aplicar una actualización se consulta `MatchRepository.findActive()`, la misma fuente de verdad que impide crear dos partidos activos. Si hay un partido preparado o en curso, la actualización queda aplazada. Al finalizar el partido y navegar de vuelta al listado se vuelve a comprobar el estado y se ofrece la actualización; nunca se recarga automáticamente.

## Versión visible

`tools/generate-app-version.mjs` genera la constante que consume la interfaz y `ngsw-config.generated.json` a partir del campo `version` de `package.json`. El `appData` generado permite identificar la versión disponible en los eventos del worker. Los scripts de inicio, test y build ejecutan el generador para evitar mantener versiones duplicadas.

## Cómo probar una actualización

1. Generar y desplegar un build de producción A.
2. Instalar o abrir la PWA y confirmar la versión desde Ajustes.
3. Cambiar la versión de `package.json`, generar y desplegar el build B.
4. Volver a primer plano o pulsar **Buscar actualizaciones**.
5. Verificar los flujos sin partido, con partido activo, después de finalizarlo y sin conexión.

El service worker está deshabilitado durante `ng serve`. Para estas pruebas se necesita servir el contenido de `dist/futsal-stats/browser` mediante HTTPS o `localhost` y no mezclar builds en el mismo directorio durante una publicación.

## Caché del hosting

El repositorio no contiene configuración de un proveedor de hosting concreto. El CDN o servidor elegido debe revalidar `index.html` y `ngsw.json` (`Cache-Control: no-cache`). Los JavaScript y CSS con hash pueden usar caché larga e inmutable. La publicación debe ser atómica para no servir `ngsw.json` antes que los recursos que referencia.

## Diagnóstico de versiones antiguas

- Confirmar en Ajustes la versión instalada y ejecutar una búsqueda manual con conexión.
- Revisar en las herramientas del navegador que `ngsw-worker.js` controla la aplicación y que `ngsw.json` se revalida.
- Comprobar que el hosting no conserva `index.html` o `ngsw.json` con caché larga.
- Revisar los eventos `update_*` de la consola. No se borran IndexedDB ni cachés manualmente como parte del flujo normal.
