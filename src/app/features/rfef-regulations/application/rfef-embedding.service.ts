import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import { RFEF_EMBEDDING_MODEL } from '../domain/rfef-embedding-config';
import { RfefCorpus, RfefEmbeddingsMetadata } from '../domain/rfef-corpus';

interface LoadedEmbeddingIndex {
  metadata: RfefEmbeddingsMetadata;
  vectors: Float32Array;
}

interface PendingRequest {
  resolve: (vector: Float32Array) => void;
  reject: () => void;
}

@Injectable({ providedIn: 'root' })
export class RfefEmbeddingService {
  private readonly http = inject(HttpClient);
  private readonly pending = new Map<number, PendingRequest>();
  private indexPromise: Promise<LoadedEmbeddingIndex> | null = null;
  private worker: Worker | null = null;
  private requestSequence = 0;

  readonly state = signal<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  readonly progress = signal(0);
  readonly backend = signal<'webgpu' | 'wasm' | null>(null);

  async semanticScores(
    query: string,
    corpus: RfefCorpus,
  ): Promise<ReadonlyMap<string, number> | null> {
    if (this.state() === 'unavailable' || typeof Worker === 'undefined') {
      this.state.set('unavailable');
      return null;
    }
    this.state.set('loading');
    try {
      const index = await this.loadIndex(corpus);
      const queryVector = await this.embedQuery(query);
      if (queryVector.length !== index.metadata.embeddingDimension) throw new Error();
      const scores = new Map<string, number>();
      for (const entry of index.metadata.entries) {
        const vector = index.vectors.subarray(
          entry.offset,
          entry.offset + index.metadata.embeddingDimension,
        );
        scores.set(entry.chunkId, dotProduct(queryVector, vector));
      }
      this.state.set('ready');
      return scores;
    } catch {
      this.state.set('unavailable');
      return null;
    }
  }

  private loadIndex(corpus: RfefCorpus): Promise<LoadedEmbeddingIndex> {
    this.indexPromise ??= firstValueFrom(
      forkJoin({
        metadata: this.http.get<RfefEmbeddingsMetadata>('/rfef/embeddings.json'),
        binary: this.http.get('/rfef/embeddings.f32', { responseType: 'arraybuffer' }),
      }),
    ).then(({ metadata, binary }) => validateIndex(metadata, binary, corpus));
    return this.indexPromise;
  }

  private embedQuery(query: string): Promise<Float32Array> {
    const worker = this.getWorker();
    const requestId = ++this.requestSequence;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage({
        type: 'embed',
        requestId,
        text: query,
        preferWebGpu: hasWebGpu(),
      });
    });
  }

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('../workers/rfef-embedding.worker', import.meta.url), {
      type: 'module',
      name: 'rfef-embeddings',
    });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        this.progress.set(data.progress);
        return;
      }
      const pending = this.pending.get(data.requestId);
      if (!pending) return;
      this.pending.delete(data.requestId);
      if (data.type === 'result') {
        this.backend.set(data.backend);
        pending.resolve(new Float32Array(data.vector));
      } else {
        console.warn('RfefEmbeddingService fallback:', data.reason);
        pending.reject();
      }
    };
    this.worker.onerror = () => {
      for (const pending of this.pending.values()) pending.reject();
      this.pending.clear();
      this.state.set('unavailable');
    };
    return this.worker;
  }
}

export function validateIndex(
  metadata: RfefEmbeddingsMetadata,
  binary: ArrayBuffer,
  corpus: RfefCorpus,
): LoadedEmbeddingIndex {
  const chunkIds = new Set(corpus.chunks.map((chunk) => chunk.id));
  const entryIds = new Set(metadata.entries.map((entry) => entry.chunkId));
  const entryOffsets = new Set(metadata.entries.map((entry) => entry.offset));
  const entriesValid =
    metadata.entries.length === corpus.chunks.length &&
    entryIds.size === corpus.chunks.length &&
    entryOffsets.size === corpus.chunks.length &&
    metadata.entries.every(
      ({ chunkId, offset }) =>
        chunkIds.has(chunkId) &&
        Number.isInteger(offset) &&
        offset >= 0 &&
        offset + metadata.embeddingDimension <= binary.byteLength / 4,
    );
  if (
    metadata.formatVersion !== 1 ||
    metadata.corpusRevision !== corpus.manifest.version ||
    metadata.modelId !== RFEF_EMBEDDING_MODEL.id ||
    metadata.modelRevision !== RFEF_EMBEDDING_MODEL.revision ||
    metadata.dtype !== RFEF_EMBEDDING_MODEL.dtype ||
    metadata.embeddingDimension !== RFEF_EMBEDDING_MODEL.dimension ||
    metadata.vectorCount !== corpus.chunks.length ||
    binary.byteLength !== metadata.vectorCount * metadata.embeddingDimension * 4 ||
    !entriesValid
  ) {
    throw new Error('Artifact semántico incompatible.');
  }
  return { metadata, vectors: new Float32Array(binary) };
}

export function dotProduct(left: Float32Array, right: Float32Array): number {
  let result = 0;
  for (let index = 0; index < left.length; index++) result += left[index] * right[index];
  return result;
}

function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
