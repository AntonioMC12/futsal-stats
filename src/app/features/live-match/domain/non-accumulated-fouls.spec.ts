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
  it.each(['DISCIPLINE', 'BENCH_DISCIPLINE'] as const)(
    '%s counts protest cautions for either team and undo removes the foul',
    (type) => {
      for (const team of ['home', 'away'] as const) {
        for (const disciplinaryAction of ['yellow', 'secondYellow', 'directRed'] as const) {
          const card = event(1, {
            type,
            team,
            playerId: team === 'home' ? 'p1' : undefined,
            opponentPlayerNumber: team === 'away' ? 7 : undefined,
            disciplinaryAction,
            reason: 'protest',
          });
          const expected = disciplinaryAction === 'directRed' ? 0 : 1;
          expect(countsAsAccumulatedFoul(card)).toBe(expected === 1);
          expect(deriveMatchState(match, [card]).foulsByPeriod[1]?.[team] ?? 0).toBe(expected);
          expect(deriveDisciplinaryState([card], 0).teams[team].accumulatedFouls).toBe(expected);
          const undo = event(2, { type: 'EVENT_UNDONE', targetEventId: card.id });
          expect(deriveMatchState(match, [card, undo]).foulsByPeriod[1]).toBeUndefined();
          expect(deriveDisciplinaryState([card, undo], 0).teams[team].accumulatedFouls).toBe(0);
        }
      }
    },
  );

  it('counts protest cautions on court and on the bench alongside accumulated fouls', () => {
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

    expect(deriveMatchState(match, events).foulsByPeriod[1]?.home).toBe(4);
    expect(deriveDisciplinaryState(events, 0).teams.home).toMatchObject({
      fouls: 5,
      accumulatedFouls: 4,
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
