import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { deriveMatchState } from './derived-match-state';
import { deriveDisciplinaryState } from './discipline';
import { countsAsAccumulatedFoul } from './futsal-rules';

const match: Match = {
  id: 'match-1',
  teamId: 'team-1',
  homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
  awayTeam: { name: 'Rival', shortName: 'RIV' },
  date: 1,
  description: '',
  status: 'firstHalf',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: ['p1'],
  startingLineupPlayerIds: ['p1'],
  createdAt: 1,
  updatedAt: 1,
};

function event(
  sequence: number,
  value: Partial<MatchEvent> & Pick<MatchEvent, 'type'>,
): MatchEvent {
  return {
    id: `event-${sequence}`,
    matchId: match.id,
    period: 1,
    gameClockMs: 1_200_000 - sequence,
    timestamp: sequence,
    sequence,
    undone: false,
    ...value,
  } as MatchEvent;
}

describe('non-accumulated fouls and independent cards', () => {
  it('uses only explicit accumulated FOUL events for the period counter', () => {
    const events: MatchEvent[] = [
      event(1, {
        type: 'FOUL',
        team: 'home',
        playerId: 'p1',
        periodFoulNumber: 1,
        countsAsAccumulatedFoul: true,
        restart: 'direct-free-kick',
      }),
      event(2, {
        type: 'DISCIPLINE',
        team: 'home',
        playerId: 'p1',
        disciplinaryAction: 'yellow',
        reason: 'protest',
      }),
      event(3, {
        type: 'FOUL',
        team: 'home',
        playerId: 'p1',
        periodFoulNumber: 1,
        countsAsAccumulatedFoul: false,
        restart: 'indirect-free-kick',
      }),
      event(4, {
        type: 'FOUL',
        team: 'home',
        playerId: 'p1',
        periodFoulNumber: 2,
        countsAsAccumulatedFoul: true,
        restart: 'penalty',
        disciplinaryAction: 'yellow',
      }),
      event(5, {
        type: 'BENCH_DISCIPLINE',
        team: 'home',
        subjectKind: 'staff',
        staffRole: 'headCoach',
        staffIdentityKey: 'home:headCoach:coach',
        staffName: 'Coach',
        disciplinaryAction: 'yellow',
        reason: 'protest',
        context: 'bench',
        countsAsAccumulatedFoul: false,
        createsDirectFreeKickWithoutWall: false,
        periodFoulNumber: 2,
      }),
    ];

    expect(deriveMatchState(match, events).foulsByPeriod[1]?.home).toBe(2);
    expect(deriveDisciplinaryState(events, 0).teams.home).toMatchObject({
      fouls: 3,
      accumulatedFouls: 2,
      nonAccumulatedInfringements: 1,
      yellowCards: 3,
    });
  });

  it('does not infer a foul from yellow or red cards', () => {
    for (const disciplinaryAction of ['yellow', 'directRed'] as const) {
      expect(
        countsAsAccumulatedFoul(
          event(1, {
            type: 'DISCIPLINE',
            team: 'home',
            playerId: 'p1',
            disciplinaryAction,
            reason: 'other',
          }),
        ),
      ).toBe(false);
    }
  });

  it('removing an isolated yellow changes cards but not accumulated fouls', () => {
    const foul = event(1, {
      type: 'FOUL',
      team: 'home',
      playerId: 'p1',
      periodFoulNumber: 1,
      countsAsAccumulatedFoul: true,
      restart: 'direct-free-kick',
    });
    const yellow = event(2, {
      type: 'DISCIPLINE',
      team: 'home',
      playerId: 'p1',
      disciplinaryAction: 'yellow',
      reason: 'delayRestart',
    });
    const undo = event(3, { type: 'EVENT_UNDONE', targetEventId: yellow.id });
    expect(deriveMatchState(match, [foul, yellow, undo]).foulsByPeriod[1]?.home).toBe(1);
    expect(deriveDisciplinaryState([foul, yellow, undo], 0).teams.home.yellowCards).toBe(0);
  });
});
