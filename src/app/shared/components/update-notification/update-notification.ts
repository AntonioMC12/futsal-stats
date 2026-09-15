import { Component, inject } from '@angular/core';
import { PwaUpdateService } from '../../../core/update/pwa-update.service';

@Component({
  selector: 'app-update-notification',
  templateUrl: './update-notification.html',
  styleUrl: './update-notification.scss',
})
export class UpdateNotificationComponent {
  protected readonly updates = inject(PwaUpdateService);
}
