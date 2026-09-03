import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StrategiesPage } from './strategies-page';

describe('StrategiesPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('loads Ravi and keeps board, copy and controls synchronized', async () => {
    await TestBed.configureTestingModule({
      imports: [StrategiesPage],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StrategiesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    expect(page.textContent).toContain('Ravi');
    expect(page.textContent).toContain('Salida de presión');
    expect(page.textContent).toContain('Fase 1/5');
    expect(page.textContent).toContain('Colocación inicial');
    expect(page.textContent).toContain('Clave táctica');
    expect(page.querySelector<HTMLSelectElement>('select')?.value).toBe('1350');

    const navigationButtons = page.querySelectorAll<HTMLButtonElement>(
      '.controls__transport .control-button--secondary',
    );
    expect(navigationButtons[0]?.disabled).toBe(true);
    expect(navigationButtons[1]?.disabled).toBe(false);
    navigationButtons[1]?.click();
    fixture.detectChanges();
    expect(page.textContent).toContain('Fase 2/5');
    expect(page.textContent).toContain('Saque hacia el cierre');

    page.querySelector<HTMLButtonElement>('.timeline__step:last-of-type')?.click();
    fixture.detectChanges();
    expect(page.textContent).toContain('Fase 5/5');
    expect(navigationButtons[1]?.disabled).toBe(true);
  });

  it('supports arrow and space shortcuts without hijacking focused controls', async () => {
    await TestBed.configureTestingModule({
      imports: [StrategiesPage],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(StrategiesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    fixture.detectChanges();
    expect(page.textContent).toContain('Fase 2/5');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
    fixture.detectChanges();
    expect(page.querySelector('.control-button--play')?.textContent).toContain('Pausar');

    const select = page.querySelector('select')!;
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(page.textContent).toContain('Fase 2/5');
  });
});
