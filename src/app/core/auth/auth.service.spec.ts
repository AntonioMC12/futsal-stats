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

  it('requests a normalized email OTP without a redirect', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    configure(authClientMock({ signInWithOtp }));

    const auth = TestBed.inject(AuthService);
    await auth.requestEmailOtp(' Coach@Example.com ');

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'coach@example.com',
      options: { shouldCreateUser: true },
    });
    expect(auth.status()).toBe('codeSent');
  });

  it('verifies an email OTP and closes the local session explicitly', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ data: { session }, error: null });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    configure(authClientMock({ verifyOtp, signOut }));
    const auth = TestBed.inject(AuthService);

    await auth.verifyEmailOtp('coach@example.com', '123 456');
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

  it('reports request rate limiting without exposing the Supabase message', async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: { status: 429, message: 'internal detail' } });
    configure(authClientMock({ signInWithOtp }));
    await expect(TestBed.inject(AuthService).requestEmailOtp(' A@Example.com ')).rejects.toThrow(
      'Has realizado demasiados intentos',
    );
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it('reports an expired code and keeps the user signed out', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { session: null },
      error: { code: 'otp_expired', message: 'expired token' },
    });
    configure(authClientMock({ verifyOtp }));
    const auth = TestBed.inject(AuthService);
    await expect(auth.verifyEmailOtp(' A@Example.com ', '123456')).rejects.toThrow(
      'El código ha caducado',
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      email: 'a@example.com', token: '123456', type: 'email',
    });
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
