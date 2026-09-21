import { inject, Injectable } from '@angular/core';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY,
  MATCH_REPOSITORY,
  PLAYER_REPOSITORY,
} from '../../../core/persistence/persistence.tokens';
import { TeamWorkspaceContext } from '../../../core/team-workspace/team-workspace.context';
import { createId } from '../../../core/utils/id';
import { Match } from '../../../shared/models/match';
import { MatchEvent } from '../../../shared/models/match-event';
import { Player } from '../../../shared/models/player';
import { deriveMatchState } from '../../live-match/domain/derived-match-state';
import { normalizePlayerName } from '../domain/player-import-resolver';
import {
  DuplicateImportedMatchError,
  ImportedMatchDto,
  ImportMatchResult,
  ImportPersistenceError,
  PlayerImportResolution,
  PlayerResolutionError,
} from '../domain/match-import';

export interface ImportMatchCommand {
  importedMatch: ImportedMatchDto;
  resolutions: readonly PlayerImportResolution[];
}

@Injectable({ providedIn: 'root' })
export class ImportMatchFromCsvUseCase {
  private readonly matches = inject(MATCH_REPOSITORY);
  private readonly events = inject(MATCH_EVENT_REPOSITORY);
  private readonly players = inject(PLAYER_REPOSITORY);
  private readonly workspace = inject(TeamWorkspaceContext);

  async execute(command: ImportMatchCommand): Promise<ImportMatchResult> {
    const startedAt = performance.now();
    const dto = command.importedMatch;
    logImport('match_import_started', dto);
    const blockingIssue = dto.issues.find(
      ({ severity }) => severity === 'fatal' || severity === 'error',
    );
    if (blockingIssue) {
      logImport('match_import_validation_failed', dto);
      throw new PlayerResolutionError(blockingIssue.message);
    }
    const team = this.workspace.activeTeam();
    if (!team) throw new ImportPersistenceError('No hay un equipo activo para la importación.');

    const existing = await this.findDuplicate(team.id, dto);
    if (existing) {
      logImport('match_import_duplicate_detected', dto);
      throw new DuplicateImportedMatchError(existing.id);
    }

    const resolutions = new Map(
      command.resolutions.map((item) => [item.csvPlayer.importKey, item]),
    );
    if (resolutions.size !== dto.players.length) {
      throw new PlayerResolutionError('Debes resolver todos los jugadores antes de importar.');
    }
    const existingPlayers = await this.players.listByTeam(team.id);
    const existingById = new Map(existingPlayers.map((player) => [player.id, player]));
    const localPlayerIds = new Map<string, string>();
    const playersToCreate: Player[] = [];
    for (const importedPlayer of dto.players) {
      const resolution = resolutions.get(importedPlayer.importKey)!;
      if (resolution.resolution === 'ignore') {
        throw new PlayerResolutionError(
          `No se puede ignorar a ${importedPlayer.name}: forma parte de la convocatoria.`,
        );
      }
      if (resolution.resolution === 'existing' || resolution.resolution === 'manual') {
        const player = resolution.playerId ? existingById.get(resolution.playerId) : undefined;
        if (!player || player.teamId !== team.id) {
          throw new PlayerResolutionError(`La vinculación de ${importedPlayer.name} no es válida.`);
        }
        localPlayerIds.set(importedPlayer.importKey, player.id);
      } else {
        const player: Player = {
          id: createId(),
          teamId: team.id,
          number: importedPlayer.number,
          name: importedPlayer.name,
          active: true,
        };
        playersToCreate.push(player);
        localPlayerIds.set(importedPlayer.importKey, player.id);
      }
    }

    const sourcePlayerIds = new Map(
      dto.players.flatMap((player) =>
        player.sourceId ? [[player.sourceId, localPlayerIds.get(player.importKey)!] as const] : [],
      ),
    );
    const eventIds = new Map(dto.events.map(({ sourceId }) => [sourceId, createId()]));
    const matchId = createId();
    const importedAt = new Date().toISOString();
    const now = Date.now();
    const match: Match = {
      id: matchId,
      teamId: team.id,
      homeTeam: { id: team.id, name: team.name, shortName: team.shortName },
      awayTeam: {
        name: dto.match.opponent,
        shortName:
          dto.match.abbreviation ||
          (dto.format === 'legacy-player-snapshot' ? '' : abbreviation(dto.match.opponent)),
      },
      date: dto.match.date,
      description: dto.match.description ?? '',
      status: 'finished',
      currentPeriod: dto.legacySnapshot?.observedPeriod ?? dto.match.periodCount,
      periodCount: dto.match.periodCount,
      clock: { ...createMatchClock(dto.match.periodDurationMs), remainingMs: 0 },
      squadPlayerIds: dto.players.map((player) => localPlayerIds.get(player.importKey)!),
      startingLineupPlayerIds:
        dto.format === 'legacy-player-snapshot'
          ? (dto.lineups[0]?.playerImportKeys.map((key) => localPlayerIds.get(key)!) ?? [])
          : dto.players
              .filter(({ startingLineup }) => startingLineup)
              .map((player) => localPlayerIds.get(player.importKey)!),
      createdAt: now,
      updatedAt: now,
      ...(dto.match.statisticsSchemaVersion === 2 ? { statisticsSchemaVersion: 2 as const } : {}),
      source: 'csv-import',
      importMetadata: {
        fileName: dto.source.fileName,
        importedAt,
        schemaVersion: dto.schemaVersion,
        fingerprint: dto.source.fingerprint,
        originalMatchId: dto.source.originalMatchId,
        ...(dto.legacySnapshot
          ? {
              legacySnapshot: {
                ...dto.legacySnapshot,
                players: dto.legacySnapshot.players.map(({ importKey, ...statistics }) => ({
                  ...statistics,
                  playerId: localPlayerIds.get(importKey)!,
                })),
              },
            }
          : {}),
      },
    };
    if (match.startingLineupPlayerIds.length > 5) {
      throw new PlayerResolutionError('El quinteto inicial contiene más de 5 jugadores.');
    }
    const mappedEvents = dto.events.map(({ event }) =>
      remapEvent(event, matchId, eventIds, sourcePlayerIds),
    );
    const score = deriveMatchState(match, mappedEvents).score;
    const issues = [...dto.issues];
    if (
      dto.legacySnapshot &&
      normalizePlayerName(dto.legacySnapshot.observedTeamName) !== normalizePlayerName(team.name)
    ) {
      issues.push({
        severity: 'warning',
        code: 'team-name-mismatch',
        message: `El CSV indica el equipo ${dto.legacySnapshot.observedTeamName}, pero se ha importado en ${team.name}.`,
      });
    }
    if (
      !dto.legacySnapshot &&
      dto.match.homeScore !== undefined &&
      dto.match.awayScore !== undefined &&
      (dto.match.homeScore !== score.home || dto.match.awayScore !== score.away)
    ) {
      issues.push({
        severity: 'warning',
        code: 'score-mismatch',
        message: `El marcador del CSV (${dto.match.homeScore}-${dto.match.awayScore}) no coincide con los eventos (${score.home}-${score.away}).`,
      });
    }

    try {
      await this.events.importMatch(match, mappedEvents, playersToCreate);
    } catch (cause) {
      try {
        await this.matches.delete(matchId);
      } catch {
        // Preserve the original persistence failure.
      }
      logImport('match_import_failed', dto);
      throw new ImportPersistenceError('No se ha podido guardar el partido importado.', { cause });
    }

    console.info('match_import_completed', {
      schemaVersion: dto.schemaVersion ?? 'legacy',
      eventCount: mappedEvents.length,
      playerCount: dto.players.length,
      warningCount: issues.filter(({ severity }) => severity === 'warning').length,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return {
      matchId,
      playersCreated: playersToCreate.length,
      playersLinked: dto.players.length - playersToCreate.length,
      eventCount: mappedEvents.length,
      substitutionCount: mappedEvents.filter(({ type }) => type === 'SUBSTITUTION').length,
      lineupCount: dto.lineups.length,
      issues,
    };
  }

  private async findDuplicate(teamId: string, dto: ImportedMatchDto): Promise<Match | undefined> {
    const matches = await this.matches.listByTeam(teamId);
    return matches.find(
      (match) =>
        (dto.source.originalMatchId &&
          (match.id === dto.source.originalMatchId ||
            match.importMetadata?.originalMatchId === dto.source.originalMatchId)) ||
        match.importMetadata?.fingerprint === dto.source.fingerprint,
    );
  }
}

function remapEvent(
  source: MatchEvent,
  matchId: string,
  eventIds: Map<string, string>,
  playerIds: Map<string, string>,
): MatchEvent {
  const event = { ...source } as unknown as Record<string, unknown>;
  event['id'] = eventIds.get(source.id)!;
  event['matchId'] = matchId;
  for (const key of [
    'playerId',
    'foulPlayerId',
    'receivedByPlayerId',
    'scorerPlayerId',
    'outPlayerId',
    'inPlayerId',
  ] as const) {
    if (typeof event[key] === 'string') event[key] = playerIds.get(event[key] as string);
  }
  for (const key of ['targetEventId', 'reductionEventId', 'relatedEventId'] as const) {
    if (typeof event[key] === 'string') event[key] = eventIds.get(event[key] as string);
  }
  if (Array.isArray(event['lineupPlayerIds'])) {
    event['lineupPlayerIds'] = event['lineupPlayerIds']
      .map((id) => playerIds.get(String(id)))
      .filter(Boolean);
  }
  return event as unknown as MatchEvent;
}

function abbreviation(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 4)
    .toLocaleUpperCase('es');
}

function logImport(name: string, dto: ImportedMatchDto): void {
  console.info(name, {
    schemaVersion: dto.schemaVersion ?? 'legacy',
    eventCount: dto.events.length,
    playerCount: dto.players.length,
    warningCount: dto.issues.filter(({ severity }) => severity === 'warning').length,
  });
}
