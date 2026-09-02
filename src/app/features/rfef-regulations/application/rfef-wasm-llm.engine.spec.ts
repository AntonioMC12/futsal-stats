import { RfefWasmLlmEngine } from './rfef-wasm-llm.engine';

describe('RfefWasmLlmEngine', () => {
  let worker!: WorkerMock;

  beforeEach(() => {
    vi.stubGlobal(
      'Worker',
      class extends WorkerMock {
        constructor(..._args: unknown[]) {
          super();
          worker = this;
        }
      },
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('initializes and generates through one dedicated worker', async () => {
    const progress = vi.fn();
    const engine = new RfefWasmLlmEngine(progress, vi.fn());
    const initializing = engine.initialize();
    const initRequest = worker.messages[0] as { requestId: number };
    worker.emit({
      type: 'progress',
      requestId: initRequest.requestId,
      progress: 42,
      file: 'model',
    });
    worker.emit({ type: 'ready', requestId: initRequest.requestId });
    await initializing;

    const generation = engine.generate({ system: 'Sistema', user: 'Pregunta' }, 160);
    await Promise.resolve();
    const generateRequest = worker.messages.at(-1) as { requestId: number; type: string };
    expect(generateRequest.type).toBe('generate');
    worker.emit({
      type: 'result',
      requestId: generateRequest.requestId,
      text: 'Respuesta local',
    });

    await expect(generation).resolves.toBe('Respuesta local');
    expect(progress).toHaveBeenCalledWith(42, 'model');
  });

  it('rejects pending work if the worker fails', async () => {
    const engine = new RfefWasmLlmEngine(vi.fn(), vi.fn());
    const initializing = engine.initialize();

    worker.onerror?.(new ErrorEvent('error', { message: 'WASM failed' }));

    await expect(initializing).rejects.toThrow('WASM failed');
  });
});

class WorkerMock {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  readonly messages: unknown[] = [];

  postMessage(message: unknown): void {
    this.messages.push(message);
  }

  terminate(): void {}

  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}
