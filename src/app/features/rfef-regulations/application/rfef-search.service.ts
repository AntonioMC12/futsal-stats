import { Injectable, inject } from '@angular/core';
import { RfefCorpusChunk, RfefSearchResult } from '../domain/rfef-corpus';
import { RfefCorpusService } from './rfef-corpus.service';

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  roja: ['expulsion'],
  'tarjeta roja': ['expulsion'],
  entrenador: ['cuerpo tecnico', 'banquillo'],
  coach: ['cuerpo tecnico', 'banquillo'],
  'doble penalti': ['sexta falta', 'tiro sin barrera', 'tiro libre sin barrera'],
  '6a falta': ['sexta falta', 'tiro sin barrera', 'tiro libre sin barrera'],
  'sexta falta': ['6a falta', 'tiro sin barrera', 'tiro libre sin barrera'],
};

export function normalizeRfefText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/(\d)\s*\.?\s*ª/g, '$1a')
    .replace(/(\d)\s*\.?\s*º/g, '$1o')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function expandRfefQuery(query: string): readonly string[] {
  const normalized = normalizeRfefText(query);
  if (!normalized) return [];
  const expanded = new Set(normalized.split(' '));
  for (const [term, synonyms] of Object.entries(SYNONYMS)) {
    if (normalized.includes(term)) {
      for (const synonym of synonyms) {
        for (const token of synonym.split(' ')) expanded.add(token);
      }
    }
  }
  return [...expanded];
}

export function rankRfefChunks(
  chunks: readonly RfefCorpusChunk[],
  query: string,
  limit = 5,
): readonly RfefSearchResult[] {
  const normalizedQuery = normalizeRfefText(query);
  const tokens = expandRfefQuery(query);
  if (tokens.length === 0) return [];

  return chunks
    .map((chunk) => {
      const section = normalizeRfefText(chunk.section);
      const keywords = chunk.keywords.map(normalizeRfefText).join(' ');
      const text = normalizeRfefText(chunk.text);
      const title = normalizeRfefText(chunk.documentTitle);
      const searchable = `${section} ${keywords} ${text} ${title}`;
      if (normalizedQuery === 'portero jugador' && !searchable.includes('portero jugador')) {
        return { ...chunk, score: 0 };
      }
      let score = 0;
      for (const token of tokens) {
        if (section.includes(token)) score += 16;
        if (keywords.includes(token)) score += 8;
        if (text.includes(token)) score += 3;
        if (title.includes(token)) score += 1;
      }
      return { ...chunk, score };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

@Injectable({ providedIn: 'root' })
export class RfefSearchService {
  private readonly corpus = inject(RfefCorpusService);

  async search(query: string): Promise<readonly RfefSearchResult[]> {
    const { chunks } = await this.corpus.load();
    return rankRfefChunks(chunks, query);
  }
}
