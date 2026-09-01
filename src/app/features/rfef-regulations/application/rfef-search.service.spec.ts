import { RfefCorpusChunk } from '../domain/rfef-corpus';
import { expandRfefQuery, normalizeRfefText, rankRfefChunks } from './rfef-search.service';

const sourceUrl = 'https://rfef.es/documento-oficial.pdf';

function chunk(overrides: Partial<RfefCorpusChunk> = {}): RfefCorpusChunk {
  return {
    id: 'fixture',
    season: '2026/27',
    documentId: 'doc',
    documentTitle: 'Circular oficial',
    documentDate: '2026-08-26',
    section: 'Sección general',
    text: 'Texto exacto de la fuente.',
    keywords: [],
    sourceUrl,
    ...overrides,
  };
}

describe('RfefSearchService', () => {
  it('normaliza mayúsculas, acentos, puntuación y espacios', () => {
    expect(normalizeRfefText('  6.ª  FÁLTA — técnica ')).toBe('6a falta tecnica');
  });

  it('expande los sinónimos reglamentarios explícitos', () => {
    expect(expandRfefQuery('doble penalti')).toEqual(
      expect.arrayContaining(['sexta', 'falta', 'tiro', 'sin', 'barrera']),
    );
    expect(expandRfefQuery('entrenador')).toEqual(
      expect.arrayContaining(['cuerpo', 'tecnico', 'banquillo']),
    );
  });

  it('encuentra coincidencias en palabras clave', () => {
    const result = rankRfefChunks([chunk({ keywords: ['banquillo'] })], 'banquillo');
    expect(result).toHaveLength(1);
  });

  it('pondera sección por encima de keywords, texto y título', () => {
    const results = rankRfefChunks(
      [
        chunk({ id: 'title', documentTitle: 'Banquillo' }),
        chunk({ id: 'text', text: 'Banquillo' }),
        chunk({ id: 'keyword', keywords: ['banquillo'] }),
        chunk({ id: 'section', section: 'Banquillo' }),
      ],
      'banquillo',
    );
    expect(results.map((result) => result.id)).toEqual(['section', 'keyword', 'text', 'title']);
  });

  it('devuelve vacío si no hay coincidencia suficiente', () => {
    expect(rankRfefChunks([chunk()], 'portero-jugador')).toEqual([]);
  });

  it('limita la respuesta a cinco referencias', () => {
    const fixtures = Array.from({ length: 7 }, (_, index) =>
      chunk({ id: String(index), keywords: ['tarjeta'] }),
    );
    expect(rankRfefChunks(fixtures, 'tarjeta')).toHaveLength(5);
  });

  it('conserva literalmente texto, metadatos y enlace de la fuente', () => {
    const fixture = chunk({ text: 'Fragmento oficial exacto.', keywords: ['tarjeta'] });
    const [result] = rankRfefChunks([fixture], 'tarjeta');
    expect(result.text).toBe(fixture.text);
    expect(result.documentTitle).toBe(fixture.documentTitle);
    expect(result.sourceUrl).toBe(sourceUrl);
  });
});
