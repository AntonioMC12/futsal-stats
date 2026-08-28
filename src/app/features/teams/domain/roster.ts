import { Player } from '../../../shared/models/player';
import { Team } from '../../../shared/models/team';
import { DomainResult, fail, ok } from '../../../core/utils/result';

export const TEAM_NAME_MAX_LENGTH = 40;
export const TEAM_SHORT_NAME_MAX_LENGTH = 5;
export const PLAYER_NAME_MAX_LENGTH = 40;
export const MIN_SHIRT_NUMBER = 0;
export const MAX_SHIRT_NUMBER = 99;

export interface TeamInput {
  name: string;
  shortName: string;
}

export interface PlayerInput {
  teamId: string;
  number: number | string;
  name: string;
  position?: string;
}

export function suggestShortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '';
  }

  if (words.length === 1) {
    return Array.from(words[0] ?? '')
      .slice(0, 3)
      .join('')
      .toUpperCase();
  }

  return words
    .slice(0, TEAM_SHORT_NAME_MAX_LENGTH)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

export function createTeamRecord(input: TeamInput, id: string, now: number): DomainResult<Team> {
  const normalized = normalizeTeamInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  return ok({
    id,
    name: normalized.value.name,
    shortName: normalized.value.shortName,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateTeamRecord(team: Team, input: TeamInput, now: number): DomainResult<Team> {
  const normalized = normalizeTeamInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  return ok({
    ...team,
    name: normalized.value.name,
    shortName: normalized.value.shortName,
    updatedAt: now,
  });
}

export function createPlayerRecord(
  input: PlayerInput,
  roster: readonly Player[],
  id: string,
): DomainResult<Player> {
  const normalized = normalizePlayerInput(input);
  if (!normalized.ok) {
    return normalized;
  }

  const conflict = findNumberConflict(roster, normalized.value.number);
  if (conflict) {
    return fail(`Ya hay un jugador con el dorsal ${normalized.value.number}.`);
  }

  return ok({
    id,
    teamId: normalized.value.teamId,
    number: normalized.value.number,
    name: normalized.value.name,
    position: normalized.value.position,
    active: true,
  });
}

export function updatePlayerRecord(
  player: Player,
  input: PlayerInput,
  roster: readonly Player[],
): DomainResult<Player> {
  const normalized = normalizePlayerInput({ ...input, teamId: player.teamId });
  if (!normalized.ok) {
    return normalized;
  }

  const conflict = findNumberConflict(roster, normalized.value.number, player.id);
  if (conflict) {
    return fail(`Ya hay un jugador con el dorsal ${normalized.value.number}.`);
  }

  return ok({
    ...player,
    number: normalized.value.number,
    name: normalized.value.name,
    position: normalized.value.position,
    active: true,
  });
}

export function deactivatePlayerRecord(player: Player): Player {
  return { ...player, active: false };
}

export function normalizeTeamInput(
  input: TeamInput,
): DomainResult<{ name: string; shortName: string }> {
  const name = input.name.trim();
  if (!name) {
    return fail('El nombre del equipo es obligatorio.');
  }
  if (name.length > TEAM_NAME_MAX_LENGTH) {
    return fail(`El nombre no puede superar ${TEAM_NAME_MAX_LENGTH} caracteres.`);
  }

  const shortName = (input.shortName.trim() || suggestShortName(name)).toUpperCase();
  if (!shortName) {
    return fail('Las siglas del equipo son obligatorias.');
  }
  if (shortName.length > TEAM_SHORT_NAME_MAX_LENGTH) {
    return fail(`Las siglas no pueden superar ${TEAM_SHORT_NAME_MAX_LENGTH} caracteres.`);
  }

  return ok({ name, shortName });
}

export function normalizePlayerInput(
  input: PlayerInput,
): DomainResult<{ teamId: string; number: number; name: string; position?: string }> {
  if (!input.teamId) {
    return fail('Falta el equipo del jugador.');
  }

  const number = parseShirtNumber(input.number);
  if (!number.ok) {
    return number;
  }

  const name = input.name.trim();
  if (!name) {
    return fail('El nombre del jugador es obligatorio.');
  }
  if (name.length > PLAYER_NAME_MAX_LENGTH) {
    return fail(`El nombre no puede superar ${PLAYER_NAME_MAX_LENGTH} caracteres.`);
  }

  const position = input.position?.trim();
  return ok({
    teamId: input.teamId,
    number: number.value,
    name,
    position: position ? position : undefined,
  });
}

export function parseShirtNumber(value: number | string): DomainResult<number> {
  const raw = typeof value === 'number' ? String(value) : value.trim();
  if (!/^\d{1,2}$/.test(raw)) {
    return fail('El dorsal debe ser un número entre 0 y 99.');
  }

  const number = Number.parseInt(raw, 10);
  if (number < MIN_SHIRT_NUMBER || number > MAX_SHIRT_NUMBER) {
    return fail('El dorsal debe ser un número entre 0 y 99.');
  }

  return ok(number);
}

function findNumberConflict(
  roster: readonly Player[],
  number: number,
  exceptPlayerId?: string,
): Player | undefined {
  return roster.find(
    (player) => player.active && player.number === number && player.id !== exceptPlayerId,
  );
}
