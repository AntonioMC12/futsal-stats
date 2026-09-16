import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from '../cloud/cloud.config';
import { SupabaseClientService } from '../cloud/supabase-client.service';

export type AuthStatus = 'disabled' | 'loading' | 'authenticated' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(CLOUD_CONFIG);
  private readonly supabase = inject(SupabaseClientService);
  private readonly destroyRef = inject(DestroyRef);
  private initialization: Promise<void> | null = null;
  private revalidation: Promise<Session> | null = null;
  private replacingIdentity = false;

  readonly status = signal<AuthStatus>(this.config.mode === 'cloud' ? 'loading' : 'disabled');
  readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly authenticated = computed(
    () => this.config.mode === 'local' || this.status() === 'authenticated',
  );
  readonly remotelyVerified = signal(false);
  readonly orphanedUserId = signal<string | null>(null);
  readonly reenrollmentRequired = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.config.mode !== 'cloud') return;
    const { data } = this.supabase.requireClient().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        const wasAuthenticated = this.status() === 'authenticated';
        this.session.set(null);
        this.remotelyVerified.set(false);
        this.status.set('loading');
        if (wasAuthenticated && !this.replacingIdentity) this.initialization = null;
      } else if (
        session &&
        this.status() === 'authenticated' &&
        session.user.id === this.session()?.user.id
      ) {
        this.session.set(session);
      }
    });
    this.destroyRef.onDestroy(() => data.subscription.unsubscribe());
  }

  initialize(): Promise<void> {
    this.initialization ??= this.restoreOrCreateSession();
    return this.initialization;
  }

  retry(): Promise<void> {
    if (this.status() === 'error') this.initialization = null;
    return this.initialize();
  }

  async ensureValidDeviceIdentity(): Promise<Session> {
    if (this.config.mode !== 'cloud') throw new Error('La identidad cloud no está configurada.');
    await this.initialize();
    if (!this.authenticated()) throw new Error(this.error() ?? 'No hay identidad válida.');
    this.revalidation ??= this.verifyForCloudMutation().finally(() => (this.revalidation = null));
    return this.revalidation;
  }

  markAccessRestored(): void {
    this.reenrollmentRequired.set(false);
  }

  private async restoreOrCreateSession(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    this.status.set('loading');
    this.error.set(null);
    try {
      const client = this.supabase.requireClient();
      const restored = await client.auth.getSession();
      if (restored.error) throw restored.error;
      const session = restored.data.session
        ? await this.validateOrRecover(restored.data.session, true)
        : await this.createAnonymousSession();
      this.session.set(session);
      this.status.set('authenticated');
    } catch {
      this.session.set(null);
      this.remotelyVerified.set(false);
      this.error.set('No se ha podido iniciar este dispositivo. Comprueba la conexión.');
      this.status.set('error');
    }
  }

  private async verifyForCloudMutation(): Promise<Session> {
    const client = this.supabase.requireClient();
    const restored = await client.auth.getSession();
    if (restored.error) throw restored.error;
    if (!restored.data.session)
      throw new Error('La sesión de este dispositivo ya no está disponible.');
    const session = await this.validateOrRecover(restored.data.session, false);
    this.session.set(session);
    this.status.set('authenticated');
    return session;
  }

  private async validateOrRecover(session: Session, allowOffline: boolean): Promise<Session> {
    const client = this.supabase.requireClient();
    const verified = await client.auth.getUser();
    if (verified.error) {
      if (allowOffline && !isInvalidIdentity(verified.error)) {
        this.remotelyVerified.set(false);
        return session;
      }
      if (!isInvalidIdentity(verified.error)) throw verified.error;
      return this.replaceOrphanedIdentity(session.user.id);
    }
    if (!verified.data.user || verified.data.user.id !== session.user.id) {
      return this.replaceOrphanedIdentity(session.user.id);
    }
    const refreshed = await client.auth.getSession();
    if (refreshed.error) throw refreshed.error;
    if (!refreshed.data.session || refreshed.data.session.user.id !== verified.data.user.id) {
      throw new Error('La sesión cambió durante su validación.');
    }
    this.remotelyVerified.set(true);
    return refreshed.data.session;
  }

  private async replaceOrphanedIdentity(oldUserId: string): Promise<Session> {
    console.warn('auth_orphan_session_detected');
    this.orphanedUserId.set(oldUserId);
    this.reenrollmentRequired.set(true);
    this.remotelyVerified.set(false);
    this.replacingIdentity = true;
    try {
      const signedOut = await this.supabase.requireClient().auth.signOut({ scope: 'local' });
      if (signedOut.error) throw signedOut.error;
      return await this.createAnonymousSession();
    } finally {
      this.replacingIdentity = false;
    }
  }

  private async createAnonymousSession(): Promise<Session> {
    const created = await this.supabase.requireClient().auth.signInAnonymously();
    if (created.error) throw created.error;
    if (
      !created.data.session ||
      !created.data.user ||
      created.data.session.user.id !== created.data.user.id
    ) {
      throw new Error('Supabase did not return a valid device identity.');
    }
    this.remotelyVerified.set(true);
    return created.data.session;
  }
}

function isInvalidIdentity(error: unknown): boolean {
  const candidate = error as { status?: number; code?: string; message?: string } | null;
  if (candidate?.status === 401 || candidate?.status === 403) return true;
  if (
    [
      'user_not_found',
      'session_not_found',
      'bad_jwt',
      'invalid_token',
      'refresh_token_not_found',
      'invalid_refresh_token',
    ].includes(candidate?.code ?? '')
  )
    return true;
  return /user.+(not found|does not exist)/i.test(candidate?.message ?? '');
}
