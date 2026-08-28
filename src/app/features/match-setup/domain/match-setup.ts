import { createMatchClock } from '../../../core/clock/match-clock';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';

export const STARTING_LINEUP_SIZE = 5;

export interface CreateMatchInput {
  homeTeam: Team;
  awayTeamName: string;
  players: readonly Player[];
  squadPlayerIds: readonly string[];
  startingLineupPlayerIds: readonly string[];
}

export function createMatchRecord(
  input: CreateMatchInput,
  id: string,
  now: number,
): DomainResult<Match> {
  const awayTeamName = input.awayTeamName.trim();
  if (!awayTeamName) {
    return fail('El nombre del rival es obligatorio.');
  }

  const squadPlayerIds = unique(input.squadPlayerIds);
  const startingLineupPlayerIds = unique(input.startingLineupPlayerIds);
  const eligibleIds = new Set(
    input.players
      .filter((player) => player.active && player.teamId === input.homeTeam.id)
      .map((player) => player.id),
  );

  if (squadPlayerIds.length < STARTING_LINEUP_SIZE) {
    return fail('Selecciona al menos 5 jugadores para el partido.');
  }
  if (squadPlayerIds.some((playerId) => !eligibleIds.has(playerId))) {
    return fail('La convocatoria contiene jugadores que no están disponibles.');
  }
  if (startingLineupPlayerIds.length !== STARTING_LINEUP_SIZE) {
    return fail('Selecciona exactamente 5 jugadores para el quinteto inicial.');
  }

  const squadIds = new Set(squadPlayerIds);
  if (startingLineupPlayerIds.some((playerId) => !squadIds.has(playerId))) {
    return fail('El quinteto inicial debe formar parte de la convocatoria.');
  }

  return ok({
    id,
    homeTeam: {
      id: input.homeTeam.id,
      name: input.homeTeam.name,
      shortName: input.homeTeam.shortName,
    },
    awayTeam: {
      name: awayTeamName,
      shortName: suggestOpponentShortName(awayTeamName),
    },
    date: now,
    status: 'ready',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds,
    startingLineupPlayerIds,
    createdAt: now,
    updatedAt: now,
  });
}

export function suggestOpponentShortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words
      .map((word) => word[0])
      .join('')
      .slice(0, 5)
      .toUpperCase();
  }
  return (words[0] ?? '').slice(0, 5).toUpperCase();
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
