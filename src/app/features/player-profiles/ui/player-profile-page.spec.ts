import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY as MatchEventRepository,
  MATCH_REPOSITORY as MatchRepository,
  PLAYER_PROFILE_REPOSITORY as PlayerProfileRepository,
  PLAYER_REPOSITORY as PlayerRepository,
} from '../../../core/persistence/persistence.tokens';
import { PlayerProfilePage } from './player-profile-page';
import { PlayerProfileStore } from '../application/player-profile.store';

describe('PlayerProfilePage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders career metrics, season history and saves the persistent sports profile', async () => {
    const put = vi.fn(async () => 'p1');
    const match = {
      id: 'match-1',
      teamId: 'team-1',
      homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-08',
      season: '2026/27',
      competition: 'Liga',
      description: '',
      status: 'finished' as const,
      currentPeriod: 2,
      periodCount: 2,
      clock: createMatchClock(),
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1,
      updatedAt: 2,
    };
    await TestBed.configureTestingModule({
      imports: [PlayerProfilePage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: PlayerRepository,
          useValue: {
            listByIds: async () => [
              { id: 'p1', teamId: 'team-1', number: 7, name: 'Ana Ruiz', active: true },
            ],
          },
        },
        { provide: PlayerProfileRepository, useValue: { get: async () => undefined, put } },
        { provide: MatchRepository, useValue: { listByTeam: async () => [match] } },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async () => [
              {
                id: 'goal',
                matchId: 'match-1',
                type: 'GOAL_FOR',
                period: 1,
                gameClockMs: 10,
                timestamp: 1,
                sequence: 1,
                undone: false,
                scorerPlayerId: 'p1',
                lineupPlayerIds: ['p1'],
                scoreBefore: { home: 0, away: 0 },
                scoreAfter: { home: 1, away: 0 },
              },
            ],
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayerProfilePage);
    fixture.componentRef.setInput('playerId', 'p1');
    fixture.detectChanges();
    await fixture.debugElement.injector.get(PlayerProfileStore).load('p1');
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toContain('Ana Ruiz');
    expect(page.querySelector('.career-summary')?.textContent).toContain('1 goles');
    expect(page.querySelector('.player-match-card')?.getAttribute('href')).toBe('/matches/match-1');
    expect(page.textContent).toContain('2026/27');

    const notes = page.querySelector('[formControlName="notes"]') as HTMLTextAreaElement;
    notes.value = 'Mejora en finalización';
    notes.dispatchEvent(new Event('input'));
    (page.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p1', notes: 'Mejora en finalización' }),
    );
    fixture.destroy();
  });
});
