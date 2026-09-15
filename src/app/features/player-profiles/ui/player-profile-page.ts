import { Component, effect, inject, input, signal } from '@angular/core';
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
import { validatePlayerPhoto } from '../domain/player-photo';

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
  protected readonly pendingPhoto = signal<Blob | null>(null);
  protected readonly previewUrl = signal<string | null>(null);
  protected readonly form = this.formBuilder.nonNullable.group({
    number: ['', [Validators.required, Validators.pattern(/^\d{1,2}$/)]],
    name: ['', [Validators.required, Validators.maxLength(40)]],
    position: [''],
    active: [true],
    preferredFoot: ['unknown' as PreferredFoot, Validators.required],
    notes: ['', Validators.maxLength(2_000)],
  });

  constructor() {
    effect(() => void this.store.load(this.playerId()));
    effect(() => {
      const player = this.store.player();
      const profile = this.store.profile();
      if (!player || !profile) return;
      this.form.setValue({
        number: String(player.number),
        name: player.name,
        position: player.position ?? '',
        active: player.active,
        preferredFoot: profile.preferredFoot,
        notes: profile.notes,
      });
      this.form.markAsPristine();
    });
    effect((onCleanup) => {
      const blob = this.pendingPhoto() ?? this.store.photoBlob();
      if (!blob) {
        this.previewUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      this.previewUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }
  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { preferredFoot, notes, ...player } = this.form.getRawValue();
    if (await this.store.save({ preferredFoot, notes }, player)) this.form.markAsPristine();
  }
  protected async selectPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const validation = await validatePlayerPhoto(file);
    if (!validation.ok) {
      this.store.error.set(validation.error);
      this.pendingPhoto.set(null);
      return;
    }
    this.store.error.set(null);
    this.store.notice.set(null);
    this.pendingPhoto.set(file);
  }
  protected async savePhoto(): Promise<void> {
    const blob = this.pendingPhoto();
    if (blob && (await this.store.uploadPhoto(blob))) this.pendingPhoto.set(null);
  }
  protected cancelPhoto(): void {
    this.pendingPhoto.set(null);
  }
  protected async deletePhoto(): Promise<void> {
    if (await this.store.deletePhoto()) this.pendingPhoto.set(null);
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
