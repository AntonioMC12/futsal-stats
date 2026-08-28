import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { TeamsService } from '../application/teams.service';
import { TeamsPage } from './teams-page';

describe('TeamsPage', () => {
  it('lists saved teams', async () => {
    await TestBed.configureTestingModule({
      imports: [TeamsPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: TeamsService,
          useValue: {
            listSummaries: async () => [
              {
                team: { id: 't1', name: 'Inter', shortName: 'INT' },
                playerCount: 8,
              },
            ],
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TeamsPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Inter');
    expect(fixture.nativeElement.textContent).toContain('8 jugadores');
  });
});
