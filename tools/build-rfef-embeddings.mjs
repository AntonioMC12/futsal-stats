import { pipeline } from '@huggingface/transformers';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const MODEL_ID = 'Xenova/multilingual-e5-small';
const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const DTYPE = 'int8';
const DIMENSION = 384;
const root = resolve(import.meta.dirname, '..');
const rfefDir = resolve(root, 'public/rfef');
const [manifest, chunks] = await Promise.all([
  readFile(resolve(rfefDir, 'manifest.json'), 'utf8').then(JSON.parse),
  readFile(resolve(rfefDir, 'chunks.json'), 'utf8').then(JSON.parse),
]);

const startedAt = performance.now();
let lastProgress = -1;
const extractor = await pipeline('feature-extraction', MODEL_ID, {
  revision: MODEL_REVISION,
  dtype: DTYPE,
  device: 'cpu',
  progress_callback: (event) => {
    if (typeof event?.progress !== 'number') return;
    const progress = Math.floor(event.progress);
    if (progress >= lastProgress + 10) {
      lastProgress = progress;
      console.log(`Modelo: ${progress}%`);
    }
  },
});

const orderedChunks = [...chunks].sort((left, right) => left.id.localeCompare(right.id));
const vectors = new Float32Array(orderedChunks.length * DIMENSION);
const entries = [];

for (const [index, chunk] of orderedChunks.entries()) {
  const passage = `passage: ${chunk.section}\n${chunk.keywords.join(', ')}\n${chunk.text}`;
  const output = await extractor(passage, { pooling: 'mean', normalize: true });
  if (output.data.length !== DIMENSION) {
    throw new Error(`Dimensión inesperada para ${chunk.id}: ${output.data.length}.`);
  }
  vectors.set(output.data, index * DIMENSION);
  entries.push({ chunkId: chunk.id, offset: index * DIMENSION });
  console.log(`Embedding ${index + 1}/${orderedChunks.length}: ${chunk.id}`);
}

const metadata = {
  formatVersion: 1,
  corpusRevision: manifest.version,
  modelId: MODEL_ID,
  modelRevision: MODEL_REVISION,
  dtype: DTYPE,
  embeddingDimension: DIMENSION,
  vectorCount: entries.length,
  normalized: true,
  binaryFile: 'embeddings.f32',
  entries,
};

await mkdir(rfefDir, { recursive: true });
await Promise.all([
  writeFile(resolve(rfefDir, 'embeddings.json'), `${JSON.stringify(metadata, null, 2)}\n`),
  writeFile(
    resolve(rfefDir, metadata.binaryFile),
    Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength),
  ),
]);

await extractor.dispose();
const binarySize = (await stat(resolve(rfefDir, metadata.binaryFile))).size;
console.log(
  `Listo: ${entries.length} vectores, ${DIMENSION} dimensiones, ${binarySize} bytes, ${Math.round(performance.now() - startedAt)} ms.`,
);
