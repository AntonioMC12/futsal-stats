import { TestBed } from '@angular/core/testing';
import { MATCH_REPOSITORY } from '../../../core/persistence/persistence.tokens';
import { DeleteMatchService } from './delete-match.service';

describe('DeleteMatchService', () => {
  it('delegates aggregate deletion to the repository port', async () => {
    const deleteMatch = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [
        DeleteMatchService,
        { provide: MATCH_REPOSITORY, useValue: { delete: deleteMatch } },
      ],
    });

    await TestBed.inject(DeleteMatchService).execute('match-a');

    expect(deleteMatch).toHaveBeenCalledWith('match-a');
  });

  it('propagates persistence failures to the caller', async () => {
    TestBed.configureTestingModule({
      providers: [
        DeleteMatchService,
        {
          provide: MATCH_REPOSITORY,
          useValue: { delete: async () => Promise.reject(new Error('IndexedDB unavailable')) },
        },
      ],
    });

    await expect(TestBed.inject(DeleteMatchService).execute('match-a')).rejects.toThrow(
      'IndexedDB unavailable',
    );
  });
});
