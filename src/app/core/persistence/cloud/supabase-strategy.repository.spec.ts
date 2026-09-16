import { TestBed } from '@angular/core/testing';
import { SupabaseClientService } from '../../cloud/supabase-client.service';
import { createStrategy } from '../../../features/strategies/domain/strategy';
import { SupabaseStrategyRepository } from './supabase-strategy.repository';

describe('SupabaseStrategyRepository', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('round-trips ordered phases and enforces the Team RPC on save', async () => {
    const strategy = createStrategy('e9a71552-45e6-47e8-b7ef-a7746704864c', [], () => crypto.randomUUID());
    const row = {
      id: strategy.id, team_id: strategy.teamId, name: strategy.name,
      description: strategy.description, category: strategy.category,
      phases: strategy.phases, created_at: strategy.createdAt,
      updated_at: strategy.updatedAt, deleted_at: null,
    };
    const eq = vi.fn().mockResolvedValue({ data: [row], error: null });
    const rpc = vi.fn().mockResolvedValue({ error: null });
    TestBed.configureTestingModule({ providers: [
      SupabaseStrategyRepository,
      { provide: SupabaseClientService, useValue: { requireClient: () => ({
        from: () => ({ select: () => ({ eq }) }), rpc,
      }) } },
    ] });
    const repository = TestBed.inject(SupabaseStrategyRepository);
    expect((await repository.list(strategy.teamId))[0]?.phases).toEqual(strategy.phases);
    await repository.save(strategy);
    expect(rpc).toHaveBeenCalledWith('upsert_team_strategy', {
      p_strategy: expect.objectContaining({ team_id: strategy.teamId, phases: strategy.phases }),
    });
    await repository.delete(strategy.id);
    expect(rpc).toHaveBeenCalledWith('delete_team_strategy', { p_id: strategy.id });
  });
});
