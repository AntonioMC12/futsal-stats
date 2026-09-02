# Corpus reglamentario de fútbol sala

El buscador local combina dos fuentes oficiales:

1. El texto íntegro de las Reglas de Juego del Futsal 2025/2026, publicado por la RFEF como anexo de la Circular 27.
2. La Circular 10 rectificativa de la temporada 2026/27, que tiene prioridad cuando modifica la base anterior.

El reglamento completo se divide por página y sección en fragmentos de hasta 1400 caracteres, con solapamiento. Cada fragmento conserva documento, fecha, página y URL oficial. El corpus resultante contiene 289 fragmentos y su índice semántico usa 289 vectores de 384 dimensiones.

Los cuatro archivos de `public/rfef` se precargan mediante el service worker y ocupan menos de 1 MB en conjunto. Por tanto, ampliar el reglamento no aumenta la descarga del modelo generativo y la búsqueda sigue funcionando sin conexión.

## Actualización

Para importar de nuevo el PDF oficial y regenerar el índice:

```powershell
node tools/build-rfef-corpus.mjs --import-futsal-rules C:\ruta\Circular_27_con_anexos.pdf
npm run embeddings:build
npm run corpus:check
```

El importador valida que estén presentes las 17 reglas, un mínimo de contenido y texto UTF-8 sin corrupción.
