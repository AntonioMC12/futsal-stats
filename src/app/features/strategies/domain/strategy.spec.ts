import {
  addArrow,
  addSequence,
  createStrategy,
  duplicateSequence,
  interpolatePoint,
  movePiece,
  removeArrow,
  removeSequence,
  updateTransitionDuration,
  updateArrowEndpoint,
} from './strategy';
describe('tactical strategy domain', () => {
  let id = 0;
  const nextId = () => `id-${++id}`;
  it('creates a complete normalized board tied to a team', () => {
    const strategy = createStrategy('team-1', [{ id: 'p1', number: 7, name: 'Alex' }], nextId);
    expect(strategy.teamId).toBe('team-1');
    expect(strategy.phases[0]?.pieces).toHaveLength(11);
    expect(
      strategy.phases[0]?.pieces.every(
        ({ position }) => position.x >= 0 && position.x <= 1 && position.y >= 0 && position.y <= 1,
      ),
    ).toBe(true);
  });
  it('adds and duplicates sequences with stable piece ids and unique own ids', () => {
    const original = createStrategy('team-1', [], nextId);
    const added = addSequence(original, 0, nextId);
    expect(added.phases.map(({ order }) => order)).toEqual([1, 2]);
    expect(added.phases[1]?.pieces.map(({ pieceId }) => pieceId)).toEqual(
      added.phases[0]?.pieces.map(({ pieceId }) => pieceId),
    );
    expect(added.phases[1]?.id).not.toBe(added.phases[0]?.id);
    expect(added.phases[1]?.arrows).toEqual([]);
    const duplicated = duplicateSequence(added, 0, nextId);
    expect(duplicated.phases).toHaveLength(3);
  });
  it('keeps one sequence, reorders removals, clamps movement and durations', () => {
    const strategy = addSequence(createStrategy('team-1', [], nextId), 0, nextId);
    const piece = strategy.phases[0]!.pieces[0]!;
    const moved = movePiece(strategy, 0, piece.pieceId, { x: -3, y: 4 });
    expect(moved.phases[0]!.pieces[0]!.position).toEqual({ x: 0, y: 1 });
    expect(updateTransitionDuration(moved, 0, 50).phases[0]?.durationMs).toBe(200);
    const reduced = removeSequence(moved, 0);
    expect(reduced.phases).toHaveLength(1);
    expect(removeSequence(reduced, 0)).toBe(reduced);
  });
  it('creates and removes arrows and interpolates endpoints', () => {
    const strategy = createStrategy('team-1', [], nextId);
    const arrow = {
      id: 'arrow-1',
      type: 'pass' as const,
      from: { x: -1, y: 0.2 },
      to: { x: 0.8, y: 2 },
    };
    const withArrow = addArrow(strategy, 0, arrow);
    expect(withArrow.phases[0]?.arrows[0]?.from.x).toBe(0);
    expect(removeArrow(withArrow, 0, arrow.id).phases[0]?.arrows).toEqual([]);
    expect(
      updateArrowEndpoint(withArrow, 0, arrow.id, 'to', { x: 2, y: 0.4 }).phases[0]?.arrows[0]?.to,
    ).toEqual({ x: 1, y: 0.4 });
    expect(interpolatePoint({ x: 0, y: 0.2 }, { x: 1, y: 0.8 }, 0.5)).toEqual({ x: 0.5, y: 0.5 });
  });
});
