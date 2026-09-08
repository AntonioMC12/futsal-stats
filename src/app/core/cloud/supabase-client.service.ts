import { inject, Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CLOUD_CONFIG } from './cloud.config';

@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private readonly config = inject(CLOUD_CONFIG);
  readonly client: SupabaseClient | null =
    this.config.mode === 'cloud'
      ? createClient(this.config.supabaseUrl, this.config.publishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        })
      : null;

  requireClient(): SupabaseClient {
    if (!this.client) throw new Error('La persistencia cloud no está configurada.');
    return this.client;
  }
}
