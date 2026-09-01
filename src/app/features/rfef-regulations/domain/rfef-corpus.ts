export interface RfefCorpusManifest {
  corpusId: string;
  version: string;
  federation: 'RFEF';
  sport: 'Fútbol Sala';
  season: '2026/27';
  revisionDate: string;
  generatedAt: string;
  chunksFile: string;
  chunkCount: number;
  documents: readonly RfefCorpusDocument[];
}

export interface RfefCorpusDocument {
  id: string;
  title: string;
  date: string;
  sourceUrl: string;
}

export interface RfefCorpusChunk {
  id: string;
  season: string;
  documentId: string;
  documentTitle: string;
  documentDate: string;
  section: string;
  page?: number;
  text: string;
  keywords: readonly string[];
  sourceUrl: string;
}

export interface RfefCorpus {
  manifest: RfefCorpusManifest;
  chunks: readonly RfefCorpusChunk[];
}

export interface RfefSearchResult extends RfefCorpusChunk {
  score: number;
}
