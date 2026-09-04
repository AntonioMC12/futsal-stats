export interface TacticalPoint {
  readonly x: number;
  readonly y: number;
}
export type TacticalPieceType = 'home-player' | 'away-player' | 'ball';
export interface TacticalPieceState {
  readonly pieceId: string;
  readonly type: TacticalPieceType;
  readonly playerId?: string;
  readonly number?: number;
  readonly label: string;
  readonly position: TacticalPoint;
}
export type TacticalActionType = 'pass' | 'movement';
export interface TacticalArrow {
  readonly id: string;
  readonly type: TacticalActionType;
  readonly from: TacticalPoint;
  readonly to: TacticalPoint;
  readonly sourcePieceId?: string;
  readonly targetPieceId?: string;
}
export interface StrategyPhase {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly cue: string;
  readonly durationMs: number;
  readonly pieces: readonly TacticalPieceState[];
  readonly arrows: readonly TacticalArrow[];
}
export interface Strategy {
  readonly id: string;
  readonly teamId: string;
  readonly name: string;
  readonly variant?: string;
  readonly description: string;
  readonly category: string;
  readonly season?: string;
  readonly phases: readonly StrategyPhase[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
export abstract class StrategyRepository {
  abstract list(teamId: string): Promise<readonly Strategy[]>;
  abstract get(id: string): Promise<Strategy | undefined>;
  abstract save(strategy: Strategy): Promise<void>;
  abstract delete(id: string): Promise<void>;
}
export type TacticalTool = 'select' | 'movement' | 'pass' | 'delete';
export const DEFAULT_SEQUENCE_DURATION_MS = 1_000;

export function clampCoordinate(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
export function normalizePoint(point: TacticalPoint): TacticalPoint {
  return { x: clampCoordinate(point.x), y: clampCoordinate(point.y) };
}
export function interpolatePoint(
  from: TacticalPoint,
  to: TacticalPoint,
  progress: number,
): TacticalPoint {
  const t = clampCoordinate(progress);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
export function createStrategy(
  teamId: string,
  homePlayers: readonly { id: string; number: number; name: string }[],
  createId: () => string,
  now = new Date().toISOString(),
): Strategy {
  if (!teamId) throw new Error('A strategy requires a team id.');
  const home = homePlayers.slice(0, 5).map<TacticalPieceState>((player, index) => ({
    pieceId: `home-${player.id}`,
    playerId: player.id,
    type: 'home-player',
    number: player.number,
    label: String(player.number),
    position: { x: 0.68 + (index % 2) * 0.14, y: 0.14 + index * 0.17 },
  }));
  while (home.length < 5) {
    const number = home.length + 1;
    home.push({
      pieceId: `home-${createId()}`,
      type: 'home-player',
      number,
      label: String(number),
      position: { x: 0.68 + (number % 2) * 0.14, y: 0.14 + (number - 1) * 0.17 },
    });
  }
  const away = Array.from({ length: 5 }, (_, index): TacticalPieceState => ({
    pieceId: `away-${createId()}`,
    type: 'away-player',
    number: index + 1,
    label: `R${index + 1}`,
    position: { x: 0.2 + (index % 2) * 0.14, y: 0.14 + index * 0.17 },
  }));
  const pieces: TacticalPieceState[] = [
    ...home,
    ...away,
    { pieceId: 'ball', type: 'ball', label: 'Balón', position: { x: 0.62, y: 0.5 } },
  ];
  return {
    id: createId(),
    teamId,
    name: 'Nueva jugada',
    description: 'Diseña la secuencia táctica.',
    category: 'Personalizada',
    createdAt: now,
    updatedAt: now,
    phases: [
      {
        id: createId(),
        order: 1,
        title: 'Secuencia 1',
        description: '',
        cue: '',
        durationMs: DEFAULT_SEQUENCE_DURATION_MS,
        pieces,
        arrows: [],
      },
    ],
  };
}
export function addSequence(
  strategy: Strategy,
  activeIndex: number,
  createId: () => string,
): Strategy {
  const source = strategy.phases[activeIndex] ?? strategy.phases.at(-1);
  if (!source) return strategy;
  const clone: StrategyPhase = {
    ...source,
    id: createId(),
    title: `Secuencia ${activeIndex + 2}`,
    pieces: source.pieces.map((piece) => ({ ...piece, position: { ...piece.position } })),
    arrows: [],
  };
  const phases = [...strategy.phases];
  phases.splice(activeIndex + 1, 0, clone);
  return withOrderedPhases(strategy, phases);
}
export function duplicateSequence(
  strategy: Strategy,
  activeIndex: number,
  createId: () => string,
): Strategy {
  const source = strategy.phases[activeIndex];
  if (!source) return strategy;
  const clone: StrategyPhase = {
    ...source,
    id: createId(),
    title: `${source.title} (copia)`,
    pieces: source.pieces.map((piece) => ({ ...piece, position: { ...piece.position } })),
    arrows: source.arrows.map((arrow) => ({
      ...arrow,
      id: createId(),
      from: { ...arrow.from },
      to: { ...arrow.to },
    })),
  };
  const phases = [...strategy.phases];
  phases.splice(activeIndex + 1, 0, clone);
  return withOrderedPhases(strategy, phases);
}
export function removeSequence(strategy: Strategy, index: number): Strategy {
  if (strategy.phases.length <= 1 || !strategy.phases[index]) return strategy;
  return withOrderedPhases(
    strategy,
    strategy.phases.filter((_, candidate) => candidate !== index),
  );
}
export function movePiece(
  strategy: Strategy,
  phaseIndex: number,
  pieceId: string,
  position: TacticalPoint,
): Strategy {
  return updatePhase(strategy, phaseIndex, (phase) => ({
    ...phase,
    pieces: phase.pieces.map((piece) =>
      piece.pieceId === pieceId ? { ...piece, position: normalizePoint(position) } : piece,
    ),
  }));
}
export function addArrow(strategy: Strategy, phaseIndex: number, arrow: TacticalArrow): Strategy {
  return updatePhase(strategy, phaseIndex, (phase) => ({
    ...phase,
    arrows: [
      ...phase.arrows,
      { ...arrow, from: normalizePoint(arrow.from), to: normalizePoint(arrow.to) },
    ],
  }));
}
export function removeArrow(strategy: Strategy, phaseIndex: number, arrowId: string): Strategy {
  return updatePhase(strategy, phaseIndex, (phase) => ({
    ...phase,
    arrows: phase.arrows.filter((arrow) => arrow.id !== arrowId),
  }));
}

export function updateArrowEndpoint(
  strategy: Strategy,
  phaseIndex: number,
  arrowId: string,
  endpoint: 'from' | 'to',
  position: TacticalPoint,
): Strategy {
  return updatePhase(strategy, phaseIndex, (phase) => ({
    ...phase,
    arrows: phase.arrows.map((arrow) =>
      arrow.id === arrowId ? { ...arrow, [endpoint]: normalizePoint(position) } : arrow,
    ),
  }));
}
export function updateTransitionDuration(
  strategy: Strategy,
  phaseIndex: number,
  durationMs: number,
): Strategy {
  return updatePhase(strategy, phaseIndex, (phase) => ({
    ...phase,
    durationMs: Math.max(200, Math.min(10_000, Math.round(durationMs))),
  }));
}
function updatePhase(
  strategy: Strategy,
  index: number,
  update: (phase: StrategyPhase) => StrategyPhase,
): Strategy {
  if (!strategy.phases[index]) return strategy;
  return {
    ...strategy,
    phases: strategy.phases.map((phase, candidate) =>
      candidate === index ? update(phase) : phase,
    ),
  };
}
function withOrderedPhases(strategy: Strategy, phases: readonly StrategyPhase[]): Strategy {
  return { ...strategy, phases: phases.map((phase, index) => ({ ...phase, order: index + 1 })) };
}
