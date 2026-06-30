import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, safeString, safeArray } from "../http";

export class OpenCitationsAdapter implements SourceAdapter {
  id = "opencitations";
  displayName = "OpenCitations";
  tier = 3 as const;
  requiresCredential = false;
  rateLimit = { perSecond: 5, concurrent: 2 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.opencitations.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    if (!identifier.doi) return null;

    try {
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(
        `https://opencitations.net/meta/api/v1/metadata/doi:${identifier.doi}`,
        {},
        timeout,
      );
      const results = safeArray(data);
      if (results.length === 0) return null;
      return this.normalize(results[0]);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: OpenCitations getById failed - ${e}`);
      return null;
    }
  }

  async search(
    _query: SearchQuery,
    _prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    // OpenCitations COCI API does not provide a search endpoint
    return [];
  }

  // OpenCitations Meta annotates values with bracketed identifiers,
  // e.g. "Plos One [issn:1932-6203 omid:...]" or "Piwowar, Heather [orcid:...]".
  private stripAnnotations(value: string): string {
    return value.replace(/\s*\[[^\]]*\]/g, "").trim();
  }

  // The "id" field is a space-separated list, e.g.
  // "doi:10.1/x openalex:W1 pmid:123 omid:br/...".
  private parseIds(idField: string): { doi?: string; pmid?: string } {
    const out: { doi?: string; pmid?: string } = {};
    for (const token of safeString(idField).split(/\s+/)) {
      if (token.startsWith("doi:")) out.doi = token.slice(4);
      else if (token.startsWith("pmid:")) out.pmid = token.slice(5);
    }
    return out;
  }

  private normalize(item: any): CanonicalRecord {
    if (!item || typeof item !== "object") {
      return this.emptyRecord(item);
    }

    const ids = this.parseIds(item.id);

    const authorStr = safeString(item.author);
    const authors = authorStr
      ? authorStr
          .split(";")
          .map((name: string) => parseAuthorName(this.stripAnnotations(name)))
          .filter((a: { family: string }) => a.family !== "")
      : [];

    const venueName = this.stripAnnotations(safeString(item.venue));

    const identifiers: Identifier = {};
    if (ids.doi) identifiers.doi = ids.doi;
    if (ids.pmid) identifiers.pmid = ids.pmid;

    return {
      identifiers,
      title: safeString(item.title),
      authors,
      year: parseYear(safeString(item.pub_date).slice(0, 4)),
      venue: venueName
        ? {
            name: venueName,
            type: "journal",
            volume: safeString(item.volume) || undefined,
            issue: safeString(item.issue) || undefined,
            pages: safeString(item.page) || undefined,
          }
        : undefined,
      source: this.id,
      sourceUrl: ids.doi
        ? `https://doi.org/${ids.doi}`
        : "https://opencitations.net",
      confidence: 0.7,
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
}
