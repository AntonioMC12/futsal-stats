import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { formatGameClock } from '../../../core/clock/match-clock';
import { LiveMatchStore } from '../application/live-match.store';
import {
  derivePlayerDetailHistory,
  periodLabel,
  projectPlayerMatchDetail,
} from '../domain/player-match-detail';

@Component({
  selector: 'app-player-match-detail',
  templateUrl: './player-match-detail.html',
  styleUrl: './player-match-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayerMatchDetailComponent {
  private readonly store = inject(LiveMatchStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly playerId = input.required<string>();
  readonly returnFocusTo = input<HTMLElement | null>(null);
  readonly closed = output<void>();
  protected readonly formatTime = formatGameClock;
  protected readonly periodLabel = periodLabel;
  private readonly history = computed(() => {
    const match = this.store.match();
    return match
      ? derivePlayerDetailHistory(match, this.store.events(), this.playerId(), this.store.players())
      : null;
  });
  protected readonly detail = computed(() => {
    const history = this.history();
    const match = this.store.match();
    const statistics = this.store.statistics();
    const playerStatistics = statistics.players[this.playerId()];
    return history && match && playerStatistics
      ? projectPlayerMatchDetail(
          history,
          playerStatistics,
          statistics.playerStints[this.playerId()] ?? [],
          match.status,
          this.store.lineupPlayerIds().includes(this.playerId()),
        )
      : null;
  });
  protected readonly metrics = computed(() => {
    const stats = this.detail()?.statistics;
    return stats
      ? [
          { label: 'Goles', value: stats.goals },
          { label: 'Goles a favor en pista', value: stats.goalsForOnCourt },
          { label: 'Goles en contra en pista', value: stats.goalsAgainstOnCourt },
          {
            label: 'Diferencia en pista',
            value: stats.plusMinus > 0 ? `+${stats.plusMinus}` : stats.plusMinus,
          },
          { label: 'Faltas', value: stats.fouls },
          { label: 'Amarillas', value: stats.yellowCards },
          { label: 'Segunda amarilla', value: stats.secondYellowSendOffs },
          { label: 'Rojas directas', value: stats.directRedCards },
          { label: 'Expulsiones', value: stats.sendOffs },
          { label: 'Entradas en pista', value: stats.entries },
          { label: 'Participación', value: `${Math.round(stats.percentage)} %` },
        ]
      : [];
  });

  protected readonly shirtNumber = computed(() => {
    const number = this.detail()?.player.number;
    return number !== undefined && Number.isFinite(number) ? `#${number}` : '';
  });

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
    inject(DestroyRef).onDestroy(() => {
      this.dialog().nativeElement.close();
      this.returnFocusTo()?.focus({ preventScroll: true });
    });
  }

  protected dismiss(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.closed.emit();
  }
}
