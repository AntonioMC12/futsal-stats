import { computed, inject, Injectable, signal } from '@angular/core';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { createMatchCsvFilename, serializeMatchCsv } from '../domain/match-csv';
import { buildMatchStatisticsExport } from '../domain/match-export';
import { CsvFileDownloader } from './csv-file-downloader';
import { SystemNotificationService } from '../../../core/notifications/system-notification.service';

@Injectable({ providedIn: 'root' })
export class MatchCsvExportService {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly downloader = inject(CsvFileDownloader);
  private readonly notifications = inject(SystemNotificationService);
  readonly exportingId = signal<string | null>(null);
  readonly isExporting = computed(() => this.exportingId() !== null);
  readonly error = signal<string | null>(null);

  async export(matchId: string): Promise<DomainResult<string>> {
    if (this.isExporting()) {
      return fail('Ya hay una exportación en curso.');
    }

    this.exportingId.set(matchId);
    this.error.set(null);
    try {
      const match = await this.matches.get(matchId);
      if (!match) {
        this.error.set('No se ha podido exportar el CSV');
        return fail('No se ha encontrado el partido que quieres exportar.');
      }

      const [events, players] = await Promise.all([
        this.events.listByMatch(match.id),
        this.players.listByIds(match.squadPlayerIds),
      ]);
      const exportData = buildMatchStatisticsExport(match, events, players, Date.now());
      const filename = createMatchCsvFilename(exportData);
      this.downloader.download(serializeMatchCsv(exportData), filename);
      this.notifications.success('CSV exportado');
      return ok(filename);
    } catch {
      const message = 'No se ha podido exportar el CSV';
      this.error.set(message);
      return fail(message);
    } finally {
      this.exportingId.set(null);
    }
  }
}
