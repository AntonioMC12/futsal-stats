import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { RfefCorpus, RfefCorpusChunk, RfefCorpusManifest } from '../domain/rfef-corpus';

@Injectable({ providedIn: 'root' })
export class RfefCorpusService {
  private readonly http = inject(HttpClient);
  private corpusPromise: Promise<RfefCorpus> | null = null;

  load(): Promise<RfefCorpus> {
    this.corpusPromise ??= firstValueFrom(
      forkJoin({
        manifest: this.http.get<RfefCorpusManifest>('/rfef/manifest.json'),
        chunks: this.http.get<RfefCorpusChunk[]>('/rfef/chunks.json'),
      }),
    ).then(({ manifest, chunks }) => {
      if (manifest.chunksFile !== 'chunks.json' || manifest.chunkCount !== chunks.length) {
        throw new Error('El corpus RFEF instalado no coincide con su manifiesto.');
      }
      return { manifest, chunks };
    });
    return this.corpusPromise;
  }
}
