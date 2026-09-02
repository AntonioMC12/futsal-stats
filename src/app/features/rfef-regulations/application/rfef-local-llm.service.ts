import { inject, Injectable, signal } from '@angular/core';
import {
  serializeError,
  WebGpuDiagnosticReport,
  WebGpuDiagnosticsService,
} from '../../../core/diagnostics/web-gpu-diagnostics.service';
import {
  RFEF_LOCAL_MODEL,
  RFEF_LOCAL_MODEL_CONFIG,
  RFEF_WASM_FALLBACK_MODEL,
  RfefPrompt,
} from '../domain/rfef-assistant';
import { RfefWasmLlmEngine } from './rfef-wasm-llm.engine';

type LlmState =
  | 'checking'
  | 'unsupported'
  | 'not-installed'
  | 'installing'
  | 'installed'
  | 'loading'
  | 'generating'
  | 'error';
type LocalAiBackend = 'webllm' | 'wasm';

interface LocalEngine {
  generate(prompt: RfefPrompt, maxTokens: number): Promise<string>;
  interruptGenerate(): void;
  unload(): Promise<void>;
}

interface WebLlmEngine {
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
const WEBLLM_MIN_WORKGROUP_STORAGE_SIZE = 32 * 1024;

@Injectable({ providedIn: 'root' })
export class RfefLocalLlmService {
  private readonly diagnostics = inject(WebGpuDiagnosticsService);
  private engine: LocalEngine | null = null;
  private webLlmWorker: Worker | null = null;
  private initializationPromise: Promise<LocalEngine> | null = null;
  private workerFailurePromise: Promise<never> | null = null;
  private rejectWorkerFailure: ((reason: Error) => void) | null = null;

  readonly backend = signal<LocalAiBackend>('webllm');
  readonly state = signal<LlmState>('checking');
  readonly progress = signal(0);
  readonly statusText = signal('Comprobando motor local…');
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
    this.statusText.set('Comprobando motor local…');
    const report = await this.diagnostics.run();
    const selectedBackend = selectBackend(report);
    if (!selectedBackend) {
      this.state.set('unsupported');
      this.statusText.set('Este navegador no dispone de WebGPU ni WebAssembly utilizables.');
      return;
    }
    this.backend.set(selectedBackend);
    const limitError = webLlmGpuLimitError(report);
    if (limitError) this.diagnostics.markWebLlmRequirementsUnmet(limitError);
    if (selectedBackend === 'wasm') {
      this.diagnostics.markFallbackSelected(RFEF_WASM_FALLBACK_MODEL.id);
    }

    try {
      const installed = await this.hasActiveModelInCache();
      this.state.set(installed ? 'installed' : 'not-installed');
      this.statusText.set(
        installed
          ? selectedBackend === 'wasm'
            ? 'Asistente compatible disponible.'
            : 'Asistente disponible.'
          : selectedBackend === 'wasm'
            ? 'Modelo compatible no instalado.'
            : 'Modelo no instalado.',
      );
    } catch (error) {
      console.error('[AI Model]', 'Unable to inspect local model cache', serializeError(error));
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
      this.fail(userFacingEngineError(error, this.backend()));
    }
  }

  async generate(prompt: RfefPrompt): Promise<string> {
    if (!this.isInstalled) throw new Error('El modelo local no está instalado.');
    try {
      const engine = await this.ensureEngine('loading');
      this.state.set('generating');
      this.statusText.set(
        this.backend() === 'wasm'
          ? 'Generando en el iPad… Puede tardar.'
          : 'Generando explicación…',
      );
      const generation = engine.generate(prompt, 240);
      const text = this.workerFailurePromise
        ? await Promise.race([generation, this.workerFailurePromise])
        : await generation;
      if (!text.trim()) throw new Error('Respuesta vacía.');
      this.state.set('installed');
      this.statusText.set('Asistente disponible.');
      return text.trim();
    } catch (error) {
      console.error('[AI]', 'Generation failed', serializeError(error));
      this.markActiveBackendFailed(error);
      await this.disposeEngine();
      this.fail(userFacingEngineError(error, this.backend()));
      throw error;
    }
  }

  cancel(): void {
    this.engine?.interruptGenerate();
  }

  async remove(): Promise<void> {
    await this.disposeEngine();
    try {
      if (this.backend() === 'wasm') {
        const { ModelRegistry } = await import('@huggingface/transformers');
        await ModelRegistry.clear_pipeline_cache(
          'text-generation',
          RFEF_WASM_FALLBACK_MODEL.id,
          wasmModelOptions(),
        );
        console.info('[AI WASM]', 'Fallback model removed from Transformers.js cache');
      } else {
        const { deleteModelAllInfoInCache } = await import('@mlc-ai/web-llm');
        await deleteModelAllInfoInCache(RFEF_LOCAL_MODEL.id);
        console.info('[WebLLM Model]', 'Model data removed from WebLLM cache');
      }
      this.progress.set(0);
      this.state.set('not-installed');
      this.statusText.set('Modelo no instalado.');
      this.error.set(null);
    } catch (error) {
      console.error('[AI Model]', 'Unable to clear model cache', serializeError(error));
      this.fail('No se ha podido eliminar el modelo de la caché local.');
    }
  }

  private async hasActiveModelInCache(): Promise<boolean> {
    if (this.backend() === 'wasm') {
      const { ModelRegistry } = await import('@huggingface/transformers');
      return ModelRegistry.is_pipeline_cached(
        'text-generation',
        RFEF_WASM_FALLBACK_MODEL.id,
        wasmModelOptions(),
      );
    }
    const { hasModelInCache } = await import('@mlc-ai/web-llm');
    return hasModelInCache(RFEF_LOCAL_MODEL.id);
  }

  private async ensureEngine(state: 'installing' | 'loading'): Promise<LocalEngine> {
    if (this.engine) return this.engine;
    if (this.initializationPromise) return this.initializationPromise;
    // Assign before the first await so simultaneous calls share this exact initialization.
    this.initializationPromise = this.initializeEngine(state);
    try {
      return await this.initializationPromise;
    } catch (error) {
      this.markActiveBackendFailed(error);
      throw error;
    } finally {
      this.initializationPromise = null;
    }
  }

  private async initializeEngine(state: 'installing' | 'loading'): Promise<LocalEngine> {
    const report = await this.diagnostics.run();
    const selectedBackend = selectBackend(report);
    if (!selectedBackend) throw new Error('No hay un motor local compatible.');
    this.backend.set(selectedBackend);
    if (selectedBackend === 'wasm') {
      this.diagnostics.markFallbackSelected(RFEF_WASM_FALLBACK_MODEL.id);
    }
    this.state.set(state);

    if (selectedBackend === 'wasm') return this.createWasmEngine();

    const contextWindowSize = report.isMobile
      ? RFEF_LOCAL_MODEL_CONFIG.mobile.contextWindowSize
      : RFEF_LOCAL_MODEL_CONFIG.desktop.contextWindowSize;
    this.diagnostics.markWebLlmLoading(
      RFEF_LOCAL_MODEL.id,
      contextWindowSize,
      RFEF_LOCAL_MODEL.prefillChunkSize,
    );
    this.statusText.set(state === 'installing' ? 'Descargando modelo…' : 'Cargando modelo…');
    console.info('[WebLLM Init]', 'Creating one worker engine', {
      model: RFEF_LOCAL_MODEL.id,
      device: report.device,
      contextWindowSize,
      prefillChunkSize: RFEF_LOCAL_MODEL.prefillChunkSize,
    });
    return this.createWebLlmEngine(contextWindowSize);
  }

  private async createWasmEngine(): Promise<LocalEngine> {
    this.diagnostics.markFallbackLoading(RFEF_WASM_FALLBACK_MODEL.id);
    this.statusText.set('Descargando modelo compatible…');
    let timeoutId = 0;
    let rejectTimeout: ((reason: Error) => void) | null = null;
    const armTimeout = (): void => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(
        () =>
          rejectTimeout?.(
            new Error(
              `El motor WebAssembly no ha informado progreso durante ${ENGINE_STALL_TIMEOUT_MS / 1000} s.`,
            ),
          ),
        ENGINE_STALL_TIMEOUT_MS,
      );
    };
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
      armTimeout();
    });
    const engine = new RfefWasmLlmEngine(
      (progress, file) => {
        armTimeout();
        this.progress.set(progress);
        this.statusText.set(
          progress < 100
            ? `Descargando modelo compatible… ${progress} %`
            : 'Preparando modelo WebAssembly…',
        );
        this.diagnostics.updateWebLlmProgress(`${progress} % ${file}`.trim());
      },
      (error) => this.handleFatalEngineError(error),
    );
    try {
      await Promise.race([engine.initialize(), timeout]);
      this.engine = engine;
      this.diagnostics.markFallbackReady();
      return engine;
    } catch (error) {
      await engine.unload();
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private async createWebLlmEngine(contextWindowSize: number): Promise<LocalEngine> {
    const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
    const worker = new Worker(new URL('../workers/rfef-llm.worker', import.meta.url), {
      type: 'module',
      name: 'rfef-local-llm',
    });
    this.webLlmWorker = worker;
    this.workerFailurePromise = new Promise<never>((_, reject) => {
      this.rejectWorkerFailure = reject;
    });
    worker.addEventListener('error', (event) => {
      console.error('[WebLLM Worker]', event.message, event);
      this.diagnostics.recordWorkerError(event.message, event.filename, event.lineno, event.colno);
      const error = new Error(event.message || 'El worker de WebLLM ha fallado.');
      this.rejectWorkerFailure?.(error);
      if (this.engine) this.handleFatalEngineError(error);
    });
    worker.addEventListener('messageerror', () => {
      const error = new Error('No se pudo deserializar un mensaje del worker de WebLLM.');
      this.diagnostics.recordWorkerError(error.message);
      this.rejectWorkerFailure?.(error);
      if (this.engine) this.handleFatalEngineError(error);
    });

    let timeoutId = 0;
    let rejectTimeout: ((reason: Error) => void) | null = null;
    const armTimeout = (): void => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(
        () =>
          rejectTimeout?.(
            new Error(
              `La inicialización de WebLLM no ha informado progreso durante ${ENGINE_STALL_TIMEOUT_MS / 1000} s.`,
            ),
          ),
        ENGINE_STALL_TIMEOUT_MS,
      );
    };
    const timeout = new Promise<never>((_, reject) => {
      rejectTimeout = reject;
      armTimeout();
    });
    let lastPhase = '';
    const engineCreation = CreateWebWorkerMLCEngine(
      worker,
      RFEF_LOCAL_MODEL.id,
      {
        initProgressCallback: (report) => {
          armTimeout();
          this.progress.set(Math.round(report.progress * 100));
          const phase = friendlyProgress(report.text, report.progress);
          this.statusText.set(phase);
          this.diagnostics.updateWebLlmProgress(report.text || phase);
          if (phase !== lastPhase) {
            console.info('[WebLLM Init]', phase);
            lastPhase = phase;
          }
        },
        logLevel: this.diagnostics.debugEnabled ? 'INFO' : 'WARN',
      },
      { context_window_size: contextWindowSize },
    ) as Promise<WebLlmEngine>;

    try {
      const webLlm = await Promise.race([engineCreation, timeout, this.workerFailurePromise]);
      const engine: LocalEngine = {
        generate: async (prompt, maxTokens) => {
          const completion = await webLlm.chat.completions.create({
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            temperature: 0.1,
            max_tokens: maxTokens,
          });
          return completion.choices[0]?.message.content?.trim() ?? '';
        },
        interruptGenerate: () => webLlm.interruptGenerate(),
        unload: () => webLlm.unload(),
      };
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
      console.warn('[AI]', 'Engine unload failed', serializeError(error));
    } finally {
      this.engine = null;
      this.webLlmWorker?.terminate();
      this.webLlmWorker = null;
      this.workerFailurePromise = null;
      this.rejectWorkerFailure = null;
      this.initializationPromise = null;
    }
  }

  private handleFatalEngineError(error: Error): void {
    this.engine?.interruptGenerate();
    this.webLlmWorker?.terminate();
    this.webLlmWorker = null;
    this.workerFailurePromise = null;
    this.rejectWorkerFailure = null;
    this.engine = null;
    this.initializationPromise = null;
    this.markActiveBackendFailed(error);
    this.fail(userFacingEngineError(error, this.backend()));
  }

  private markActiveBackendFailed(error: unknown): void {
    if (this.backend() === 'wasm') this.diagnostics.markFallbackFailed(error);
    else this.diagnostics.markWebLlmFailed(error);
  }

  private fail(message: string): void {
    this.state.set('error');
    this.error.set(message);
    this.statusText.set(message);
  }
}

function selectBackend(report: WebGpuDiagnosticReport): LocalAiBackend | null {
  const webGpuReady = report.status === 'WEBGPU_AVAILABLE' || report.status === 'WEBLLM_READY';
  if (webGpuReady && !webLlmGpuLimitError(report)) return 'webllm';
  return report.webAssembly ? 'wasm' : null;
}

function wasmModelOptions() {
  return {
    revision: RFEF_WASM_FALLBACK_MODEL.revision,
    dtype: RFEF_WASM_FALLBACK_MODEL.quantization,
    device: 'wasm' as const,
  };
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

function userFacingEngineError(error: unknown, backend: LocalAiBackend): string {
  const message = serializeError(error).message.toLowerCase();
  if (/memory|out of memory|allocation|createbuffer|device (was )?lost|gpu.*lost/.test(message)) {
    return 'El modelo requiere más recursos de los disponibles o la GPU se ha perdido.';
  }
  if (/timeout|no ha informado progreso|no ha respondido/.test(message)) {
    return 'La inicialización de la IA local se ha quedado bloqueada.';
  }
  return backend === 'wasm'
    ? 'El modelo local compatible no ha podido iniciarse. El buscador RFEF sigue disponible.'
    : 'La IA local no ha podido iniciarse en este dispositivo. El buscador RFEF sigue disponible.';
}

function webLlmGpuLimitError(report: WebGpuDiagnosticReport): Error | null {
  const available = report.adapterLimits?.['maxComputeWorkgroupStorageSize'];
  if (available === undefined || available >= WEBLLM_MIN_WORKGROUP_STORAGE_SIZE) return null;
  return new Error(
    `WebLLM requiere maxComputeWorkgroupStorageSize=${WEBLLM_MIN_WORKGROUP_STORAGE_SIZE}; el navegador ofrece ${available}.`,
  );
}
