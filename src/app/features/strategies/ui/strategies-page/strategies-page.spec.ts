import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LocalStrategyRepository } from '../../data/local-strategy.repository';
import { StrategyRepository } from '../../domain/strategy';
import { StrategiesPage } from './strategies-page';
describe('StrategiesPage shell', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('renders real designer and library navigation plus the team selector', async () => {
    await TestBed.configureTestingModule({
      imports: [StrategiesPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: StrategyRepository, useClass: LocalStrategyRepository },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(StrategiesPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelectorAll('.module-bar nav a')).toHaveLength(2);
    expect(page.textContent).toContain('Diseñador');
    expect(page.textContent).toContain('Biblioteca');
    expect(page.querySelector('.team-switcher select')).not.toBeNull();
  });
});
