import { Component, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatGameClock } from '../../../core/clock/match-clock';
import {
  MatchDate,
  matchCompetition,
  matchDateTimestamp,
  matchSeason,
} from '../../../shared/models/match';
import { MatchDetailStore } from '../application/match-detail.store';
import { MatchCsvExportService } from '../application/match-csv-export.service';

@Component({
  selector: 'app-match-detail-page',
  imports: [RouterLink],
  providers: [MatchDetailStore],
  templateUrl: './match-detail-page.html',
  styleUrl: './match-detail-page.scss',
})
export class MatchDetailPage {
  protected readonly store = inject(MatchDetailStore);
  protected readonly csvExporter = inject(MatchCsvExportService);
  readonly matchId = input.required<string>();

  constructor() {
    effect(() => void this.store.load(this.matchId()));
  }

  protected formatDate(value: MatchDate): string {
    const timestamp = matchDateTimestamp(value);
    return timestamp
      ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(timestamp)
      : '—';
  }

  protected formatDuration(value: number): string {
    return formatGameClock(value);
  }

  protected readonly matchSeason = matchSeason;
  protected readonly matchCompetition = matchCompetition;
}
