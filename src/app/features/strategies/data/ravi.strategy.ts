import { APAGA_TEAM_ID } from '../../../core/initialization/built-in-teams';
import { Strategy, TacticalPieceState } from '../domain/strategy';

const basePieces: TacticalPieceState[] = [
  ...['01', '02', '03', '04', '05'].map((id, index): TacticalPieceState => ({
    pieceId: `home-built-in-player-apaga-${id}`,
    playerId: `built-in-player-apaga-${id}`,
    type: 'home-player',
    number: index + 1,
    label: index === 0 ? 'P' : String(index + 1),
    position: {
      x: [0.93, 0.785, 0.68, 0.8, 0.72][index]!,
      y: [0.5, 0.267, 0.137, 0.608, 0.867][index]!,
    },
  })),
  ...Array.from({ length: 5 }, (_, index): TacticalPieceState => ({
    pieceId: `ravi-away-${index + 1}`,
    type: 'away-player',
    number: index + 1,
    label: `R${index + 1}`,
    position: { x: 0.18 + (index % 2) * 0.13, y: 0.15 + index * 0.17 },
  })),
  { pieceId: 'ball', type: 'ball', label: 'Balón', position: { x: 0.91, y: 0.5 } },
];
function pieces(
  changes: Readonly<Record<string, { x: number; y: number }>> = {},
  ball = { x: 0.91, y: 0.5 },
): TacticalPieceState[] {
  return basePieces.map((piece) =>
    piece.pieceId === 'ball'
      ? { ...piece, position: ball }
      : changes[piece.pieceId]
        ? { ...piece, position: changes[piece.pieceId]! }
        : { ...piece, position: { ...piece.position } },
  );
}
export const RAVI_STRATEGY: Strategy = {
  id: '56e5e659-d26e-4de4-8747-cc747ee63280',
  teamId: APAGA_TEAM_ID,
  name: 'Ravi',
  description: 'Saque de portero, ruptura profunda y ocupación del ala contraria.',
  category: 'Salida de presión',
  season: '2026/27',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  phases: [
    {
      id: 'e2ee74c5-25d3-4313-9bb9-ab195d73bac9',
      order: 1,
      title: 'Colocación inicial',
      description: 'El equipo abre la pista y ofrece líneas de pase.',
      cue: 'Abrir la pista.',
      durationMs: 1000,
      pieces: pieces(),
      arrows: [],
    },
    {
      id: '0b8e775d-7482-4e11-ae7e-b65ade3870da',
      order: 2,
      title: 'Saque hacia el cierre',
      description: 'El portero juega con el cierre libre.',
      cue: 'Perfilar el cuerpo.',
      durationMs: 1000,
      pieces: pieces(
        { 'home-built-in-player-apaga-05': { x: 0.66, y: 0.367 } },
        { x: 0.785, y: 0.267 },
      ),
      arrows: [
        {
          id: 'ravi-a1',
          type: 'pass',
          from: { x: 0.908, y: 0.465 },
          to: { x: 0.808, y: 0.303 },
          sourcePieceId: 'home-built-in-player-apaga-01',
          targetPieceId: 'home-built-in-player-apaga-02',
        },
      ],
    },
    {
      id: 'ab84cf86-c437-4c7e-8416-75e7ff69d6f6',
      order: 3,
      title: 'Pase y ruptura',
      description: '2 pasa a 3 y acelera hacia campo contrario.',
      cue: 'Solapar pase y carrera.',
      durationMs: 1000,
      pieces: pieces(
        {
          'home-built-in-player-apaga-02': { x: 0.235, y: 0.667 },
          'home-built-in-player-apaga-05': { x: 0.3, y: 0.15 },
        },
        { x: 0.68, y: 0.137 },
      ),
      arrows: [
        { id: 'ravi-a2', type: 'pass', from: { x: 0.759, y: 0.235 }, to: { x: 0.706, y: 0.168 } },
        {
          id: 'ravi-a3',
          type: 'movement',
          from: { x: 0.754, y: 0.29 },
          to: { x: 0.264, y: 0.645 },
          sourcePieceId: 'home-built-in-player-apaga-02',
        },
      ],
    },
    {
      id: '93b3c09f-32e4-4d2b-97ce-24d84d690a90',
      order: 4,
      title: '5 cruza al ala contraria',
      description: '5 cruza para generar una línea paralela.',
      cue: 'Atacar profundidad.',
      durationMs: 1000,
      pieces: pieces(
        {
          'home-built-in-player-apaga-02': { x: 0.235, y: 0.667 },
          'home-built-in-player-apaga-03': { x: 0.6, y: 0.292 },
          'home-built-in-player-apaga-05': { x: 0.3, y: 0.15 },
        },
        { x: 0.6, y: 0.292 },
      ),
      arrows: [
        { id: 'ravi-a4', type: 'movement', from: { x: 0.63, y: 0.35 }, to: { x: 0.331, y: 0.168 } },
      ],
    },
    {
      id: '87af0fd4-59f4-461b-94c8-17333a3d9e5a',
      order: 5,
      title: '4 equilibra la salida',
      description: '4 queda como opción segura de pase atrás.',
      cue: 'Conservar amplitud.',
      durationMs: 1000,
      pieces: pieces(
        {
          'home-built-in-player-apaga-02': { x: 0.235, y: 0.667 },
          'home-built-in-player-apaga-03': { x: 0.5, y: 0.5 },
          'home-built-in-player-apaga-04': { x: 0.75, y: 0.5 },
          'home-built-in-player-apaga-05': { x: 0.3, y: 0.15 },
        },
        { x: 0.5, y: 0.5 },
      ),
      arrows: [
        { id: 'ravi-a5', type: 'pass', from: { x: 0.532, y: 0.5 }, to: { x: 0.716, y: 0.5 } },
      ],
    },
  ],
};
