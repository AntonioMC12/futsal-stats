import { RfefSearchResult } from './rfef-corpus';

export const RFEF_LOCAL_MODEL = {
  id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  label: 'Qwen 2.5 0.5B Instruct',
  approximateDownload: 'aprox. 500 MB',
  approximateVram: 'aprox. 945 MB de memoria gráfica',
} as const;

export const RFEF_NO_EVIDENCE_MESSAGE =
  'No encuentro respaldo suficiente en la normativa RFEF 2026/27 instalada.';
export const RFEF_OUT_OF_SCOPE_MESSAGE =
  'Este asistente solo consulta la normativa RFEF de fútbol sala 2026/27.';

export interface RfefMatchReductionContext {
  team: 'own' | 'opponent';
  remainingSeconds: number;
  status: 'active' | 'replacementAllowed';
}

export interface RfefMatchContext {
  period: number;
  clock: string;
  ownAccumulatedFouls: number;
  opponentAccumulatedFouls: number;
  ownPlayersOnCourt: number;
  opponentPlayersOnCourt: number;
  activeReductions: readonly RfefMatchReductionContext[];
}

export interface RfefAnswer {
  text: string;
  sources: readonly RfefSearchResult[];
  mode: 'generated' | 'search-only';
  confidence: 'high' | 'medium' | 'low';
  reason?: 'not-installed' | 'unavailable' | 'generation-error' | 'no-evidence' | 'out-of-scope';
}

export interface RfefPrompt {
  system: string;
  user: string;
}
