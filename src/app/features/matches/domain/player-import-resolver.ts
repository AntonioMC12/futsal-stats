import { Player } from '../../../shared/models/player';
import { ImportedPlayerDto, PlayerImportResolution } from './match-import';

export interface PlayerImportSuggestion extends PlayerImportResolution {
  confidence: 'exact-id' | 'number-and-name' | 'name-only' | 'number-conflict' | 'none';
}

export function suggestPlayerResolutions(
  importedPlayers: readonly ImportedPlayerDto[],
  currentPlayers: readonly Player[],
): PlayerImportSuggestion[] {
  return importedPlayers.map((csvPlayer) => {
    const byId = csvPlayer.sourceId
      ? currentPlayers.find(({ id }) => id === csvPlayer.sourceId)
      : undefined;
    if (byId) return existing(csvPlayer, byId, 'exact-id');

    const normalizedName = normalizePlayerName(csvPlayer.name);
    const byNumberAndName = currentPlayers.find(
      (player) =>
        player.number === csvPlayer.number && normalizePlayerName(player.name) === normalizedName,
    );
    if (byNumberAndName) return existing(csvPlayer, byNumberAndName, 'number-and-name');

    if (currentPlayers.some((player) => player.number === csvPlayer.number)) {
      return { csvPlayer, resolution: 'manual', confidence: 'number-conflict' };
    }

    const sameName = currentPlayers.filter(
      (player) => normalizePlayerName(player.name) === normalizedName,
    );
    if (sameName.length === 1) {
      return {
        csvPlayer,
        resolution: 'manual',
        playerId: sameName[0]!.id,
        confidence: 'name-only',
      };
    }

    return { csvPlayer, resolution: 'create', confidence: 'none' };
  });
}

export function normalizePlayerName(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function existing(
  csvPlayer: ImportedPlayerDto,
  player: Player,
  confidence: PlayerImportSuggestion['confidence'],
): PlayerImportSuggestion {
  return { csvPlayer, resolution: 'existing', playerId: player.id, confidence };
}
