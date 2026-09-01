import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RfefCorpusService } from './rfef-corpus.service';

describe('RfefCorpusService', () => {
  it('carga el corpus una sola vez y comparte la promesa en memoria', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(RfefCorpusService);
    const http = TestBed.inject(HttpTestingController);

    const first = service.load();
    const second = service.load();
    expect(first).toBe(second);

    http.expectOne('/rfef/manifest.json').flush({
      corpusId: 'test',
      version: '1',
      federation: 'RFEF',
      sport: 'Fútbol Sala',
      season: '2026/27',
      revisionDate: '2026-08-26',
      generatedAt: '2026-09-01T00:00:00.000Z',
      chunksFile: 'chunks.json',
      chunkCount: 0,
      documents: [],
    });
    http.expectOne('/rfef/chunks.json').flush([]);

    await expect(first).resolves.toMatchObject({ chunks: [] });
    http.verify();
  });
});
