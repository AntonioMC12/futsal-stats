import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { Match } from '../../../shared/models/match';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {
  private readonly matches = inject(MatchRepository);

  protected readonly activeMatch = signal<Match | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);

  constructor() {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      this.activeMatch.set(await this.matches.findActive());
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
