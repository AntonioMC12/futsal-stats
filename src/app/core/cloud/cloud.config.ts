import { InjectionToken } from '@angular/core';

export interface CloudConfig {
  mode: 'local' | 'cloud';
  supabaseUrl: string;
  publishableKey: string;
}

declare global {
  // Public runtime configuration. Never put a Supabase service-role key here.
  var __FUTSAL_STATS_CLOUD__: Partial<CloudConfig> | undefined;
}

export const CLOUD_CONFIG = new InjectionToken<CloudConfig>('CLOUD_CONFIG', {
  providedIn: 'root',
  factory: readCloudConfig,
});

export function readCloudConfig(): CloudConfig {
  const runtime = globalThis.__FUTSAL_STATS_CLOUD__;
  const url = runtime?.supabaseUrl?.trim() ?? '';
  const publishableKey = runtime?.publishableKey?.trim() ?? '';
  const enabled =
    runtime?.mode === 'cloud' && isSecureSupabaseUrl(url) && publishableKey.length > 0;
  return {
    mode: enabled ? 'cloud' : 'local',
    supabaseUrl: enabled ? url : '',
    publishableKey: enabled ? publishableKey : '',
  };
}

function isSecureSupabaseUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
