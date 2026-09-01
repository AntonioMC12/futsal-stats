import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const manifestPath = resolve(root, 'public/rfef/manifest.json');
const chunksPath = resolve(root, 'public/rfef/chunks.json');

// Iteración 1: acepta un paquete JSON ya curado y valida el corpus final. La extracción
// desde PDF se añadirá cuando exista una fuente automatizable y verificable.
const command = process.argv[2];
let manifest;
let chunks;

if (command === '--build') {
  const inputPath = process.argv[3];
  if (!inputPath) throw new Error('Uso: --build <paquete-curado.json>');
  ({ manifest, chunks } = JSON.parse(await readFile(resolve(inputPath), 'utf8')));
  validate(manifest, chunks);
  await mkdir(resolve(root, 'public/rfef'), { recursive: true });
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(chunksPath, `${JSON.stringify(chunks, null, 2)}\n`),
  ]);
} else if (command === '--check') {
  [manifest, chunks] = await Promise.all([
    readFile(manifestPath, 'utf8').then(JSON.parse),
    readFile(chunksPath, 'utf8').then(JSON.parse),
  ]);
  validate(manifest, chunks);
} else {
  console.error('Uso: --check | --build <paquete-curado.json>');
  process.exitCode = 1;
}

if (manifest && chunks) {
  console.log(`Corpus ${manifest.version} válido: ${chunks.length} fragmentos oficiales.`);
}

function validate(manifest, chunks) {
  if (!Array.isArray(chunks) || manifest.chunkCount !== chunks.length) {
    throw new Error('El número de fragmentos no coincide con el manifiesto.');
  }
  const required = [
    'id',
    'season',
    'documentId',
    'documentTitle',
    'documentDate',
    'section',
    'text',
    'keywords',
    'sourceUrl',
  ];
  for (const [index, chunk] of chunks.entries()) {
    for (const field of required) {
      if (!(field in chunk)) throw new Error(`Fragmento ${index}: falta ${field}.`);
    }
    if (chunk.season !== manifest.season || !chunk.sourceUrl.startsWith('https://rfef.es/')) {
      throw new Error(`Fragmento ${chunk.id}: temporada o fuente no válidas.`);
    }
  }
}
