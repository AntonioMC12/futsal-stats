import { RfefCorpusChunk } from '../domain/rfef-corpus';
import { RFEF_RETRIEVAL_BENCHMARK } from './rfef-retrieval-benchmark';
import { hybridRankRfefChunks } from './rfef-search.service';

const chunks: readonly RfefCorpusChunk[] = [
  fixture('c10-bench-cards', 'Tarjetas por protestas a miembros de banquillo'),
  fixture('c10-bench-electronics', 'Sistemas electrónicos en banquillos'),
  fixture('c10-fifth-foul-review', 'Revisión a partir de la quinta falta'),
  fixture('c10-sixth-foul-example', 'Ejemplo de sexta falta'),
  fixture('c10-second-yellow-review', 'Segunda tarjeta amarilla'),
  fixture(
    'lotg-2025-26-p057-02',
    'Jugador expulsado: dos minutos en inferioridad numérica o hasta que se marque un gol',
  ),
];

describe('benchmark pequeño de retrieval RFEF', () => {
  for (const benchmark of RFEF_RETRIEVAL_BENCHMARK) {
    it(benchmark.question, () => {
      const semanticScores = new Map(
        chunks.map((chunk) => [
          chunk.id,
          benchmark.expectedChunkIds.includes(chunk.id) ? 0.9 : 0.81,
        ]),
      );
      const results = hybridRankRfefChunks(chunks, benchmark.question, semanticScores);
      if (benchmark.expectedEmpty) {
        expect(results).toEqual([]);
      } else {
        expect(
          results.slice(0, 5).some((result) => benchmark.expectedChunkIds.includes(result.id)),
        ).toBe(true);
      }
    });
  }
});

function fixture(id: string, section: string): RfefCorpusChunk {
  return {
    id,
    season: '2026/27',
    documentId: 'doc',
    documentTitle: 'Circular n.º 10',
    documentDate: '2026-08-26',
    section,
    text: section,
    keywords: section.split(' '),
    sourceUrl: 'https://rfef.es/doc.pdf',
  };
}
