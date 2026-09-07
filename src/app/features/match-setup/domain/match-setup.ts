import { createMatchClock } from '../../../core/clock/match-clock';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match } from '../../../shared/models/match';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';

export const STARTING_LINEUP_SIZE = 5;

export interface CreateMatchInput {
  homeTeam: Team;
  awayTeamShortName: string;
  awayTeamName: string;
  matchDate: string;
  description: string;
  players: readonly Player[];
  squadPlayerIds: readonly string[];
  startingLineupPlayerIds: readonly string[];
}

export function createMatchRecord(
  input: CreateMatchInput,
  id: string,
  now: number,
): DomainResult<Match> {
  const awayTeamShortName = input.awayTeamShortName.trim().toUpperCase();
  if (awayTeamShortName.length < 2 || awayTeamShortName.length > 6) {
    return fail('La abreviación debe tener entre 2 y 6 caracteres.');
  }
  const awayTeamName = input.awayTeamName.trim();
  if (!awayTeamName) {
    return fail('El nombre del rival es obligatorio.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.matchDate)) {
    return fail('La fecha del partido es obligatoria.');
  }
  const description = input.description.trim();
  if (!description) {
    return fail('La descripción es obligatoria.');
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
      shortName: awayTeamShortName,
    },
    date: input.matchDate,
    description,
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

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
