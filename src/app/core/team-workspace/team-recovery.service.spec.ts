import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { OfflineSyncService } from '../sync/offline-sync.service';
import { TeamRecoveryService } from './team-recovery.service';

describe('TeamRecoveryService creation', () => {
  const team = {
    id: 'team-1',
    name: 'Team',
    shortName: 'TM',
    createdAt: 1,
    updatedAt: 1,
  };
  afterEach(() => TestBed.resetTestingModule());

  it('verifies identity and isolates the old cache before creating Team and OWNER', async () => {
    const order: string[] = [];
    const rpc = vi.fn().mockImplementation(async () => {
      order.push('rpc');
      return { data: [{ recovery_key: 'a'.repeat(64) }], error: null };
    });
    configure(
      {
        ensureValidDeviceIdentity: async () => {
          order.push('verify');
        },
        markAccessRestored: () => order.push('restored'),
      },
      rpc,
      {
        isolateOrphanedIdentity: async () => {
          order.push('isolate');
        },
      },
    );

    const key = await TestBed.inject(TeamRecoveryService).createTeam(team);
    expect(order).toEqual(['verify', 'isolate', 'rpc', 'restored']);
    expect(key).toMatch(/^FS-(A{8}-){7}A{8}$/);
    expect(rpc).toHaveBeenCalledWith('create_team_with_recovery_key', {
      p_team: expect.objectContaining({ id: 'team-1' }),
    });
  });

  it('never calls the Team creation RPC without verified identity', async () => {
    const rpc = vi.fn();
    configure(
      {
        ensureValidDeviceIdentity: async () => {
          throw new Error('No identity');
        },
        markAccessRestored: vi.fn(),
      },
      rpc,
      { isolateOrphanedIdentity: vi.fn() },
    );
    await expect(TestBed.inject(TeamRecoveryService).createTeam(team)).rejects.toThrow(
      'No identity',
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

function configure(
  auth: { ensureValidDeviceIdentity: () => Promise<void>; markAccessRestored: () => void },
  rpc: ReturnType<typeof vi.fn>,
  sync: { isolateOrphanedIdentity: () => Promise<void> },
): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: OfflineSyncService, useValue: sync },
      { provide: SupabaseClientService, useValue: { requireClient: () => ({ rpc }) } },
    ],
  });
}
