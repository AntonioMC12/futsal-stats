import { inject, Injectable, signal } from '@angular/core';
import { CLOUD_CONFIG } from './cloud.config';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from '../auth/auth.service';

export type CloudStatus =
  'disabled' | 'connecting' | 'connected' | 'authRequired' | 'authError' | 'unreachable';

@Injectable({ providedIn: 'root' })
export class CloudFoundationService {
  private readonly config = inject(CLOUD_CONFIG);
  private readonly supabase = inject(SupabaseClientService);
  private readonly auth = inject(AuthService);

  readonly status = signal<CloudStatus>(this.config.mode === 'cloud' ? 'connecting' : 'disabled');
  readonly userId = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly lastCheckedAt = signal<number | null>(null);

  async initialize(): Promise<void> {
    if (this.config.mode !== 'cloud') return;
    this.status.set('connecting');
    this.error.set(null);
    const client = this.supabase.requireClient();
    try {
      await this.auth.initialize();
      const user = this.auth.user();
      if (!user) {
        this.userId.set(null);
        this.status.set('authRequired');
        return;
      }
      this.userId.set(user.id);
    } catch (error) {
      this.fail('authError', error);
      return;
    }

    try {
      const { error } = await client.from('teams').select('id').limit(1);
      if (error) throw error;
      const { error: touchError } = await client.rpc('touch_device_memberships');
      if (touchError) throw touchError;
      this.status.set('connected');
      this.lastCheckedAt.set(Date.now());
    } catch (error) {
      this.fail('unreachable', error);
    }
  }

  private fail(status: Extract<CloudStatus, 'authError' | 'unreachable'>, error: unknown): void {
    this.status.set(status);
    this.error.set(error instanceof Error ? error.message : String(error));
    this.lastCheckedAt.set(Date.now());
  }
}
