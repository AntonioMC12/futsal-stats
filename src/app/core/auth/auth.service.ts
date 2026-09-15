import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';

export type AuthStatus =
  'disabled' | 'loading' | 'signedOut' | 'linkSent' | 'authenticated' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(CLOUD_CONFIG);
  private readonly supabase = inject(SupabaseClientService);
  private readonly destroyRef = inject(DestroyRef);
  private initialization: Promise<void> | null = null;

  readonly status = signal<AuthStatus>(this.config.mode === 'cloud' ? 'loading' : 'disabled');
  readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly authenticated = computed(
    () => this.config.mode === 'local' || this.status() === 'authenticated',
  );
  readonly email = computed(() => this.user()?.email ?? null);
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.config.mode !== 'cloud') return;
    const { data } = this.supabase.requireClient().auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (session) {
        this.status.set('authenticated');
        this.error.set(null);
      } else if (event === 'SIGNED_OUT') {
        this.status.set('signedOut');
      }
    });
    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
  }

  initialize(): Promise<void> {
    this.initialization ??= this.restoreSession();
    return this.initialization;
  }

  async requestAccess(email: string, redirectPath: string | null = null): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Introduce un email válido.');
    this.status.set('loading');
    this.error.set(null);
    try {
      const redirectTo = new URL(
        '/auth/callback',
        globalThis.location?.origin ?? 'http://localhost',
      );
      if (isSafeApplicationPath(redirectPath)) {
        redirectTo.searchParams.set('redirect', redirectPath);
      }
      const { error } = await this.supabase.requireClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { emailRedirectTo: redirectTo.href, shouldCreateUser: true },
      });
      if (error) throw error;
      this.status.set('linkSent');
      console.info('auth_access_requested');
    } catch (error) {
      this.fail(error);
      throw new Error('No se ha podido enviar el acceso. Inténtalo de nuevo.');
    }
  }

  async verifyAccessCode(email: string, token: string): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    this.status.set('loading');
    this.error.set(null);
    try {
      const { data, error } = await this.supabase.requireClient().auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: token.replace(/\s/g, ''),
        type: 'email',
      });
      if (error) throw error;
      if (!data.session) throw new Error('Supabase did not return an authenticated session.');
      this.session.set(data.session);
      this.status.set('authenticated');
      console.info('auth_signed_in');
    } catch (error) {
      this.fail(error);
      throw new Error('El código no es válido o ha caducado.');
    }
  }

  async signOut(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    const { error } = await this.supabase.requireClient().auth.signOut({ scope: 'local' });
    if (error) {
      this.fail(error);
      throw new Error('No se ha podido cerrar la sesión.');
    }
    this.session.set(null);
    this.status.set('signedOut');
    console.info('auth_signed_out');
  }

  private async restoreSession(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    this.status.set('loading');
    try {
      const { data, error } = await this.supabase.requireClient().auth.getSession();
      if (error) throw error;
      this.session.set(data.session);
      this.status.set(data.session ? 'authenticated' : 'signedOut');
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    console.error('auth_failed', error instanceof Error ? error.message : String(error));
    this.error.set('No se ha podido completar la autenticación.');
    this.status.set('error');
  }
}

function isSafeApplicationPath(value: string | null): value is string {
  return Boolean(value?.startsWith('/') && !value.startsWith('//'));
}
