import { CsvMatchImportParser } from './csv-match-import-parser';

const header =
  'fecha,equipo,rival,estado_partido,periodo,reloj,marcador,dorsal,jugador,tiempo_jugado,segundos_jugados,goles_favor_en_pista,goles_contra_en_pista,diferencia_goles,titular,en_pista,entradas_en_pista,faltas,amarillas,segunda_amarilla,rojas_directas,expulsiones,faltas_equipo,faltas_rival,amarillas_equipo,amarillas_rival,expulsiones_equipo,expulsiones_rival';
const row = (number: number, name: string, seconds: number, starter: string) =>
  `28/08/2026,Apaga,MNG,Primera parte,1,19:18,1-0,${number},${name},0:${String(seconds).padStart(2, '0')},${seconds},1,0,1,${starter},${starter},1,0,0,0,0,0,2,1,0,0,0,0`;
const sample = [
  header,
  row(1, 'Ratón', 41, 'Sí'),
  row(3, 'Manolo', 41, 'Sí'),
  row(5, 'Cala', 41, 'Sí'),
  row(7, 'Mara', 41, 'Sí'),
  row(8, 'Keko', 29, 'Sí'),
  row(22, 'Carlos', 0, 'No'),
  row(25, 'Isaac', 0, 'No'),
].join('\r\n');

describe('legacy CSV player snapshot', () => {
  const parser = new CsvMatchImportParser();

  it('recovers observed state and players without inventing events', async () => {
    const result = await parser.parseText(sample, 'apaga.csv');
    expect(result.format).toBe('legacy-player-snapshot');
    expect(result.match).toMatchObject({
      date: '2026-08-28',
      opponent: 'MNG',
      homeScore: 1,
      awayScore: 0,
    });
    expect(result.players.map((player) => player.name)).toEqual([
      'Ratón',
      'Manolo',
      'Cala',
      'Mara',
      'Keko',
      'Carlos',
      'Isaac',
    ]);
    expect(result.events).toEqual([]);
    expect(result.lineups).toHaveLength(1);
    expect(result.lineups[0]?.playerImportKeys).toHaveLength(5);
    expect(result.legacySnapshot).toMatchObject({
      observedState: 'Primera parte',
      observedPeriod: 1,
      observedClock: '19:18',
      observedScore: { home: 1, away: 0 },
      teamTotals: { teamFouls: 2, opponentFouls: 1 },
    });
    expect(result.legacySnapshot?.players.map((player) => player.secondsPlayed)).toEqual([
      41, 41, 41, 41, 29, 0, 0,
    ]);
  });

  it('keeps omitted optional values unknown and fingerprints the same content', async () => {
    const reduced = [header, row(1, 'Ratón', 41, 'Sí').replace(',1,0,1,Sí', ',,,Sí')].join('\n');
    const result = await parser.parseText(reduced, 'first.csv');
    expect(result.legacySnapshot?.players[0]?.goalsForOnCourt).toBeUndefined();
    expect(result.legacySnapshot?.players[0]?.goalsAgainstOnCourt).toBeUndefined();
    expect(result.source.fingerprint).toBe(
      (await parser.parseText(reduced, 'renamed.csv')).source.fingerprint,
    );
  });
});
