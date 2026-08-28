import { computed, inject, Injectable, signal } from '@angular/core';
import { MatchEventRepository } from '../../../core/persistence/match-event.repository';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { PlayerRepository } from '../../../core/persistence/player.repository';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { createMatchCsvFilename, serializeMatchCsv } from '../domain/match-csv';
import { buildMatchStatisticsExport } from '../domain/match-export';
import { CsvFileDownloader } from './csv-file-downloader';

@Injectable({ providedIn: 'root' })
export class MatchCsvExportService {
  private readonly matches = inject(MatchRepository);
  private readonly events = inject(MatchEventRepository);
  private readonly players = inject(PlayerRepository);
  private readonly downloader = inject(CsvFileDownloader);
  readonly exportingId = signal<string | null>(null);
  readonly isExporting = computed(() => this.exportingId() !== null);
  readonly notice = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  async export(matchId: string): Promise<DomainResult<string>> {
    if (this.isExporting()) {
      return fail('Ya hay una exportación en curso.');
    }

    this.exportingId.set(matchId);
    this.notice.set(null);
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
      this.notice.set('CSV exportado');
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
