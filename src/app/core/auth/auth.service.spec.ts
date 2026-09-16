import { TestBed } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { AuthService } from './auth.service';

describe('AuthService device identity', () => {
  const oldSession = { user: { id: 'device-old' } } as Session;
  const newSession = { user: { id: 'device-new' } } as Session;
  afterEach(() => TestBed.resetTestingModule());

  it('reuses a remotely verified persisted identity', async () => {
    const authClient = configure({
      getSession: vi.fn().mockResolvedValue({ data: { session: oldSession }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: oldSession.user }, error: null }),
    });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.user()?.id).toBe('device-old');
    expect(auth.remotelyVerified()).toBe(true);
    expect(authClient.signInAnonymously).not.toHaveBeenCalled();
    expect(authClient.signOut).not.toHaveBeenCalled();
  });

  it('creates one anonymous identity when no session exists, even with ten concurrent callers', async () => {
    const authClient = configure({
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: newSession, user: newSession.user },
        error: null,
      }),
    });
    const auth = TestBed.inject(AuthService);
    await Promise.all(Array.from({ length: 10 }, () => auth.initialize()));
    expect(authClient.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(auth.user()?.id).toBe('device-new');
  });

  it('replaces an orphaned identity and requires Team reenrollment', async () => {
    const authClient = configure({
      getSession: vi.fn().mockResolvedValue({ data: { session: oldSession }, error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { status: 403, code: 'user_not_found' },
      }),
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: newSession, user: newSession.user },
        error: null,
      }),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const auth = TestBed.inject(AuthService);
      await auth.initialize();
      expect(authClient.signOut).toHaveBeenCalledWith({ scope: 'local' });
      expect(authClient.signInAnonymously).toHaveBeenCalledTimes(1);
      expect(auth.user()?.id).toBe('device-new');
      expect(auth.orphanedUserId()).toBe('device-old');
      expect(auth.reenrollmentRequired()).toBe(true);
      expect(warning).toHaveBeenCalledWith('auth_orphan_session_detected');
    } finally {
      warning.mockRestore();
    }
  });

  it('keeps a stored session available offline without claiming remote verification', async () => {
    const authClient = configure({
      getSession: vi.fn().mockResolvedValue({ data: { session: oldSession }, error: null }),
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: null }, error: { message: 'fetch failed' } }),
    });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.authenticated()).toBe(true);
    expect(auth.remotelyVerified()).toBe(false);
    await expect(auth.ensureValidDeviceIdentity()).rejects.toEqual({ message: 'fetch failed' });
    expect(authClient.signOut).not.toHaveBeenCalled();
    expect(authClient.signInAnonymously).not.toHaveBeenCalled();
  });

  it('revalidates just before a cloud mutation and replaces a user deleted after bootstrap', async () => {
    const getSession = vi
      .fn()
      .mockResolvedValueOnce({ data: { session: oldSession }, error: null })
      .mockResolvedValueOnce({ data: { session: oldSession }, error: null })
      .mockResolvedValueOnce({ data: { session: oldSession }, error: null });
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({ data: { user: oldSession.user }, error: null })
      .mockResolvedValueOnce({
        data: { user: null },
        error: { status: 403, code: 'user_not_found' },
      });
    configure({
      getSession,
      getUser,
      signInAnonymously: vi.fn().mockResolvedValue({
        data: { session: newSession, user: newSession.user },
        error: null,
      }),
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const auth = TestBed.inject(AuthService);
      await auth.initialize();
      expect(auth.user()?.id).toBe('device-old');
      const verified = await auth.ensureValidDeviceIdentity();
      expect(verified.user.id).toBe('device-new');
      expect(auth.user()?.id).toBe('device-new');
    } finally {
      warning.mockRestore();
    }
  });

  it('does not register when getSession fails', async () => {
    const authClient = configure({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: null }, error: new Error('storage') }),
    });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.status()).toBe('error');
    expect(authClient.signInAnonymously).not.toHaveBeenCalled();
  });
});

function configure(overrides: Record<string, unknown> = {}) {
  const auth = {
    onAuthStateChange: vi
      .fn()
      .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn(),
    signInAnonymously: vi.fn(),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
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
      { provide: SupabaseClientService, useValue: { requireClient: () => ({ auth }) } },
    ],
  });
  return auth;
}
