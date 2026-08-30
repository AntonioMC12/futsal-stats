import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export type NotificationType = 'success' | 'info' | 'warning' | 'error';
export type NotificationPhase = 'entering' | 'visible' | 'leaving';

export interface NotificationAction {
  readonly label: string;
  readonly run: () => void | Promise<void>;
  readonly disabled?: () => boolean;
}

export interface SystemNotification {
  readonly id: number;
  readonly message: string;
  readonly type: NotificationType;
  readonly duration: number;
  readonly action?: NotificationAction;
}

export interface NotificationOptions {
  readonly duration?: number;
  readonly action?: NotificationAction;
}

const DEFAULT_DURATION: Record<NotificationType, number> = {
  success: 1_600,
  info: 1_600,
  warning: 2_600,
  error: 3_600,
};

@Injectable({ providedIn: 'root' })
export class SystemNotificationService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly currentState = signal<SystemNotification | null>(null);
  private readonly phaseState = signal<NotificationPhase>('entering');
  private dismissTimer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 0;

  readonly notification = this.currentState.asReadonly();
  readonly phase = this.phaseState.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.clearDismissTimer());
  }

  success(message: string, options?: NotificationOptions): number {
    return this.show(message, 'success', options);
  }

  info(message: string, options?: NotificationOptions): number {
    return this.show(message, 'info', options);
  }

  warning(message: string, options?: NotificationOptions): number {
    return this.show(message, 'warning', options);
  }

  error(message: string, options?: NotificationOptions): number {
    return this.show(message, 'error', options);
  }

  show(message: string, type: NotificationType, options: NotificationOptions = {}): number {
    this.clearDismissTimer();
    const id = ++this.nextId;
    this.phaseState.set('entering');
    this.currentState.set({
      id,
      message,
      type,
      duration: options.duration ?? DEFAULT_DURATION[type],
      action: options.action,
    });
    return id;
  }

  animationDone(id: number): void {
    if (this.currentState()?.id !== id) return;

    if (this.phaseState() === 'entering') {
      this.phaseState.set('visible');
      this.startDismissTimer(id);
    } else if (this.phaseState() === 'leaving') {
      this.currentState.set(null);
    }
  }

  dismiss(id = this.currentState()?.id): void {
    if (id === undefined || this.currentState()?.id !== id) return;
    this.clearDismissTimer();
    this.phaseState.set('leaving');
  }

  async runAction(id: number): Promise<void> {
    const action = this.currentState()?.id === id ? this.currentState()?.action : undefined;
    if (!action || action.disabled?.()) return;

    await action.run();
    if (this.currentState()?.id === id) this.dismiss(id);
  }

  private startDismissTimer(id: number): void {
    this.clearDismissTimer();
    const duration = this.currentState()?.duration;
    if (duration === undefined) return;
    this.dismissTimer = setTimeout(() => this.dismiss(id), duration);
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer !== undefined) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = undefined;
    }
  }
}
