import { Injectable, signal } from '@angular/core';
import { SquadSort, SquadStatusFilter } from '../domain/squad-overview';

@Injectable({ providedIn: 'root' })
export class SquadOverviewPreferences {
  readonly search = signal('');
  readonly status = signal<SquadStatusFilter>('all');
  readonly position = signal('');
  readonly sort = signal<SquadSort>('number');
  readonly season = signal('all');
}
