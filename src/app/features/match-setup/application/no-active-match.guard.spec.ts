import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MatchRepository } from '../../../core/persistence/match.repository';
import { noActiveMatchGuard } from './no-active-match.guard';

describe('noActiveMatchGuard', () => {
  it('redirects direct creation attempts to the manager when a match is active', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MatchRepository, useValue: { findActive: async () => ({ id: 'active' }) } },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      noActiveMatchGuard({} as never, {} as never),
    );

    expect(result).toEqual(TestBed.inject(Router).createUrlTree(['/matches']));
  });

  it('allows creation when no match is active', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MatchRepository, useValue: { findActive: async () => null } },
      ],
    });

    await expect(
      TestBed.runInInjectionContext(() => noActiveMatchGuard({} as never, {} as never)),
    ).resolves.toBe(true);
  });
});
