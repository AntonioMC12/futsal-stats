import { Component, computed, inject } from '@angular/core';
import { SystemNotificationService } from '../../../core/notifications/system-notification.service';

@Component({
  selector: 'app-system-notification',
  templateUrl: './system-notification.html',
  styleUrl: './system-notification.scss',
})
export class SystemNotificationComponent {
  protected readonly notifications = inject(SystemNotificationService);
  protected readonly activeNotifications = computed(() => {
    const notification = this.notifications.notification();
    return notification ? [notification] : [];
  });

  protected icon(type: 'success' | 'info' | 'warning' | 'error'): string {
    return { success: '✓', info: 'i', warning: '!', error: '×' }[type];
  }

  protected liveRole(type: 'success' | 'info' | 'warning' | 'error'): 'status' | 'alert' {
    return type === 'warning' || type === 'error' ? 'alert' : 'status';
  }

  protected animationDone(event: AnimationEvent, id: number): void {
    if (event.target === event.currentTarget) this.notifications.animationDone(id);
  }
}
