import { Component, effect, inject, input } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatGameClock } from '../../../core/clock/match-clock';
import {
  MatchDate,
  matchCompetition,
  matchDateTimestamp,
  matchSeason,
} from '../../../shared/models/match';
import { PreferredFoot } from '../../../shared/models/player-profile';
import { PlayerProfileStore } from '../application/player-profile.store';

@Component({
  selector: 'app-player-profile-page',
  imports: [ReactiveFormsModule, RouterLink],
  providers: [PlayerProfileStore],
  templateUrl: './player-profile-page.html',
  styleUrl: './player-profile-page.scss',
})
export class PlayerProfilePage {
  readonly playerId = input.required<string>();
  protected readonly store = inject(PlayerProfileStore);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly form = this.formBuilder.nonNullable.group({
    photoUrl: ['', Validators.maxLength(1_000)],
    preferredFoot: ['unknown' as PreferredFoot, Validators.required],
    notes: ['', Validators.maxLength(2_000)],
  });

  constructor() {
    effect(() => void this.store.load(this.playerId()));
    effect(() => {
      const profile = this.store.profile();
      if (!profile) return;
      this.form.setValue({
        photoUrl: profile.photoUrl ?? '',
        preferredFoot: profile.preferredFoot,
        notes: profile.notes,
      });
      this.form.markAsPristine();
    });
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (await this.store.save(this.form.getRawValue())) this.form.markAsPristine();
  }

  protected initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  protected formatDate(value: MatchDate): string {
    const timestamp = matchDateTimestamp(value);
    return timestamp
      ? new Intl.DateTimeFormat('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(timestamp)
      : '—';
  }

  protected duration(value: number): string {
    return formatGameClock(value);
  }

  protected decimal(value: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
  }

  protected percentage(value: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value) + '%';
  }

  protected footLabel(value: PreferredFoot): string {
    return { unknown: 'Sin especificar', right: 'Derecho', left: 'Izquierdo', both: 'Ambidiestro' }[
      value
    ];
  }

  protected outcomeLabel(value: 'win' | 'draw' | 'loss'): string {
    return { win: 'Victoria', draw: 'Empate', loss: 'Derrota' }[value];
  }

  protected readonly matchSeason = matchSeason;
  protected readonly matchCompetition = matchCompetition;
}
