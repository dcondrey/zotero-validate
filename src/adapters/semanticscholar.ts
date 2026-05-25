import { parseAuthorName } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";

export class SemanticScholarAdapter implements SourceAdapter {
  readonly id = "semanticscholar";
  readonly displayName = "Semantic Scholar";
  readonly tier = 2;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 }; // Safe fallback for public tier

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.semanticscholar.enabled"] === true;
  }

  private getHeaders(prefs?: PluginPrefs): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const apiKey = prefs?.["sources.semanticscholar.key"];
    if (apiKey) {
      headers["x-api-key"] = apiKey;
    }
    return headers;
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    let targetId = "";
    if (identifier.doi) targetId = `DOI:${identifier.doi}`;
    else if (identifier.semanticScholarId)
      targetId = identifier.semanticScholarId;
    else if (identifier.arxivId) targetId = `ARXIV:${identifier.arxivId}`;
    else if (identifier.pmid) targetId = `PMID:${identifier.pmid}`;

    if (!targetId) return null;

    const fields =
      "title,authors,year,venue,externalIds,publicationVenue,citationCount";
    const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(targetId)}?fields=${fields}`;

    try {
      const response = await fetch(url, { headers: this.getHeaders(prefs) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      return this.transformRecord(data, 1.0);
    } catch (e) {
      throw new Error(
        `Lookup failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    let queryString = query.title;
    if (query.authors && query.authors.length > 0) {
      queryString += ` ${query.authors[0]}`;
    }

    const fields = "title,authors,year,venue,externalIds,publicationVenue";
    const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(queryString)}&fields=${fields}&limit=5`;

    try {
      const response = await fetch(url, { headers: this.getHeaders(prefs) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      if (!data.data || !Array.isArray(data.data)) return [];

      return data.data.map((item: any) => this.transformRecord(item, 0.8));
    } catch (e) {
      throw new Error(
        `Search failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private transformRecord(raw: any, confidence: number): CanonicalRecord {
    const authors = (raw.authors || []).map((a: any) =>
      parseAuthorName(a?.name || ""),
    );

    const extIds = raw.externalIds || {};
    const venueType = raw.publicationVenue?.type?.toLowerCase();

    return {
      identifiers: {
        doi: extIds.DOI,
        arxivId: extIds.ArXiv,
        pmid: extIds.PubMed,
        isbn: extIds.ISBN,
        semanticScholarId: raw.paperId,
      },
      title: raw.title || "",
      authors,
      year: raw.year ? parseInt(raw.year, 10) : undefined,
      venue: raw.venue
        ? {
            name: raw.venue,
            type: ["journal", "conference", "book"].includes(venueType)
              ? venueType
              : "other",
          }
        : undefined,
      source: this.id,
      sourceUrl:
        raw.url || `https://www.semanticscholar.org/paper/${raw.paperId}`,
      confidence,
      rawResponse: raw,
    };
  }
}
