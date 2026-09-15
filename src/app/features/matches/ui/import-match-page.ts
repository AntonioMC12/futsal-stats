import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PLAYER_REPOSITORY } from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { Player } from '../../../shared/models/player';
import { ImportMatchFromCsvUseCase } from '../application/import-match-from-csv.use-case';
import { CsvMatchImportParser } from '../data/csv-match-import-parser';
import {
  DuplicateImportedMatchError,
  ImportedMatchDto,
  ImportMatchResult,
  MAX_MATCH_CSV_BYTES,
  PlayerImportResolution,
} from '../domain/match-import';
import { suggestPlayerResolutions } from '../domain/player-import-resolver';

@Component({
  selector: 'app-import-match-page',
  imports: [RouterLink],
  templateUrl: './import-match-page.html',
  styleUrl: './import-match-page.scss',
})
export class ImportMatchPage {
  private readonly parser = inject(CsvMatchImportParser);
  private readonly importer = inject(ImportMatchFromCsvUseCase);
  private readonly playersRepository = inject(PLAYER_REPOSITORY);
  private readonly workspace = inject(TeamWorkspaceContext);

  protected readonly importedMatch = signal<ImportedMatchDto | null>(null);
  protected readonly currentPlayers = signal<Player[]>([]);
  protected readonly resolutions = signal<PlayerImportResolution[]>([]);
  protected readonly result = signal<ImportMatchResult | null>(null);
  protected readonly processing = signal(false);
  protected readonly importing = signal(false);
  protected readonly dragging = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly duplicateMatchId = signal<string | null>(null);
  protected readonly fileName = signal('');
  protected readonly blockingIssues = computed(
    () =>
      this.importedMatch()?.issues.filter(
        ({ severity }) => severity === 'fatal' || severity === 'error',
      ) ?? [],
  );
  protected readonly warnings = computed(
    () => this.importedMatch()?.issues.filter(({ severity }) => severity === 'warning') ?? [],
  );
  protected readonly substitutionCount = computed(
    () => this.importedMatch()?.events.filter(({ event }) => event.type === 'SUBSTITUTION').length ?? 0,
  );
  protected readonly canImport = computed(
    () =>
      Boolean(this.importedMatch()) &&
      this.blockingIssues().length === 0 &&
      this.resolutions().every(
        ({ resolution, playerId }) => resolution === 'create' || Boolean(playerId),
      ) &&
      !this.importing(),
  );

  protected async fileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.readFile(file);
  }

  protected dragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected dragLeave(): void {
    this.dragging.set(false);
  }

  protected async dropFile(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) await this.readFile(file);
  }

  protected setResolution(importKey: string, value: string): void {
    this.resolutions.update((items) =>
      items.map((item) =>
        item.csvPlayer.importKey !== importKey
          ? item
          : value === '__create__'
            ? { ...item, resolution: 'create', playerId: undefined }
            : { ...item, resolution: 'existing', playerId: value },
      ),
    );
  }

  protected resolutionValue(item: PlayerImportResolution): string {
    return item.resolution === 'create' ? '__create__' : (item.playerId ?? '');
  }

  protected async confirmImport(): Promise<void> {
    const importedMatch = this.importedMatch();
    if (!importedMatch || !this.canImport()) return;
    this.importing.set(true);
    this.error.set(null);
    this.duplicateMatchId.set(null);
    try {
      this.result.set(
        await this.importer.execute({ importedMatch, resolutions: this.resolutions() }),
      );
    } catch (error) {
      if (error instanceof DuplicateImportedMatchError) {
        this.duplicateMatchId.set(error.existingMatchId);
        this.error.set(error.message);
      } else {
        this.error.set(error instanceof Error ? error.message : 'No se ha podido importar el partido.');
      }
    } finally {
      this.importing.set(false);
    }
  }

  protected reset(): void {
    this.importedMatch.set(null);
    this.resolutions.set([]);
    this.result.set(null);
    this.error.set(null);
    this.duplicateMatchId.set(null);
    this.fileName.set('');
  }

  private async readFile(file: File): Promise<void> {
    this.reset();
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      this.error.set('Selecciona un archivo con extensión .csv.');
      return;
    }
    if (file.size > MAX_MATCH_CSV_BYTES) {
      this.error.set('El archivo supera el máximo permitido de 5 MB.');
      return;
    }
    this.processing.set(true);
    this.fileName.set(file.name);
    try {
      const teamId = this.workspace.activeTeamId();
      if (!teamId) throw new Error('No hay un equipo activo.');
      const [parsed, players] = await Promise.all([
        file.text().then((text) => this.parser.parseText(text, file.name)),
        this.playersRepository.listByTeam(teamId),
      ]);
      this.currentPlayers.set(players);
      this.importedMatch.set(parsed);
      this.resolutions.set(suggestPlayerResolutions(parsed.players, players));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se ha podido analizar el CSV.');
    } finally {
      this.processing.set(false);
    }
  }
}
