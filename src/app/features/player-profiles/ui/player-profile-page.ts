import { Component, effect, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatGameClock } from '../../../core/clock/match-clock';
import { PreferredFoot } from '../../../shared/models/player-profile';
import { PlayerProfileStore } from '../application/player-profile.store';
import { validatePlayerPhoto } from '../domain/player-photo';
import { MatchHistoryRowComponent } from './components/match-history-row';
import { ProfileMetricComponent } from './components/profile-metric';
import { ProfileStatusBadgeComponent } from './components/profile-status-badge';
import { SeasonSelectorComponent } from './components/season-selector';

@Component({
  selector: 'app-player-profile-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatchHistoryRowComponent,
    ProfileMetricComponent,
    ProfileStatusBadgeComponent,
    SeasonSelectorComponent,
  ],
  providers: [PlayerProfileStore],
  templateUrl: './player-profile-page.html',
})
export class PlayerProfilePage {
  readonly playerId = input.required<string>();
  protected readonly store = inject(PlayerProfileStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  protected readonly isEditing = signal(false);
  protected readonly discardOpen = signal(false);
  protected readonly pendingPhoto = signal<Blob | null>(null);
  protected readonly removePhoto = signal(false);
  protected readonly previewUrl = signal<string | null>(null);
  private resolveNavigation: ((allow: boolean) => void) | null = null;
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
      if (this.isEditing()) return;
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
      const blob = this.isEditing()
        ? (this.pendingPhoto() ?? this.store.photoBlob())
        : this.store.photoBlob();
      if (!blob) {
        this.previewUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      this.previewUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }
  protected edit(): void {
    if (!this.store.canWrite() || !this.store.player() || !this.store.profile()) return;
    this.store.error.set(null);
    this.store.notice.set(null);
    this.isEditing.set(true);
    setTimeout(() =>
      this.element.nativeElement
        .querySelector<HTMLInputElement>('[formControlName="number"]')
        ?.focus(),
    );
  }
  protected cancel(): void {
    if (this.hasUnsavedChanges()) this.openDiscard();
    else this.closeEditor();
  }
  protected keepEditing(): void {
    this.discardOpen.set(false);
    this.resolveNavigation?.(false);
    this.resolveNavigation = null;
    setTimeout(() =>
      this.element.nativeElement
        .querySelector<HTMLInputElement>('[formControlName="number"]')
        ?.focus(),
    );
  }
  protected discard(): void {
    this.discardOpen.set(false);
    this.closeEditor();
    this.resolveNavigation?.(true);
    this.resolveNavigation = null;
  }
  canDeactivate(): boolean | Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;
    this.openDiscard();
    return new Promise<boolean>((resolve) => (this.resolveNavigation = resolve));
  }
  private openDiscard(): void {
    this.discardOpen.set(true);
    setTimeout(() =>
      this.element.nativeElement
        .querySelector<HTMLButtonElement>('.profile-discard-dialog .btn--secondary')
        ?.focus(),
    );
  }
  @HostListener('document:keydown.escape')
  protected escapeDiscard(): void {
    if (this.discardOpen()) this.keepEditing();
  }
  @HostListener('window:beforeunload', ['$event'])
  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }
  private hasUnsavedChanges(): boolean {
    return this.isEditing() && (this.form.dirty || !!this.pendingPhoto() || this.removePhoto());
  }
  private closeEditor(): void {
    const player = this.store.player();
    const profile = this.store.profile();
    if (player && profile) {
      this.form.setValue({
        number: String(player.number),
        name: player.name,
        position: player.position ?? '',
        active: player.active,
        preferredFoot: profile.preferredFoot,
        notes: profile.notes,
      });
      this.form.markAsPristine();
    }
    this.pendingPhoto.set(null);
    this.removePhoto.set(false);
    this.store.error.set(null);
    this.isEditing.set(false);
    setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLButtonElement>('.profile-edit-button')?.focus(),
    );
  }
  protected async save(): Promise<void> {
    if (!this.isEditing() || !this.store.canWrite()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    if (this.form.dirty) {
      const { preferredFoot, notes, ...player } = this.form.getRawValue();
      if (!(await this.store.save({ preferredFoot, notes }, player))) return;
    }
    if (this.pendingPhoto() && !(await this.store.uploadPhoto(this.pendingPhoto()!))) return;
    if (this.removePhoto() && !(await this.store.deletePhoto())) return;
    this.closeEditor();
  }
  protected async selectPhoto(event: Event): Promise<void> {
    if (!this.isEditing() || !this.store.canWrite()) return;
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
    this.removePhoto.set(false);
  }
  protected cancelPhoto(): void {
    this.pendingPhoto.set(null);
  }
  protected deletePhoto(): void {
    if (!this.isEditing() || !this.store.canWrite()) return;
    this.pendingPhoto.set(null);
    this.removePhoto.set(true);
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
  protected duration(value: number): string {
    return formatGameClock(value);
  }
  protected decimal(value: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value);
  }
  protected percentage(value: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value) + '%';
  }
  protected isGoalkeeper(position: string | undefined): boolean {
    return /^(?:porter[oa]|gk|goalkeeper)\b/i.test(position?.trim() ?? '');
  }
  protected footLabel(value: PreferredFoot): string {
    return { unknown: 'Sin especificar', right: 'Derecho', left: 'Izquierdo', both: 'Ambidiestro' }[
      value
    ];
  }
  protected participation(): number {
    const statistics = this.store.statistics();
    return statistics.squadSelections
      ? (statistics.appearances / statistics.squadSelections) * 100
      : 0;
  }
}
