import { Component, input, output, signal } from '@angular/core';
import {
  Strategy,
  StrategyPhase,
  TacticalArrow,
  TacticalPieceState,
  TacticalPoint,
  TacticalTool,
} from '../../domain/strategy';

interface ArrowEndpoint {
  point: TacticalPoint;
  pieceId?: string;
}

const BOARD_WIDTH = 1000;
const BOARD_HEIGHT = 600;

function clampNormalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function pointerToBoardPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): TacticalPoint {
  const matrix = svg.getScreenCTM();
  if (matrix) {
    const pointer = svg.createSVGPoint();
    pointer.x = clientX;
    pointer.y = clientY;
    const local = pointer.matrixTransform(matrix.inverse());
    return {
      x: clampNormalized(local.x / BOARD_WIDTH),
      y: clampNormalized(local.y / BOARD_HEIGHT),
    };
  }

  // Fallback for environments without an SVG CTM. The board uses xMidYMid/meet,
  // so its rendered content can have horizontal or vertical letterboxing.
  const rect = svg.getBoundingClientRect();
  const scale = Math.min(rect.width / BOARD_WIDTH, rect.height / BOARD_HEIGHT);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0, y: 0 };
  const renderedWidth = BOARD_WIDTH * scale;
  const renderedHeight = BOARD_HEIGHT * scale;
  const left = rect.left + (rect.width - renderedWidth) / 2;
  const top = rect.top + (rect.height - renderedHeight) / 2;
  return {
    x: clampNormalized((clientX - left) / renderedWidth),
    y: clampNormalized((clientY - top) / renderedHeight),
  };
}

@Component({
  selector: 'app-tactical-board',
  templateUrl: './tactical-board.html',
  styleUrl: './tactical-board.scss',
})
export class TacticalBoard {
  readonly strategy = input.required<Strategy>();
  readonly phase = input.required<StrategyPhase>();
  readonly pieces = input.required<readonly TacticalPieceState[]>();
  readonly tool = input<TacticalTool>('select');
  readonly locked = input(false);
  readonly selectedArrowId = input<string | null>(null);
  readonly selectedPieceId = input<string | null>(null);
  readonly compact = input(false);
  readonly pieceMoved = output<{ pieceId: string; position: TacticalPoint }>();
  readonly arrowCreated = output<Omit<TacticalArrow, 'id'>>();
  readonly arrowSelected = output<string | null>();
  readonly deleteRequested = output<void>();
  readonly pieceSelected = output<string | null>();
  readonly arrowEndpointMoved = output<{
    arrowId: string;
    endpoint: 'from' | 'to';
    position: TacticalPoint;
  }>();
  protected readonly draftStart = signal<ArrowEndpoint | null>(null);
  private drag: {
    pointerId: number;
    pieceId: string;
    svg: SVGSVGElement;
    grabOffset: TacticalPoint;
  } | null = null;
  private arrowDrag: {
    pointerId: number;
    arrowId: string;
    endpoint: 'from' | 'to';
    svg: SVGSVGElement;
  } | null = null;

  protected position(point: TacticalPoint): string {
    return `translate(${point.x * 1000}px, ${point.y * 600}px)`;
  }
  protected arrowPath(arrow: TacticalArrow): string {
    return `M ${arrow.from.x * 1000} ${arrow.from.y * 600} L ${arrow.to.x * 1000} ${arrow.to.y * 600}`;
  }
  protected draftPosition(point: TacticalPoint): string {
    return `translate(${point.x * 1000}px, ${point.y * 600}px)`;
  }

  protected boardPointerDown(event: PointerEvent): void {
    if (this.locked()) return;
    if (this.tool() === 'pass' || this.tool() === 'movement') {
      event.preventDefault();
      this.consumeArrowEndpoint({ point: this.toPoint(event) });
    } else {
      this.arrowSelected.emit(null);
      this.pieceSelected.emit(null);
    }
  }
  protected piecePointerDown(event: PointerEvent, piece: TacticalPieceState): void {
    if (this.locked()) return;
    event.stopPropagation();
    if (this.tool() === 'pass' || this.tool() === 'movement') {
      event.preventDefault();
      this.consumeArrowEndpoint({ point: piece.position, pieceId: piece.pieceId });
      return;
    }
    if (this.tool() !== 'select') return;
    this.pieceSelected.emit(piece.pieceId);
    this.arrowSelected.emit(null);
    event.preventDefault();
    const svg = (event.currentTarget as SVGElement).ownerSVGElement;
    if (!svg) return;
    const pointer = this.toPoint(event, svg);
    this.drag = {
      pointerId: event.pointerId,
      pieceId: piece.pieceId,
      svg,
      grabOffset: {
        x: pointer.x - piece.position.x,
        y: pointer.y - piece.position.y,
      },
    };
    (
      event.currentTarget as Element & { setPointerCapture?: (id: number) => void }
    ).setPointerCapture?.(event.pointerId);
  }
  protected piecePointerMove(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    event.preventDefault();
    const pointer = this.toPoint(event, this.drag.svg);
    this.pieceMoved.emit({
      pieceId: this.drag.pieceId,
      position: {
        x: clampNormalized(pointer.x - this.drag.grabOffset.x),
        y: clampNormalized(pointer.y - this.drag.grabOffset.y),
      },
    });
  }
  protected piecePointerEnd(event: PointerEvent): void {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    (
      event.currentTarget as Element & { releasePointerCapture?: (id: number) => void }
    ).releasePointerCapture?.(event.pointerId);
    this.drag = null;
  }
  protected pieceKeydown(event: KeyboardEvent, piece: TacticalPieceState): void {
    if (this.locked() || this.tool() !== 'select') return;
    const delta = 0.02;
    let position: TacticalPoint | null = null;
    if (event.key === 'ArrowLeft') position = { x: piece.position.x - delta, y: piece.position.y };
    else if (event.key === 'ArrowRight')
      position = { x: piece.position.x + delta, y: piece.position.y };
    else if (event.key === 'ArrowUp')
      position = { x: piece.position.x, y: piece.position.y - delta };
    else if (event.key === 'ArrowDown')
      position = { x: piece.position.x, y: piece.position.y + delta };
    if (position) {
      event.preventDefault();
      event.stopPropagation();
      this.pieceMoved.emit({ pieceId: piece.pieceId, position });
    }
  }
  protected arrowPointerDown(event: PointerEvent, id: string): void {
    if (this.locked()) return;
    event.stopPropagation();
    event.preventDefault();
    this.arrowSelected.emit(id);
    if (this.tool() === 'delete') this.deleteRequested.emit();
  }
  protected arrowHandleDown(event: PointerEvent, arrowId: string, endpoint: 'from' | 'to'): void {
    if (this.locked()) return;
    event.preventDefault();
    event.stopPropagation();
    const svg = (event.currentTarget as SVGElement).ownerSVGElement;
    if (!svg) return;
    this.arrowDrag = { pointerId: event.pointerId, arrowId, endpoint, svg };
    (
      event.currentTarget as Element & { setPointerCapture?: (id: number) => void }
    ).setPointerCapture?.(event.pointerId);
  }
  protected arrowHandleMove(event: PointerEvent): void {
    if (!this.arrowDrag || event.pointerId !== this.arrowDrag.pointerId) return;
    event.preventDefault();
    this.arrowEndpointMoved.emit({
      arrowId: this.arrowDrag.arrowId,
      endpoint: this.arrowDrag.endpoint,
      position: this.toPoint(event, this.arrowDrag.svg),
    });
  }
  protected arrowHandleEnd(event: PointerEvent): void {
    if (!this.arrowDrag || event.pointerId !== this.arrowDrag.pointerId) return;
    (
      event.currentTarget as Element & { releasePointerCapture?: (id: number) => void }
    ).releasePointerCapture?.(event.pointerId);
    this.arrowDrag = null;
  }
  protected keydown(event: KeyboardEvent): void {
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedArrowId()) {
      event.preventDefault();
      this.deleteRequested.emit();
    }
    if (event.key === 'Escape') {
      this.draftStart.set(null);
      this.arrowSelected.emit(null);
    }
  }
  private consumeArrowEndpoint(endpoint: ArrowEndpoint): void {
    const start = this.draftStart();
    if (!start) {
      this.draftStart.set(endpoint);
      return;
    }
    this.arrowCreated.emit({
      type: this.tool() as 'pass' | 'movement',
      from: start.point,
      to: endpoint.point,
      sourcePieceId: start.pieceId,
      targetPieceId: endpoint.pieceId,
    });
    this.draftStart.set(null);
  }
  private toPoint(
    event: PointerEvent,
    svg = (event.currentTarget as SVGElement).ownerSVGElement ??
      (event.currentTarget as SVGSVGElement),
  ): TacticalPoint {
    return pointerToBoardPoint(svg, event.clientX, event.clientY);
  }
}
