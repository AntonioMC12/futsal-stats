import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { HomePage } from './home-page';

describe('HomePage', () => {
  it('offers to continue an active match', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: MatchRepository,
          useValue: {
            findActive: async () => ({
              id: 'match-1',
              homeTeam: { name: 'Casa', shortName: 'CAS' },
              awayTeam: { name: 'Rival', shortName: 'RIV' },
            }),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Continuar partido');
    expect(fixture.nativeElement.textContent).toContain('CAS vs RIV');
  });

  it('offers to create a match when none is active', async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchRepository, useValue: { findActive: async () => null } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(HomePage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Crear partido');
  });
});
