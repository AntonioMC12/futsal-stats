import { Injectable, signal } from '@angular/core';

export type WebGpuDiagnosticStatus =
  | 'NO_WEBGPU'
  | 'NO_GPU_ADAPTER'
  | 'GPU_DEVICE_FAILED'
  | 'WEBGPU_AVAILABLE'
  | 'WEBLLM_INITIALIZATION_FAILED'
  | 'WEBLLM_READY';

export type DeviceKind = 'desktop' | 'mobile' | 'unknown';
export type OperatingSystem = 'iOS/iPadOS' | 'Android' | 'other' | 'unknown';
export type WebLlmDiagnosticStatus = 'not_started' | 'loading' | 'available' | 'error';

export interface SerializableError {
  name: string;
  message: string;
  stack?: string;
}

export interface GlobalDiagnosticError extends SerializableError {
  type: 'error' | 'unhandledrejection' | 'worker' | 'gpu-device-lost';
  timestamp: string;
  filename?: string;
  line?: number;
  column?: number;
}

export interface WebGpuDiagnosticReport {
  timestamp: string;
  userAgent: string;
  platform: string;
  device: DeviceKind;
  operatingSystem: OperatingSystem;
  browser: string;
  isMobile: boolean;
  isIOS: boolean;
  hardwareConcurrency: number | null;
  webgpu: boolean;
  gpuAdapter: boolean;
  gpuDevice: boolean;
  webgpuCompute: boolean | null;
  webAssembly: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  adapterInfo: Record<string, string>;
  adapterFeatures: string[];
  adapterLimits: Record<string, number>;
  status: WebGpuDiagnosticStatus;
  webllmVersion: string;
  webllmStatus: WebLlmDiagnosticStatus;
  model: string;
  contextWindowSize: number;
  prefillChunkSize: number;
  progressText: string;
  error: SerializableError | null;
  globalErrors: GlobalDiagnosticError[];
}

interface GpuBufferLike {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface GpuDeviceLike {
  lost?: Promise<{ reason?: string; message?: string }>;
  queue: {
    writeBuffer(buffer: GpuBufferLike, offset: number, data: ArrayBufferView): void;
    submit(commands: readonly unknown[]): void;
  };
  createBuffer(descriptor: { size: number; usage: number }): GpuBufferLike;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipeline(descriptor: Record<string, unknown>): {
    getBindGroupLayout(index: number): unknown;
  };
  createBindGroup(descriptor: Record<string, unknown>): unknown;
  createCommandEncoder(): {
    beginComputePass(): {
      setPipeline(pipeline: unknown): void;
      setBindGroup(index: number, bindGroup: unknown): void;
      dispatchWorkgroups(count: number): void;
      end(): void;
    };
    copyBufferToBuffer(
      source: GpuBufferLike,
      sourceOffset: number,
      destination: GpuBufferLike,
      destinationOffset: number,
      size: number,
    ): void;
    finish(): unknown;
  };
  destroy?: () => void;
}

interface GpuAdapterLike {
  features?: Iterable<string>;
  limits?: object;
  info?: object;
  requestAdapterInfo?: () => Promise<object>;
  requestDevice(): Promise<GpuDeviceLike>;
}

type NavigatorWithGpu = Omit<Navigator, 'gpu'> & {
  gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> };
  userAgentData?: { mobile?: boolean; platform?: string };
};

const WEBLLM_VERSION = '0.2.82';
const MAX_GLOBAL_ERRORS = 30;
const LIMIT_NAMES = [
  'maxBufferSize',
  'maxStorageBufferBindingSize',
  'maxComputeWorkgroupSizeX',
  'maxComputeInvocationsPerWorkgroup',
  'maxComputeWorkgroupsPerDimension',
] as const;

@Injectable({ providedIn: 'root' })
export class WebGpuDiagnosticsService {
  private diagnosticsPromise: Promise<WebGpuDiagnosticReport> | null = null;
  private listenersInstalled = false;
  private globalErrors: GlobalDiagnosticError[] = [];

  readonly debugEnabled =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === 'true';
  readonly report = signal<WebGpuDiagnosticReport>(this.createBaseReport());

  initialize(): void {
    if (!this.debugEnabled || this.listenersInstalled || typeof window === 'undefined') return;
    this.listenersInstalled = true;
    window.addEventListener('error', (event) => {
      this.recordGlobalError({
        ...serializeError(event.error ?? event.message),
        type: 'error',
        timestamp: new Date().toISOString(),
        filename: event.filename || undefined,
        line: event.lineno || undefined,
        column: event.colno || undefined,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      this.recordGlobalError({
        ...serializeError(event.reason),
        type: 'unhandledrejection',
        timestamp: new Date().toISOString(),
      });
    });
    console.info('[WebGPU Diagnostics]', 'Mobile diagnostics enabled');
  }

  run(force = false): Promise<WebGpuDiagnosticReport> {
    if (!force && this.diagnosticsPromise) return this.diagnosticsPromise;
    this.diagnosticsPromise = this.performDiagnostics().catch((error: unknown) => {
      const base = this.createBaseReport();
      const serialized = serializeError(error);
      console.error('[WebGPU Diagnostics]', 'Unexpected diagnostic failure', serialized);
      return this.setReport({
        ...base,
        webgpu: typeof navigator !== 'undefined' && Boolean((navigator as NavigatorWithGpu).gpu),
        status: 'GPU_DEVICE_FAILED',
        error: serialized,
      });
    });
    return this.diagnosticsPromise;
  }

  markWebLlmLoading(model: string, contextWindowSize: number, prefillChunkSize: number): void {
    this.patchReport({
      model,
      contextWindowSize,
      prefillChunkSize,
      webllmStatus: 'loading',
      progressText: 'Preparando asistente…',
      error: null,
    });
  }

  updateWebLlmProgress(progressText: string): void {
    this.patchReport({ progressText });
  }

  markWebLlmReady(): void {
    console.info('[WebLLM]', 'Model ready');
    this.patchReport({
      status: 'WEBLLM_READY',
      webllmStatus: 'available',
      progressText: 'Asistente listo',
      error: null,
    });
  }

  markWebLlmFailed(error: unknown): void {
    const serializable = serializeError(error);
    console.error('[WebLLM]', 'Initialization failed', serializable);
    this.patchReport({
      status: 'WEBLLM_INITIALIZATION_FAILED',
      webllmStatus: 'error',
      progressText: 'Error al iniciar WebLLM',
      error: serializable,
    });
  }

  recordWorkerError(error: unknown, filename?: string, line?: number, column?: number): void {
    this.recordGlobalError({
      ...serializeError(error),
      type: 'worker',
      timestamp: new Date().toISOString(),
      filename,
      line,
      column,
    });
  }

  exportReport(): string {
    return JSON.stringify({ ...this.report(), timestamp: new Date().toISOString() }, null, 2);
  }

  private async performDiagnostics(): Promise<WebGpuDiagnosticReport> {
    const base = this.createBaseReport();
    this.report.set(base);
    const nav = navigator as NavigatorWithGpu;
    if (!nav.gpu) {
      console.warn('[WebGPU]', 'navigator.gpu unavailable');
      return this.setReport({ ...base, status: 'NO_WEBGPU' });
    }

    console.info('[WebGPU]', 'navigator.gpu available');
    let adapter: GpuAdapterLike | null;
    try {
      adapter = await withTimeout(nav.gpu.requestAdapter(), 10_000, 'requestAdapter');
    } catch (error) {
      return this.setReport({
        ...base,
        webgpu: true,
        status: 'NO_GPU_ADAPTER',
        error: serializeError(error),
      });
    }
    if (!adapter) {
      return this.setReport({ ...base, webgpu: true, status: 'NO_GPU_ADAPTER' });
    }

    const adapterInfo = await readAdapterInfo(adapter);
    const adapterFeatures = adapter.features ? Array.from(adapter.features) : [];
    const adapterLimits = readAdapterLimits(adapter.limits);
    console.info('[WebGPU]', 'Adapter acquired', adapterInfo);
    let device: GpuDeviceLike;
    try {
      device = await withTimeout(adapter.requestDevice(), 15_000, 'requestDevice');
    } catch (error) {
      return this.setReport({
        ...base,
        webgpu: true,
        gpuAdapter: true,
        adapterInfo,
        adapterFeatures,
        adapterLimits,
        status: 'GPU_DEVICE_FAILED',
        error: serializeError(error),
      });
    }

    let intentionalDestroy = false;
    device.lost
      ?.then((info) => {
        if (intentionalDestroy) return;
        const error = serializeError({
          name: info.reason ?? 'GPUDeviceLost',
          message: info.message ?? 'GPU device lost',
        });
        console.error('[WebGPU]', 'Device lost', error);
        this.recordGlobalError({
          ...error,
          type: 'gpu-device-lost',
          timestamp: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => console.error('[WebGPU]', 'Unable to observe device loss', error));

    console.info('[WebGPU]', 'Device created');
    let webgpuCompute = false;
    let computeError: SerializableError | null = null;
    try {
      await runComputeSmokeTest(device);
      webgpuCompute = true;
      console.info('[WebGPU Diagnostics]', 'Compute smoke test passed');
    } catch (error) {
      computeError = serializeError(error);
      console.error('[WebGPU Diagnostics]', 'Compute smoke test failed', computeError);
    } finally {
      intentionalDestroy = true;
      device.destroy?.();
    }

    return this.setReport({
      ...base,
      webgpu: true,
      gpuAdapter: true,
      gpuDevice: true,
      webgpuCompute,
      adapterInfo,
      adapterFeatures,
      adapterLimits,
      status: webgpuCompute ? 'WEBGPU_AVAILABLE' : 'GPU_DEVICE_FAILED',
      error: computeError,
    });
  }

  private createBaseReport(): WebGpuDiagnosticReport {
    const nav = (typeof navigator === 'undefined' ? undefined : navigator) as
      NavigatorWithGpu | undefined;
    const detection = detectDevice(nav);
    return {
      timestamp: new Date().toISOString(),
      userAgent: nav?.userAgent ?? '',
      platform: nav?.userAgentData?.platform ?? nav?.platform ?? 'unknown',
      ...detection,
      hardwareConcurrency: nav?.hardwareConcurrency ?? null,
      webgpu: false,
      gpuAdapter: false,
      gpuDevice: false,
      webgpuCompute: null,
      webAssembly: typeof WebAssembly !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      crossOriginIsolated: typeof window !== 'undefined' && window.crossOriginIsolated === true,
      adapterInfo: {},
      adapterFeatures: [],
      adapterLimits: {},
      status: 'NO_WEBGPU',
      webllmVersion: WEBLLM_VERSION,
      webllmStatus: 'not_started',
      model: '',
      contextWindowSize: 0,
      prefillChunkSize: 0,
      progressText: 'No iniciado',
      error: null,
      globalErrors: [...this.globalErrors],
    };
  }

  private patchReport(patch: Partial<WebGpuDiagnosticReport>): void {
    this.report.update((current) => ({
      ...current,
      ...patch,
      timestamp: new Date().toISOString(),
      globalErrors: [...this.globalErrors],
    }));
  }

  private setReport(report: WebGpuDiagnosticReport): WebGpuDiagnosticReport {
    this.report.set(report);
    return report;
  }

  private recordGlobalError(error: GlobalDiagnosticError): void {
    this.globalErrors = [...this.globalErrors.slice(-(MAX_GLOBAL_ERRORS - 1)), error];
    this.patchReport({ globalErrors: [...this.globalErrors] });
  }
}

function detectDevice(
  nav?: NavigatorWithGpu,
): Pick<WebGpuDiagnosticReport, 'device' | 'operatingSystem' | 'browser' | 'isMobile' | 'isIOS'> {
  const ua = nav?.userAgent ?? '';
  const platform = nav?.platform ?? '';
  const touchPoints = nav?.maxTouchPoints ?? 0;
  const isIPadDesktopUa = platform === 'MacIntel' && touchPoints > 1;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || isIPadDesktopUa;
  const isAndroid = /Android/i.test(ua);
  const mobileSignal = nav?.userAgentData?.mobile;
  const isMobile = mobileSignal ?? (isIOS || isAndroid || /Mobile|Tablet/i.test(ua));
  const browser = /CriOS/i.test(ua)
    ? 'Chrome iOS'
    : /FxiOS/i.test(ua)
      ? 'Firefox iOS'
      : /EdgiOS/i.test(ua)
        ? 'Edge iOS'
        : /Safari/i.test(ua) && !/Chrome|Chromium|Android/i.test(ua)
          ? 'Safari'
          : /Chrome|Chromium/i.test(ua)
            ? 'Chrome/Chromium'
            : 'unknown';
  return {
    device: isMobile ? 'mobile' : ua ? 'desktop' : 'unknown',
    operatingSystem: isIOS ? 'iOS/iPadOS' : isAndroid ? 'Android' : ua ? 'other' : 'unknown',
    browser,
    isMobile,
    isIOS,
  };
}

async function readAdapterInfo(adapter: GpuAdapterLike): Promise<Record<string, string>> {
  try {
    const info = adapter.info ?? (await adapter.requestAdapterInfo?.()) ?? {};
    return objectToStringRecord(info, ['vendor', 'architecture', 'device', 'description']);
  } catch (error) {
    console.warn('[WebGPU Diagnostics]', 'Adapter info is restricted', error);
    return {};
  }
}

function readAdapterLimits(limits?: object): Record<string, number> {
  if (!limits) return {};
  const values = limits as Record<string, unknown>;
  return Object.fromEntries(
    LIMIT_NAMES.flatMap((name) => (typeof values[name] === 'number' ? [[name, values[name]]] : [])),
  );
}

function objectToStringRecord(value: object, keys: readonly string[]): Record<string, string> {
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    keys.flatMap((key) =>
      typeof record[key] === 'string' && record[key] ? [[key, record[key]]] : [],
    ),
  );
}

async function runComputeSmokeTest(device: GpuDeviceLike): Promise<void> {
  // WebGPU flag values: MAP_READ=1, COPY_SRC=4, COPY_DST=8, STORAGE=128.
  const input = device.createBuffer({ size: 16, usage: 128 | 8 });
  const output = device.createBuffer({ size: 16, usage: 128 | 4 });
  const readback = device.createBuffer({ size: 16, usage: 1 | 8 });
  try {
    device.queue.writeBuffer(input, 0, new Float32Array([1, 2, 3, 4]));
    const module = device.createShaderModule({
      code: `
        @group(0) @binding(0) var<storage, read> inputData: array<f32>;
        @group(0) @binding(1) var<storage, read_write> outputData: array<f32>;
        @compute @workgroup_size(1)
        fn main(@builtin(global_invocation_id) id: vec3<u32>) {
          outputData[id.x] = inputData[id.x] * 2.0;
        }
      `,
    });
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'main' },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: input } },
        { binding: 1, resource: { buffer: output } },
      ],
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(4);
    pass.end();
    encoder.copyBufferToBuffer(output, 0, readback, 0, 16);
    device.queue.submit([encoder.finish()]);
    await withTimeout(readback.mapAsync(1), 15_000, 'WebGPU compute');
    const values = new Float32Array(readback.getMappedRange().slice(0));
    readback.unmap();
    if (values[0] !== 2 || values[3] !== 8)
      throw new Error('El resultado del cómputo WebGPU no es válido.');
  } finally {
    input.destroy();
    output.destroy();
    readback.destroy();
  }
}

export function serializeError(value: unknown): SerializableError {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return {
      name: typeof record['name'] === 'string' ? record['name'] : 'Error',
      message: typeof record['message'] === 'string' ? record['message'] : safeStringify(value),
      stack: typeof record['stack'] === 'string' ? record['stack'] : undefined,
    };
  }
  return { name: 'Error', message: String(value) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
  operation: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () =>
        reject(new Error(`${operation} no ha respondido en ${Math.round(milliseconds / 1000)} s.`)),
      milliseconds,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}
