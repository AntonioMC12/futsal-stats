import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Player } from '../../../shared/models/player';
import { MatchSetupService, MatchSetupTeam } from '../application/match-setup.service';
import { MatchSetupPage } from './match-setup-page';

const teams: MatchSetupTeam[] = [
  {
    team: {
      id: 'team-1',
      name: 'Inter',
      shortName: 'INT',
      createdAt: 1,
      updatedAt: 1,
    },
    playerCount: 16,
  },
  {
    team: {
      id: 'team-2',
      name: 'Sala',
      shortName: 'SAL',
      createdAt: 1,
      updatedAt: 1,
    },
    playerCount: 6,
  },
];

function teamPlayers(teamId: string, count: number): Player[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${teamId}-p${index + 1}`,
    teamId,
    number: index + 1,
    name: index === count - 1 ? 'Nombre especialmente largo' : `Jugador ${index + 1}`,
    active: true,
  }));
}

describe('MatchSetupPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function createPage() {
    const firstTeamPlayers = [
      ...teamPlayers('team-1', 16),
      {
        id: 'inactive',
        teamId: 'team-1',
        number: 99,
        name: 'Inactivo',
        active: false,
      },
    ];
    const secondTeamPlayers = teamPlayers('team-2', 6);
    const setup = {
      listTeams: vi.fn(async () => teams),
      listPlayers: vi.fn(async (teamId: string) =>
        teamId === 'team-1' ? firstTeamPlayers : secondTeamPlayers,
      ),
      createMatch: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [MatchSetupPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: MatchSetupService, useValue: setup },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MatchSetupPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, setup };
  }

  async function chooseTeam(fixture: Awaited<ReturnType<typeof createPage>>['fixture'], id: string) {
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = id;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('selects and deselects every eligible player without choosing starters', async () => {
    const { fixture } = await createPage();
    await chooseTeam(fixture, 'team-1');

    expect(fixture.nativeElement.querySelectorAll('.squad-panel .player')).toHaveLength(16);
    expect(fixture.nativeElement.textContent).not.toContain('Inactivo');
    const toggle = fixture.nativeElement.querySelector('.select-all') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Seleccionar todos');

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.squad-panel input:checked')).toHaveLength(16);
    expect(fixture.nativeElement.querySelectorAll('.lineup-setup-panel input:checked')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.selection-count').textContent).toContain('16/16');
    expect(toggle.textContent).toContain('Deseleccionar todos');

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.squad-panel input:checked')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('.lineup-setup-panel .player')).toHaveLength(0);
    fixture.destroy();
  });

  it('completes a partial squad selection with the same action', async () => {
    const { fixture } = await createPage();
    await chooseTeam(fixture, 'team-1');
    const inputs = fixture.nativeElement.querySelectorAll(
      '.squad-panel input',
    ) as NodeListOf<HTMLInputElement>;
    [...inputs].slice(0, 8).forEach((input) => input.click());
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.selection-count').textContent).toContain('8/16');
    expect(fixture.nativeElement.querySelector('.select-all').textContent).toContain(
      'Seleccionar todos',
    );
    (fixture.nativeElement.querySelector('.select-all') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.squad-panel input:checked')).toHaveLength(16);
    fixture.destroy();
  });

  it('clears the previous squad and lineup when changing teams', async () => {
    const { fixture, setup } = await createPage();
    await chooseTeam(fixture, 'team-1');
    (fixture.nativeElement.querySelector('.select-all') as HTMLButtonElement).click();
    fixture.detectChanges();
    const starters = fixture.nativeElement.querySelectorAll(
      '.lineup-setup-panel input',
    ) as NodeListOf<HTMLInputElement>;
    [...starters].slice(0, 5).forEach((input) => input.click());
    fixture.detectChanges();

    await chooseTeam(fixture, 'team-2');
    expect(setup.listPlayers).toHaveBeenLastCalledWith('team-2');
    expect(fixture.nativeElement.querySelector('.selection-count').textContent).toContain('0/6');
    expect(fixture.nativeElement.querySelectorAll('.squad-panel input:checked')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('.lineup-setup-panel .player')).toHaveLength(0);
    fixture.destroy();
  });
});
