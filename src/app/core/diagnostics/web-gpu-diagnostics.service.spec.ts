import { WebGpuDiagnosticsService } from './web-gpu-diagnostics.service';

describe('WebGpuDiagnosticsService', () => {
  const originalGpu = Object.getOwnPropertyDescriptor(navigator, 'gpu');

  afterEach(() => {
    if (originalGpu) Object.defineProperty(navigator, 'gpu', originalGpu);
    else Reflect.deleteProperty(navigator, 'gpu');
  });

  it('distinguishes an absent WebGPU API', async () => {
    setGpu(undefined);

    const report = await new WebGpuDiagnosticsService().run();

    expect(report.status).toBe('NO_WEBGPU');
    expect(report.webgpu).toBe(false);
  });

  it('distinguishes a missing adapter', async () => {
    setGpu({ requestAdapter: vi.fn().mockResolvedValue(null) });

    const report = await new WebGpuDiagnosticsService().run();

    expect(report.status).toBe('NO_GPU_ADAPTER');
    expect(report.webgpu).toBe(true);
    expect(report.gpuAdapter).toBe(false);
  });

  it('distinguishes requestDevice failure', async () => {
    setGpu({
      requestAdapter: vi.fn().mockResolvedValue({
        requestDevice: vi.fn().mockRejectedValue(new Error('device unavailable')),
      }),
    });

    const report = await new WebGpuDiagnosticsService().run();

    expect(report.status).toBe('GPU_DEVICE_FAILED');
    expect(report.gpuAdapter).toBe(true);
    expect(report.gpuDevice).toBe(false);
    expect(report.error?.message).toBe('device unavailable');
  });

  it('only reports WebGPU available after a real compute result', async () => {
    const readback = buffer(new Float32Array([2, 4, 6, 8]).buffer);
    const buffers = [buffer(), buffer(), readback];
    const device = {
      lost: new Promise<object>(() => undefined),
      queue: { writeBuffer: vi.fn(), submit: vi.fn() },
      createBuffer: vi.fn(() => buffers.shift()),
      createShaderModule: vi.fn(() => ({})),
      createComputePipeline: vi.fn(() => ({ getBindGroupLayout: vi.fn(() => ({})) })),
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: vi.fn(() => ({
        beginComputePass: vi.fn(() => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups: vi.fn(),
          end: vi.fn(),
        })),
        copyBufferToBuffer: vi.fn(),
        finish: vi.fn(() => ({})),
      })),
      destroy: vi.fn(),
    };
    setGpu({
      requestAdapter: vi.fn().mockResolvedValue({
        features: new Set(['shader-f16']),
        limits: { maxBufferSize: 1024 },
        info: { vendor: 'test-vendor' },
        requestDevice: vi.fn().mockResolvedValue(device),
      }),
    });

    const report = await new WebGpuDiagnosticsService().run();

    expect(report.status).toBe('WEBGPU_AVAILABLE');
    expect(report.gpuDevice).toBe(true);
    expect(report.webgpuCompute).toBe(true);
    expect(report.adapterInfo['vendor']).toBe('test-vendor');
    expect(device.destroy).toHaveBeenCalledOnce();
  });
});

function setGpu(value: unknown): void {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value });
}

function buffer(contents = new ArrayBuffer(16)) {
  return {
    mapAsync: vi.fn().mockResolvedValue(undefined),
    getMappedRange: vi.fn(() => contents),
    unmap: vi.fn(),
    destroy: vi.fn(),
  };
}
