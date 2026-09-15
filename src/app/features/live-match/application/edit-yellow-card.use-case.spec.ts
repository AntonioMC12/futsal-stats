import { TestBed } from '@angular/core/testing';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveDisciplinaryState } from '../domain/discipline';
import { buildMatchStatisticsExport } from '../../matches/domain/match-export';
import { serializeMatchCsv } from '../../matches/domain/match-csv';
import { CsvMatchImportParser } from '../../matches/data/csv-match-import-parser';
import {
  DisciplineUpdateError,
  EditYellowCardUseCase,
  InvalidDisciplinaryPlayerError,
  MatchReadonlyError,
  PlayerNotInMatchError,
  YellowCardNotFoundError,
} from './edit-yellow-card.use-case';

const players: Player[] = [
  { id: 'p12', teamId: 'team-1', number: 12, name: 'Juan', active: true },
  { id: 'p7', teamId: 'team-1', number: 7, name: 'Mario', active: true },
];

function match(status: Match['status'] = 'firstHalf', running = false): Match {
  return {
    id: 'match-1',
    teamId: 'team-1',
    homeTeam: { id: 'team-1', name: 'Inter', shortName: 'INT' },
    awayTeam: { name: 'Rival', shortName: 'RIV' },
    date: '2026-09-14',
    description: '',
    status,
    currentPeriod: 1,
    periodCount: 2,
    clock: { ...createMatchClock(), running, startedAtEpochMs: running ? 1_000 : null },
    squadPlayerIds: players.map(({ id }) => id),
    startingLineupPlayerIds: players.map(({ id }) => id),
    createdAt: 1,
    updatedAt: 1,
  };
}

function yellow(overrides: Partial<MatchEvent> = {}): MatchEvent {
  return {
    id: 'yellow-1',
    matchId: 'match-1',
    type: 'DISCIPLINE',
    team: 'home',
    playerId: 'p12',
    disciplinaryAction: 'yellow',
    reason: 'protest',
    relatedEventId: 'foul-1',
    period: 1,
    gameClockMs: 862_000,
    matchElapsedMs: 338_000,
    timestamp: 2_000,
    sequence: 4,
    undone: false,
    ...overrides,
  } as MatchEvent;
}

function setup(currentMatch = match(), events: MatchEvent[] = [yellow()]) {
  const updateEvent = vi.fn().mockResolvedValue(undefined);
  TestBed.configureTestingModule({
    providers: [
      EditYellowCardUseCase,
      { provide: MATCH_REPOSITORY, useValue: { get: async () => currentMatch } },
      {
        provide: PLAYER_REPOSITORY,
        useValue: {
          listByIds: async (ids: string[]) => players.filter(({ id }) => ids.includes(id)),
        },
      },
      {
        provide: MATCH_EVENT_REPOSITORY,
        useValue: { listByMatch: async () => events, updateEvent },
      },
    ],
  });
  return { useCase: TestBed.inject(EditYellowCardUseCase), updateEvent };
}

describe('EditYellowCardUseCase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  it('reassigns #12 to #7 while preserving event identity, time, period, reason and relation', async () => {
    const source = yellow();
    const { useCase, updateEvent } = setup(match(), [source]);
    const result = await useCase.execute({
      matchId: 'match-1',
      eventId: source.id,
      newPlayerId: 'p7',
    });

    expect(result.event).toEqual({ ...source, playerId: 'p7' });
    expect(result.event).toMatchObject({
      id: source.id,
      gameClockMs: source.gameClockMs,
      period: source.period,
      reason: 'protest',
      relatedEventId: 'foul-1',
      timestamp: source.timestamp,
    });
    expect(updateEvent).toHaveBeenCalledWith(result.match, result.event);
  });

  it('moves only an embedded yellow while retaining the original foul player', async () => {
    const { reason: _reason, ...cardBase } = yellow() as Extract<
      MatchEvent,
      { type: 'DISCIPLINE' }
    >;
    const foul: MatchEvent = {
      ...cardBase,
      type: 'FOUL',
      disciplinaryAction: 'yellow',
      countsAsAccumulatedFoul: true,
      restart: 'direct-free-kick',
      periodFoulNumber: 1,
      relatedEventId: undefined,
    };
    const { useCase } = setup(match(), [foul]);
    const result = await useCase.execute({
      matchId: 'match-1',
      eventId: foul.id,
      newPlayerId: 'p7',
    });

    expect(result.event).toMatchObject({ playerId: 'p7', foulPlayerId: 'p12' });
    const state = deriveDisciplinaryState([result.event], 0);
    expect(state.players['p12']).toMatchObject({ fouls: 1, yellowCards: 0 });
    expect(state.players['p7']).toMatchObject({ fouls: 0, yellowCards: 1 });
    expect(state.teams.home).toMatchObject({ fouls: 1, yellowCards: 1 });
  });

  it('reassigns a rival yellow to another dorsal without changing the event', async () => {
    const source = yellow({ team: 'away', playerId: undefined, opponentPlayerNumber: 12 });
    const { useCase, updateEvent } = setup(match(), [source]);
    const result = await useCase.execute({
      matchId: 'match-1',
      eventId: source.id,
      newOpponentPlayerNumber: 7,
    });

    expect(result.event).toEqual({ ...source, opponentPlayerNumber: 7 });
    expect(result.event).toMatchObject({
      id: source.id,
      gameClockMs: source.gameClockMs,
      period: source.period,
      relatedEventId: source.relatedEventId,
      timestamp: source.timestamp,
    });
    expect(updateEvent).toHaveBeenCalledWith(result.match, result.event);
  });

  it('moves only an embedded rival yellow while retaining the original rival foul', async () => {
    const source: MatchEvent = {
      ...yellow({ team: 'away', playerId: undefined, opponentPlayerNumber: 12 }),
      type: 'FOUL',
      disciplinaryAction: 'yellow',
      countsAsAccumulatedFoul: true,
      restart: 'direct-free-kick',
      periodFoulNumber: 1,
    } as MatchEvent;
    const { useCase } = setup(match(), [source]);
    const result = await useCase.execute({
      matchId: 'match-1',
      eventId: source.id,
      newOpponentPlayerNumber: 7,
    });

    expect(result.event).toMatchObject({
      opponentPlayerNumber: 7,
      foulOpponentPlayerNumber: 12,
    });
    const state = deriveDisciplinaryState([result.event], 0);
    expect(state.opponentPlayers).toEqual([
      expect.objectContaining({ jerseyNumber: 7, fouls: 0, yellowCards: 1 }),
      expect.objectContaining({ jerseyNumber: 12, fouls: 1, yellowCards: 0 }),
    ]);
    expect(state.teams.away).toMatchObject({ fouls: 1, yellowCards: 1 });
    const exported = buildMatchStatisticsExport(match(), [result.event], players, 10_000);
    expect(exported.events[0]).toMatchObject({
      playerNumber: 7,
      foulOpponentPlayerNumber: 12,
    });
    const imported = await new CsvMatchImportParser().parseText(
      serializeMatchCsv(exported),
      'corrected-opponent.csv',
    );
    expect(imported.events[0]?.event).toMatchObject({
      opponentPlayerNumber: 7,
      foulOpponentPlayerNumber: 12,
    });
  });

  it('rejects an invalid rival dorsal', async () => {
    const source = yellow({ team: 'away', playerId: undefined, opponentPlayerNumber: 12 });
    const { useCase } = setup(match(), [source]);
    await expect(
      useCase.execute({
        matchId: 'match-1',
        eventId: source.id,
        newOpponentPlayerNumber: 0,
      }),
    ).rejects.toBeInstanceOf(InvalidDisciplinaryPlayerError);
  });

  it('rejects a player outside the match', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ matchId: 'match-1', eventId: 'yellow-1', newPlayerId: 'foreign' }),
    ).rejects.toBeInstanceOf(PlayerNotInMatchError);
  });

  it('rejects a non-yellow event and a missing event', async () => {
    const source = yellow({ disciplinaryAction: 'directRed' });
    const { useCase } = setup(match(), [source]);
    await expect(
      useCase.execute({ matchId: 'match-1', eventId: source.id, newPlayerId: 'p7' }),
    ).rejects.toBeInstanceOf(YellowCardNotFoundError);
    await expect(
      useCase.execute({ matchId: 'match-1', eventId: 'missing', newPlayerId: 'p7' }),
    ).rejects.toBeInstanceOf(YellowCardNotFoundError);
  });

  it('rejects readonly finished matches', async () => {
    const { useCase } = setup(match('finished'));
    await expect(
      useCase.execute({ matchId: 'match-1', eventId: 'yellow-1', newPlayerId: 'p7' }),
    ).rejects.toBeInstanceOf(MatchReadonlyError);
  });

  it.each([true, false])('preserves a clock whose running state is %s', async (running) => {
    const currentMatch = match('firstHalf', running);
    const { useCase } = setup(currentMatch);
    const result = await useCase.execute({
      matchId: currentMatch.id,
      eventId: 'yellow-1',
      newPlayerId: 'p7',
    });
    expect(result.match.clock).toEqual(currentMatch.clock);
  });

  it('exports and imports the corrected player and original foul owner', async () => {
    const currentMatch = match();
    const { reason: _reason, ...cardBase } = yellow() as Extract<
      MatchEvent,
      { type: 'DISCIPLINE' }
    >;
    const original: MatchEvent = {
      ...cardBase,
      type: 'FOUL',
      disciplinaryAction: 'yellow',
      countsAsAccumulatedFoul: true,
      restart: 'direct-free-kick',
      periodFoulNumber: 1,
      relatedEventId: undefined,
    };
    const { useCase } = setup(currentMatch, [original]);
    const result = await useCase.execute({
      matchId: currentMatch.id,
      eventId: original.id,
      newPlayerId: 'p7',
    });
    const exported = buildMatchStatisticsExport(currentMatch, [result.event], players, 10_000);
    expect(exported.events[0]).toMatchObject({
      playerId: 'p7',
      playerNumber: 7,
      playerName: 'Mario',
      foulPlayerId: 'p12',
      foulPlayerNumber: 12,
    });
    const imported = await new CsvMatchImportParser().parseText(
      serializeMatchCsv(exported),
      'corrected.csv',
    );
    expect(imported.events[0]?.event).toMatchObject({ playerId: 'p7', foulPlayerId: 'p12' });
  });

  it('wraps persistence failures in a typed update error', async () => {
    const configured = setup();
    configured.updateEvent.mockRejectedValueOnce(new Error('storage failed'));
    await expect(
      configured.useCase.execute({ matchId: 'match-1', eventId: 'yellow-1', newPlayerId: 'p7' }),
    ).rejects.toBeInstanceOf(DisciplineUpdateError);
  });
});
