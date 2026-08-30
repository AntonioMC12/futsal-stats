import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SystemNotificationService } from '../../../core/notifications/system-notification.service';
import { SystemNotificationComponent } from './system-notification';

describe('SystemNotificationComponent', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await TestBed.configureTestingModule({
      imports: [SystemNotificationComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('renders the variant, enters, leaves and is removed after animationend', () => {
    const fixture = TestBed.createComponent(SystemNotificationComponent);
    const service = TestBed.inject(SystemNotificationService);
    service.warning('Acción no disponible', { duration: 10 });
    fixture.detectChanges();

    let element = fixture.nativeElement.querySelector('.system-notification') as HTMLElement;
    expect(element.classList).toContain('system-notification--warning');
    expect(element.classList).toContain('system-notification--entering');
    expect(element.getAttribute('role')).toBe('alert');

    element.dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
    expect(service.phase()).toBe('visible');
    vi.advanceTimersByTime(10);
    fixture.detectChanges();
    element = fixture.nativeElement.querySelector('.system-notification') as HTMLElement;
    expect(element.classList).toContain('system-notification--leaving');

    element.dispatchEvent(new Event('animationend'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.system-notification')).toBeNull();
  });
});
