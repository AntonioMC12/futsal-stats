import { TestBed } from '@angular/core/testing';
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { ModelRegistry } from '@huggingface/transformers';
import { WebGpuDiagnosticsService } from '../../../core/diagnostics/web-gpu-diagnostics.service';
import { RfefLocalLlmService } from './rfef-local-llm.service';

vi.mock('@mlc-ai/web-llm', () => ({
  CreateWebWorkerMLCEngine: vi.fn(),
}));
vi.mock('@huggingface/transformers', () => ({
  ModelRegistry: { is_pipeline_cached: vi.fn(), clear_pipeline_cache: vi.fn() },
}));

describe('RfefLocalLlmService', () => {
  const engine = {
    chat: { completions: { create: vi.fn() } },
    interruptGenerate: vi.fn(),
    unload: vi.fn().mockResolvedValue(undefined),
  };
  const diagnostics = {
    debugEnabled: false,
    run: vi.fn().mockResolvedValue({
      status: 'WEBGPU_AVAILABLE',
      device: 'mobile',
      isMobile: true,
      webAssembly: true,
      adapterLimits: {},
    }),
    markWebLlmLoading: vi.fn(),
    updateWebLlmProgress: vi.fn(),
    markWebLlmReady: vi.fn(),
    markWebLlmFailed: vi.fn(),
    markWebLlmRequirementsUnmet: vi.fn(),
    markFallbackSelected: vi.fn(),
    markFallbackLoading: vi.fn(),
    markFallbackReady: vi.fn(),
    markFallbackFailed: vi.fn(),
    recordWorkerError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CreateWebWorkerMLCEngine).mockResolvedValue(engine as never);
    vi.mocked(ModelRegistry.is_pipeline_cached).mockResolvedValue(false);
    vi.stubGlobal(
      'Worker',
      class {
        addEventListener(): void {}
        terminate(): void {}
      },
    );
    TestBed.configureTestingModule({
      providers: [
        RfefLocalLlmService,
        { provide: WebGpuDiagnosticsService, useValue: diagnostics },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('reuses one initialization for simultaneous install calls', async () => {
    const service = TestBed.inject(RfefLocalLlmService);

    await Promise.all([service.install(), service.install()]);

    expect(CreateWebWorkerMLCEngine).toHaveBeenCalledOnce();
    expect(diagnostics.markWebLlmLoading).toHaveBeenCalledWith(
      'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
      2048,
      1024,
    );
    expect(service.state()).toBe('installed');
  });

  it('selects the WASM fallback when WebLLM requires more workgroup storage than available', async () => {
    diagnostics.run.mockResolvedValueOnce({
      status: 'WEBGPU_AVAILABLE',
      device: 'mobile',
      isMobile: true,
      webAssembly: true,
      adapterLimits: { maxComputeWorkgroupStorageSize: 16_384 },
    });
    const service = TestBed.inject(RfefLocalLlmService);

    await service.refreshStatus();

    expect(service.state()).toBe('not-installed');
    expect(service.backend()).toBe('wasm');
    expect(service.statusText()).toContain('compatible');
    expect(diagnostics.markWebLlmRequirementsUnmet).toHaveBeenCalledOnce();
    expect(CreateWebWorkerMLCEngine).not.toHaveBeenCalled();
  });
});
