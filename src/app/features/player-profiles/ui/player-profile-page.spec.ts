import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createMatchClock } from '../../../core/clock/match-clock';
import {
  MATCH_EVENT_REPOSITORY as MatchEventRepository,
  MATCH_REPOSITORY as MatchRepository,
  PLAYER_PROFILE_REPOSITORY as PlayerProfileRepository,
  PLAYER_PHOTO_REPOSITORY as PlayerPhotoRepository,
  PLAYER_REPOSITORY as PlayerRepository,
} from '../../../core/persistence/persistence.tokens';
import { PlayerProfilePage } from './player-profile-page';
import { PlayerProfileStore } from '../application/player-profile.store';

describe('PlayerProfilePage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders career metrics, season history and saves the persistent sports profile', async () => {
    const put = vi.fn(async () => 'p1');
    const match = {
      id: 'match-1',
      teamId: 'team-1',
      homeTeam: { id: 'team-1', name: 'Local', shortName: 'LOC' },
      awayTeam: { name: 'Rival', shortName: 'RIV' },
      date: '2026-09-08',
      season: '2026/27',
      competition: 'Liga',
      description: '',
      status: 'finished' as const,
      currentPeriod: 2,
      periodCount: 2,
      clock: createMatchClock(),
      squadPlayerIds: ['p1'],
      startingLineupPlayerIds: ['p1'],
      createdAt: 1,
      updatedAt: 2,
      statisticsSchemaVersion: 2 as const,
    };
    const older = {
      ...match,
      id: 'match-old',
      date: '2026-05-08',
      season: '2025/26',
      statisticsSchemaVersion: undefined,
    };
    const trackedZero = {
      ...match,
      id: 'match-zero',
      date: '2025-05-08',
      season: '2024/25',
    };
    await TestBed.configureTestingModule({
      imports: [PlayerProfilePage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: PlayerRepository,
          useValue: {
            listByIds: async () => [
              {
                id: 'p1',
                teamId: 'team-1',
                number: 7,
                name: 'Ana Ruiz',
                position: 'Portero',
                active: true,
              },
            ],
          },
        },
        { provide: PlayerProfileRepository, useValue: { get: async () => undefined, put } },
        { provide: PlayerPhotoRepository, useValue: { get: async () => undefined } },
        {
          provide: MatchRepository,
          useValue: { listByTeam: async () => [match, older, trackedZero] },
        },
        {
          provide: MatchEventRepository,
          useValue: {
            listByMatch: async (matchId: string) =>
              matchId !== 'match-1'
                ? []
                : [
                    {
                      id: 'goal',
                      matchId: 'match-1',
                      type: 'GOAL_FOR',
                      period: 1,
                      gameClockMs: 10,
                      timestamp: 1,
                      sequence: 1,
                      undone: false,
                      scorerPlayerId: 'p1',
                      lineupPlayerIds: ['p1'],
                      scoreBefore: { home: 0, away: 0 },
                      scoreAfter: { home: 1, away: 0 },
                    },
                    {
                      id: 'save',
                      matchId: 'match-1',
                      type: 'SAVE',
                      playerId: 'p1',
                      period: 1,
                      gameClockMs: 9,
                      timestamp: 2,
                      sequence: 2,
                      undone: false,
                    },
                    {
                      id: 'received',
                      matchId: 'match-1',
                      type: 'FOUL',
                      team: 'away',
                      receivedByPlayerId: 'p1',
                      periodFoulNumber: 1,
                      period: 1,
                      gameClockMs: 8,
                      timestamp: 3,
                      sequence: 3,
                      undone: false,
                    },
                  ],
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PlayerProfilePage);
    fixture.componentRef.setInput('playerId', 'p1');
    fixture.detectChanges();
    await fixture.debugElement.injector.get(PlayerProfileStore).load('p1');
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toContain('Ana Ruiz');
    expect(page.querySelector('.player-overview')?.textContent).toContain('Dorsal 7');
    expect(page.querySelector('.player-overview')?.textContent).toContain('Portero');
    expect(page.querySelector('.player-overview')?.textContent).toContain('Sin especificar');
    expect(page.querySelector('.player-overview')?.textContent).toContain('Activo');
    expect(page.querySelector('.career-summary')?.textContent).toContain('Goles');
    expect(page.querySelector('.career-summary')?.textContent).toContain('1');
    expect(page.querySelector('.player-match-card')?.getAttribute('href')).toBe('/matches/match-1');
    expect(page.textContent).toContain('2026/27');
    const metric = (label: string) =>
      [...page.querySelectorAll('.metrics-grid article')].find(
        (card) => card.querySelector('span')?.textContent?.trim() === label,
      );
    expect(metric('Paradas')?.querySelector('strong')?.textContent?.trim()).toBe('1');
    expect(metric('Faltas recibidas')?.querySelector('strong')?.textContent?.trim()).toBe('1');
    expect(metric('Paradas')?.textContent).toContain('2 partidos registrados');
    expect(metric('Paradas')?.classList.contains('metric-card--goalkeeper')).toBe(true);
    expect(
      [...page.querySelectorAll('.metrics-grid article > span:first-child')].map((title) =>
        title.textContent?.trim(),
      ),
    ).toEqual([
      'Partidos',
      'Tiempo jugado',
      'Goles',
      'Balance +/−',
      "Goles / 40'",
      'Convocatorias',
      'Titularidades',
      'Entradas en pista',
      'Disciplina',
      'Disparos',
      'Faltas recibidas',
      'Paradas',
    ]);
    expect(page.textContent).not.toContain('Paradas / faltas recibidas');
    expect(page.querySelector('.player-match-card')?.textContent).toContain('1 parada');
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.profile-details')?.textContent).toContain('Portero');
    expect(page.querySelector('.photo-picker')).toBeNull();
    const edit = page.querySelector<HTMLButtonElement>('.profile-edit-button')!;
    expect(edit.textContent).toContain('Editar');

    const season = page.querySelector('.season-toolbar select') as HTMLSelectElement;
    season.value = '2026/27';
    season.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(metric('Paradas')?.textContent).toContain('1 partido registrado');
    season.value = '2025/26';
    season.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(metric('Paradas')?.querySelector('strong')?.textContent?.trim()).toBe('Sin registro');
    expect(metric('Faltas recibidas')?.querySelector('strong')?.textContent?.trim()).toBe(
      'Sin registro',
    );
    season.value = '2024/25';
    season.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(metric('Paradas')?.querySelector('strong')?.textContent?.trim()).toBe('0');
    expect(metric('Faltas recibidas')?.querySelector('strong')?.textContent?.trim()).toBe('0');

    edit.click();
    fixture.detectChanges();
    expect(page.querySelector<HTMLInputElement>('[formControlName="name"]')?.value).toBe(
      'Ana Ruiz',
    );
    const notes = page.querySelector('[formControlName="notes"]') as HTMLTextAreaElement;
    notes.value = 'Mejora en finalización';
    notes.dispatchEvent(new Event('input'));
    page.querySelector<HTMLButtonElement>('.profile-form-actions button[type="button"]')!.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(page.querySelector('form')).not.toBeNull();
    page.querySelector<HTMLButtonElement>('.profile-discard-dialog .btn--secondary')!.click();
    fixture.detectChanges();
    expect(page.querySelector('[role="alertdialog"]')).toBeNull();
    const navigation = fixture.componentInstance.canDeactivate() as Promise<boolean>;
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.profile-discard-dialog .btn--danger')!.click();
    expect(await navigation).toBe(true);
    fixture.detectChanges();
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.profile-details')?.textContent).not.toContain(
      'Mejora en finalización',
    );
    expect(put).not.toHaveBeenCalled();

    edit.click();
    fixture.detectChanges();
    const nextNotes = page.querySelector('[formControlName="notes"]') as HTMLTextAreaElement;
    nextNotes.value = 'Mejora en finalización';
    nextNotes.dispatchEvent(new Event('input'));
    put.mockRejectedValueOnce(new Error('offline'));
    (page.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(page.querySelector('form')).not.toBeNull();
    expect(nextNotes.value).toBe('Mejora en finalización');
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('No se ha podido guardar');
    (page.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: 'p1', notes: 'Mejora en finalización' }),
    );
    expect(page.querySelector('form')).toBeNull();
    expect(page.querySelector('.profile-details')?.textContent).toContain('Mejora en finalización');

    const store = fixture.debugElement.injector.get(PlayerProfileStore);
    store.profile.update((profile) => ({
      ...profile!,
      photoUrl: 'https://example.invalid/photo.jpg',
    }));
    fixture.detectChanges();
    const deletePhoto = vi.spyOn(store, 'deletePhoto');
    edit.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.photo-editor .btn--danger')!.click();
    fixture.detectChanges();
    expect(deletePhoto).not.toHaveBeenCalled();
    expect(page.querySelector('.avatar img')).toBeNull();
    page.querySelector<HTMLButtonElement>('.profile-form-actions button[type="button"]')!.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.profile-discard-dialog .btn--danger')!.click();
    fixture.detectChanges();
    expect(deletePhoto).not.toHaveBeenCalled();
    expect(store.profile()?.photoUrl).toBe('https://example.invalid/photo.jpg');
    expect(page.querySelector('.avatar img')).not.toBeNull();

    store.canWrite.set(false);
    fixture.detectChanges();
    expect(page.querySelector('.profile-edit-button')).toBeNull();
    (fixture.componentInstance as unknown as { edit: () => void }).edit();
    fixture.detectChanges();
    expect(page.querySelector('form')).toBeNull();
    fixture.destroy();
  });
});
