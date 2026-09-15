import { createMatchClock } from '../../../core/clock/match-clock';
import { DomainResult, fail, ok } from '../../../core/utils/result';
import { Match, seasonForDate } from '../../../shared/models/match';
import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';

export const STARTING_LINEUP_SIZE = 5;

export interface CreateMatchInput {
  homeTeam: Team;
  awayTeamShortName: string;
  awayTeamName: string;
  matchDate: string;
  season?: string;
  competition?: string;
  description: string;
  players: readonly Player[];
  squadPlayerIds: readonly string[];
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
  const season = input.season?.trim() || seasonForDate(input.matchDate);
  const competition = input.competition?.trim() || 'Sin competición';
  const description = input.description.trim();
  if (!description) {
    return fail('La descripción es obligatoria.');
  }

  const squadPlayerIds = unique(input.squadPlayerIds);
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
  return ok({
    id,
    teamId: input.homeTeam.id,
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
    season,
    competition,
    description,
    status: 'ready',
    currentPeriod: 1,
    periodCount: 2,
    clock: createMatchClock(),
    squadPlayerIds,
    startingLineupPlayerIds: [],
    createdAt: now,
    updatedAt: now,
  });
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}
