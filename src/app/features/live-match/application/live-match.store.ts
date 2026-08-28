import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  DEFAULT_PERIOD_DURATION_MS,
  formatGameClock,
  projectRemaining,
} from '../../../core/clock/match-clock';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { createId } from '../../../core/utils/id';
import { DomainResult } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { DisciplinaryAction, FoulTeam, MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveMatchState } from '../domain/derived-match-state';
import { deriveDisciplinaryState, registerRedCardReplacement } from '../domain/discipline';
import { registerFoul as createFoul } from '../domain/foul';
import { GoalSide, registerGoal as createGoal } from '../domain/goal';
import {
  finishPeriod,
  resetMatchClock,
  startMatchClock,
  startNextPeriod,
  stopMatchClock,
  synchronizeExpiredClock,
} from '../domain/match-lifecycle';
import { createEventsForTransition, MatchClockCommand } from '../domain/match-transition-events';
import { deriveMatchStatistics, MatchStatistics } from '../domain/match-statistics';
import { createMatchTimeline } from '../domain/match-timeline';
import { PlayerPlayingTimes } from '../domain/player-playing-time';
import { makeSubstitution as createSubstitution } from '../domain/substitution';
import { findLastUndoableEvent, undoLastEvent as createUndoLastEvent } from '../domain/undo';
import { DeleteMatchService } from '../../matches/application/delete-match.service';

@Injectable()
export class LiveMatchStore {
  private readonly matches = inject(MatchRepository);
  private readonly eventStore = inject(MatchEventRepository);
  private readonly playerRepository = inject(PlayerRepository);
  private readonly deleteMatchService = inject(DeleteMatchService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly now = signal(Date.now());
  private commandInProgress = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly match = signal<Match | null>(null);
  readonly events = signal<MatchEvent[]>([]);
  readonly players = signal<Player[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly remainingMs = computed(() => {
    const match = this.match();
    return match ? projectRemaining(match.clock, this.now()) : DEFAULT_PERIOD_DURATION_MS;
  });
  readonly formattedClock = computed(() => formatGameClock(this.remainingMs()));
  readonly clockRunning = computed(() => this.match()?.clock.running ?? false);
  readonly periodLabel = computed(() => labelFor(this.match()));
  readonly derivedState = computed(() => {
    const match = this.match();
    return match ? deriveMatchState(match, this.events()) : null;
  });
  readonly disciplinaryState = computed(() => {
    const state = this.derivedState();
    if (!state) return deriveDisciplinaryState([], 0);
    const currentSegment =
      state.clockRunning && state.runningSegmentStartedAtGameClockMs !== null
        ? Math.max(0, state.runningSegmentStartedAtGameClockMs - this.remainingMs())
        : 0;
    return deriveDisciplinaryState(this.events(), state.completedElapsedMs + currentSegment);
  });
  readonly timeline = computed(() =>
    createMatchTimeline(
      this.events(),
      Object.fromEntries(this.players().map((player) => [player.id, player.name])),
      Object.fromEntries(this.players().map((player) => [player.id, player.number])),
    ),
  );
  readonly lastUndoableEvent = computed(() => findLastUndoableEvent(this.events()));
  readonly canUndo = computed(() => this.lastUndoableEvent() !== null && !this.saving());
  readonly lineupPlayerIds = computed(() => {
    const match = this.match();
    if (!match) {
      return [];
    }
    return match.status === 'ready'
      ? match.startingLineupPlayerIds
      : (this.derivedState()?.currentLineupPlayerIds ?? []);
  });
  readonly currentLineup = computed(() => {
    const lineupIds = new Set(this.lineupPlayerIds());
    return this.players().filter((player) => lineupIds.has(player.id));
  });
  readonly benchPlayers = computed(() => {
    const lineupIds = new Set(this.lineupPlayerIds());
    const sentOffIds = new Set(this.disciplinaryState().sentOffPlayerIds);
    return this.players().filter(
      (player) => !lineupIds.has(player.id) && !sentOffIds.has(player.id),
    );
  });
  readonly sentOffPlayers = computed(() => {
    const sentOffIds = new Set(this.disciplinaryState().sentOffPlayerIds);
    return this.players().filter((player) => sentOffIds.has(player.id));
  });
  readonly ourReductions = computed(() =>
    this.disciplinaryState().reductions.filter(
      (reduction) => reduction.team === 'home' && reduction.status !== 'replacementCompleted',
    ),
  );
  readonly opponentReductions = computed(() =>
    this.disciplinaryState().reductions.filter(
      (reduction) => reduction.team === 'away' && reduction.status !== 'replacementCompleted',
    ),
  );
  readonly knownOpponentPlayers = computed(() =>
    this.disciplinaryState().opponentPlayers.map((player) => player.jerseyNumber),
  );
  readonly statistics = computed<MatchStatistics>(() => {
    const match = this.match();
    return match
      ? deriveMatchStatistics(match, this.events(), this.remainingMs())
      : { players: {}, lineups: [] };
  });
  readonly playerPlayingTimes = computed<PlayerPlayingTimes>(() => this.statistics().players);
  readonly lineupStatistics = computed(() => this.statistics().lineups);
  readonly canSubstitute = computed(() => {
    const status = this.match()?.status;
    return status === 'firstHalf' || status === 'halftime' || status === 'secondHalf';
  });
  readonly score = computed(() => this.derivedState()?.score ?? { home: 0, away: 0 });
  readonly canRegisterGoal = computed(() => {
    const status = this.match()?.status;
    return (
      (status === 'firstHalf' || status === 'secondHalf') &&
      this.lineupPlayerIds().length >= 3 &&
      this.lineupPlayerIds().length <= 5
    );
  });
  readonly currentPeriodFouls = computed(() => {
    const period = this.match()?.currentPeriod ?? 1;
    return this.derivedState()?.foulsByPeriod[period] ?? { home: 0, away: 0 };
  });
  readonly foulsByPeriod = computed(() => {
    const match = this.match();
    if (!match) {
      return [];
    }
    const derived = this.derivedState()?.foulsByPeriod ?? {};
    return Array.from({ length: match.periodCount }, (_, index) => {
      const period = index + 1;
      const fouls = derived[period] ?? { home: 0, away: 0 };
      return { period, ...fouls };
    });
  });
  readonly canRegisterFoul = computed(() => {
    const status = this.match()?.status;
    return status === 'firstHalf' || status === 'secondHalf';
  });
  readonly canStartClock = computed(
    () =>
      this.lineupPlayerIds().length >= 3 && this.disciplinaryState().onCourtPlayerCounts.away >= 3,
  );
  readonly matchElapsedMs = computed(() => {
    const state = this.derivedState();
    if (!state) {
      return 0;
    }
    const currentSegment =
      state.clockRunning && state.runningSegmentStartedAtGameClockMs !== null
        ? Math.max(0, state.runningSegmentStartedAtGameClockMs - this.remainingMs())
        : 0;
    return state.completedElapsedMs + currentSegment;
  });

  opponentYellowCardsByNumber(number: number): number {
    return this.opponentDiscipline(number)?.yellowCards ?? 0;
  }

  opponentDirectRedsByNumber(number: number): number {
    return this.opponentDiscipline(number)?.directRedCards ?? 0;
  }

  opponentSecondYellowSendOffsByNumber(number: number): number {
    return this.opponentDiscipline(number)?.secondYellowSendOffs ?? 0;
  }

  isOpponentPlayerSentOff(number: number): boolean {
    return this.opponentDiscipline(number)?.sentOff ?? false;
  }

  constructor() {
    this.timer = setInterval(() => this.tick(), 200);
    this.destroyRef.onDestroy(() => this.stopTimer());
  }

  reset(): void {
    this.stopTimer();
    this.commandInProgress = false;
    this.now.set(Date.now());
    this.match.set(null);
    this.events.set([]);
    this.players.set([]);
    this.loading.set(false);
    this.saving.set(false);
    this.deleting.set(false);
    this.error.set(null);
    this.notice.set(null);
  }

  async load(matchId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [match, events] = await Promise.all([
        this.matches.get(matchId),
        this.eventStore.listByMatch(matchId),
      ]);
      if (!match) {
        this.match.set(null);
        this.events.set([]);
        this.players.set([]);
        this.error.set('No se ha encontrado el partido.');
        return;
      }

      const players = await this.playerRepository.listByIds(match.squadPlayerIds);

      const now = Date.now();
      const synchronized = synchronizeExpiredClock(match, now);
      this.now.set(now);
      if (synchronized !== match) {
        const newEvents = this.transitionEvents(match, synchronized, 'STOP_CLOCK', events, now);
        await this.eventStore.commit(synchronized, newEvents);
        events.push(...newEvents);
      }
      this.match.set(synchronized);
      this.events.set(events);
      this.players.set(players);
    } catch {
      this.error.set('No se ha podido cargar el partido.');
    } finally {
      this.loading.set(false);
    }
  }

  startClock(): Promise<void> {
    if (!this.canStartClock()) {
      this.error.set('El partido no puede reanudarse con menos de 3 jugadores en un equipo.');
      return Promise.resolve();
    }
    return this.execute(startMatchClock, 'START_CLOCK');
  }

  stopClock(): Promise<void> {
    return this.execute(stopMatchClock, 'STOP_CLOCK');
  }

  resetClock(): Promise<void> {
    return this.execute(resetMatchClock, 'RESET_CLOCK');
  }

  finishPeriod(): Promise<void> {
    return this.execute(finishPeriod, 'FINISH_PERIOD');
  }

  startNextPeriod(): Promise<void> {
    return this.execute(startNextPeriod, 'START_NEXT_PERIOD');
  }

  async makeSubstitution(outPlayerId: string, inPlayerId: string): Promise<boolean> {
    const match = this.match();
    const state = this.derivedState();
    if (!match || !state || this.commandInProgress) {
      return false;
    }

    this.commandInProgress = true;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const timestamp = Date.now();
    try {
      const result = createSubstitution({
        match,
        currentLineupPlayerIds: state.currentLineupPlayerIds,
        outPlayerId,
        inPlayerId,
        gameClockMs: projectRemaining(match.clock, timestamp),
        timestamp,
        sequence: this.nextSequence(this.events()),
        eventId: createId(),
        sentOffPlayerIds: this.disciplinaryState().sentOffPlayerIds,
      });
      if (!result.ok) {
        this.error.set(result.error);
        return false;
      }

      await this.eventStore.commit(result.value.match, [result.value.event]);
      this.now.set(timestamp);
      this.match.set(result.value.match);
      this.events.update((events) => [...events, result.value.event]);
      return true;
    } catch {
      this.error.set('No se ha podido guardar la sustitución.');
      return false;
    } finally {
      this.commandInProgress = false;
      this.saving.set(false);
    }
  }

  registerGoalFor(scorerPlayerId?: string): Promise<boolean> {
    return this.registerGoal('for', scorerPlayerId);
  }

  registerGoalAgainst(): Promise<boolean> {
    return this.registerGoal('against');
  }

  registerTeamFoul(
    playerId?: string,
    disciplinaryAction: DisciplinaryAction = 'none',
  ): Promise<boolean> {
    return this.registerFoul('home', disciplinaryAction, playerId);
  }

  registerOpponentFoul(
    disciplinaryAction: DisciplinaryAction = 'none',
    opponentPlayerNumber?: number,
  ): Promise<boolean> {
    return this.registerFoul('away', disciplinaryAction, undefined, opponentPlayerNumber);
  }

  async replaceSentOffPlayer(reductionEventId: string, playerId?: string): Promise<boolean> {
    const match = this.match();
    if (!match || this.commandInProgress) return false;

    this.commandInProgress = true;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const timestamp = Date.now();
    try {
      const result = registerRedCardReplacement({
        match,
        reduction: this.disciplinaryState().reductions.find(
          (reduction) => reduction.eventId === reductionEventId,
        ),
        currentLineupPlayerIds: this.lineupPlayerIds(),
        sentOffPlayerIds: this.disciplinaryState().sentOffPlayerIds,
        playerId,
        gameClockMs: projectRemaining(match.clock, timestamp),
        matchElapsedMs: this.matchElapsedAt(timestamp),
        timestamp,
        sequence: this.nextSequence(this.events()),
        eventId: createId(),
      });
      if (!result.ok) {
        this.error.set(result.error);
        return false;
      }

      await this.eventStore.commit(result.value.match, [result.value.event]);
      this.now.set(timestamp);
      this.match.set(result.value.match);
      this.events.update((events) => [...events, result.value.event]);
      return true;
    } catch {
      this.error.set('No se ha podido guardar la reposición.');
      return false;
    } finally {
      this.commandInProgress = false;
      this.saving.set(false);
    }
  }

  async undoLastEvent(): Promise<boolean> {
    const match = this.match();
    if (!match || this.commandInProgress) {
      return false;
    }

    this.commandInProgress = true;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const timestamp = Date.now();
    try {
      const result = createUndoLastEvent({
        match,
        events: this.events(),
        gameClockMs: projectRemaining(match.clock, timestamp),
        timestamp,
        sequence: this.nextSequence(this.events()),
        eventId: createId(),
      });
      if (!result.ok) {
        this.error.set(result.error);
        return false;
      }

      await this.eventStore.commit(result.value.match, [result.value.event]);
      this.now.set(timestamp);
      this.match.set(result.value.match);
      this.events.update((events) => [...events, result.value.event]);
      this.notice.set(`Acción deshecha: ${undoLabel(result.value.targetEvent.type)}.`);
      return true;
    } catch {
      this.error.set('No se ha podido deshacer la última acción.');
      return false;
    } finally {
      this.commandInProgress = false;
      this.saving.set(false);
    }
  }

  async deleteCurrentMatch(): Promise<boolean> {
    const match = this.match();
    if (!match || this.commandInProgress) {
      return false;
    }

    this.commandInProgress = true;
    this.deleting.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await this.deleteMatchService.execute(match.id);
      this.reset();
      return true;
    } catch {
      this.error.set('No se ha podido eliminar el partido. Los datos siguen guardados.');
      return false;
    } finally {
      this.commandInProgress = false;
      this.deleting.set(false);
    }
  }

  private tick(): void {
    const match = this.match();
    if (!match?.clock.running) {
      return;
    }

    const now = Date.now();
    this.now.set(now);
    if (projectRemaining(match.clock, now) === 0 && !this.commandInProgress) {
      void this.execute(stopMatchClock, 'STOP_CLOCK');
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async registerGoal(side: GoalSide, scorerPlayerId?: string): Promise<boolean> {
    const match = this.match();
    const state = this.derivedState();
    if (!match || !state || this.commandInProgress) {
      return false;
    }

    this.commandInProgress = true;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const timestamp = Date.now();
    try {
      const result = createGoal({
        match,
        side,
        scorerPlayerId,
        currentLineupPlayerIds: state.currentLineupPlayerIds,
        score: state.score,
        gameClockMs: projectRemaining(match.clock, timestamp),
        timestamp,
        sequence: this.nextSequence(this.events()),
        eventId: createId(),
        matchElapsedMs: this.matchElapsedAt(timestamp),
      });
      if (!result.ok) {
        this.error.set(result.error);
        return false;
      }

      await this.eventStore.commit(result.value.match, [result.value.event]);
      this.now.set(timestamp);
      this.match.set(result.value.match);
      this.events.update((events) => [...events, result.value.event]);
      return true;
    } catch {
      this.error.set('No se ha podido guardar el gol.');
      return false;
    } finally {
      this.commandInProgress = false;
      this.saving.set(false);
    }
  }

  private async registerFoul(
    team: FoulTeam,
    disciplinaryAction: DisciplinaryAction,
    playerId?: string,
    opponentPlayerNumber?: number,
  ): Promise<boolean> {
    const match = this.match();
    if (!match || this.commandInProgress) {
      return false;
    }

    this.commandInProgress = true;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const timestamp = Date.now();
    try {
      const result = createFoul({
        match,
        team,
        currentPeriodFoulCount: this.currentPeriodFouls()[team],
        playerId,
        opponentPlayerNumber,
        opponentPlayerYellowCards:
          this.disciplinaryState().opponentPlayers.find(
            (player) => player.jerseyNumber === opponentPlayerNumber,
          )?.yellowCards ?? 0,
        sentOffOpponentPlayerNumbers: this.disciplinaryState()
          .opponentPlayers.filter((player) => player.sentOff)
          .map((player) => player.jerseyNumber),
        currentLineupPlayerIds: this.lineupPlayerIds(),
        sentOffPlayerIds: this.disciplinaryState().sentOffPlayerIds,
        playerYellowCards: playerId
          ? (this.disciplinaryState().players[playerId]?.yellowCards ?? 0)
          : 0,
        disciplinaryAction,
        matchElapsedMs: this.matchElapsedAt(timestamp),
        gameClockMs: projectRemaining(match.clock, timestamp),
        timestamp,
        sequence: this.nextSequence(this.events()),
        eventId: createId(),
      });
      if (!result.ok) {
        this.error.set(result.error);
        return false;
      }

      await this.eventStore.commit(result.value.match, [result.value.event]);
      this.now.set(timestamp);
      this.match.set(result.value.match);
      this.events.update((events) => [...events, result.value.event]);
      return true;
    } catch {
      this.error.set('No se ha podido guardar la falta.');
      return false;
    } finally {
      this.commandInProgress = false;
      this.saving.set(false);
    }
  }

  private async execute(
    command: (match: Match, now: number) => DomainResult<Match>,
    eventCommand: MatchClockCommand,
  ): Promise<void> {
    const match = this.match();
    if (!match || this.commandInProgress) {
      return;
    }

    this.commandInProgress = true;
    this.saving.set(true);
    this.error.set(null);
    this.notice.set(null);
    const now = Date.now();
    try {
      const result = command(match, now);
      if (!result.ok) {
        this.error.set(result.error);
        return;
      }
      const events = this.transitionEvents(match, result.value, eventCommand, this.events(), now);
      await this.eventStore.commit(result.value, events);
      this.now.set(now);
      this.match.set(result.value);
      this.events.update((current) => [...current, ...events]);
    } catch {
      this.error.set('No se ha podido guardar el estado del reloj.');
    } finally {
      this.commandInProgress = false;
      this.saving.set(false);
    }
  }

  private transitionEvents(
    before: Match,
    after: Match,
    command: MatchClockCommand,
    currentEvents: readonly MatchEvent[],
    timestamp: number,
  ): MatchEvent[] {
    const nextSequence = this.nextSequence(currentEvents);
    return createEventsForTransition({
      before,
      after,
      command,
      nextSequence,
      timestamp,
      createId,
    });
  }

  private nextSequence(currentEvents: readonly MatchEvent[]): number {
    return currentEvents.reduce((maximum, event) => Math.max(maximum, event.sequence), 0) + 1;
  }

  private matchElapsedAt(timestamp: number): number {
    const state = this.derivedState();
    const match = this.match();
    if (!state || !match) return 0;
    const remainingMs = projectRemaining(match.clock, timestamp);
    const currentSegment =
      state.clockRunning && state.runningSegmentStartedAtGameClockMs !== null
        ? Math.max(0, state.runningSegmentStartedAtGameClockMs - remainingMs)
        : 0;
    return state.completedElapsedMs + currentSegment;
  }

  private opponentDiscipline(number: number) {
    return this.disciplinaryState().opponentPlayers.find(
      (player) => player.jerseyNumber === number,
    );
  }
}

function undoLabel(type: MatchEvent['type']): string {
  switch (type) {
    case 'GOAL_FOR':
      return 'gol a favor';
    case 'GOAL_AGAINST':
      return 'gol en contra';
    case 'FOUL':
      return 'falta';
    case 'SUBSTITUTION':
      return 'sustitución';
    case 'RED_CARD_REPLACEMENT':
      return 'reposición tras expulsión';
    default:
      return 'última acción';
  }
}

function labelFor(match: Match | null): string {
  switch (match?.status) {
    case 'ready':
      return 'Partido preparado';
    case 'firstHalf':
      return 'Primera parte';
    case 'halftime':
      return 'Descanso';
    case 'secondHalf':
      return 'Segunda parte';
    case 'finished':
      return 'Partido finalizado';
    default:
      return '';
  }
}
