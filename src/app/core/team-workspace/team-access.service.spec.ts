import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
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
        {
          provide: AuthService,
          useValue: {
            initialize: async () => undefined,
            user: () => ({ id: 'user-1' }),
          },
        },
      ],
    });
    const access = TestBed.inject(TeamAccessService);
    await access.load('team-1');
    expect(access.role()).toBe(role);
    expect(access.canWrite()).toBe(canWrite);
  });

  it('uses the last verified role for the same user and team while offline', async () => {
    localStorage.setItem('futsal-stats.team-role.user-1.team-1', 'editor');
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
          useValue: {
            requireClient: () => ({ rpc: async () => Promise.reject(new Error('offline')) }),
          },
        },
        {
          provide: AuthService,
          useValue: { initialize: async () => undefined, user: () => ({ id: 'user-1' }) },
        },
      ],
    });

    const access = TestBed.inject(TeamAccessService);
    await access.load('team-1');

    expect(access.role()).toBe('editor');
    expect(access.canWrite()).toBe(true);
  });

  it('removes OWNER write access when the authenticated device identity changes', async () => {
    const user = signal<{ id: string }>({ id: 'old-user' });
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
          useValue: {
            requireClient: () => ({ rpc: async () => ({ data: 'owner', error: null }) }),
          },
        },
        { provide: AuthService, useValue: { initialize: async () => undefined, user } },
      ],
    });
    const access = TestBed.inject(TeamAccessService);
    await access.load('team-1');
    expect(access.canWrite()).toBe(true);

    user.set({ id: 'new-user' });
    TestBed.tick();
    expect(access.role()).toBe('viewer');
    expect(access.canWrite()).toBe(false);
  });
});
