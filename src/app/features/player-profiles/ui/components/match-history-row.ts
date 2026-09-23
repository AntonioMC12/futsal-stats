import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatGameClock } from '../../../../core/clock/match-clock';
import { matchCompetition, matchDateTimestamp, matchSeason } from '../../../../shared/models/match';
import { PlayerHistoricalMatch } from '../../domain/player-profile-statistics';
import { ProfileStatusBadgeComponent, ProfileStatusTone } from './profile-status-badge';

@Component({
  selector: 'app-match-history-row',
  imports: [RouterLink, ProfileStatusBadgeComponent],
  template: `
    <a [routerLink]="['/matches', item().match.id]" class="player-match-card">
      <time>{{ dateLabel() }}</time>
      <div class="match-opponent">
        <strong>{{ item().match.awayTeam.name }}</strong
        ><small>{{ matchCompetition(item().match) }} · {{ matchSeason(item().match) }}</small>
      </div>
      <strong class="match-score">{{ homeScore() }} <span>–</span> {{ awayScore() }}</strong>
      <span class="match-stat">{{ playedTime() }}</span>
      <span class="match-stat match-stat--performance" [title]="performanceLabel()">{{
        performanceLabel()
      }}</span>
      <span class="match-stat">{{ plusMinusLabel() }}</span>
      <app-profile-status-badge [label]="outcomeLabel()" [tone]="outcomeTone()" />
      <span class="match-chevron" aria-hidden="true">›</span>
    </a>
  `,
  styleUrl: './match-history-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchHistoryRowComponent {
  readonly item = input.required<PlayerHistoricalMatch>();
  readonly goalkeeper = input(false);
  protected readonly matchCompetition = matchCompetition;
  protected readonly matchSeason = matchSeason;

  protected dateLabel(): string {
    const timestamp = matchDateTimestamp(this.item().match.date);
    return timestamp
      ? new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          .format(timestamp)
          .replace('.', '')
      : 'Sin fecha';
  }
  protected homeScore(): string | number {
    return (
      this.item().match.importMetadata?.legacySnapshot?.observedScore?.home ??
      this.item().score.home
    );
  }
  protected awayScore(): string | number {
    return (
      this.item().match.importMetadata?.legacySnapshot?.observedScore?.away ??
      this.item().score.away
    );
  }
  protected playedTime(): string {
    const seconds = this.item().legacySnapshot?.secondsPlayed;
    return this.item().match.importMetadata?.legacySnapshot
      ? seconds === undefined
        ? 'Tiempo sin dato'
        : formatGameClock(seconds * 1_000)
      : formatGameClock(this.item().statistics.playedMs);
  }
  protected performanceLabel(): string {
    if (this.item().match.importMetadata?.legacySnapshot) return 'Goles sin dato';
    const statistics = this.item().statistics;
    const labels = [
      `${statistics.goals} ${statistics.goals === 1 ? 'gol' : 'goles'}`,
      statistics.shotsTotal === null
        ? 'Disparos sin registro'
        : `${statistics.shotsTotal} disparos`,
    ];
    if (this.goalkeeper() && statistics.saves !== null) {
      labels.push(`${statistics.saves} ${statistics.saves === 1 ? 'parada' : 'paradas'}`);
    }
    return labels.join(' · ');
  }
  protected plusMinusLabel(): string {
    const value = this.item().match.importMetadata?.legacySnapshot
      ? this.item().legacySnapshot?.goalDifference
      : this.item().statistics.plusMinus;
    return value === undefined ? '+/− sin dato' : `${value > 0 ? '+' : ''}${value} +/−`;
  }
  protected outcomeLabel(): string {
    return { win: 'Victoria', draw: 'Empate', loss: 'Derrota', unknown: 'Snapshot legacy' }[
      this.item().outcome
    ];
  }
  protected outcomeTone(): ProfileStatusTone {
    return { win: 'positive', draw: 'neutral', loss: 'negative', unknown: 'no-data' }[
      this.item().outcome
    ] as ProfileStatusTone;
  }
}
