import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { PlayerMatchStatistics } from '../../live-match/domain/match-statistics';
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
  protected readonly activeStats = signal<'attack' | 'discipline' | 'participation'>('attack');
  protected readonly detailKind = signal<'timeline' | 'integrity' | null>(null);
  protected readonly selectedPlayerId = signal<string | null>(null);
  protected readonly selectedPlayer = computed(() =>
    this.store.playerRows().find((row) => row.player.id === this.selectedPlayerId()),
  );
  protected readonly statGroups = [
    { id: 'attack' as const, label: 'Ataque y portería' },
    { id: 'discipline' as const, label: 'Disciplina' },
    { id: 'participation' as const, label: 'Participación' },
  ];
  protected readonly columns = computed(() => this.allColumns(this.activeStats()));
  protected allColumns(
    group: 'attack' | 'discipline' | 'participation',
  ): { key: keyof PlayerMatchStatistics; label: string }[] {
    switch (group) {
      case 'attack':
        return [
          { key: 'playedMs', label: 'Tiempo' },
          { key: 'goals', label: 'Goles' },
          { key: 'shotsTotal', label: 'Tiros' },
          { key: 'shotsOnTarget', label: 'A puerta' },
          { key: 'shotsOffTarget', label: 'Fuera' },
          { key: 'saves', label: 'Paradas' },
        ];
      case 'discipline':
        return [
          { key: 'fouls', label: 'Faltas' },
          { key: 'accumulatedFouls', label: 'Acum.' },
          { key: 'nonAccumulatedInfringements', label: 'No acum.' },
          { key: 'foulsReceived', label: 'Recibidas' },
          { key: 'yellowCards', label: 'Amarillas' },
          { key: 'secondYellowSendOffs', label: '2.ª amarilla' },
          { key: 'directRedCards', label: 'Rojas' },
        ];
      default:
        return [
          { key: 'playedMs', label: 'Tiempo' },
          { key: 'percentage', label: '% partido' },
          { key: 'entries', label: 'Entradas' },
          { key: 'goalsForOnCourt', label: 'GF en pista' },
          { key: 'goalsAgainstOnCourt', label: 'GC en pista' },
          { key: 'plusMinus', label: '+/−' },
        ];
    }
  }
  protected statValue(stats: PlayerMatchStatistics, key: keyof PlayerMatchStatistics): string {
    const value = stats[key];
    if (value === null) return '—';
    if (key.endsWith('Ms')) return formatGameClock(value);
    if (key === 'percentage') return `${Math.round(value)} %`;
    return key === 'plusMinus' && value > 0 ? `+${value}` : String(value);
  }
  protected openDetails(dialog: HTMLDialogElement, kind: 'timeline' | 'integrity'): void {
    this.detailKind.set(kind);
    dialog.showModal();
  }
  protected openPlayer(dialog: HTMLDialogElement, id: string): void {
    this.selectedPlayerId.set(id);
    dialog.showModal();
  }

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

  protected legacyDuration(value?: number): string {
    return value === undefined ? '—' : formatGameClock(value * 1000);
  }

  protected metric(value?: number | null): string {
    return value == null ? '—' : String(value);
  }

  protected readonly matchSeason = matchSeason;
  protected readonly matchCompetition = matchCompetition;
  protected formatDateTime(value: number): string {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(
      value,
    );
  }
}
