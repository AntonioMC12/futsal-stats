import { RfefPrompt } from '../domain/rfef-assistant';

interface PendingRequest<T> {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
}

type WasmWorkerMessage =
  | { type: 'progress'; requestId: number; progress: number; file: string }
  | { type: 'ready'; requestId: number }
  | { type: 'result'; requestId: number; text: string }
  | { type: 'error'; requestId: number; reason: string };

export class RfefWasmLlmEngine {
  private readonly worker: Worker;
  private readonly pendingInitialization = new Map<number, PendingRequest<void>>();
  private readonly pendingGeneration = new Map<number, PendingRequest<string>>();
  private requestSequence = 0;
  private initializationPromise: Promise<void> | null = null;
  private initialized = false;

  constructor(
    private readonly onProgress: (progress: number, file: string) => void,
    private readonly onFatalError: (error: Error) => void,
  ) {
    this.worker = new Worker(new URL('../workers/rfef-wasm-llm.worker', import.meta.url), {
      type: 'module',
      name: 'rfef-wasm-llm',
    });
    this.worker.onmessage = ({ data }: MessageEvent<WasmWorkerMessage>) => this.handleMessage(data);
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'El worker WebAssembly ha fallado.');
      this.rejectAll(error);
      this.onFatalError(error);
    };
    this.worker.onmessageerror = () => {
      const error = new Error('No se pudo leer una respuesta del worker WebAssembly.');
      this.rejectAll(error);
      this.onFatalError(error);
    };
  }

  initialize(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    this.initializationPromise ??= this.sendInitialization().finally(() => {
      this.initializationPromise = null;
    });
    return this.initializationPromise;
  }

  async generate(prompt: RfefPrompt, maxTokens: number): Promise<string> {
    await this.initialize();
    const requestId = ++this.requestSequence;
    return new Promise<string>((resolve, reject) => {
      this.pendingGeneration.set(requestId, { resolve, reject });
      this.worker.postMessage({
        type: 'generate',
        requestId,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        maxTokens,
      });
    });
  }

  interruptGenerate(): void {
    this.worker.postMessage({ type: 'cancel', requestId: ++this.requestSequence });
  }

  async unload(): Promise<void> {
    this.initialized = false;
    this.worker.terminate();
    this.rejectAll(new Error('El motor WebAssembly se ha cerrado.'));
  }

  private sendInitialization(): Promise<void> {
    const requestId = ++this.requestSequence;
    return new Promise<void>((resolve, reject) => {
      this.pendingInitialization.set(requestId, { resolve, reject });
      this.worker.postMessage({ type: 'init', requestId });
    });
  }

  private handleMessage(message: WasmWorkerMessage): void {
    if (message.type === 'progress') {
      this.onProgress(message.progress, message.file);
      return;
    }
    if (message.type === 'ready') {
      const pending = this.pendingInitialization.get(message.requestId);
      this.pendingInitialization.delete(message.requestId);
      this.initialized = true;
      pending?.resolve();
      return;
    }
    const pending = this.pendingGeneration.get(message.requestId);
    if (message.type === 'result') {
      this.pendingGeneration.delete(message.requestId);
      pending?.resolve(message.text);
      return;
    }
    const error = new Error(message.reason);
    if (pending) {
      this.pendingGeneration.delete(message.requestId);
      pending.reject(error);
      return;
    }
    const initialization = this.pendingInitialization.get(message.requestId);
    this.pendingInitialization.delete(message.requestId);
    initialization?.reject(error);
  }

  private rejectAll(error: Error): void {
    this.initialized = false;
    for (const pending of this.pendingInitialization.values()) pending.reject(error);
    for (const pending of this.pendingGeneration.values()) pending.reject(error);
    this.pendingInitialization.clear();
    this.pendingGeneration.clear();
  }
}
