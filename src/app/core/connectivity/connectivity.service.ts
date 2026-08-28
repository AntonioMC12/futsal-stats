import { DestroyRef, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);

  constructor(destroyRef: DestroyRef) {
    if (typeof window === 'undefined') {
      return;
    }

    const markOnline = () => this.online.set(true);
    const markOffline = () => this.online.set(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    destroyRef.onDestroy(() => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
    });
  }
}
