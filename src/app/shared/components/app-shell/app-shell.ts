import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConnectivityService } from '../../../core/connectivity/connectivity.service';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShell {
  readonly connectivity = inject(ConnectivityService);
  private readonly router = inject(Router);

  get liveMatchActive(): boolean {
    return this.router.url.startsWith('/live/');
  }
}
