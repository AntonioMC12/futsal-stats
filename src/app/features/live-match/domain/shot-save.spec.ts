import { createMatchClock } from '../../../core/clock/match-clock';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { registerFoul } from './foul';
import { deriveMatchStatistics } from './match-statistics';
import { registerSave, registerShot } from './shot-save';
import { undoLastEvent } from './undo';

const match: Match = {
  id: 'm',
  teamId: 't',
  homeTeam: { id: 't', name: 'Home', shortName: 'H' },
  awayTeam: { name: 'Away', shortName: 'A' },
  date: '2026-09-21',
  description: '',
  status: 'firstHalf',
  currentPeriod: 1,
  periodCount: 2,
  clock: createMatchClock(),
  squadPlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
  startingLineupPlayerIds: ['a', 'b', 'c', 'd', 'e'],
  createdAt: 1,
  updatedAt: 1,
  statisticsSchemaVersion: 2,
};
const common = {
  match,
  currentLineupPlayerIds: ['a', 'b', 'c', 'd', 'e'],
  playerId: 'a',
  gameClockMs: 500_000,
  timestamp: 100,
  sequence: 1,
  eventId: 'one',
};

describe('shot, save and received foul tracking', () => {
  it('records both shot outcomes and attributes a save only to an on-court player', () => {
    const on = registerShot({ ...common, outcome: 'on_target' });
    const off = registerShot({ ...common, eventId: 'two', sequence: 2, outcome: 'off_target' });
    const save = registerSave({ ...common, eventId: 'three', sequence: 3, playerId: 'b' });
    expect(on.ok && off.ok && save.ok).toBe(true);
    if (!on.ok || !off.ok || !save.ok) return;
    const stats = deriveMatchStatistics(
      match,
      [on.value.event, off.value.event, save.value.event],
      500_000,
    );
    expect(stats.players['a']).toMatchObject({
      shotsTotal: 2,
      shotsOnTarget: 1,
      shotsOffTarget: 1,
      saves: 0,
    });
    expect(stats.players['b'].saves).toBe(1);
    expect(registerShot({ ...common, playerId: 'f', outcome: 'on_target' }).ok).toBe(false);
    expect(registerSave({ ...common, playerId: 'f' }).ok).toBe(false);
  });

  it('counts only explicit foul receivers and excludes undone events', () => {
    const foul = registerFoul({
      ...common,
      playerId: undefined,
      team: 'away',
      currentPeriodFoulCount: 0,
      receivedByPlayerId: 'a',
    });
    const none = registerFoul({
      ...common,
      playerId: undefined,
      team: 'away',
      currentPeriodFoulCount: 1,
      eventId: 'two',
      sequence: 2,
    });
    expect(foul.ok && none.ok).toBe(true);
    if (!foul.ok || !none.ok) return;
    expect(
      registerFoul({
        ...common,
        playerId: undefined,
        team: 'away',
        currentPeriodFoulCount: 0,
        receivedByPlayerId: 'f',
      }).ok,
    ).toBe(false);
    const events: MatchEvent[] = [foul.value.event, none.value.event];
    expect(deriveMatchStatistics(match, events, 500_000).players['a'].foulsReceived).toBe(1);
    const undo = undoLastEvent({
      match,
      events: [foul.value.event],
      gameClockMs: 490_000,
      timestamp: 200,
      sequence: 3,
      eventId: 'undo',
    });
    expect(undo.ok).toBe(true);
    if (undo.ok)
      expect(
        deriveMatchStatistics(match, [...events, undo.value.event], 490_000).players['a']
          .foulsReceived,
      ).toBe(0);
  });

  it('distinguishes untracked historical matches from tracked zero and undoes shots and saves', () => {
    expect(
      registerShot({
        ...common,
        match: { ...match, statisticsSchemaVersion: undefined },
        outcome: 'on_target',
      }).ok,
    ).toBe(false);
    expect(
      deriveMatchStatistics({ ...match, statisticsSchemaVersion: undefined }, [], 500_000).players[
        'a'
      ].shotsTotal,
    ).toBeNull();
    expect(deriveMatchStatistics(match, [], 500_000).players['a'].shotsTotal).toBe(0);
    for (const result of [
      registerShot({ ...common, outcome: 'on_target' }),
      registerSave(common),
    ]) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const undo = undoLastEvent({
        match,
        events: [result.value.event],
        gameClockMs: 490_000,
        timestamp: 200,
        sequence: 2,
        eventId: 'undo',
      });
      expect(undo.ok).toBe(true);
      if (undo.ok) {
        const stats = deriveMatchStatistics(match, [result.value.event, undo.value.event], 490_000)
          .players['a'];
        expect(stats.shotsTotal).toBe(0);
        expect(stats.saves).toBe(0);
      }
    }
  });
});
