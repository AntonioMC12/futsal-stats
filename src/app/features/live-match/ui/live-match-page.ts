import { Component, computed, effect, HostListener, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatGameClock } from '../../../core/clock/match-clock';
import {
  BenchDisciplineAction,
  BenchDisciplineReason,
  DisciplinaryAction,
  FoulTeam,
  MatchEventType,
  StaffRole,
} from '../../../shared/models/match-event';
import { LiveMatchStore } from '../application/live-match.store';
import { MatchCsvExportService } from '../../matches/application/match-csv-export.service';
import { SystemNotificationService } from '../../../core/notifications/system-notification.service';
import { BenchDisciplineSubject, createStaffIdentityKey } from '../domain/bench-discipline';

type MatchOverlay = 'statistics' | 'events' | 'discipline' | 'more';

@Component({
  selector: 'app-live-match-page',
  imports: [RouterLink],
  providers: [LiveMatchStore],
  templateUrl: './live-match-page.html',
})
export class LiveMatchPage {
  protected readonly store = inject(LiveMatchStore);
  protected readonly csvExporter = inject(MatchCsvExportService);
  private readonly router = inject(Router);
  private readonly notifications = inject(SystemNotificationService);
  protected readonly selectedOutPlayerId = signal<string | null>(null);
  protected readonly substituting = signal(false);
  protected readonly confirmAbandon = signal(false);
  protected readonly foulTeam = signal<FoulTeam | null>(null);
  protected readonly selectedFoulPlayerId = signal<string | null>(null);
  protected readonly disciplineSaving = signal(false);
  protected readonly replacingReductionId = signal<string | null>(null);
  protected readonly pendingOpponentAction = signal<DisciplinaryAction | null>(null);
  protected readonly selectedOpponentNumber = signal<number | null>(null);
  protected readonly opponentNumberInput = signal('');
  protected readonly goalSelectorOpen = signal(false);
  protected readonly goalSaving = signal(false);
  protected readonly activeOverlay = signal<MatchOverlay | null>(null);
  protected readonly benchDisciplineOpen = signal(false);
  protected readonly benchDisciplineTeam = signal<FoulTeam>('home');
  protected readonly benchMemberKind = signal<'player' | 'staff'>('player');
  protected readonly selectedBenchPlayerId = signal<string | null>(null);
  protected readonly selectedBenchOpponentNumber = signal<number | null>(null);
  protected readonly benchOpponentNumberInput = signal('');
  protected readonly benchStaffRole = signal<StaffRole>('headCoach');
  protected readonly benchStaffName = signal('');
  protected readonly benchDisciplineAction = signal<BenchDisciplineAction>('yellow');
  protected readonly benchDisciplineReason = signal<BenchDisciplineReason>('protest');
  protected readonly staffRoles: readonly { value: StaffRole; label: string }[] = [
    { value: 'headCoach', label: 'Entrenador' },
    { value: 'assistantCoach', label: '2.º entrenador' },
    { value: 'delegate', label: 'Delegado' },
    { value: 'fitnessCoach', label: 'Preparador físico' },
    { value: 'physiotherapist', label: 'Fisioterapeuta' },
    { value: 'doctor', label: 'Médico' },
    { value: 'other', label: 'Otro' },
  ];
  private substitutionTrigger: HTMLElement | null = null;
  private goalTrigger: HTMLElement | null = null;
  readonly matchId = input.required<string>();
  protected readonly substitutionOutPlayer = computed(() =>
    this.store.currentLineup().find((player) => player.id === this.selectedOutPlayerId()),
  );
  protected readonly selectedFoulPlayer = computed(() =>
    this.store.players().find((player) => player.id === this.selectedFoulPlayerId()),
  );
  protected readonly selectedPlayerYellowCards = computed(() => {
    const playerId = this.selectedFoulPlayerId();
    return playerId ? (this.store.disciplinaryState().players[playerId]?.yellowCards ?? 0) : 0;
  });
  protected readonly opponentNumberValid = computed(() => {
    if (this.selectedOpponentNumber() !== null) return true;
    if (this.pendingOpponentAction() === 'secondYellow') return false;
    const value = Number(this.opponentNumberInput());
    return Number.isSafeInteger(value) && value >= 1 && value <= 999;
  });
  protected readonly benchSubject = computed<BenchDisciplineSubject | null>(() => {
    if (this.benchMemberKind() === 'staff') {
      return {
        subjectKind: 'staff',
        staffRole: this.benchStaffRole(),
        staffName: this.benchStaffName() || undefined,
      };
    }
    if (this.benchDisciplineTeam() === 'home') {
      const playerId = this.selectedBenchPlayerId();
      return playerId ? { subjectKind: 'player', playerId } : null;
    }
    const selected = this.selectedBenchOpponentNumber();
    const number = selected ?? Number(this.benchOpponentNumberInput());
    return Number.isSafeInteger(number) && number >= 1 && number <= 999
      ? { subjectKind: 'opponentPlayer', opponentPlayerNumber: number }
      : null;
  });
  protected readonly benchSubjectDiscipline = computed(() => {
    const subject = this.benchSubject();
    if (!subject) return { yellowCards: 0, sentOff: false };
    const discipline = this.store.disciplinaryState();
    if (subject.subjectKind === 'player') {
      const player = discipline.players[subject.playerId];
      return { yellowCards: player?.yellowCards ?? 0, sentOff: (player?.sendOffs ?? 0) > 0 };
    }
    if (subject.subjectKind === 'opponentPlayer') {
      const player = discipline.opponentPlayers.find(
        (item) => item.jerseyNumber === subject.opponentPlayerNumber,
      );
      return { yellowCards: player?.yellowCards ?? 0, sentOff: player?.sentOff ?? false };
    }
    const key = createStaffIdentityKey(
      this.benchDisciplineTeam(),
      subject.staffRole,
      subject.staffName,
    );
    const staff = discipline.staffMembers.find((item) => item.identityKey === key);
    return { yellowCards: staff?.yellowCards ?? 0, sentOff: staff?.sentOff ?? false };
  });
  protected readonly benchSubjectLabel = computed(() => {
    const subject = this.benchSubject();
    if (!subject) return 'Selecciona una persona';
    if (subject.subjectKind === 'player') {
      const player = this.store.players().find((item) => item.id === subject.playerId);
      return player ? `#${player.number} ${player.name}` : 'Jugador';
    }
    if (subject.subjectKind === 'opponentPlayer') return `Rival #${subject.opponentPlayerNumber}`;
    return `${this.staffRoleLabel(subject.staffRole)}${subject.staffName ? ` · ${subject.staffName.trim()}` : ''}`;
  });
  protected readonly benchSubmissionValid = computed(() => {
    const subject = this.benchSubject();
    const discipline = this.benchSubjectDiscipline();
    const action = this.benchDisciplineAction();
    return (
      subject !== null &&
      !discipline.sentOff &&
      (action === 'yellow' ? discipline.yellowCards === 0 : true) &&
      (action === 'secondYellow' ? discipline.yellowCards === 1 : true)
    );
  });
  protected readonly activeBenchStaff = computed(() =>
    this.store
      .disciplinaryState()
      .staffMembers.filter((staff) => staff.team === this.benchDisciplineTeam() && !staff.sentOff),
  );
  protected readonly clockFabVisible = computed(() => {
    const match = this.store.match();
    return (
      match?.status === 'ready' ||
      ((match?.status === 'firstHalf' || match?.status === 'secondHalf') &&
        this.store.remainingMs() > 0)
    );
  });
  protected readonly clockFabLabel = computed(() =>
    this.store.clockRunning() ? 'Pausar reloj' : 'Iniciar reloj',
  );
  protected readonly clockFabPulsing = computed(
    () => !this.store.clockRunning() && this.store.canStartClock() && !this.store.saving(),
  );
  protected readonly isLiveMatchPaused = computed(() => {
    const match = this.store.match();
    const isPlayablePeriod = match?.status === 'firstHalf' || match?.status === 'secondHalf';
    return isPlayablePeriod && !this.store.clockRunning() && this.store.remainingMs() > 0;
  });
  protected readonly compactPeriodLabel = computed(() => {
    switch (this.store.match()?.status) {
      case 'ready':
        return 'Preparado';
      case 'firstHalf':
        return '1.ª parte';
      case 'halftime':
        return 'Descanso';
      case 'secondHalf':
        return '2.ª parte';
      case 'finished':
        return 'Finalizado';
      default:
        return '';
    }
  });

  constructor() {
    effect(() => void this.store.load(this.matchId()));
  }

  protected selectOutPlayer(playerId: string, event: Event): void {
    if (!this.store.canSubstitute() || this.store.saving()) {
      return;
    }
    const trigger = event.currentTarget as HTMLElement;
    this.substitutionTrigger = trigger;
    this.selectedOutPlayerId.set(playerId);
  }

  protected async substituteWith(inPlayerId: string): Promise<void> {
    const outPlayerId = this.selectedOutPlayerId();
    if (!outPlayerId || this.substituting()) {
      return;
    }

    this.substituting.set(true);
    try {
      if (await this.store.makeSubstitution(outPlayerId, inPlayerId)) {
        this.showActionFeedback('Cambio realizado');
        this.cancelSubstitution();
      }
    } finally {
      this.substituting.set(false);
    }
  }

  protected cancelSubstitution(): void {
    this.selectedOutPlayerId.set(null);
    const trigger = this.substitutionTrigger;
    this.substitutionTrigger = null;
    queueMicrotask(() => trigger?.focus());
  }

  protected toggleClock(): void {
    if (this.store.saving()) {
      return;
    }
    if (this.store.clockRunning()) {
      void this.store.stopClock();
    } else {
      void this.store.startClock();
    }
  }

  protected openGoalSelector(event: Event): void | Promise<void> {
    if (!this.store.canRegisterGoal() || this.store.saving()) return;
    const trigger = event.currentTarget as HTMLElement;
    return this.runAfterClockStopped(() => {
      this.goalTrigger = trigger;
      this.goalSelectorOpen.set(true);
    });
  }

  protected async submitGoal(scorerPlayerId?: string): Promise<void> {
    if (this.goalSaving()) return;
    this.goalSaving.set(true);
    try {
      if (await this.store.registerGoalFor(scorerPlayerId)) {
        this.showActionFeedback('Gol registrado');
        this.closeGoalSelector();
      }
    } finally {
      this.goalSaving.set(false);
    }
  }

  protected cancelGoalSelector(): void {
    if (this.goalSaving()) return;
    this.closeGoalSelector();
  }

  private closeGoalSelector(): void {
    this.goalSelectorOpen.set(false);
    const trigger = this.goalTrigger;
    this.goalTrigger = null;
    queueMicrotask(() => trigger?.focus());
  }

  protected registerGoalAgainst(): void | Promise<void> {
    if (!this.store.canRegisterGoal() || this.store.saving()) return;
    return this.runAfterClockStopped(async () => {
      if (await this.store.registerGoalAgainst()) {
        this.showActionFeedback('Gol rival registrado');
      }
    });
  }

  protected async undoLastAction(): Promise<void> {
    if (await this.store.undoLastEvent()) {
      this.notifications.info(this.store.notice() ?? 'Acción deshecha');
    }
  }

  protected openFoul(team: FoulTeam): void | Promise<void> {
    if (!this.store.canRegisterFoul() || this.store.saving()) return;
    return this.runAfterClockStopped(() => {
      this.selectedFoulPlayerId.set(null);
      this.resetOpponentSelection();
      this.foulTeam.set(team);
    });
  }

  protected openBenchDiscipline(): void | Promise<void> {
    if (!this.store.canRegisterBenchDiscipline() || this.store.saving()) return;
    return this.runAfterClockStopped(() => {
      this.resetBenchDiscipline();
      this.benchDisciplineOpen.set(true);
    });
  }

  protected cancelBenchDiscipline(): void {
    if (this.disciplineSaving()) return;
    this.benchDisciplineOpen.set(false);
    this.resetBenchDiscipline();
  }

  protected selectBenchTeam(team: FoulTeam): void {
    this.benchDisciplineTeam.set(team);
    this.selectedBenchPlayerId.set(null);
    this.selectedBenchOpponentNumber.set(null);
    this.benchOpponentNumberInput.set('');
  }

  protected selectBenchMemberKind(kind: 'player' | 'staff'): void {
    this.benchMemberKind.set(kind);
    this.selectedBenchPlayerId.set(null);
    this.selectedBenchOpponentNumber.set(null);
    this.benchOpponentNumberInput.set('');
  }

  protected async submitBenchDiscipline(): Promise<void> {
    const subject = this.benchSubject();
    if (!subject || !this.benchSubmissionValid() || this.disciplineSaving()) return;
    this.disciplineSaving.set(true);
    try {
      if (
        await this.store.registerBenchDiscipline(
          this.benchDisciplineTeam(),
          subject,
          this.benchDisciplineAction(),
          this.benchDisciplineReason(),
        )
      ) {
        this.showActionFeedback('Disciplina de banquillo registrada');
        this.benchDisciplineOpen.set(false);
        this.resetBenchDiscipline();
      }
    } finally {
      this.disciplineSaving.set(false);
    }
  }

  protected cancelFoul(): void {
    if (this.disciplineSaving()) return;
    this.foulTeam.set(null);
    this.selectedFoulPlayerId.set(null);
    this.resetOpponentSelection();
  }

  protected chooseFoulAction(action: DisciplinaryAction): void {
    if (this.foulTeam() === 'away' && action !== 'none') {
      this.pendingOpponentAction.set(action);
      this.selectedOpponentNumber.set(null);
      this.opponentNumberInput.set('');
      return;
    }
    void this.submitFoul(action);
  }

  protected async submitOpponentCard(): Promise<void> {
    const action = this.pendingOpponentAction();
    if (!action) return;
    const selected = this.selectedOpponentNumber();
    const number = selected ?? Number(this.opponentNumberInput());
    await this.submitFoul(action, number);
  }

  protected selectOpponentNumber(number: number): void {
    this.selectedOpponentNumber.set(number);
    this.opponentNumberInput.set('');
  }

  protected opponentOptionDisabled(number: number): boolean {
    const player = this.store
      .disciplinaryState()
      .opponentPlayers.find((item) => item.jerseyNumber === number);
    const action = this.pendingOpponentAction();
    return (
      !player ||
      player.sentOff ||
      (action === 'yellow' && player.yellowCards > 0) ||
      (action === 'secondYellow' && player.yellowCards !== 1)
    );
  }

  protected async submitFoul(
    action: DisciplinaryAction,
    opponentPlayerNumber?: number,
  ): Promise<void> {
    const team = this.foulTeam();
    if (!team || this.disciplineSaving()) return;
    this.disciplineSaving.set(true);
    try {
      const saved =
        team === 'home'
          ? await this.store.registerTeamFoul(this.selectedFoulPlayerId() ?? undefined, action)
          : await this.store.registerOpponentFoul(action, opponentPlayerNumber);
      if (saved) {
        this.showActionFeedback(action === 'none' ? 'Falta registrada' : 'Tarjeta registrada');
        this.cancelFoulAfterSave();
      }
    } finally {
      this.disciplineSaving.set(false);
    }
  }

  protected openReplacement(reductionEventId: string): void | Promise<void> {
    if (this.store.saving()) return;
    return this.runAfterClockStopped(() => this.replacingReductionId.set(reductionEventId));
  }

  protected cancelReplacement(): void {
    if (!this.disciplineSaving()) this.replacingReductionId.set(null);
  }

  protected async replaceWith(playerId: string): Promise<void> {
    const reductionId = this.replacingReductionId();
    if (!reductionId || this.disciplineSaving()) return;
    this.disciplineSaving.set(true);
    try {
      if (await this.store.replaceSentOffPlayer(reductionId, playerId)) {
        this.replacingReductionId.set(null);
      }
    } finally {
      this.disciplineSaving.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeSubstitutionOnEscape(): void {
    if (this.activeOverlay()) {
      this.activeOverlay.set(null);
    } else if (this.goalSelectorOpen() && !this.goalSaving()) {
      this.cancelGoalSelector();
    } else if (this.selectedOutPlayerId() && !this.substituting()) {
      this.cancelSubstitution();
    } else if (this.foulTeam() && !this.disciplineSaving()) {
      this.cancelFoul();
    } else if (this.replacingReductionId() && !this.disciplineSaving()) {
      this.cancelReplacement();
    } else if (this.benchDisciplineOpen() && !this.disciplineSaving()) {
      this.cancelBenchDiscipline();
    }
  }

  protected async abandonMatch(): Promise<void> {
    if (await this.store.deleteCurrentMatch()) {
      this.cancelSubstitution();
      this.confirmAbandon.set(false);
      await this.router.navigate(['/matches']);
    }
  }

  protected formatDuration(durationMs: number): string {
    return formatGameClock(durationMs);
  }

  protected signed(value: number): string {
    return value > 0 ? `+${value}` : String(value);
  }

  protected timelineSymbol(type: MatchEventType, label: string): string {
    if (type === 'GOAL_FOR' || type === 'GOAL_AGAINST') return '⚽';
    if (type === 'SUBSTITUTION' || type === 'RED_CARD_REPLACEMENT') return '⇄';
    if (type === 'FOUL' || type === 'BENCH_DISCIPLINE') {
      if (label.includes('Roja')) return '🟥';
      if (label.includes('Amarilla')) return '🟨';
      return '⚠';
    }
    return '•';
  }

  protected timelineKind(type: MatchEventType): string {
    if (type === 'GOAL_FOR' || type === 'GOAL_AGAINST') return 'goal';
    if (type === 'SUBSTITUTION' || type === 'RED_CARD_REPLACEMENT') return 'change';
    if (type === 'FOUL' || type === 'BENCH_DISCIPLINE') return 'discipline';
    return 'system';
  }

  protected playerYellowCards(playerId: string): number {
    return this.store.disciplinaryState().players[playerId]?.yellowCards ?? 0;
  }

  protected staffRoleLabel(role: StaffRole): string {
    return this.staffRoles.find((option) => option.value === role)?.label ?? 'Staff';
  }

  private cancelFoulAfterSave(): void {
    this.foulTeam.set(null);
    this.selectedFoulPlayerId.set(null);
    this.resetOpponentSelection();
  }

  private resetOpponentSelection(): void {
    this.pendingOpponentAction.set(null);
    this.selectedOpponentNumber.set(null);
    this.opponentNumberInput.set('');
  }

  private resetBenchDiscipline(): void {
    this.benchDisciplineTeam.set('home');
    this.benchMemberKind.set('player');
    this.selectedBenchPlayerId.set(null);
    this.selectedBenchOpponentNumber.set(null);
    this.benchOpponentNumberInput.set('');
    this.benchStaffRole.set('headCoach');
    this.benchStaffName.set('');
    this.benchDisciplineAction.set('yellow');
    this.benchDisciplineReason.set('protest');
  }

  private showActionFeedback(message: string): void {
    this.notifications.success(message, {
      duration: 2_600,
      action: {
        label: 'Deshacer',
        run: () => this.undoLastAction(),
        disabled: () => !this.store.canUndo(),
      },
    });
  }

  private runAfterClockStopped(action: () => void | Promise<void>): void | Promise<void> {
    if (!this.store.clockRunning()) return action();
    return this.stopClockThen(action);
  }

  private async stopClockThen(action: () => void | Promise<void>): Promise<void> {
    await this.store.stopClock();
    if (!this.store.clockRunning()) await action();
  }

  protected lineupPlayers(playerIds: readonly string[]): string {
    const playersById = new Map(this.store.players().map((player) => [player.id, player]));
    return playerIds
      .map((playerId) => playersById.get(playerId))
      .filter((player) => player !== undefined)
      .map((player) => `#${player.number} ${player.name}`)
      .join(' · ');
  }
}
