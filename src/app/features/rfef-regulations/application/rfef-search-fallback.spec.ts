import { TestBed } from '@angular/core/testing';
import { RfefCorpusService } from './rfef-corpus.service';
import { RfefEmbeddingService } from './rfef-embedding.service';
import { RfefSearchService } from './rfef-search.service';

describe('RfefSearchService fallback', () => {
  it('mantiene búsqueda textual si embeddings no están disponibles', async () => {
    TestBed.configureTestingModule({
      providers: [
        RfefSearchService,
        {
          provide: RfefCorpusService,
          useValue: {
            load: async () => ({
              manifest: { version: 'test' },
              chunks: [
                {
                  id: 'tarjeta',
                  season: '2026/27',
                  documentId: 'doc',
                  documentTitle: 'Circular',
                  documentDate: '2026-08-26',
                  section: 'Segunda tarjeta amarilla',
                  text: 'Texto exacto.',
                  keywords: ['tarjeta'],
                  sourceUrl: 'https://rfef.es/doc.pdf',
                },
              ],
            }),
          },
        },
        { provide: RfefEmbeddingService, useValue: { semanticScores: async () => null } },
      ],
    });

    const results = await TestBed.inject(RfefSearchService).search('segunda tarjeta amarilla');
    expect(results.map((result) => result.id)).toContain('tarjeta');
  });
});
