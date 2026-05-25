import {
  SourceAdapter,
  CanonicalRecord,
  Identifier,
  SearchQuery,
  PluginPrefs,
} from "../types";
import { politeFetch } from "../http";

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
      const response = await politeFetch(
        `https://api.crossref.org/works/${encodeURIComponent(identifier.doi)}`,
        { headers: this.getHeaders(prefs) },
        timeout,
      );
      if (!response.ok) return null;

      const data = await response.json();
      return this.normalize(data.message);
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

    // Simple title search for demonstration
    try {
      const url = new URL("https://api.crossref.org/works");
      url.searchParams.append("query.title", query.title);
      if (query.authors && query.authors.length > 0) {
        url.searchParams.append("query.author", query.authors[0]);
      }
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const response = await politeFetch(
        url.toString(),
        { headers: this.getHeaders(prefs) },
        timeout,
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data.message.items || [])
        .map((item: any) => this.normalize(item))
        .slice(0, 5);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: Crossref search failed - ${e}`);
      return [];
    }
  }

  private normalize(item: any): CanonicalRecord {
    const authors = (item.author || []).map((a: any) => ({
      family: a.family || "",
      given: a.given || "",
      raw: `${a.given || ""} ${a.family || ""}`.trim(),
    }));

    let year: number | undefined;
    if (
      item.published &&
      item.published["date-parts"] &&
      item.published["date-parts"][0]
    ) {
      year = item.published["date-parts"][0][0];
    }

    return {
      identifiers: { doi: item.DOI },
      title: item.title?.length > 0 ? item.title[0] : "",
      authors,
      year,
      venue: item["container-title"]
        ? {
            name: item["container-title"][0],
            type: this.mapVenueType(item.type),
            volume: item.volume,
            issue: item.issue,
            pages: item.page,
          }
        : undefined,
      source: this.id,
      sourceUrl: item.URL || `https://doi.org/${item.DOI}`,
      confidence: 1.0, // Directly from Crossref via DOI
      rawResponse: item,
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
