import { TestBed } from '@angular/core/testing';
import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';
import { WebGpuDiagnosticsService } from '../../../core/diagnostics/web-gpu-diagnostics.service';
import { RfefLocalLlmService } from './rfef-local-llm.service';

vi.mock('@mlc-ai/web-llm', () => ({
  CreateWebWorkerMLCEngine: vi.fn(),
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
    }),
    markWebLlmLoading: vi.fn(),
    updateWebLlmProgress: vi.fn(),
    markWebLlmReady: vi.fn(),
    markWebLlmFailed: vi.fn(),
    recordWorkerError: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(CreateWebWorkerMLCEngine).mockResolvedValue(engine as never);
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
});
