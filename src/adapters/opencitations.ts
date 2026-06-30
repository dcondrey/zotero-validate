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
        `https://opencitations.net/index/coci/api/v1/metadata/${encodeURIComponent(identifier.doi)}`,
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

  private normalize(item: any): CanonicalRecord {
    if (!item || typeof item !== "object") {
      return this.emptyRecord(item);
    }

    const authorStr = safeString(item.author);
    const authors = authorStr
      ? authorStr
          .split(";")
          .map((name: string) => parseAuthorName(name.trim()))
          .filter((a: { family: string }) => a.family !== "")
      : [];

    const doi = safeString(item.oc_doi || item.doi);
    const sourceTitle = safeString(item.source_title);

    return {
      identifiers: { doi: doi || undefined },
      title: safeString(item.title),
      authors,
      year: parseYear(item.year),
      venue: sourceTitle
        ? {
            name: sourceTitle,
            type: "journal",
            volume: safeString(item.volume) || undefined,
            issue: safeString(item.issue) || undefined,
            pages: safeString(item.page) || undefined,
          }
        : undefined,
      source: this.id,
      sourceUrl: doi ? `https://doi.org/${doi}` : "https://opencitations.net",
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
