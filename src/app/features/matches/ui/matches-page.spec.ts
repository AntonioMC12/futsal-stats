import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { Match } from '../../../shared/models/match';
import { DeleteMatchService } from '../application/delete-match.service';
import { MatchCsvExportService } from '../application/match-csv-export.service';
import { MatchesPage } from './matches-page';

function match(id: string, status: Match['status'], date: number): Match {
  return {
    id,
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date,
    status,
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    startingLineupPlayerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    createdAt: date,
    updatedAt: date,
  };
}

describe('MatchesPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('clearly separates the active match from finished history and blocks a second match', async () => {
    const active = match('active', 'firstHalf', 20);
    const finished = match('finished', 'finished', 10);
    const csvExporter = {
      isExporting: signal(false),
      notice: signal<string | null>(null),
      error: signal<string | null>(null),
      export: vi.fn(async () => ({ ok: true as const, value: 'match.csv' })),
    };
    await TestBed.configureTestingModule({
      imports: [MatchesPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchRepository, useValue: { list: async () => [active, finished] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        { provide: DeleteMatchService, useValue: { execute: async () => undefined } },
        { provide: MatchCsvExportService, useValue: csvExporter },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(MatchesPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Partido en curso');
    expect(fixture.nativeElement.textContent).toContain('Continuar partido');
    expect(fixture.nativeElement.textContent).toContain('Finalizados');

    const exportButtons = fixture.nativeElement.querySelectorAll(
      'details.secondary-actions .export-csv',
    ) as NodeListOf<HTMLButtonElement>;
    expect(exportButtons).toHaveLength(2);
    expect(exportButtons[0]?.textContent).toContain('Exportar CSV');
    exportButtons[0]?.click();
    expect(csvExporter.export).toHaveBeenCalledOnce();
    expect(csvExporter.export).toHaveBeenCalledWith('active');

    csvExporter.isExporting.set(true);
    fixture.detectChanges();
    expect(Array.from(exportButtons).every((button) => button.disabled)).toBe(true);

    (fixture.nativeElement.querySelector('.new-match') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Ya existe un partido en curso');
    expect(fixture.nativeElement.textContent).toContain('Abandonar y crear nuevo');
    expect(navigate).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('navigates directly to setup when no active match exists', async () => {
    const csvExporter = {
      isExporting: signal(false),
      notice: signal<string | null>(null),
      error: signal<string | null>(null),
      export: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [MatchesPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchRepository, useValue: { list: async () => [] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        { provide: DeleteMatchService, useValue: { execute: async () => undefined } },
        { provide: MatchCsvExportService, useValue: csvExporter },
      ],
    }).compileComponents();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(MatchesPage);
    await fixture.whenStable();
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.new-match') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/matches/new']);
    fixture.destroy();
  });
});
