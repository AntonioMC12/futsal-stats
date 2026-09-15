import { afterEach, describe, expect, it } from 'vitest';
import { readCloudConfig } from './cloud.config';

describe('readCloudConfig', () => {
  afterEach(() => delete globalThis.__FUTSAL_STATS_CLOUD__);

  it('defaults to local persistence', () => {
    expect(readCloudConfig()).toEqual({ mode: 'local', supabaseUrl: '', publishableKey: '' });
  });

  it('enables cloud only with an explicit secure public configuration', () => {
    globalThis.__FUTSAL_STATS_CLOUD__ = {
      mode: 'cloud',
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_test',
    };
    expect(readCloudConfig()).toEqual({
      mode: 'cloud',
      supabaseUrl: 'https://project.supabase.co',
      publishableKey: 'sb_publishable_test',
    });
  });

  it('rejects incomplete or insecure cloud configuration', () => {
    globalThis.__FUTSAL_STATS_CLOUD__ = {
      mode: 'cloud',
      supabaseUrl: 'http://project.supabase.co',
      publishableKey: 'key',
    };
    expect(readCloudConfig().mode).toBe('local');
  });
});
