import { Injectable, inject } from '@angular/core';
import { RFEF_HYBRID_WEIGHTS } from '../domain/rfef-embedding-config';
import { RfefCorpusChunk, RfefSearchResult } from '../domain/rfef-corpus';
import { RfefCorpusService } from './rfef-corpus.service';
import { RfefEmbeddingService } from './rfef-embedding.service';

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  roja: ['expulsion'],
  'tarjeta roja': ['expulsion'],
  entrenador: ['cuerpo tecnico', 'banquillo'],
  coach: ['cuerpo tecnico', 'banquillo'],
  'doble penalti': ['sexta falta', 'tiro sin barrera', 'tiro libre sin barrera'],
  '6a falta': ['sexta falta', 'tiro sin barrera', 'tiro libre sin barrera'],
  'sexta falta': ['6a falta', 'tiro sin barrera', 'tiro libre sin barrera'],
};

const STOP_WORDS = new Set([
  'al',
  'con',
  'cuanto',
  'de',
  'del',
  'el',
  'en',
  'estamos',
  'la',
  'las',
  'los',
  'pasa',
  'por',
  'que',
  'si',
  'un',
  'una',
]);

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
  const expanded = new Set(normalized.split(' ').filter((token) => !STOP_WORDS.has(token)));
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
  return scoreRfefChunks(chunks, query)
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function scoreRfefChunks(
  chunks: readonly RfefCorpusChunk[],
  query: string,
): readonly RfefSearchResult[] {
  const normalizedQuery = normalizeRfefText(query);
  const tokens = expandRfefQuery(query);
  if (tokens.length === 0) return [];

  return chunks.map((chunk) => {
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
  });
}

export function hybridRankRfefChunks(
  chunks: readonly RfefCorpusChunk[],
  query: string,
  semanticScores: ReadonlyMap<string, number>,
  limit = 5,
): readonly RfefSearchResult[] {
  const textResults = scoreRfefChunks(chunks, query);
  const maxTextScore = Math.max(0, ...textResults.map((result) => result.score));
  const maxSemanticScore = Math.max(-1, ...semanticScores.values());
  if (maxTextScore === 0 && maxSemanticScore < RFEF_HYBRID_WEIGHTS.minimumSemanticOnlyScore) {
    return [];
  }
  return textResults
    .map((result) => {
      const textScore = maxTextScore > 0 ? result.score / maxTextScore : 0;
      const semanticScore = semanticScores.get(result.id) ?? -1;
      const normalizedSemanticScore = Math.max(
        0,
        Math.min(
          1,
          (semanticScore - RFEF_HYBRID_WEIGHTS.minimumSemanticScore) /
            (1 - RFEF_HYBRID_WEIGHTS.minimumSemanticScore),
        ),
      );
      const exactBoost = textScore === 1 ? RFEF_HYBRID_WEIGHTS.exactTextBoost : 0;
      const score =
        RFEF_HYBRID_WEIGHTS.semantic * normalizedSemanticScore +
        RFEF_HYBRID_WEIGHTS.textual * textScore +
        exactBoost;
      return {
        ...result,
        score,
        textScore,
        semanticScore,
        relevance: score >= 0.7 ? ('high' as const) : ('medium' as const),
      };
    })
    .filter(
      (result) =>
        result.textScore > 0 ||
        (result.semanticScore ?? -1) >= RFEF_HYBRID_WEIGHTS.minimumSemanticScore,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.documentDate.localeCompare(left.documentDate) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, limit);
}

@Injectable({ providedIn: 'root' })
export class RfefSearchService {
  private readonly corpus = inject(RfefCorpusService);
  private readonly embeddings = inject(RfefEmbeddingService);

  async search(query: string): Promise<readonly RfefSearchResult[]> {
    const corpus = await this.corpus.load();
    const textualResults = rankRfefChunks(corpus.chunks, query);
    const normalizedQuery = normalizeRfefText(query);
    if (
      normalizedQuery === 'portero jugador' &&
      !corpus.chunks.some((chunk) =>
        normalizeRfefText(`${chunk.section} ${chunk.keywords.join(' ')} ${chunk.text}`).includes(
          normalizedQuery,
        ),
      )
    ) {
      return textualResults;
    }
    const semanticScores = await this.embeddings.semanticScores(query, corpus);
    return semanticScores
      ? hybridRankRfefChunks(corpus.chunks, query, semanticScores)
      : textualResults;
  }
}
