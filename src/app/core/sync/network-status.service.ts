import { DestroyRef, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly destroyRef = inject(DestroyRef);
  readonly online = signal(readOnlineState());

  constructor() {
    const onOnline = () => this.online.set(true);
    const onOffline = () => this.online.set(false);
    globalThis.addEventListener?.('online', onOnline);
    globalThis.addEventListener?.('offline', onOffline);
    this.destroyRef.onDestroy(() => {
      globalThis.removeEventListener?.('online', onOnline);
      globalThis.removeEventListener?.('offline', onOffline);
    });
  }
}

function readOnlineState(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
