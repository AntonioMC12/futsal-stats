import { TestBed } from '@angular/core/testing';
import {
  RFEF_NO_EVIDENCE_MESSAGE,
  RFEF_OUT_OF_SCOPE_MESSAGE,
  RfefMatchContext,
  RfefPrompt,
} from '../domain/rfef-assistant';
import { RfefSearchResult } from '../domain/rfef-corpus';
import { RfefAssistantService } from './rfef-assistant.service';
import { RfefLocalLlmService } from './rfef-local-llm.service';
import { RfefPromptBuilder } from './rfef-prompt-builder';
import { RfefSearchService } from './rfef-search.service';

describe('RfefAssistantService', () => {
  const source = result('official-1', 0.82, 'high');
  const secondSource = result('official-2', 0.71, 'medium');
  let search: ReturnType<typeof vi.fn>;
  let build: ReturnType<typeof vi.fn>;
  let generate: ReturnType<typeof vi.fn>;
  let llm: {
    canGenerate: boolean;
    state: ReturnType<typeof vi.fn>;
    generate: ReturnType<typeof vi.fn>;
  };
  let service: RfefAssistantService;

  beforeEach(() => {
    search = vi.fn().mockResolvedValue([source, secondSource]);
    build = vi.fn().mockReturnValue({ system: 'system', user: 'user' } satisfies RfefPrompt);
    generate = vi.fn().mockResolvedValue('Respuesta basada en el contexto.');
    llm = { canGenerate: true, state: vi.fn().mockReturnValue('installed'), generate };
    TestBed.configureTestingModule({
      providers: [
        RfefAssistantService,
        { provide: RfefSearchService, useValue: { search } },
        { provide: RfefPromptBuilder, useValue: { build } },
        { provide: RfefLocalLlmService, useValue: llm },
      ],
    });
    service = TestBed.inject(RfefAssistantService);
  });

  it('retrieves official chunks before building the prompt and generating', async () => {
    const answer = await service.ask('¿Una roja al entrenador suma falta?');

    expect(search).toHaveBeenCalledWith('¿Una roja al entrenador suma falta?');
    expect(build).toHaveBeenCalledWith(
      '¿Una roja al entrenador suma falta?',
      [source, secondSource],
      undefined,
    );
    expect(search.mock.invocationCallOrder[0]).toBeLessThan(build.mock.invocationCallOrder[0]);
    expect(answer.mode).toBe('generated');
    expect(answer.sources).toEqual([source, secondSource]);
  });

  it('does not call the LLM when retrieval evidence is below threshold', async () => {
    search.mockResolvedValue([result('weak', 2)]);

    const answer = await service.ask('¿Qué regla se aplica al partido?');

    expect(answer.text).toBe(RFEF_NO_EVIDENCE_MESSAGE);
    expect(answer.mode).toBe('search-only');
    expect(generate).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
  });

  it('keeps sources exclusively from retrieval even if generated text names a fake source', async () => {
    generate.mockResolvedValue('Según la Circular inventada 999, ocurre algo.');

    const answer = await service.ask('¿Cuánto dura una inferioridad?');

    expect(answer.sources).toEqual([source, secondSource]);
    expect(answer.sources.some((item) => item.id.includes('999'))).toBe(false);
  });

  it('falls back to search-only and retains sources if generation fails', async () => {
    generate.mockRejectedValue(new Error('device lost'));

    const answer = await service.ask('¿Cuánto dura una inferioridad?');

    expect(answer.mode).toBe('search-only');
    expect(answer.reason).toBe('generation-error');
    expect(answer.sources).toEqual([source, secondSource]);
  });

  it('does not use the LLM as a general chatbot', async () => {
    const answer = await service.ask('¿Quién ganó la Champions?');

    expect(search).toHaveBeenCalled();
    expect(answer.text).toBe(RFEF_OUT_OF_SCOPE_MESSAGE);
    expect(answer.sources).toEqual([]);
    expect(generate).not.toHaveBeenCalled();
  });

  it('passes structured match context to the prompt builder', async () => {
    const context: RfefMatchContext = {
      period: 1,
      clock: '04:20',
      ownAccumulatedFouls: 5,
      opponentAccumulatedFouls: 2,
      ownPlayersOnCourt: 5,
      opponentPlayersOnCourt: 5,
      activeReductions: [],
    };

    await service.ask('¿Qué pasa si amonestan al entrenador por protestar?', context);

    expect(build).toHaveBeenCalledWith(expect.any(String), [source, secondSource], context);
  });
});

function result(
  id: string,
  score: number,
  relevance?: RfefSearchResult['relevance'],
): RfefSearchResult {
  return {
    id,
    score,
    relevance,
    season: '2026/27',
    documentId: 'document',
    documentTitle: 'Circular oficial',
    documentDate: '2026-08-01',
    section: 'Disciplina',
    page: 4,
    text: 'Fragmento oficial recuperado.',
    keywords: ['disciplina'],
    sourceUrl: 'https://rfef.es/documento-oficial.pdf',
  };
}
