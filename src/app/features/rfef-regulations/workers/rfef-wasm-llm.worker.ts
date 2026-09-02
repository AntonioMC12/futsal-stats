/// <reference lib="webworker" />

import { RFEF_WASM_FALLBACK_MODEL } from '../domain/rfef-assistant';

interface InitRequest {
  type: 'init';
  requestId: number;
}

interface GenerateRequest {
  type: 'generate';
  requestId: number;
  messages: readonly { role: 'system' | 'user'; content: string }[];
  maxTokens: number;
}

interface CancelRequest {
  type: 'cancel';
  requestId: number;
}

interface DisposeRequest {
  type: 'dispose';
  requestId: number;
}

type WorkerRequest = InitRequest | GenerateRequest | CancelRequest | DisposeRequest;

interface GeneratedMessage {
  role: string;
  content: string;
}

type Generator = ((
  messages: readonly { role: 'system' | 'user'; content: string }[],
  options: {
    max_new_tokens: number;
    do_sample: false;
    repetition_penalty: number;
    stopping_criteria: unknown;
  },
) => Promise<readonly { generated_text: readonly GeneratedMessage[] }[]>) & {
  dispose(): Promise<void>;
};

interface StopController {
  interrupt(): void;
  reset(): void;
}

let generatorPromise: Promise<Generator> | null = null;
let stopController: StopController | null = null;

addEventListener('message', ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'cancel') {
    stopController?.interrupt();
    return;
  }
  if (data.type === 'dispose') {
    void dispose(data.requestId);
    return;
  }
  if (data.type === 'init') {
    void initialize(data.requestId);
    return;
  }
  void generate(data);
});

async function initialize(requestId: number): Promise<void> {
  try {
    await getGenerator(requestId);
    postMessage({ type: 'ready', requestId });
  } catch (error) {
    postWorkerError(requestId, error);
  }
}

async function generate(request: GenerateRequest): Promise<void> {
  try {
    const generator = await getGenerator(request.requestId);
    stopController?.reset();
    const output = await generator(request.messages, {
      max_new_tokens: Math.min(request.maxTokens, 160),
      do_sample: false,
      repetition_penalty: 1.08,
      stopping_criteria: stopController,
    });
    const generated = output[0]?.generated_text;
    const text = generated?.at(-1)?.content?.trim();
    if (!text) throw new Error('El modelo WebAssembly ha devuelto una respuesta vacía.');
    postMessage({ type: 'result', requestId: request.requestId, text });
  } catch (error) {
    postWorkerError(request.requestId, error);
  }
}

async function getGenerator(requestId: number): Promise<Generator> {
  generatorPromise ??= (async () => {
    const { env, InterruptableStoppingCriteria, pipeline } =
      await import('@huggingface/transformers');
    // This iPad is not cross-origin isolated, so force the reliable single-thread WASM path.
    const wasm = env.backends.onnx.wasm;
    if (wasm) wasm.numThreads = 1;
    stopController = new InterruptableStoppingCriteria();
    const loaded = await pipeline('text-generation', RFEF_WASM_FALLBACK_MODEL.id, {
      revision: RFEF_WASM_FALLBACK_MODEL.revision,
      dtype: RFEF_WASM_FALLBACK_MODEL.quantization,
      device: 'wasm',
      progress_callback: (progress: unknown) => {
        const event = progress as { status?: string; progress?: number; file?: string };
        if (typeof event.progress !== 'number') return;
        postMessage({
          type: 'progress',
          requestId,
          progress: Math.round(event.progress),
          file: event.file ?? '',
        });
      },
    });
    return loaded as unknown as Generator;
  })();
  try {
    return await generatorPromise;
  } catch (error) {
    generatorPromise = null;
    throw error;
  }
}

async function dispose(requestId: number): Promise<void> {
  try {
    const generator = await generatorPromise;
    await generator?.dispose();
  } finally {
    generatorPromise = null;
    stopController = null;
    postMessage({ type: 'disposed', requestId });
  }
}

function postWorkerError(requestId: number, error: unknown): void {
  postMessage({
    type: 'error',
    requestId,
    reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
}
