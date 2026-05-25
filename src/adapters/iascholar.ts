import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, safeString, safeArray, safeGet } from "../http";

const BASE_URL = "https://scholar.archive.org";

export class IAScholarAdapter implements SourceAdapter {
  readonly id = "iascholar";
  readonly displayName = "Internet Archive Scholar";
  readonly tier = 3 as const;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.iascholar.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    if (!identifier.doi) return null;

    try {
      const url = `${BASE_URL}/search?q=doi:${encodeURIComponent(identifier.doi)}&format=json&limit=1`;
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(url, {}, timeout);
      if (!data) return null;

      const results = safeArray(safeGet(data, "results"));
      if (results.length === 0) return null;

      return this.normalize(results[0], 0.6);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: IA Scholar getById failed - ${e}`);
      return null;
    }
  }

  async search(
    query: SearchQuery,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    try {
      const url = `${BASE_URL}/search?q=${encodeURIComponent(query.title)}&format=json&limit=5`;
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(url, {}, timeout);
      if (!data) return [];

      const results = safeArray(safeGet(data, "results"));
      return results
        .map((item: unknown) => this.normalize(item, 0.5))
        .filter(
          (r: CanonicalRecord | null): r is CanonicalRecord => r !== null,
        );
    } catch (e) {
      Zotero.debug(`ReferenceValidator: IA Scholar search failed - ${e}`);
      return [];
    }
  }

  private normalize(item: unknown, confidence: number): CanonicalRecord | null {
    const biblio = safeGet(item, "biblio");
    if (!biblio) return null;

    const title = safeString(safeGet(biblio, "title"));
    if (!title) return null;

    const contribNames = safeArray(safeGet(biblio, "contrib_names"));
    const authors = contribNames.map((name: unknown) =>
      parseAuthorName(safeString(name)),
    );

    const identifiers: Identifier = {};
    const doi = safeString(safeGet(biblio, "doi"));
    if (doi) identifiers.doi = doi;
    const pmid = safeString(safeGet(biblio, "pmid"));
    if (pmid) identifiers.pmid = pmid;
    const arxivId = safeString(safeGet(biblio, "arxiv_id"));
    if (arxivId) identifiers.arxivId = arxivId;

    const publisher = safeString(safeGet(biblio, "publisher"));
    const volume = safeString(safeGet(biblio, "volume"));
    const issue = safeString(safeGet(biblio, "issue"));
    const pages = safeString(safeGet(biblio, "pages"));

    const venue = publisher
      ? {
          name: publisher,
          type: "other" as const,
          volume: volume || undefined,
          issue: issue || undefined,
          pages: pages || undefined,
        }
      : undefined;

    const accessUrl = safeString(safeGet(item, "access_url"));
    const sourceUrl = accessUrl || `${BASE_URL}/search?q=doi:${doi}`;

    return {
      identifiers,
      title,
      authors,
      year: parseYear(safeGet(biblio, "year")),
      venue,
      source: this.id,
      sourceUrl,
      confidence,
      rawResponse: item,
    };
  }
}
