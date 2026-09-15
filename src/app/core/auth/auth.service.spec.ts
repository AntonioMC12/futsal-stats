import { TestBed } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const session = {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: 'user-1', email: 'coach@example.com' },
  } as Session;

  afterEach(() => TestBed.resetTestingModule());

  it('restores the persistent Supabase session', async () => {
    const authClient = authClientMock({
      getSession: async () => ({ data: { session }, error: null }),
    });
    configure(authClient);

    const auth = TestBed.inject(AuthService);
    await auth.initialize();

    expect(auth.authenticated()).toBe(true);
    expect(auth.user()?.id).toBe('user-1');
    expect(auth.email()).toBe('coach@example.com');
  });

  it('requests a passwordless login while preserving a safe private redirect', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    configure(authClientMock({ signInWithOtp }));

    const auth = TestBed.inject(AuthService);
    await auth.requestAccess(' Coach@Example.com ', '/join?code=ABC');

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      options: {
        emailRedirectTo: expect.stringContaining('/auth/callback?redirect=%2Fjoin%3Fcode%3DABC'),
        shouldCreateUser: true,
      },
    });
    expect(auth.status()).toBe('linkSent');
  });

  it('verifies an email OTP and closes the local session explicitly', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session }, error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    configure(authClientMock({ verifyOtp, signOut }));
    const auth = TestBed.inject(AuthService);

    await auth.verifyAccessCode('coach@example.com', '123 456');
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      token: '123456',
      type: 'email',
    });
    expect(auth.authenticated()).toBe(true);

    await auth.signOut();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(auth.authenticated()).toBe(false);
  });
});

function configure(authClient: Record<string, unknown>): void {
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
      { provide: SupabaseClientService, useValue: { requireClient: () => ({ auth: authClient }) } },
    ],
  });
}

function authClientMock(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ data: { session: null }, error: null }),
    signOut: async () => ({ error: null }),
    ...overrides,
  };
}
