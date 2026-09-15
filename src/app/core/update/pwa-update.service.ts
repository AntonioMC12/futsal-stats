import { DOCUMENT } from '@angular/common';
import {
  ApplicationRef,
  DestroyRef,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { APP_VERSION } from './app-build.generated';
import { PwaUpdateState } from './pwa-update.models';
import { UpdateReloadSafetyService } from './update-reload-safety.service';

const FOREGROUND_CHECK_INTERVAL_MS = 20 * 60 * 1_000;
const UPDATE_ERROR_MESSAGE = 'No se pudo comprobar si hay actualizaciones. Inténtalo más tarde.';

export const PWA_RELOAD = new InjectionToken<() => void>('PWA_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const document = inject(DOCUMENT);
    return () => document.defaultView?.location.reload();
  },
});

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  readonly isEnabled = this.swUpdate?.isEnabled ?? false;
  private readonly reloadSafety = inject(UpdateReloadSafetyService, { optional: true });
  private readonly reload = inject(PWA_RELOAD);
  private readonly document = inject(DOCUMENT);
  private readonly appRef = inject(ApplicationRef);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stateSignal = signal<PwaUpdateState>({
    status: 'idle',
    currentVersion: APP_VERSION,
    lastCheckOutcome: this.isEnabled ? 'none' : 'unavailable',
  });
  private readonly notificationVisibleSignal = signal(false);
  private initialized = false;
  private lastAutomaticCheckAt = 0;
  private reloadOnly = false;

  readonly state = this.stateSignal.asReadonly();
  readonly notificationVisible = this.notificationVisibleSignal.asReadonly();

  constructor() {
    this.swUpdate?.versionUpdates
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => void this.handleVersionEvent(event));
    this.swUpdate?.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => void this.handleUnrecoverableState(event.reason));
  }

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.appRef.isStable
      .pipe(filter(Boolean), first(), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.checkAutomatically());
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => void this.reevaluateUpdateSafety());

    const onVisibilityChange = () => {
      if (this.document.visibilityState === 'visible') void this.checkAutomatically();
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisibilityChange),
    );
  }

  async checkForUpdate(): Promise<boolean> {
    return this.performCheck(true);
  }

  async applyUpdate(): Promise<void> {
    const status = this.stateSignal().status;
    if (status !== 'available' && status !== 'deferred') return;
    if (!(await this.isReloadSafe())) {
      this.deferUpdate();
      return;
    }

    this.patchState({ status: 'updating', error: undefined });
    this.notificationVisibleSignal.set(false);
    console.info('update_accepted');
    try {
      if (!this.reloadOnly) {
        const activated = await this.swUpdate?.activateUpdate();
        if (!activated) throw new Error('No update was ready for activation.');
        this.reloadOnly = true;
      }
      if (!(await this.isReloadSafe())) {
        this.deferUpdate();
        return;
      }
      this.reload();
    } catch (error) {
      this.fail(error);
    }
  }

  dismissNotification(): void {
    this.notificationVisibleSignal.set(false);
    console.info('update_dismissed');
  }

  async reevaluateUpdateSafety(): Promise<void> {
    if (this.stateSignal().status !== 'deferred') return;
    if (await this.isReloadSafe()) {
      this.patchState({ status: 'available' });
      this.notificationVisibleSignal.set(true);
    }
  }

  private async performCheck(manual: boolean): Promise<boolean> {
    if (this.hasPendingUpdate()) return true;
    if (!this.isEnabled || !this.swUpdate) {
      this.patchState({
        status: 'idle',
        lastCheckOutcome: 'unavailable',
        lastCheckedAt: manual ? Date.now() : this.stateSignal().lastCheckedAt,
      });
      return false;
    }

    if (manual) this.patchState({ status: 'checking', error: undefined, lastCheckOutcome: 'none' });
    console.info('update_check_started');
    try {
      const found = await this.swUpdate.checkForUpdate();
      const checkedAt = Date.now();
      if (found && this.stateSignal().status === 'checking') {
        await this.offerOrDeferUpdate();
      } else if (!found && !this.hasPendingUpdate()) {
        this.patchState({ status: 'idle', lastCheckOutcome: 'up-to-date' });
      }
      this.patchState({ lastCheckedAt: checkedAt });
      return found;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  private async checkAutomatically(): Promise<void> {
    const now = Date.now();
    if (now - this.lastAutomaticCheckAt < FOREGROUND_CHECK_INTERVAL_MS) return;
    this.lastAutomaticCheckAt = now;
    await this.performCheck(false);
  }

  private async handleVersionEvent(event: VersionEvent): Promise<void> {
    switch (event.type) {
      case 'VERSION_DETECTED':
        if (!this.hasPendingUpdate()) this.patchState({ status: 'checking', error: undefined });
        break;
      case 'VERSION_READY':
        await this.handleVersionReady(event);
        break;
      case 'NO_NEW_VERSION_DETECTED':
        if (!this.hasPendingUpdate()) {
          this.patchState({ status: 'idle', lastCheckOutcome: 'up-to-date' });
        }
        break;
      case 'VERSION_INSTALLATION_FAILED':
        this.fail(event.error);
        break;
    }
  }

  private async handleVersionReady(event: VersionReadyEvent): Promise<void> {
    this.reloadOnly = false;
    this.patchState({
      availableVersion: versionFromAppData(event.latestVersion.appData),
      error: undefined,
      lastCheckOutcome: 'none',
    });
    console.info('update_available');
    await this.offerOrDeferUpdate();
  }

  private async handleUnrecoverableState(reason: string): Promise<void> {
    console.error('update_unrecoverable_state', reason);
    this.reloadOnly = true;
    this.patchState({
      error: 'La versión instalada necesita recargarse para recuperarse.',
      lastCheckOutcome: 'none',
    });
    await this.offerOrDeferUpdate();
  }

  private async offerOrDeferUpdate(): Promise<void> {
    if (await this.isReloadSafe()) {
      this.patchState({ status: 'available' });
      this.notificationVisibleSignal.set(true);
    } else {
      this.deferUpdate();
    }
  }

  private deferUpdate(): void {
    this.patchState({ status: 'deferred' });
    this.notificationVisibleSignal.set(true);
    console.info('update_deferred_live_match');
  }

  private hasPendingUpdate(): boolean {
    const status = this.stateSignal().status;
    return status === 'available' || status === 'deferred' || status === 'updating';
  }

  private async isReloadSafe(): Promise<boolean> {
    return (await this.reloadSafety?.isReloadSafe()) ?? false;
  }

  private fail(error: unknown): void {
    console.error('update_failed', error);
    this.patchState({ status: 'error', error: UPDATE_ERROR_MESSAGE });
    this.notificationVisibleSignal.set(false);
  }

  private patchState(changes: Partial<PwaUpdateState>): void {
    this.stateSignal.update((state) => ({ ...state, ...changes }));
  }
}

function versionFromAppData(appData: object | undefined): string | undefined {
  if (!appData || !('version' in appData)) return undefined;
  const version = (appData as { version?: unknown }).version;
  return typeof version === 'string' ? version : undefined;
}
