import { TestBed } from '@angular/core/testing';
import { SystemNotificationService } from './system-notification.service';

describe('SystemNotificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [SystemNotificationService] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('runs enter, visible and leave phases before removing a notification', () => {
    const service = TestBed.inject(SystemNotificationService);
    const id = service.success('CSV exportado');

    expect(service.notification()?.message).toBe('CSV exportado');
    expect(service.phase()).toBe('entering');

    service.animationDone(id);
    expect(service.phase()).toBe('visible');
    vi.advanceTimersByTime(1_599);
    expect(service.phase()).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(service.phase()).toBe('leaving');
    expect(service.notification()).not.toBeNull();

    service.animationDone(id);
    expect(service.notification()).toBeNull();
  });

  it('replaces consecutive and repeated messages and cancels the old timer', () => {
    const service = TestBed.inject(SystemNotificationService);
    const firstId = service.success('CSV exportado');
    service.animationDone(firstId);
    vi.advanceTimersByTime(500);

    const secondId = service.success('CSV exportado');
    expect(secondId).not.toBe(firstId);
    expect(service.phase()).toBe('entering');
    service.animationDone(secondId);
    vi.advanceTimersByTime(1_100);
    expect(service.phase()).toBe('visible');
    vi.advanceTimersByTime(500);
    expect(service.phase()).toBe('leaving');
  });

  it('supports all semantic variants and configurable durations', () => {
    const service = TestBed.inject(SystemNotificationService);

    for (const type of ['success', 'info', 'warning', 'error'] as const) {
      const id = service.show(type, type, { duration: 10 });
      expect(service.notification()?.type).toBe(type);
      service.animationDone(id);
      vi.advanceTimersByTime(10);
      expect(service.phase()).toBe('leaving');
      service.animationDone(id);
    }
  });
});
