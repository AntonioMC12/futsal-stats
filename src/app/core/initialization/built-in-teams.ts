import { Player } from '../../shared/models/player';
import { Team } from '../../shared/models/team';

export const APAGA_SEED_KEY = 'apaga';
export const APAGA_TEAM_ID = 'built-in-team-apaga';

export const APAGA_ROSTER = [
  { number: 1, name: 'MELLI' },
  { number: 2, name: 'RATÓN' },
  { number: 3, name: 'ALEX' },
  { number: 4, name: 'CAMPITOS' },
  { number: 5, name: 'CALA' },
  { number: 6, name: 'TAMAJÓN' },
  { number: 7, name: 'MARA' },
  { number: 8, name: 'CABEZAS' },
  { number: 9, name: 'BORRALLO' },
  { number: 10, name: 'ADRI' },
  { number: 11, name: 'TETUR' },
  { number: 12, name: 'ISAAC' },
  { number: 13, name: 'JUAN BONILLA' },
  { number: 14, name: 'KEKO' },
  { number: 15, name: 'DAVID' },
  { number: 16, name: 'JESÚS C.' },
] as const;

export function createApagaTeam(timestamp: number): Team {
  return {
    id: APAGA_TEAM_ID,
    seedKey: APAGA_SEED_KEY,
    name: 'Apaga',
    shortName: 'APA',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createApagaPlayers(): Player[] {
  return APAGA_ROSTER.map(({ number, name }) => ({
    id: `built-in-player-apaga-${String(number).padStart(2, '0')}`,
    teamId: APAGA_TEAM_ID,
    number,
    name,
    active: true,
  }));
}
