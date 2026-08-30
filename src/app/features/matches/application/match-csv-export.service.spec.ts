import { TestBed } from '@angular/core/testing';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { Match } from '../../../shared/models/match';
import { CsvFileDownloader } from './csv-file-downloader';
import { MatchCsvExportService } from './match-csv-export.service';
import { SystemNotificationService } from '../../../core/notifications/system-notification.service';

function match(status: Match['status']): Match {
  return {
    id: 'match-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: new Date(2026, 7, 28, 12).getTime(),
    status,
    currentPeriod: 2,
    periodCount: 2,
    clock: { ...createMatchClock(), remainingMs: 0 },
    squadPlayerIds: ['p1'],
    startingLineupPlayerIds: ['p1'],
    createdAt: 1,
    updatedAt: 2,
  };
}

describe('MatchCsvExportService', () => {
  it('loads persisted data, projects it and triggers one CSV download', async () => {
    const download = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        MatchCsvExportService,
        { provide: MatchRepository, useValue: { get: async () => match('finished') } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        {
          provide: PlayerRepository,
          useValue: {
            listByIds: async () => [
              { id: 'p1', teamId: 'team-1', number: 7, name: 'Álex', active: true },
            ],
          },
        },
        { provide: CsvFileDownloader, useValue: { download } },
      ],
    });

    const result = await TestBed.inject(MatchCsvExportService).export('match-1');

    expect(result.ok).toBe(true);
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0]?.[0]).toContain('\uFEFFfecha,equipo,rival');
    expect(download.mock.calls[0]?.[0]).not.toContain('match_id');
    expect(download.mock.calls[0]?.[0]).not.toContain('player_id');
    expect(download.mock.calls[0]?.[0]).toContain('Álex,0,00:00,0');
    expect(download.mock.calls[0]?.[1]).toBe('futsal-stats_2026-08-28_inter_vs_rival.csv');
  });

  it('exports an active match without creating events or changing its clock', async () => {
    const listByMatch = vi.fn(async () => []);
    const download = vi.fn();
    const active = match('firstHalf');
    active.clock = {
      ...createMatchClock(),
      running: true,
      startedAtEpochMs: Date.now(),
    };
    TestBed.configureTestingModule({
      providers: [
        MatchCsvExportService,
        { provide: MatchRepository, useValue: { get: async () => active } },
        { provide: MatchEventRepository, useValue: { listByMatch } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        { provide: CsvFileDownloader, useValue: { download } },
      ],
    });

    const service = TestBed.inject(MatchCsvExportService);
    const notifications = TestBed.inject(SystemNotificationService);
    const result = await service.export('match-1');

    expect(result.ok).toBe(true);
    expect(listByMatch).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledOnce();
    expect(active.clock.running).toBe(true);
    expect(notifications.notification()?.message).toBe('CSV exportado');
    expect(notifications.notification()?.type).toBe('success');
    expect(service.error()).toBeNull();
  });

  it('shares one loading lock and prevents duplicate exports', async () => {
    let releaseMatch!: (value: Match) => void;
    const pendingMatch = new Promise<Match>((resolve) => (releaseMatch = resolve));
    const download = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        MatchCsvExportService,
        { provide: MatchRepository, useValue: { get: () => pendingMatch } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => [] } },
        { provide: PlayerRepository, useValue: { listByIds: async () => [] } },
        { provide: CsvFileDownloader, useValue: { download } },
      ],
    });
    const service = TestBed.inject(MatchCsvExportService);

    const first = service.export('match-1');
    expect(service.isExporting()).toBe(true);
    await expect(service.export('match-1')).resolves.toEqual({
      ok: false,
      error: 'Ya hay una exportación en curso.',
    });
    releaseMatch(match('finished'));
    await first;

    expect(download).toHaveBeenCalledOnce();
    expect(service.isExporting()).toBe(false);
  });
});
