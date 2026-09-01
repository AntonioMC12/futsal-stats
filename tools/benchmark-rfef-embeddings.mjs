import { pipeline } from '@huggingface/transformers';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = resolve(import.meta.dirname, '..');
const rfefDir = resolve(root, 'public/rfef');
const [metadata, binary] = await Promise.all([
  readFile(resolve(rfefDir, 'embeddings.json'), 'utf8').then(JSON.parse),
  readFile(resolve(rfefDir, 'embeddings.f32')),
]);
const vectors = new Float32Array(binary.buffer, binary.byteOffset, binary.byteLength / 4);
const extractor = await pipeline('feature-extraction', metadata.modelId, {
  revision: metadata.modelRevision,
  dtype: metadata.dtype,
  device: 'cpu',
});
const questions = [
  '¿Qué pasa si expulsan al entrenador por protestar?',
  '¿Cuánto tiempo estamos con uno menos?',
  '¿Qué pasa con la sexta?',
  'segunda tarjeta amarilla',
];

for (const question of questions) {
  const startedAt = performance.now();
  const output = await extractor(`query: ${question}`, { pooling: 'mean', normalize: true });
  const scores = metadata.entries
    .map((entry) => ({
      chunkId: entry.chunkId,
      score: dot(
        output.data,
        vectors.subarray(entry.offset, entry.offset + metadata.embeddingDimension),
      ),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
  console.log(`\n${question} (${Math.round(performance.now() - startedAt)} ms)`);
  console.table(scores);
}

await extractor.dispose();

function dot(left, right) {
  let value = 0;
  for (let index = 0; index < left.length; index++) value += left[index] * right[index];
  return value;
}
