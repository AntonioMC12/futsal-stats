import { Injectable, inject } from '@angular/core';
import {
  RFEF_NO_EVIDENCE_MESSAGE,
  RFEF_OUT_OF_SCOPE_MESSAGE,
  RfefAnswer,
  RfefMatchContext,
} from '../domain/rfef-assistant';
import { RfefSearchResult } from '../domain/rfef-corpus';
import { RfefLocalLlmService } from './rfef-local-llm.service';
import { RfefPromptBuilder } from './rfef-prompt-builder';
import { normalizeRfefText, RfefSearchService } from './rfef-search.service';

const TOP_K = 4;
const SEARCH_ONLY_MESSAGE =
  'He encontrado referencias relacionadas. Instala o activa el asistente local para obtener una explicación.';
const SCOPE_TERMS = [
  'regla',
  'reglamento',
  'falta',
  'tarjeta',
  'amarilla',
  'roja',
  'expulsion',
  'banquillo',
  'entrenador',
  'jugador',
  'portero',
  'saque',
  'penalti',
  'arbitro',
  'protesta',
  'sustitucion',
  'inferioridad',
  'reduccion',
  'tiempo muerto',
  'partido',
  'equipo',
  'balon',
  'barrera',
  'cancha',
  'capitan',
  'corner',
  'cronometrador',
  'dimension',
  'distancia',
  'equipamiento',
  'fuera de banda',
  'gol',
  'linea',
  'mano',
  'medida',
  'pista',
  'porteria',
  'superficie',
  'terreno',
  'uniforme',
  'ventaja',
  'video',
] as const;

@Injectable({ providedIn: 'root' })
export class RfefAssistantService {
  private readonly searcher = inject(RfefSearchService);
  private readonly promptBuilder = inject(RfefPromptBuilder);
  private readonly llm = inject(RfefLocalLlmService);

  async ask(question: string, matchContext?: RfefMatchContext): Promise<RfefAnswer> {
    const results = await this.searcher.search(question);
    if (!isInScope(question)) {
      return {
        text: RFEF_OUT_OF_SCOPE_MESSAGE,
        sources: [],
        mode: 'search-only',
        confidence: 'low',
        reason: 'out-of-scope',
      };
    }

    const confidence = retrievalConfidence(results);
    const sources = results.slice(0, TOP_K);
    if (confidence === 'low') {
      return {
        text: RFEF_NO_EVIDENCE_MESSAGE,
        sources,
        mode: 'search-only',
        confidence,
        reason: 'no-evidence',
      };
    }

    if (!this.llm.canGenerate) {
      return {
        text: SEARCH_ONLY_MESSAGE,
        sources,
        mode: 'search-only',
        confidence,
        reason: this.llm.state() === 'unsupported' ? 'unavailable' : 'not-installed',
      };
    }

    try {
      const prompt = this.promptBuilder.build(question, sources, matchContext);
      const text = await this.llm.generate(prompt);
      return { text, sources, mode: 'generated', confidence };
    } catch {
      return {
        text: 'No se ha podido generar la explicación local. Conservamos las referencias encontradas.',
        sources,
        mode: 'search-only',
        confidence,
        reason: 'generation-error',
      };
    }
  }
}

export function retrievalConfidence(
  results: readonly RfefSearchResult[],
): RfefAnswer['confidence'] {
  const first = results[0];
  if (!first) return 'low';
  if (first.relevance === 'high') {
    return results.length > 1 ? 'high' : 'medium';
  }
  if (first.relevance === 'medium') return 'medium';
  if (first.score >= 16 && (results[1]?.score ?? 0) >= 3) return 'high';
  if (first.score >= 8) return 'medium';
  return 'low';
}

export function isInScope(question: string): boolean {
  const normalized = normalizeRfefText(question);
  return SCOPE_TERMS.some((term) => normalized.includes(term));
}
