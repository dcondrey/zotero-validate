export interface Identifier {
  doi?: string;
  arxivId?: string;
  pmid?: string;
  isbn?: string;
  openAlexId?: string;
  semanticScholarId?: string;
  dblpKey?: string;
  aclAnthologyId?: string;
  openReviewId?: string;
}

export interface CanonicalRecord {
  identifiers: Identifier;
  title: string;
  authors: Array<{
    family: string;
    given: string;
    raw: string;
  }>;
  year?: number;
  venue?: {
    name: string;
    type: 'journal' | 'conference' | 'workshop' | 'preprint' | 'book' | 'other';
    volume?: string;
    issue?: string;
    pages?: string;
  };
  source: string;
  sourceUrl: string;
  confidence: number;
  rawResponse: unknown;
}

export interface SearchQuery {
  title?: string;
  authors?: string[];
  year?: number;
}

export interface PluginPrefs {
  [key: string]: any;
}

export interface SourceAdapter {
  readonly id: string;
  readonly displayName: string;
  readonly tier: 1 | 2 | 3;
  readonly requiresCredential: boolean;
  readonly rateLimit: { perSecond: number; concurrent: number };

  isConfigured(prefs: PluginPrefs): boolean;
  getById(identifier: Identifier): Promise<CanonicalRecord | null>;
  search(query: SearchQuery): Promise<CanonicalRecord[]>;
}

export interface FieldDiff {
  field: string;
  status: 'match' | 'mismatch' | 'missing-zotero' | 'missing-source';
  zoteroValue?: any;
  sourceValue?: any;
  diagnostic?: string;
}
