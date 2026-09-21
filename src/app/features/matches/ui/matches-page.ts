import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatchSummary, MatchesStore } from '../application/matches.store';
import { MatchCsvExportService } from '../application/match-csv-export.service';
import {
  MatchDate,
  matchCompetition,
  matchDateTimestamp,
  matchSeason,
} from '../../../shared/models/match';
import { MatchIntegrityStatus } from '../../../core/sync/match-integrity.model';

@Component({
  selector: 'app-matches-page',
  imports: [RouterLink],
  providers: [MatchesStore],
  templateUrl: './matches-page.html',
  styleUrl: './matches-page.scss',
})
export class MatchesPage {
  protected readonly store = inject(MatchesStore);
  protected readonly csvExporter = inject(MatchCsvExportService);
  private readonly router = inject(Router);
  protected readonly showActiveConflict = signal(false);
  protected readonly deleteCandidate = signal<MatchSummary | null>(null);
  protected readonly createAfterDelete = signal(false);

  constructor() {
    void this.store.load();
  }

  protected newMatch(): void {
    if (this.store.activeMatch()) {
      this.showActiveConflict.set(true);
      return;
    }
    void this.router.navigate(['/matches/new']);
  }

  protected abandonAndCreate(): void {
    const active = this.store.activeMatch();
    if (!active) {
      void this.router.navigate(['/matches/new']);
      return;
    }
    this.showActiveConflict.set(false);
    this.createAfterDelete.set(true);
    this.deleteCandidate.set(active);
  }

  protected requestDelete(summary: MatchSummary, createAfterDelete = false): void {
    this.createAfterDelete.set(createAfterDelete);
    this.deleteCandidate.set(summary);
  }

  protected cancelDelete(): void {
    if (this.store.deletingId()) {
      return;
    }
    this.deleteCandidate.set(null);
    this.createAfterDelete.set(false);
  }

  protected async confirmDelete(): Promise<void> {
    const candidate = this.deleteCandidate();
    if (!candidate) {
      return;
    }
    const navigateToNew = this.createAfterDelete();
    if (!(await this.store.deleteMatch(candidate.match.id))) {
      return;
    }
    this.deleteCandidate.set(null);
    this.createAfterDelete.set(false);
    if (navigateToNew) {
      await this.router.navigate(['/matches/new']);
    }
  }

  protected formatDate(value: MatchDate): string {
    const timestamp = matchDateTimestamp(value);
    if (!timestamp) return '—';
    return new Intl.DateTimeFormat('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(timestamp);
  }

  protected readonly matchSeason = matchSeason;
  protected readonly matchCompetition = matchCompetition;
  protected integrityLabel(status: MatchIntegrityStatus | undefined): string {
    switch (status) {
      case 'verified':
        return '✓ Integridad verificada';
      case 'pending':
      case 'repairing':
      case 'checking':
        return '↻ Sincronización pendiente';
      case 'mismatch':
        return '⚠ Inconsistencia detectada';
      case 'unreachable':
        return '○ No verificable ahora';
      default:
        return '○ Integridad sin verificar';
    }
  }
}
