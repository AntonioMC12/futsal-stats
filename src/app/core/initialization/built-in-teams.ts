import { Player } from '../../shared/models/player';
import { Team } from '../../shared/models/team';

export const APAGA_SEED_KEY = 'apaga';
export const LEGACY_APAGA_TEAM_ID = 'built-in-team-apaga';
export const APAGA_TEAM_ID = '8f4b8f3e-22df-4dad-8d8a-8d2e43f40a01';

export const APAGA_PLAYER_IDS = [
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40101',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40102',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40103',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40104',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40105',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40106',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40107',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40108',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40109',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40110',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40111',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40112',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40113',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40114',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40115',
  '8f4b8f3e-22df-4dad-8d8a-8d2e43f40116',
] as const;

export const APAGA_LEGACY_ID_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
  [LEGACY_APAGA_TEAM_ID]: APAGA_TEAM_ID,
  ...Object.fromEntries(
    APAGA_PLAYER_IDS.map((id, index) => [
      `built-in-player-apaga-${String(index + 1).padStart(2, '0')}`,
      id,
    ]),
  ),
});

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
  return APAGA_ROSTER.map(({ number, name }, index) => ({
    id: APAGA_PLAYER_IDS[index]!,
    teamId: APAGA_TEAM_ID,
    number,
    name,
    active: true,
  }));
}
