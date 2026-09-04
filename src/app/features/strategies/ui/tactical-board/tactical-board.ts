import { Component, computed, input } from '@angular/core';
import { Strategy, StrategyPhase, TacticalAction, TacticalPoint } from '../../domain/strategy';

@Component({
  selector: 'app-tactical-board',
  templateUrl: './tactical-board.html',
  styleUrl: './tactical-board.scss',
})
export class TacticalBoard {
  readonly strategy = input.required<Strategy>();
  readonly phase = input.required<StrategyPhase>();

  protected readonly visibleActions = computed(() => {
    const visibleIds = new Set(this.phase().visibleActionIds);
    return this.strategy().actions.filter((action) => visibleIds.has(action.id));
  });

  protected playerPosition(playerId: string): TacticalPoint {
    const player = this.strategy().players.find((candidate) => candidate.id === playerId);
    return this.phase().playerPositions[playerId] ?? player?.initialPosition ?? { x: 0, y: 0 };
  }

  protected translate(point: TacticalPoint): string {
    return `translate(${point.x}px, ${point.y}px)`;
  }

  protected actionPath(action: TacticalAction): string {
    const start = `M ${action.from.x} ${action.from.y}`;
    return action.controlPoint
      ? `${start} Q ${action.controlPoint.x} ${action.controlPoint.y} ${action.to.x} ${action.to.y}`
      : `${start} L ${action.to.x} ${action.to.y}`;
  }
}
