import { RfefMatchContext } from '../domain/rfef-assistant';
import { RfefSearchResult } from '../domain/rfef-corpus';
import { RfefPromptBuilder } from './rfef-prompt-builder';

describe('RfefPromptBuilder', () => {
  it('separates normative sources from non-normative match facts', () => {
    const source: RfefSearchResult = {
      id: 'source-1',
      score: 1,
      relevance: 'high',
      season: '2026/27',
      documentId: 'doc',
      documentTitle: 'Circular 10',
      documentDate: '2026-08-01',
      section: 'Banquillos',
      page: 7,
      text: 'La conducta se sanciona conforme al fragmento.',
      keywords: ['banquillo'],
      sourceUrl: 'https://rfef.es/circular.pdf',
    };
    const context: RfefMatchContext = {
      period: 2,
      clock: '03:00',
      ownAccumulatedFouls: 5,
      opponentAccumulatedFouls: 1,
      ownPlayersOnCourt: 5,
      opponentPlayersOnCourt: 4,
      activeReductions: [{ team: 'opponent', remainingSeconds: 45, status: 'active' }],
    };

    const prompt = new RfefPromptBuilder().build('¿Qué ocurre?', [source], context);

    expect(prompt.user).toContain('CONTEXTO NORMATIVO (FUENTE DE VERDAD)');
    expect(prompt.user).toContain('La conducta se sanciona conforme al fragmento.');
    expect(prompt.user).toContain('SITUACIÓN DEL PARTIDO (DATOS NO NORMATIVOS)');
    expect(prompt.user).toContain('Faltas acumuladas propias: 5');
    expect(prompt.system).toContain('nunca es una fuente normativa');
    expect(prompt.system).toContain('No generes bibliografía');
  });
});
