export interface RfefRetrievalBenchmarkCase {
  question: string;
  expectedChunkIds: readonly string[];
  expectedEmpty?: boolean;
  note?: string;
}

export const RFEF_RETRIEVAL_BENCHMARK: readonly RfefRetrievalBenchmarkCase[] = [
  {
    question: '¿Qué pasa si expulsan al entrenador por protestar?',
    expectedChunkIds: ['c10-bench-cards', 'c10-bench-electronics'],
  },
  {
    question: '¿Cuánto tiempo estamos con uno menos?',
    expectedChunkIds: [],
    expectedEmpty: true,
    note: 'El corpus instalado no incluye todavía una regla oficial de reducción numérica.',
  },
  {
    question: '¿Qué pasa con la sexta?',
    expectedChunkIds: ['c10-sixth-foul-example', 'c10-fifth-foul-review'],
  },
  {
    question: 'segunda tarjeta amarilla',
    expectedChunkIds: ['c10-second-yellow-review'],
  },
] as const;
