import { Strategy, TacticalPoint } from '../domain/strategy';

const PLAYER_IDS = {
  goalkeeper: 'e9426634-f84d-49d1-95d6-a8fc8366b6af',
  player2: '252d66ae-c52f-4d7c-9da8-43199551de5b',
  player3: '0af42ed1-2822-4238-8025-c2a531286a26',
  player4: 'e39e32db-853a-459c-8394-ab4713773020',
  player5: '391f7d38-ad0d-42c5-9c84-c35fbf72b533',
} as const;

const ACTION_IDS = {
  goalkeeperToPlayer2: '6da17fa6-3850-4c5f-a237-bf8c1e73374e',
  player2ToPlayer3: 'cdb0a31d-beb4-4fb2-b4d1-37c845356fa0',
  player2DeepRun: '4ed83ac6-0863-4668-8b77-c7e34aec167e',
  player5CrossRun: '393f44dd-a8ad-4252-8cd0-635593a682f3',
  player4BalanceRun: '62fd44bb-c46d-470f-8051-4f0093ba7f82',
  player3SafetyPass: '2fe96c77-0528-4d27-968f-fec8c1c0de0e',
} as const;

const initialPositions: Readonly<Record<string, TacticalPoint>> = {
  [PLAYER_IDS.goalkeeper]: { x: 930, y: 300 },
  [PLAYER_IDS.player2]: { x: 785, y: 160 },
  [PLAYER_IDS.player3]: { x: 680, y: 82 },
  [PLAYER_IDS.player4]: { x: 800, y: 365 },
  [PLAYER_IDS.player5]: { x: 720, y: 520 },
};

function positions(
  changes: Partial<Record<(typeof PLAYER_IDS)[keyof typeof PLAYER_IDS], TacticalPoint>> = {},
): Readonly<Record<string, TacticalPoint>> {
  return { ...initialPositions, ...changes };
}

export const RAVI_STRATEGY: Strategy = {
  id: '56e5e659-d26e-4de4-8747-cc747ee63280',
  name: 'Ravi',
  description: 'Saque de portero, ruptura profunda y ocupación del ala contraria.',
  category: 'Salida de presión',
  season: '2026/27',
  players: [
    {
      id: PLAYER_IDS.goalkeeper,
      label: 'P',
      kind: 'goalkeeper',
      initialPosition: initialPositions[PLAYER_IDS.goalkeeper]!,
    },
    {
      id: PLAYER_IDS.player2,
      label: '2',
      kind: 'outfield',
      initialPosition: initialPositions[PLAYER_IDS.player2]!,
    },
    {
      id: PLAYER_IDS.player3,
      label: '3',
      kind: 'outfield',
      initialPosition: initialPositions[PLAYER_IDS.player3]!,
    },
    {
      id: PLAYER_IDS.player4,
      label: '4',
      kind: 'outfield',
      initialPosition: initialPositions[PLAYER_IDS.player4]!,
    },
    {
      id: PLAYER_IDS.player5,
      label: '5',
      kind: 'outfield',
      initialPosition: initialPositions[PLAYER_IDS.player5]!,
    },
  ],
  actions: [
    {
      id: ACTION_IDS.goalkeeperToPlayer2,
      type: 'pass',
      from: { x: 908, y: 279 },
      controlPoint: { x: 865, y: 220 },
      to: { x: 808, y: 182 },
    },
    {
      id: ACTION_IDS.player2ToPlayer3,
      type: 'pass',
      from: { x: 759, y: 141 },
      controlPoint: { x: 738, y: 112 },
      to: { x: 706, y: 101 },
    },
    {
      id: ACTION_IDS.player2DeepRun,
      type: 'run',
      from: { x: 754, y: 174 },
      controlPoint: { x: 520, y: 205 },
      to: { x: 264, y: 387 },
    },
    {
      id: ACTION_IDS.player5CrossRun,
      type: 'run',
      from: { x: 629, y: 209 },
      controlPoint: { x: 465, y: 175 },
      to: { x: 331, y: 101 },
    },
    {
      id: ACTION_IDS.player4BalanceRun,
      type: 'run',
      from: { x: 780, y: 340 },
      controlPoint: { x: 765, y: 325 },
      to: { x: 769, y: 325 },
    },
    {
      id: ACTION_IDS.player3SafetyPass,
      type: 'pass',
      from: { x: 532, y: 300 },
      controlPoint: { x: 620, y: 285 },
      to: { x: 716, y: 300 },
    },
  ],
  phases: [
    {
      id: 'e2ee74c5-25d3-4313-9bb9-ab195d73bac9',
      order: 1,
      title: 'Colocación inicial',
      description:
        'El equipo se ordena como en el gráfico. El portero observa qué lado permite iniciar la salida.',
      cue: 'Abrir la pista y ofrecer líneas de pase a distintas alturas.',
      ballPosition: { x: 910, y: 300 },
      playerPositions: positions(),
      visibleActionIds: [],
    },
    {
      id: '0b8e775d-7482-4e11-ae7e-b65ade3870da',
      order: 2,
      title: 'Saque hacia el cierre',
      description:
        'El portero juega con el cierre que queda libre. En este ejemplo, el receptor es el jugador 2.',
      cue: '2 perfila el cuerpo para ver a 3 y el campo contrario.',
      ballPosition: { x: 785, y: 160 },
      playerPositions: positions({ [PLAYER_IDS.player5]: { x: 660, y: 220 } }),
      visibleActionIds: [ACTION_IDS.goalkeeperToPlayer2],
    },
    {
      id: 'ab84cf86-c437-4c7e-8416-75e7ff69d6f6',
      order: 3,
      title: 'Pase y ruptura',
      description:
        '2 pasa a 3 y acelera hacia campo contrario, atacando un espacio distinto al ocupado por 3 y 5.',
      cue: 'El pase y la carrera deben solaparse para superar la primera presión.',
      ballPosition: { x: 680, y: 82 },
      playerPositions: positions({
        [PLAYER_IDS.player2]: { x: 235, y: 400 },
        [PLAYER_IDS.player5]: { x: 300, y: 90 },
      }),
      visibleActionIds: [ACTION_IDS.player2ToPlayer3, ACTION_IDS.player2DeepRun],
    },
    {
      id: '93b3c09f-32e4-4d2b-97ce-24d84d690a90',
      order: 4,
      title: '5 cruza al ala contraria',
      description:
        'Cuando 5 ve que 3 recibe, abandona su ala y cruza para generar triángulo, pared o una línea paralela.',
      cue: '5 busca profundidad sin cerrar la trayectoria de 2.',
      ballPosition: { x: 600, y: 175 },
      playerPositions: positions({
        [PLAYER_IDS.player2]: { x: 235, y: 400 },
        [PLAYER_IDS.player3]: { x: 600, y: 175 },
        [PLAYER_IDS.player5]: { x: 300, y: 90 },
      }),
      visibleActionIds: [ACTION_IDS.player2DeepRun, ACTION_IDS.player5CrossRun],
    },
    {
      id: '87af0fd4-59f4-461b-94c8-17333a3d9e5a',
      order: 5,
      title: '4 equilibra la salida',
      description:
        '4 hace balance y queda como opción segura de pase atrás. La estructura conserva amplitud y una salida limpia.',
      cue: 'Si no aparece ventaja delante, 3 puede descargar en 4 y reiniciar.',
      ballPosition: { x: 500, y: 300 },
      playerPositions: positions({
        [PLAYER_IDS.player2]: { x: 235, y: 400 },
        [PLAYER_IDS.player3]: { x: 500, y: 300 },
        [PLAYER_IDS.player4]: { x: 750, y: 300 },
        [PLAYER_IDS.player5]: { x: 300, y: 90 },
      }),
      visibleActionIds: [
        ACTION_IDS.player5CrossRun,
        ACTION_IDS.player4BalanceRun,
        ACTION_IDS.player3SafetyPass,
      ],
    },
  ],
};
