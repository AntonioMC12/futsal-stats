import { inject, Injectable } from '@angular/core';
import { Strategy, StrategyRepository } from '../../../features/strategies/domain/strategy';
import { SupabaseClientService } from '../../cloud/supabase-client.service';

export interface CloudStrategyRecord extends Strategy {
  deletedAt?: string | null;
}

@Injectable()
export class SupabaseStrategyRepository extends StrategyRepository {
  private readonly client = inject(SupabaseClientService).requireClient();

  override async list(teamId: string): Promise<readonly Strategy[]> {
    return (await this.listIncludingDeleted(teamId)).filter((strategy) => !strategy.deletedAt);
  }

  async listIncludingDeleted(teamId: string): Promise<CloudStrategyRecord[]> {
    const { data, error } = await this.client.from('strategies').select('*').eq('team_id', teamId);
    if (error) throw error;
    return (data ?? []).map(fromCloud);
  }

  override async get(id: string): Promise<Strategy | undefined> {
    const { data, error } = await this.client
      .from('strategies')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data && !data.deleted_at ? fromCloud(data) : undefined;
  }

  override async save(strategy: Strategy): Promise<void> {
    const { error } = await this.client.rpc('upsert_team_strategy', {
      p_strategy: toCloud(strategy),
    });
    if (error) throw error;
  }

  override async delete(id: string): Promise<void> {
    const { error } = await this.client.rpc('delete_team_strategy', { p_id: id });
    if (error) throw error;
  }
}

function fromCloud(row: Record<string, unknown>): CloudStrategyRecord {
  return {
    id: String(row['id']),
    teamId: String(row['team_id']),
    name: String(row['name']),
    variant: (row['variant'] as string | null) ?? undefined,
    description: String(row['description'] ?? ''),
    category: String(row['category'] ?? ''),
    season: (row['season'] as string | null) ?? undefined,
    phases: row['phases'] as Strategy['phases'],
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
    deletedAt: row['deleted_at'] as string | null,
  };
}

function toCloud(strategy: Strategy): Record<string, unknown> {
  return {
    id: strategy.id,
    team_id: strategy.teamId,
    name: strategy.name,
    variant: strategy.variant ?? null,
    description: strategy.description,
    category: strategy.category,
    season: strategy.season ?? null,
    phases: strategy.phases,
    created_at: strategy.createdAt,
    updated_at: strategy.updatedAt,
    deleted_at: null,
  };
}
