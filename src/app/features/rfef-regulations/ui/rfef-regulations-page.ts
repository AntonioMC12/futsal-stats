import { Location } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { RfefAssistantService } from '../application/rfef-assistant.service';
import { RfefCorpusService } from '../application/rfef-corpus.service';
import { RfefEmbeddingService } from '../application/rfef-embedding.service';
import { RfefLocalLlmService } from '../application/rfef-local-llm.service';
import { RfefMatchContextService } from '../application/rfef-match-context.service';
import { RFEF_LOCAL_MODEL, RfefAnswer, RfefMatchContext } from '../domain/rfef-assistant';
import { RfefCorpusManifest } from '../domain/rfef-corpus';

@Component({
  selector: 'app-rfef-regulations-page',
  templateUrl: './rfef-regulations-page.html',
  styleUrl: './rfef-regulations-page.scss',
})
export class RfefRegulationsPage {
  private readonly assistant = inject(RfefAssistantService);
  private readonly corpus = inject(RfefCorpusService);
  private readonly matchContexts = inject(RfefMatchContextService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  protected readonly quickQueries = [
    '6ª falta',
    'Expulsiones',
    'Banquillo',
    'Tarjetas',
    'Sustituciones',
    'Portero-jugador',
  ] as const;
  protected readonly embeddings = inject(RfefEmbeddingService);
  protected readonly llm = inject(RfefLocalLlmService);
  protected readonly model = RFEF_LOCAL_MODEL;
  protected readonly query = signal('');
  protected readonly manifest = signal<RfefCorpusManifest | null>(null);
  protected readonly answer = signal<RfefAnswer | null>(null);
  protected readonly matchContext = signal<RfefMatchContext | null>(null);
  protected readonly useMatchContext = signal(false);
  protected readonly loading = signal(true);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.loadPage();
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
  protected setUseMatchContext(event: Event): void {
    this.useMatchContext.set((event.target as HTMLInputElement).checked);
  }
  protected submit(event?: Event): void {
    event?.preventDefault();
    void this.runQuestion();
  }
  protected useQuickQuery(query: string): void {
    this.query.set(query);
    void this.runQuestion();
  }
  protected installAssistant(): void {
    void (async () => {
      await this.llm.install();
      if (this.llm.isInstalled && this.searched()) await this.runQuestion();
    })();
  }
  protected removeAssistant(): void {
    void this.llm.remove();
  }
  protected goBack(): void {
    this.location.back();
  }

  protected revisionLabel(): string {
    const date = this.manifest()?.revisionDate;
    if (!date) return '';
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`));
  }

  private async loadPage(): Promise<void> {
    const matchId = this.route.snapshot.queryParamMap.get('matchId');
    const [corpusResult, context] = await Promise.all([
      this.corpus.load().catch(() => null),
      this.matchContexts.load(matchId).catch(() => null),
      this.llm.refreshStatus(),
    ]);
    if (corpusResult) this.manifest.set(corpusResult.manifest);
    else this.error.set('No se ha podido cargar el corpus RFEF instalado.');
    this.matchContext.set(context);
    this.loading.set(false);
  }

  private async runQuestion(): Promise<void> {
    if (!this.query().trim() || this.searching()) return;
    this.searching.set(true);
    this.error.set(null);
    try {
      this.answer.set(
        await this.assistant.ask(
          this.query(),
          this.useMatchContext() ? (this.matchContext() ?? undefined) : undefined,
        ),
      );
      this.searched.set(true);
    } catch {
      this.answer.set(null);
      this.error.set('No se ha podido consultar el corpus RFEF instalado.');
    } finally {
      this.searching.set(false);
    }
  }
}
