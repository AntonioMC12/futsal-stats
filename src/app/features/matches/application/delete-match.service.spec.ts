import { TestBed } from '@angular/core/testing';
import { FutsalStatsDb } from '../../../core/persistence/futsal-stats.db';
import { DeleteMatchService } from './delete-match.service';

describe('DeleteMatchService', () => {
  it('deletes events and match inside the same transaction without touching teams or players', async () => {
    const deleteEvents = vi.fn(async () => undefined);
    const deleteMatch = vi.fn(async () => undefined);
    const teamsDelete = vi.fn();
    const playersDelete = vi.fn();
    const events = {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ delete: deleteEvents })),
      })),
    };
    const matches = { delete: deleteMatch };
    const db = {
      events,
      matches,
      teams: { delete: teamsDelete },
      players: { delete: playersDelete },
      transaction: vi.fn(
        async (_mode: string, _matches: unknown, _events: unknown, work: () => Promise<void>) =>
          work(),
      ),
    };
    TestBed.configureTestingModule({
      providers: [DeleteMatchService, { provide: FutsalStatsDb, useValue: db }],
    });

    await TestBed.inject(DeleteMatchService).execute('match-a');

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(events.where).toHaveBeenCalledWith('matchId');
    expect(deleteEvents).toHaveBeenCalledOnce();
    expect(deleteMatch).toHaveBeenCalledWith('match-a');
    expect(teamsDelete).not.toHaveBeenCalled();
    expect(playersDelete).not.toHaveBeenCalled();
  });

  it('does not attempt a partial delete when the transaction cannot start', async () => {
    const deleteMatch = vi.fn();
    const db = {
      events: {},
      matches: { delete: deleteMatch },
      transaction: vi.fn(async () => {
        throw new Error('IndexedDB unavailable');
      }),
    };
    TestBed.configureTestingModule({
      providers: [DeleteMatchService, { provide: FutsalStatsDb, useValue: db }],
    });

    await expect(TestBed.inject(DeleteMatchService).execute('match-a')).rejects.toThrow();
    expect(deleteMatch).not.toHaveBeenCalled();
  });
});
