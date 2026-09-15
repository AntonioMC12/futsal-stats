export type PwaUpdateStatus = 'idle' | 'checking' | 'available' | 'deferred' | 'updating' | 'error';

export type PwaUpdateCheckOutcome = 'none' | 'up-to-date' | 'unavailable';

export interface PwaUpdateState {
  readonly status: PwaUpdateStatus;
  readonly currentVersion: string;
  readonly availableVersion?: string;
  readonly error?: string;
  readonly lastCheckOutcome: PwaUpdateCheckOutcome;
  readonly lastCheckedAt?: number;
}
