import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GetSquadOverviewUseCase } from '../application/get-squad-overview.use-case';
import { TeamsService } from '../application/teams.service';
import { TeamDetailPage } from './team-detail-page';

describe('TeamDetailPage squad overview', () => {
  it('renders every status and filters by name', async () => {
    await TestBed.configureTestingModule({
      imports: [TeamDetailPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: TeamsService,
          useValue: {
            getTeam: async () => ({
              id: 't',
              name: 'Sala 5',
              shortName: 'S5',
              createdAt: 1,
              updatedAt: 1,
            }),
          },
        },
        {
          provide: GetSquadOverviewUseCase,
          useValue: {
            execute: async () => ({
              activePlayers: 1,
              totalPlayers: 2,
              matches: 0,
              playedMs: 0,
              goals: 0,
              seasons: [],
              photoBlobs: new Map(),
              players: [
                {
                  playerId: 'p1',
                  number: 4,
                  name: 'Ana',
                  position: 'Ala',
                  active: true,
                  matchesPlayed: 0,
                  starts: 0,
                  playedMs: 0,
                  goals: 0,
                  plusMinus: 2,
                  averageMinutesPerMatch: 0,
                },
                {
                  playerId: 'p2',
                  number: 9,
                  name: 'Bea',
                  position: 'Pívot',
                  active: false,
                  matchesPlayed: 0,
                  starts: 0,
                  playedMs: 0,
                  goals: 0,
                  plusMinus: -1,
                  averageMinutesPerMatch: 0,
                },
              ],
            }),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TeamDetailPage);
    fixture.componentRef.setInput('teamId', 't');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.player-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.balance--positive')?.textContent).toContain('+2');
    expect(fixture.nativeElement.querySelector('.balance--negative')?.textContent).toContain('-1');
    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'Bea';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.player-card')).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Inactivo');
  });
});
