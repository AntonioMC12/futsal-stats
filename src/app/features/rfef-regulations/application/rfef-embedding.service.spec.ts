import { RFEF_EMBEDDING_MODEL } from '../domain/rfef-embedding-config';
import { RfefCorpus, RfefEmbeddingsMetadata } from '../domain/rfef-corpus';
import { dotProduct, validateIndex } from './rfef-embedding.service';

const corpus: RfefCorpus = {
  manifest: {
    corpusId: 'test',
    version: 'revision-ok',
    federation: 'RFEF',
    sport: 'Fútbol Sala',
    season: '2026/27',
    revisionDate: '2026-08-26',
    generatedAt: '2026-09-01T00:00:00.000Z',
    chunksFile: 'chunks.json',
    chunkCount: 1,
    documents: [],
  },
  chunks: [
    {
      id: 'chunk-1',
      season: '2026/27',
      documentId: 'doc',
      documentTitle: 'Documento',
      documentDate: '2026-08-26',
      section: 'Sección',
      text: 'Texto',
      keywords: [],
      sourceUrl: 'https://rfef.es/doc.pdf',
    },
  ],
};

function metadata(overrides: Partial<RfefEmbeddingsMetadata> = {}): RfefEmbeddingsMetadata {
  return {
    formatVersion: 1,
    corpusRevision: corpus.manifest.version,
    modelId: RFEF_EMBEDDING_MODEL.id,
    modelRevision: RFEF_EMBEDDING_MODEL.revision,
    dtype: RFEF_EMBEDDING_MODEL.dtype,
    embeddingDimension: RFEF_EMBEDDING_MODEL.dimension,
    vectorCount: 1,
    normalized: true,
    binaryFile: 'embeddings.f32',
    entries: [{ chunkId: 'chunk-1', offset: 0 }],
    ...overrides,
  };
}

describe('RfefEmbeddingService', () => {
  it('calcula dot product equivalente a coseno para vectores normalizados', () => {
    expect(dotProduct(new Float32Array([1, 0]), new Float32Array([0.5, 0.5]))).toBe(0.5);
  });

  it('acepta artifact con revisión, modelo, dimensión e ids compatibles', () => {
    const binary = new ArrayBuffer(RFEF_EMBEDDING_MODEL.dimension * 4);
    expect(validateIndex(metadata(), binary, corpus).vectors).toHaveLength(
      RFEF_EMBEDDING_MODEL.dimension,
    );
  });

  it('rechaza un artifact de otra revisión y habilita el fallback seguro', () => {
    const binary = new ArrayBuffer(RFEF_EMBEDDING_MODEL.dimension * 4);
    expect(() =>
      validateIndex(metadata({ corpusRevision: 'desactualizada' }), binary, corpus),
    ).toThrow();
  });
});
