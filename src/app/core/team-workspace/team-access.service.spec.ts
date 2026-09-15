import { TestBed } from '@angular/core/testing';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { TeamAccessService } from './team-access.service';

describe('TeamAccessService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('allows writes in local mode', async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: CLOUD_CONFIG, useValue: { mode: 'local', supabaseUrl: '', publishableKey: '' } },
      ],
    });
    const access = TestBed.inject(TeamAccessService);
    await access.load('team-1');
    expect(access.role()).toBe('owner');
    expect(access.canWrite()).toBe(true);
  });

  it.each([
    ['editor', true],
    ['viewer', false],
  ] as const)('maps the cloud %s role to write access', async (role, canWrite) => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CLOUD_CONFIG,
          useValue: {
            mode: 'cloud',
            supabaseUrl: 'https://example.supabase.co',
            publishableKey: 'key',
          },
        },
        {
          provide: SupabaseClientService,
          useValue: { requireClient: () => ({ rpc: async () => ({ data: role, error: null }) }) },
        },
      ],
    });
    const access = TestBed.inject(TeamAccessService);
    await access.load('team-1');
    expect(access.role()).toBe(role);
    expect(access.canWrite()).toBe(canWrite);
  });
});
