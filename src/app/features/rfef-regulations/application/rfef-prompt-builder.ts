import { Injectable } from '@angular/core';
import { RFEF_NO_EVIDENCE_MESSAGE, RfefMatchContext, RfefPrompt } from '../domain/rfef-assistant';
import { RfefSearchResult } from '../domain/rfef-corpus';

@Injectable({ providedIn: 'root' })
export class RfefPromptBuilder {
  build(
    question: string,
    sources: readonly RfefSearchResult[],
    matchContext?: RfefMatchContext,
  ): RfefPrompt {
    const normativeContext = sources
      .map(
        (source, index) =>
          `[FRAGMENTO ${index + 1}]\nDocumento: ${source.documentTitle}\nFecha: ${source.documentDate}\nSección: ${source.section}${source.page ? `\nPágina: ${source.page}` : ''}\nTexto: ${source.text}`,
      )
      .join('\n\n');

    return {
      system: [
        'Eres un asistente especializado exclusivamente en las reglas de fútbol sala RFEF de la temporada 2026/27.',
        'Responde únicamente con la información del CONTEXTO NORMATIVO proporcionado.',
        'No uses conocimiento general, otras temporadas ni memoria propia.',
        `Si falta información suficiente, responde exactamente: "${RFEF_NO_EVIDENCE_MESSAGE}"`,
        'No inventes reglas, artículos, páginas, documentos, sanciones ni excepciones.',
        'Si un documento posterior rectifica uno anterior, aplica la prioridad indicada por el contexto.',
        'Diferencia, cuando sea relevante, regla de juego, criterio arbitral, regla de competición e interpretación.',
        'Responde en español claro, breve y práctico.',
        'No generes bibliografía, citas ni una sección de fuentes; la aplicación las añade externamente.',
        'La SITUACIÓN DEL PARTIDO, si existe, solo aporta hechos y nunca es una fuente normativa.',
      ].join('\n'),
      user: [
        'CONTEXTO NORMATIVO (FUENTE DE VERDAD)',
        normativeContext,
        '',
        'SITUACIÓN DEL PARTIDO (DATOS NO NORMATIVOS)',
        matchContext ? formatMatchContext(matchContext) : 'No proporcionada.',
        '',
        'PREGUNTA',
        question.trim(),
      ].join('\n'),
    };
  }
}

function formatMatchContext(context: RfefMatchContext): string {
  const reductions = context.activeReductions.length
    ? context.activeReductions
        .map(
          (item) =>
            `${item.team === 'own' ? 'equipo propio' : 'rival'}: ${item.status}, ${item.remainingSeconds} s`,
        )
        .join('; ')
    : 'ninguna';
  return [
    `Periodo: ${context.period}`,
    `Reloj: ${context.clock}`,
    `Faltas acumuladas propias: ${context.ownAccumulatedFouls}`,
    `Faltas acumuladas rivales: ${context.opponentAccumulatedFouls}`,
    `Jugadores propios en pista: ${context.ownPlayersOnCourt}`,
    `Jugadores rivales en pista: ${context.opponentPlayersOnCourt}`,
    `Reducciones activas: ${reductions}`,
  ].join('\n');
}
