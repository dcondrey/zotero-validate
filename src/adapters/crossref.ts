import {
  SourceAdapter,
  CanonicalRecord,
  Identifier,
  SearchQuery,
  PluginPrefs,
} from "../types";
import { fetchJSON, safeString, safeArray, safeGet } from "../http";

export class CrossrefAdapter implements SourceAdapter {
  id = "crossref";
  displayName = "Crossref";
  tier = 1 as const;
  requiresCredential = false;
  rateLimit = { perSecond: 50, concurrent: 10 }; // Polite pool assumes email

  isConfigured(prefs: PluginPrefs): boolean {
    // Technically doesn't require config to work, but email is polite
    return prefs["sources.crossref.enabled"] !== false;
  }

  private getHeaders(prefs: PluginPrefs) {
    const headers: Record<string, string> = {};
    const email = prefs["sources.crossref.email"];
    if (email) {
      headers["User-Agent"] =
        `ZoteroReferenceValidator/0.1.0 (mailto:${email})`;
    }
    return headers;
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    if (!identifier.doi) return null;

    try {
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(
        `https://api.crossref.org/works/${encodeURIComponent(identifier.doi)}`,
        { headers: this.getHeaders(prefs) },
        timeout,
      );
      if (!data?.message) return null;
      return this.normalize(data.message, 1.0);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: Crossref getById failed - ${e}`);
      return null;
    }
  }

  async search(
    query: SearchQuery,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    try {
      const url = new URL("https://api.crossref.org/works");
      url.searchParams.append("query.title", query.title);
      if (query.authors && query.authors.length > 0) {
        url.searchParams.append("query.author", query.authors[0]);
      }
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(
        url.toString(),
        { headers: this.getHeaders(prefs) },
        timeout,
      );
      const items = safeArray(safeGet(data, "message", "items"));
      return items.map((item: any) => this.normalize(item, 0.85)).slice(0, 5);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: Crossref search failed - ${e}`);
      return [];
    }
  }

  private normalize(item: any, confidence: number): CanonicalRecord {
    if (!item || typeof item !== "object") {
      return this.emptyRecord(item);
    }

    const authors = safeArray(item.author).map((a: any) => ({
      family: safeString(a?.family),
      given: safeString(a?.given),
      raw: `${safeString(a?.given)} ${safeString(a?.family)}`.trim(),
    }));

    const dateParts = safeGet(item, "published", "date-parts", "0");
    const year = Array.isArray(dateParts) ? dateParts[0] : undefined;

    const containerTitle = safeArray(item["container-title"]);

    const identifiers: Identifier = { doi: safeString(item.DOI) };
    const altIds = safeArray(item["alternative-id"]);
    const arxivMatch = altIds.find(
      (id: string) => typeof id === "string" && /\d{4}\.\d{4,5}/.test(id),
    );
    if (arxivMatch) {
      const match = arxivMatch.match(/(\d{4}\.\d{4,5})/);
      if (match) identifiers.arxivId = match[1];
    }

    return {
      identifiers,
      title: safeString(safeArray(item.title)[0]),
      authors,
      year: typeof year === "number" ? year : undefined,
      venue:
        containerTitle.length > 0
          ? {
              name: safeString(containerTitle[0]),
              type: this.mapVenueType(item.type),
              volume: item.volume,
              issue: item.issue,
              pages: item.page,
            }
          : undefined,
      source: this.id,
      sourceUrl:
        safeString(item.URL) || `https://doi.org/${safeString(item.DOI)}`,
      confidence,
      rawResponse: item,
    };
  }

  private emptyRecord(raw: any): CanonicalRecord {
    return {
      identifiers: {},
      title: "",
      authors: [],
      source: this.id,
      sourceUrl: "",
      confidence: 0,
      rawResponse: raw,
    };
  }

  private mapVenueType(
    crossrefType?: string,
  ): "journal" | "conference" | "book" | "preprint" | "other" {
    if (!crossrefType) return "other";
    if (crossrefType === "journal-article") return "journal";
    if (
      crossrefType === "proceedings-article" ||
      crossrefType === "conference-paper"
    )
      return "conference";
    if (crossrefType === "book-chapter" || crossrefType === "monograph")
      return "book";
    if (crossrefType === "posted-content") return "preprint";
    return "other";
  }
}
