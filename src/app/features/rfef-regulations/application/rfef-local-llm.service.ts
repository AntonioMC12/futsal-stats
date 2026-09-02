import { inject, Injectable, signal } from '@angular/core';
import {
  serializeError,
  WebGpuDiagnosticsService,
} from '../../../core/diagnostics/web-gpu-diagnostics.service';
import { RFEF_LOCAL_MODEL, RFEF_LOCAL_MODEL_CONFIG, RfefPrompt } from '../domain/rfef-assistant';

type LlmState =
  | 'checking'
  | 'unsupported'
  | 'not-installed'
  | 'installing'
  | 'installed'
  | 'loading'
  | 'generating'
  | 'error';

interface LocalEngine {
  chat: {
    completions: {
      create(input: {
        messages: readonly { role: 'system' | 'user'; content: string }[];
        temperature: number;
        max_tokens: number;
      }): Promise<{ choices: readonly { message: { content: string | null } }[] }>;
    };
  };
  interruptGenerate(): void;
  unload(): Promise<void>;
}

const ENGINE_STALL_TIMEOUT_MS = 180_000;

@Injectable({ providedIn: 'root' })
export class RfefLocalLlmService {
  private readonly diagnostics = inject(WebGpuDiagnosticsService);
  private engine: LocalEngine | null = null;
  private worker: Worker | null = null;
  private initializationPromise: Promise<LocalEngine> | null = null;
  private workerFailurePromise: Promise<never> | null = null;
  private rejectWorkerFailure: ((reason: Error) => void) | null = null;

  readonly state = signal<LlmState>('checking');
  readonly progress = signal(0);
  readonly statusText = signal('Comprobando WebGPU…');
  readonly error = signal<string | null>(null);

  get isInstalled(): boolean {
    return ['installed', 'loading', 'generating'].includes(this.state());
  }

  get canGenerate(): boolean {
    return this.isInstalled && this.state() !== 'loading' && this.state() !== 'generating';
  }

  async refreshStatus(): Promise<void> {
    this.state.set('checking');
    this.error.set(null);
    this.statusText.set('Comprobando WebGPU…');
    const report = await this.diagnostics.run();
    if (report.status !== 'WEBGPU_AVAILABLE' && report.status !== 'WEBLLM_READY') {
      this.state.set('unsupported');
      this.statusText.set(webGpuFailureMessage(report.status));
      return;
    }
    try {
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      const installed = await hasModelInCache(RFEF_LOCAL_MODEL.id);
      this.state.set(installed ? 'installed' : 'not-installed');
      this.statusText.set(installed ? 'Asistente disponible.' : 'Modelo no instalado.');
      console.info(
        '[WebLLM Model]',
        installed ? 'Model found in Cache API' : 'Model is not cached',
      );
    } catch (error) {
      console.error('[WebLLM Model]', 'Unable to inspect model cache', serializeError(error));
      this.fail('No se ha podido comprobar el modelo local.');
    }
  }

  async install(): Promise<void> {
    if (this.state() === 'unsupported') return;
    if (this.initializationPromise) {
      await this.initializationPromise.catch(() => undefined);
      return;
    }
    this.state.set('installing');
    this.progress.set(0);
    this.error.set(null);
    this.statusText.set('Preparando descarga…');
    try {
      await this.ensureEngine('installing');
      this.progress.set(100);
      this.state.set('installed');
      this.statusText.set('Asistente listo');
    } catch (error) {
      await this.disposeEngine();
      this.fail(userFacingWebLlmError(error));
    }
  }

  async generate(prompt: RfefPrompt): Promise<string> {
    if (!this.isInstalled) throw new Error('El modelo local no está instalado.');
    try {
      const engine = await this.ensureEngine('loading');
      this.state.set('generating');
      this.statusText.set('Generando explicación…');
      const completionRequest = engine.chat.completions.create({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.1,
        max_tokens: 240,
      });
      const completion = this.workerFailurePromise
        ? await Promise.race([completionRequest, this.workerFailurePromise])
        : await completionRequest;
      const text = completion.choices[0]?.message.content?.trim();
      if (!text) throw new Error('Respuesta vacía.');
      this.state.set('installed');
      this.statusText.set('Asistente disponible.');
      return text;
    } catch (error) {
      console.error('[WebLLM]', 'Generation failed', serializeError(error));
      this.diagnostics.markWebLlmFailed(error);
      await this.disposeEngine();
      this.fail(userFacingWebLlmError(error));
      throw error;
    }
  }

  cancel(): void {
    this.engine?.interruptGenerate();
  }

  async remove(): Promise<void> {
    await this.disposeEngine();
    try {
      const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
      await deleteModelAllInfoInCache(RFEF_LOCAL_MODEL.id);
      console.info('[WebLLM Model]', 'Model data removed from WebLLM cache');
      this.progress.set(0);
      this.state.set('not-installed');
      this.statusText.set('Modelo no instalado.');
      this.error.set(null);
    } catch (error) {
      console.error('[WebLLM Model]', 'Unable to clear model cache', serializeError(error));
      this.fail('No se ha podido eliminar el modelo de la caché local.');
    }
  }

  private async ensureEngine(state: 'installing' | 'loading'): Promise<LocalEngine> {
    if (this.engine) return this.engine;
    if (this.initializationPromise) return this.initializationPromise;

    // Assign before the first await so two calls in the same event loop reuse this exact promise.
    this.initializationPromise = this.initializeEngine(state);
    try {
      return await this.initializationPromise;
    } catch (error) {
      this.diagnostics.markWebLlmFailed(error);
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeEngine(state: 'installing' | 'loading'): Promise<LocalEngine> {
    const report = await this.diagnostics.run();
    if (report.status !== 'WEBGPU_AVAILABLE' && report.status !== 'WEBLLM_READY') {
      throw new Error(webGpuFailureMessage(report.status));
    }
    const contextWindowSize = report.isMobile
      ? RFEF_LOCAL_MODEL_CONFIG.mobile.contextWindowSize
      : RFEF_LOCAL_MODEL_CONFIG.desktop.contextWindowSize;
    this.diagnostics.markWebLlmLoading(
      RFEF_LOCAL_MODEL.id,
      contextWindowSize,
      RFEF_LOCAL_MODEL.prefillChunkSize,
    );
    this.state.set(state);
    this.statusText.set(state === 'installing' ? 'Descargando modelo…' : 'Cargando modelo…');
    console.info('[WebLLM Init]', 'Creating one worker engine', {
      model: RFEF_LOCAL_MODEL.id,
      device: report.device,
      contextWindowSize,
      prefillChunkSize: RFEF_LOCAL_MODEL.prefillChunkSize,
    });

    return this.createEngine(contextWindowSize);
  }

  private async createEngine(contextWindowSize: number): Promise<LocalEngine> {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    const worker = new Worker(new URL('../workers/rfef-llm.worker', import.meta.url), {
      type: 'module',
      name: 'rfef-local-llm',
    });
    this.worker = worker;
    this.workerFailurePromise = new Promise<never>((_, reject) => {
      this.rejectWorkerFailure = reject;
    });
    worker.addEventListener('error', (event) => {
      console.error('[WebLLM Worker]', event.message, event);
      this.diagnostics.recordWorkerError(event.message, event.filename, event.lineno, event.colno);
      const error = new Error(event.message || 'El worker de WebLLM ha fallado.');
      this.rejectWorkerFailure?.(error);
      if (this.engine) this.handleFatalWorkerError(error);
    });
    worker.addEventListener('messageerror', (event) => {
      console.error('[WebLLM Worker]', 'Message deserialization failed', event.data);
      this.diagnostics.recordWorkerError('No se pudo deserializar un mensaje del worker.');
      const error = new Error('No se pudo deserializar un mensaje del worker de WebLLM.');
      this.rejectWorkerFailure?.(error);
      if (this.engine) this.handleFatalWorkerError(error);
    });

    let timeoutId = 0;
    let rejectTimeout: ((reason: Error) => void) | null = null;
    const armStallTimeout = (): void => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        rejectTimeout?.(
          new Error(
            `La inicialización de WebLLM no ha informado progreso durante ${ENGINE_STALL_TIMEOUT_MS / 1000} s.`,
          ),
        );
      }, ENGINE_STALL_TIMEOUT_MS);
    };
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
      armStallTimeout();
    });

    let lastPhase = '';
    const engineCreation = CreateWebWorkerMLCEngine(
      worker,
      RFEF_LOCAL_MODEL.id,
      {
        initProgressCallback: (progressReport) => {
          armStallTimeout();
          this.progress.set(Math.round(progressReport.progress * 100));
          const phase = friendlyProgress(progressReport.text, progressReport.progress);
          this.statusText.set(phase);
          this.diagnostics.updateWebLlmProgress(progressReport.text || phase);
          if (phase !== lastPhase) {
            console.info('[WebLLM Init]', phase);
            lastPhase = phase;
          }
        },
        logLevel: this.diagnostics.debugEnabled ? 'INFO' : 'WARN',
      },
      { context_window_size: contextWindowSize },
    ) as Promise<LocalEngine>;

    try {
      const engine = await Promise.race([engineCreation, timeout, this.workerFailurePromise]);
      this.engine = engine;
      this.diagnostics.markWebLlmReady();
      return engine;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async disposeEngine(): Promise<void> {
    try {
      await this.engine?.unload();
    } catch (error) {
      console.warn('[WebLLM]', 'Engine unload failed', serializeError(error));
    } finally {
      this.engine = null;
      this.worker?.terminate();
      this.worker = null;
      this.workerFailurePromise = null;
      this.rejectWorkerFailure = null;
      this.initializationPromise = null;
    }
  }

  private handleFatalWorkerError(error: Error): void {
    this.engine?.interruptGenerate();
    this.worker?.terminate();
    this.worker = null;
    this.workerFailurePromise = null;
    this.rejectWorkerFailure = null;
    this.engine = null;
    this.initializationPromise = null;
    this.diagnostics.markWebLlmFailed(error);
    this.fail(userFacingWebLlmError(error));
  }

  private fail(message: string): void {
    this.state.set('error');
    this.error.set(message);
    this.statusText.set(message);
  }
}

function friendlyProgress(text: string, progress: number): string {
  const normalized = text.toLowerCase();
  if (
    normalized.includes('fetch') ||
    normalized.includes('download') ||
    normalized.includes('cache')
  ) {
    return 'Descargando modelo…';
  }
  if (normalized.includes('loading') || normalized.includes('weight')) return 'Cargando modelo…';
  if (progress >= 1) return 'Preparando asistente…';
  return 'Preparando GPU y modelo…';
}

function webGpuFailureMessage(status: string): string {
  switch (status) {
    case 'NO_WEBGPU':
      return 'WebGPU no está disponible en este navegador.';
    case 'NO_GPU_ADAPTER':
      return 'El navegador no ha encontrado una GPU compatible.';
    case 'GPU_DEVICE_FAILED':
      return 'La GPU del dispositivo no ha podido inicializarse.';
    default:
      return 'La IA local no ha podido iniciarse en este dispositivo.';
  }
}

function userFacingWebLlmError(error: unknown): string {
  const message = serializeError(error).message.toLowerCase();
  if (/memory|out of memory|allocation|createbuffer|device (was )?lost|gpu.*lost/.test(message)) {
    return 'El modelo requiere más recursos de los disponibles o la GPU se ha perdido.';
  }
  if (/timeout|no ha informado progreso|no ha respondido/.test(message)) {
    return 'La inicialización de la IA local se ha quedado bloqueada.';
  }
  return 'La IA local no ha podido iniciarse en este dispositivo. El buscador RFEF sigue disponible.';
}
