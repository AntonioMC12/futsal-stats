import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY as MatchEventRepository,
  MATCH_REPOSITORY as MatchRepository,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { DeleteMatchService } from '../application/delete-match.service';
import { MatchCsvExportService } from '../application/match-csv-export.service';
import { MatchesPage } from './matches-page';
import { MatchIntegrityService } from '../../../core/sync/match-integrity.service';

function match(id: string, status: Match['status'], date: number): Match {
  return {
    id,
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date,
    description: `Partido amistoso ${id}`,
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
        {
          provide: MatchIntegrityService,
          useValue: {
            getIntegrityStatus: async () => 'unknown',
            verify: async () => ({ status: 'unknown' }),
          },
        },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate');
    const fixture = TestBed.createComponent(MatchesPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Partido en curso');
    expect(fixture.nativeElement.textContent).toContain('Continuar partido');
    expect(fixture.nativeElement.textContent).toContain('Historial');
    expect(fixture.nativeElement.querySelector('.import-match')?.getAttribute('href')).toBe(
      '/matches/import',
    );
    const finishedLink = fixture.nativeElement.querySelector('.history-actions > a');
    expect(finishedLink.textContent).toContain('Ver detalle');
    expect(finishedLink.getAttribute('href')).toBe('/matches/finished');
    expect(fixture.nativeElement.querySelector('.history-item')?.textContent).toContain(
      'Partido amistoso finished',
    );

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
        {
          provide: MatchIntegrityService,
          useValue: {
            getIntegrityStatus: async () => 'unknown',
            verify: async () => ({ status: 'unknown' }),
          },
        },
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

  it('keeps long and short history entries in separate content and action regions', async () => {
    const long = {
      ...match('long', 'finished', 20),
      awayTeam: {
        name: 'Club Deportivo de Fútbol Sala con un Nombre Excepcionalmente Largo',
        shortName: 'RIV',
      },
      season: '2026/27',
      competition: 'Competición Metropolitana de Fútbol Sala de Categoría Preferente',
      description: 'Partido de preparación con observaciones extensas para el cuerpo técnico',
    };
    const short = { ...match('short', 'finished', 10), description: '' };
    await TestBed.configureTestingModule({
      imports: [MatchesPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchRepository, useValue: { list: async () => [long, short] } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        { provide: DeleteMatchService, useValue: { execute: async () => undefined } },
        {
          provide: MatchCsvExportService,
          useValue: { isExporting: signal(false), error: signal(null), export: vi.fn() },
        },
        {
          provide: MatchIntegrityService,
          useValue: {
            getIntegrityStatus: async () => 'unknown',
            verify: async () => ({ status: 'unknown' }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(MatchesPage);
    await fixture.whenStable();
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll(
      '.history-item',
    ) as NodeListOf<HTMLElement>;
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelector('.history-item__content')).toBeTruthy();
      const actions = card.querySelector('.history-actions') as HTMLElement;
      expect(actions.querySelector('a')?.textContent).toContain('Ver detalle');
      expect(actions.querySelector('summary')?.getAttribute('aria-label')).toBe(
        'Opciones del partido',
      );
    }
    expect(cards[0]!.querySelector('.history-item__content')?.textContent).toContain(
      long.awayTeam.name,
    );
    expect(cards[0]!.querySelector('.history-item__content')?.textContent).toContain(
      long.competition,
    );
    expect(cards[1]!.querySelector('.history-item__content')?.textContent).toContain(
      'Sin descripción',
    );
    fixture.destroy();
  });
});
