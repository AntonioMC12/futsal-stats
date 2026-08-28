import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { DeleteMatchService } from '../../matches/application/delete-match.service';
import { LiveMatchStore } from '../application/live-match.store';
import { LiveMatchPage } from './live-match-page';

const players: Player[] = Array.from({ length: 6 }, (_, index) => ({
  id: `p${index + 1}`,
  teamId: 'team-1',
  number: index + 1,
  name: index === 5 ? 'Banquillo' : `Jugador ${index + 1}`,
  active: true,
}));

function activeMatch(): Match {
  return {
    id: 'match-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: 1,
    status: 'firstHalf',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds: players.map((player) => player.id),
    startingLineupPlayerIds: players.slice(0, 5).map((player) => player.id),
    createdAt: 1,
    updatedAt: 1,
  };
}

function lineupEvents(): MatchEvent[] {
  return players.slice(0, 5).map((player, index) => ({
    id: `entered-${player.id}`,
    matchId: 'match-1',
    type: 'PLAYER_ENTERED',
    playerId: player.id,
    period: 1,
    gameClockMs: 1_200_000,
    timestamp: index + 1,
    sequence: index + 1,
    undone: false,
  }));
}

describe('LiveMatchPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function createPage() {
    const match = activeMatch();
    await TestBed.configureTestingModule({
      imports: [LiveMatchPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchRepository, useValue: { get: async () => match } },
        { provide: PlayerRepository, useValue: { listByIds: async () => players } },
        { provide: MatchEventRepository, useValue: { listByMatch: async () => lineupEvents() } },
        { provide: DeleteMatchService, useValue: { execute: async () => undefined } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LiveMatchPage);
    fixture.componentRef.setInput('matchId', match.id);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(LiveMatchStore);
    await vi.waitFor(() => expect(store.loading()).toBe(false));
    fixture.detectChanges();
    return { fixture, store };
  }

  it('renders five court players and substitutes directly with the only bench player', async () => {
    const { fixture, store } = await createPage();
    const courtPlayers = fixture.nativeElement.querySelectorAll(
      '.court-player:not(.court-player--empty)',
    );
    expect(courtPlayers).toHaveLength(5);

    const makeSubstitution = vi.spyOn(store, 'makeSubstitution').mockResolvedValue(true);
    (courtPlayers[2] as HTMLButtonElement).click();
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('.substitution-sheet') as HTMLElement;
    expect(sheet).toBeTruthy();
    expect(sheet.textContent).toContain('#3 Jugador 3');
    const benchOptions = sheet.querySelectorAll('.bench-option');
    expect(benchOptions).toHaveLength(1);
    expect(benchOptions[0]?.textContent).toContain('#6');
    expect(benchOptions[0]?.textContent).toContain('Banquillo');

    (benchOptions[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(makeSubstitution).toHaveBeenCalledOnce();
    expect(makeSubstitution).toHaveBeenCalledWith('p3', 'p6');
    expect(fixture.nativeElement.querySelector('.substitution-sheet')).toBeNull();
    fixture.destroy();
  });

  it('uses the same clock commands from the floating button', async () => {
    const { fixture, store } = await createPage();
    const startClock = vi.spyOn(store, 'startClock').mockResolvedValue();
    let fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(fab.getAttribute('aria-label')).toBe('Iniciar reloj');

    fab.click();
    expect(startClock).toHaveBeenCalledOnce();

    const match = store.match();
    expect(match).not.toBeNull();
    store.match.set({
      ...match!,
      clock: { ...match!.clock, running: true, startedAtEpochMs: Date.now() },
    });
    fixture.detectChanges();
    const stopClock = vi.spyOn(store, 'stopClock').mockResolvedValue();
    fab = fixture.nativeElement.querySelector('.clock-fab') as HTMLButtonElement;
    expect(fab.getAttribute('aria-label')).toBe('Parar reloj');

    fab.click();
    expect(stopClock).toHaveBeenCalledOnce();
    fixture.destroy();
  });
});
