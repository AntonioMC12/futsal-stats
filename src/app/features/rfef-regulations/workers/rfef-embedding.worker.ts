/// <reference lib="webworker" />

import { RFEF_EMBEDDING_MODEL } from '../domain/rfef-embedding-config';

interface EmbedRequest {
  type: 'embed';
  requestId: number;
  text: string;
  preferWebGpu: boolean;
}

type Extractor = ((
  text: string,
  options: { pooling: 'mean'; normalize: true },
) => Promise<{ data: Float32Array }>) & { dispose(): Promise<void> | void };

let extractor: Extractor | null = null;
let backend: 'webgpu' | 'wasm' | null = null;

addEventListener('message', ({ data }: MessageEvent<EmbedRequest>) => {
  if (data.type === 'embed') void embed(data);
});

async function embed(request: EmbedRequest): Promise<void> {
  try {
    let active = await getExtractor(request.preferWebGpu);
    let output: { data: Float32Array };
    try {
      output = await active(`query: ${request.text}`, { pooling: 'mean', normalize: true });
    } catch (error) {
      if (backend !== 'webgpu') throw error;
      await active.dispose();
      extractor = null;
      backend = null;
      active = await getExtractor(false);
      output = await active(`query: ${request.text}`, { pooling: 'mean', normalize: true });
    }
    const vector = Float32Array.from(output.data);
    postMessage({ type: 'result', requestId: request.requestId, backend, vector: vector.buffer }, [
      vector.buffer,
    ]);
  } catch (error) {
    postMessage({
      type: 'error',
      requestId: request.requestId,
      reason: error instanceof Error ? error.message : 'Unknown embedding worker error',
    });
  }
}

async function getExtractor(preferWebGpu: boolean): Promise<Extractor> {
  if (extractor) return extractor;
  const { pipeline } = await import('@huggingface/transformers');
  const load = async (device: 'webgpu' | 'wasm'): Promise<Extractor> => {
    const loaded = await pipeline('feature-extraction', RFEF_EMBEDDING_MODEL.id, {
      revision: RFEF_EMBEDDING_MODEL.revision,
      dtype: RFEF_EMBEDDING_MODEL.dtype,
      device,
      progress_callback: (event: unknown) => {
        const progress = (event as { progress?: number }).progress;
        if (typeof progress === 'number') {
          postMessage({ type: 'progress', progress: Math.round(progress) });
        }
      },
    });
    backend = device;
    return loaded as unknown as Extractor;
  };

  if (preferWebGpu && (await canUseWebGpu())) {
    try {
      extractor = await load('webgpu');
      return extractor;
    } catch {
      // WASM is the supported safe fallback when WebGPU initialization fails.
    }
  }
  extractor = await load('wasm');
  return extractor;
}

async function canUseWebGpu(): Promise<boolean> {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<unknown | null> };
    }
  ).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}
