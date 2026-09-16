import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';

export type AuthStatus =
  'disabled' | 'loading' | 'signedOut' | 'codeSent' | 'authenticated' | 'error';

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

  async requestEmailOtp(email: string): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new Error('Introduce un email válido.');
    this.status.set('loading');
    this.error.set(null);
    try {
      const { error } = await this.supabase.requireClient().auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      this.status.set('codeSent');
    } catch (error) {
      this.fail(error);
      throw new Error(authErrorMessage(error, 'request'));
    }
  }

  async verifyEmailOtp(email: string, token: string): Promise<void> {
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
    } catch (error) {
      this.fail(error);
      throw new Error(authErrorMessage(error, 'verify'));
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
    console.error('auth_failed');
    this.error.set('No se ha podido completar la autenticación.');
    this.status.set('error');
  }
}

function authErrorMessage(error: unknown, action: 'request' | 'verify'): string {
  const details = error as { status?: number; code?: string; message?: string } | null;
  const code = details?.code ?? '';
  const message = details?.message?.toLowerCase() ?? '';
  if (details?.status === 429 || code.includes('rate_limit'))
    return 'Has realizado demasiados intentos. Espera un momento antes de volver a intentarlo.';
  if (message.includes('network') || message.includes('fetch'))
    return 'No se ha podido contactar con el servicio. Comprueba tu conexión e inténtalo de nuevo.';
  if (action === 'verify') {
    if (code.includes('expired') || message.includes('expired'))
      return 'El código ha caducado. Solicita uno nuevo.';
    return 'El código introducido no es válido.';
  }
  return 'No hemos podido enviar el código. Inténtalo de nuevo.';
}
