import { TestBed } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { AuthService } from './auth.service';

describe('AuthService device identity', () => {
  const session = { user: { id: 'device-1' } } as Session;
  afterEach(() => TestBed.resetTestingModule());

  it('restores the same identity without creating another', async () => {
    const signInAnonymously = vi.fn();
    configure({
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signInAnonymously,
    });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.user()?.id).toBe('device-1');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });

  it('creates one anonymous session for concurrent initializations', async () => {
    const signInAnonymously = vi.fn().mockResolvedValue({ data: { session }, error: null });
    configure({ signInAnonymously });
    const auth = TestBed.inject(AuthService);
    await Promise.all([auth.initialize(), auth.initialize(), auth.initialize()]);
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
    expect(auth.authenticated()).toBe(true);
  });

  it('reports anonymous authentication failures without repeating registration', async () => {
    const signInAnonymously = vi
      .fn()
      .mockResolvedValue({ data: { session: null }, error: new Error('denied') });
    configure({ signInAnonymously });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    await auth.initialize();
    expect(auth.status()).toBe('error');
    expect(signInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('does not create a new identity when session restoration fails', async () => {
    const signInAnonymously = vi.fn();
    configure({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: new Error('storage unavailable') }),
      signInAnonymously,
    });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.status()).toBe('error');
    expect(signInAnonymously).not.toHaveBeenCalled();
  });
});

function configure(overrides: Record<string, unknown>): void {
  const auth = {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInAnonymously: vi.fn(),
    ...overrides,
  };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CLOUD_CONFIG,
        useValue: {
          mode: 'cloud',
          supabaseUrl: 'https://example.supabase.co',
          publishableKey: 'public-key',
        },
      },
      { provide: SupabaseClientService, useValue: { requireClient: () => ({ auth }) } },
    ],
  });
}
