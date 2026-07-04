import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON } from "../http";

export class DblpAdapter implements SourceAdapter {
  readonly id = "dblp";
  readonly displayName = "DBLP Computer Science Bibliography";
  readonly tier = 2;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 2, concurrent: 2 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.dblp.enabled"] === true;
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    // DBLP's search API only matches by dblp key here; free-text DOI queries
    // return no hits, so DOI lookups fall through to title search instead.
    if (identifier.dblpKey) {
      return this.fetchFromDblp(
        `https://dblp.org/search/publ/api?q=key:${encodeURIComponent(identifier.dblpKey)}&format=json`,
      );
    }
    return null;
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];
    let term = query.title.replace(/[:\-/]/g, " ");
    if (query.authors && query.authors.length > 0) {
      term += ` author:${query.authors[0]}`;
    }

    const timeout = prefs?.["behavior.timeout_sec"] || 10;
    const url = `https://dblp.org/search/publ/api?q=${encodeURIComponent(term)}&format=json&h=5`;
    try {
      const data = await fetchJSON(url, {}, timeout);
      const hits = data?.result?.hits?.hit;
      if (!hits) return [];

      return (Array.isArray(hits) ? hits : [hits]).map((h: any) =>
        this.transformRecord(h.info),
      );
    } catch (e) {
      throw new Error(
        `Search failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private async fetchFromDblp(url: string): Promise<CanonicalRecord | null> {
    try {
      const data = await fetchJSON(url);
      const hit = data?.result?.hits?.hit?.[0];
      return hit ? this.transformRecord(hit.info) : null;
    } catch {
      return null;
    }
  }

  private transformRecord(info: any): CanonicalRecord {
    // DBLP returns single authors as an object or strings occasionally, normalize to array
    let rawAuthors = info.authors?.author || [];
    if (!Array.isArray(rawAuthors)) {
      rawAuthors = [rawAuthors];
    }

    const authors = rawAuthors.map((a: any) => {
      const name = typeof a === "string" ? a : a.text || "";
      return parseAuthorName(name);
    });

    return {
      identifiers: {
        doi: info.doi,
        dblpKey: info.key,
      },
      title: info.title || "",
      authors,
      year: parseYear(info.year),
      venue: info.venue
        ? {
            name: info.venue,
            type:
              info.type === "Conference and Workshop Papers"
                ? "conference"
                : "journal",
            volume: info.volume,
            issue: info.number,
            pages: info.pages,
          }
        : undefined,
      source: this.id,
      sourceUrl: info.ee || `https://dblp.org/rec/${info.key}`,
      confidence: 0.85,
      rawResponse: info,
    };
  }
}
