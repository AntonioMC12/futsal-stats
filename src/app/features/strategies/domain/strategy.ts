export interface TacticalPoint {
  readonly x: number;
  readonly y: number;
}

export type TacticalPlayerKind = 'goalkeeper' | 'outfield';

export interface TacticalPlayer {
  readonly id: string;
  readonly label: string;
  readonly kind: TacticalPlayerKind;
  readonly initialPosition: TacticalPoint;
}

export type TacticalActionType = 'pass' | 'run';

export interface TacticalAction {
  readonly id: string;
  readonly type: TacticalActionType;
  readonly from: TacticalPoint;
  readonly to: TacticalPoint;
  readonly controlPoint?: TacticalPoint;
}

export interface StrategyPhase {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly description: string;
  readonly cue: string;
  readonly ballPosition: TacticalPoint;
  readonly playerPositions: Readonly<Record<string, TacticalPoint>>;
  readonly visibleActionIds: readonly string[];
}

export interface Strategy {
  readonly id: string;
  readonly teamId?: string;
  readonly name: string;
  readonly variant?: string;
  readonly description: string;
  readonly category: string;
  readonly season?: string;
  readonly players: readonly TacticalPlayer[];
  readonly actions: readonly TacticalAction[];
  readonly phases: readonly StrategyPhase[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

export abstract class StrategyRepository {
  abstract list(teamId?: string): Promise<readonly Strategy[]>;
  abstract get(id: string): Promise<Strategy | undefined>;
}
