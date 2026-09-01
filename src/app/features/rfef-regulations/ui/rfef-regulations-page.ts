import { Location } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RfefCorpusService } from '../application/rfef-corpus.service';
import { RfefEmbeddingService } from '../application/rfef-embedding.service';
import { RfefSearchService } from '../application/rfef-search.service';
import { RfefCorpusManifest, RfefSearchResult } from '../domain/rfef-corpus';

@Component({
  selector: 'app-rfef-regulations-page',
  templateUrl: './rfef-regulations-page.html',
  styleUrl: './rfef-regulations-page.scss',
})
export class RfefRegulationsPage {
  private readonly corpus = inject(RfefCorpusService);
  private readonly searcher = inject(RfefSearchService);
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
  protected readonly query = signal('');
  protected readonly manifest = signal<RfefCorpusManifest | null>(null);
  protected readonly results = signal<readonly RfefSearchResult[]>([]);
  protected readonly loading = signal(true);
  protected readonly searching = signal(false);
  protected readonly searched = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.loadCorpus();
  }

  protected setQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected submit(event?: Event): void {
    event?.preventDefault();
    void this.runSearch();
  }

  protected useQuickQuery(query: string): void {
    this.query.set(query);
    void this.runSearch();
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

  private async loadCorpus(): Promise<void> {
    try {
      this.manifest.set((await this.corpus.load()).manifest);
    } catch {
      this.error.set('No se ha podido cargar el corpus RFEF instalado.');
    } finally {
      this.loading.set(false);
    }
  }

  private async runSearch(): Promise<void> {
    if (!this.query().trim() || this.searching()) return;
    this.searching.set(true);
    this.error.set(null);
    try {
      this.results.set(await this.searcher.search(this.query()));
      this.searched.set(true);
    } catch {
      this.results.set([]);
      this.error.set('No se ha podido consultar el corpus RFEF instalado.');
    } finally {
      this.searching.set(false);
    }
  }
}
