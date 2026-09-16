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

  readonly status = signal<AuthStatus>(this.config.mode === 'cloud' ? 'loading' : 'disabled');
  readonly session = signal<Session | null>(null);
  readonly user = computed<User | null>(() => this.session()?.user ?? null);
  readonly authenticated = computed(
    () => this.config.mode === 'local' || this.status() === 'authenticated',
  );
  readonly error = signal<string | null>(null);

  constructor() {
    if (this.config.mode !== 'cloud') return;
    const { data } = this.supabase.requireClient().auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (session) {
        this.status.set('authenticated');
        this.error.set(null);
      } else if (event === 'SIGNED_OUT') {
        this.status.set('loading');
        this.initialization = null;
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

  private async restoreOrCreateSession(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    this.status.set('loading');
    this.error.set(null);
    try {
      const client = this.supabase.requireClient();
      const restored = await client.auth.getSession();
      if (restored.error) throw restored.error;
      let session = restored.data.session;
      if (!session) {
        const created = await client.auth.signInAnonymously();
        if (created.error) throw created.error;
        session = created.data.session;
      }
      if (!session) throw new Error('Supabase did not return a device session.');
      this.session.set(session);
      this.status.set('authenticated');
    } catch {
      this.session.set(null);
      this.error.set('No se ha podido iniciar este dispositivo. Comprueba la conexión.');
      this.status.set('error');
    }
  }
}
