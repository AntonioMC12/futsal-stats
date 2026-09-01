import { Injectable, signal } from '@angular/core';
import { RFEF_LOCAL_MODEL, RfefPrompt } from '../domain/rfef-assistant';

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

type WebGpuNavigator = Navigator & { gpu?: { requestAdapter(): Promise<unknown | null> } };

@Injectable({ providedIn: 'root' })
export class RfefLocalLlmService {
  private engine: LocalEngine | null = null;
  private worker: Worker | null = null;
  private initialization: Promise<LocalEngine> | null = null;

  readonly state = signal<LlmState>('checking');
  readonly progress = signal(0);
  readonly statusText = signal('Comprobando compatibilidad…');
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
    if (!(await hasUsableWebGpu())) {
      this.state.set('unsupported');
      this.statusText.set('WebGPU no está disponible en este navegador.');
      return;
    }
    try {
      const { hasModelInCache } = await import('@mlc-ai/web-llm');
      const installed = await hasModelInCache(RFEF_LOCAL_MODEL.id);
      this.state.set(installed ? 'installed' : 'not-installed');
      this.statusText.set(installed ? 'Asistente disponible.' : 'Modelo no instalado.');
    } catch {
      this.fail('No se ha podido comprobar el modelo local.');
    }
  }

  async install(): Promise<void> {
    if (this.state() === 'unsupported' || this.state() === 'installing') return;
    this.state.set('installing');
    this.progress.set(0);
    this.error.set(null);
    this.statusText.set('Preparando descarga…');
    try {
      await this.ensureEngine('installing');
      this.progress.set(100);
      this.state.set('installed');
      this.statusText.set('Asistente disponible.');
    } catch {
      await this.disposeEngine();
      this.fail('No se ha podido instalar el asistente. Comprueba WebGPU, espacio y conexión.');
    }
  }

  async generate(prompt: RfefPrompt): Promise<string> {
    if (!this.isInstalled) throw new Error('El modelo local no está instalado.');
    try {
      const engine = await this.ensureEngine('loading');
      this.state.set('generating');
      this.statusText.set('Generando explicación…');
      const completion = await engine.chat.completions.create({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        temperature: 0.1,
        max_tokens: 240,
      });
      const text = completion.choices[0]?.message.content?.trim();
      if (!text) throw new Error('Respuesta vacía.');
      this.state.set('installed');
      this.statusText.set('Asistente disponible.');
      return text;
    } catch (error) {
      await this.disposeEngine();
      this.fail(
        'La inferencia local ha fallado. Las fuentes recuperadas siguen disponibles.',
      );
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
      this.progress.set(0);
      this.state.set('not-installed');
      this.statusText.set('Modelo no instalado.');
      this.error.set(null);
    } catch {
      this.fail('No se ha podido eliminar el modelo de la caché local.');
    }
  }

  private async ensureEngine(state: 'installing' | 'loading'): Promise<LocalEngine> {
    if (this.engine) return this.engine;
    if (this.initialization) return this.initialization;
    this.state.set(state);
    this.statusText.set(state === 'installing' ? 'Descargando asistente…' : 'Cargando asistente…');
    this.initialization = (async () => {
      const { CreateWebWorkerMLCEngine } = await import('@mlc-ai/web-llm');
      this.worker = new Worker(new URL('../workers/rfef-llm.worker', import.meta.url), {
        type: 'module',
        name: 'rfef-local-llm',
      });
      const engine = (await CreateWebWorkerMLCEngine(this.worker, RFEF_LOCAL_MODEL.id, {
        initProgressCallback: (report) => {
          this.progress.set(Math.round(report.progress * 100));
          this.statusText.set(report.text || 'Preparando asistente…');
        },
        logLevel: 'WARN',
      })) as LocalEngine;
      this.engine = engine;
      return engine;
    })();
    try {
      return await this.initialization;
    } finally {
      this.initialization = null;
    }
  }

  private async disposeEngine(): Promise<void> {
    try {
      await this.engine?.unload();
    } finally {
      this.engine = null;
      this.worker?.terminate();
      this.worker = null;
      this.initialization = null;
    }
  }

  private fail(message: string): void {
    this.state.set('error');
    this.error.set(message);
    this.statusText.set(message);
  }
}

async function hasUsableWebGpu(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const gpu = (navigator as WebGpuNavigator).gpu;
  if (!gpu) return false;
  try {
    return (await gpu.requestAdapter()) !== null;
  } catch {
    return false;
  }
}
