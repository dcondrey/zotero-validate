import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, safeString, safeArray, safeGet } from "../http";

export class UnpaywallAdapter implements SourceAdapter {
  id = "unpaywall";
  displayName = "Unpaywall";
  tier = 3 as const;
  requiresCredential = false;
  rateLimit = { perSecond: 10, concurrent: 3 };

  isConfigured(prefs: PluginPrefs): boolean {
    if (prefs["sources.unpaywall.enabled"] === false) return false;
    return !!this.getEmail(prefs);
  }

  private getEmail(prefs: PluginPrefs): string | undefined {
    return (
      prefs["sources.crossref.email"] ||
      prefs["sources.openalex.email"] ||
      undefined
    );
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    if (!identifier.doi) return null;

    const email = this.getEmail(prefs);
    if (!email) {
      Zotero.debug(
        "ReferenceValidator: Unpaywall getById skipped - no email configured",
      );
      return null;
    }

    try {
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const url = `https://api.unpaywall.org/v2/${encodeURIComponent(identifier.doi)}?email=${encodeURIComponent(email)}`;
      const data = await fetchJSON(url, {}, timeout);
      if (!data) return null;
      return this.normalize(data);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: Unpaywall getById failed - ${e}`);
      return null;
    }
  }

  async search(
    _query: SearchQuery,
    _prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    // Unpaywall API does not provide a search endpoint
    return [];
  }

  private normalize(item: any): CanonicalRecord {
    if (!item || typeof item !== "object") {
      return this.emptyRecord(item);
    }

    const authors = safeArray(item.z_authors).map((a: any) => ({
      family: safeString(a?.family),
      given: safeString(a?.given),
      raw: `${safeString(a?.given)} ${safeString(a?.family)}`.trim(),
    }));

    const doi = safeString(item.doi);
    const journalName = safeString(item.journal_name);
    const volume = safeString(item.volume) || undefined;
    const issue = safeString(item.issue) || undefined;

    return {
      identifiers: { doi: doi || undefined },
      title: safeString(item.title),
      authors,
      year: parseYear(item.year),
      venue: journalName
        ? {
            name: journalName,
            type: "journal",
            volume,
            issue,
          }
        : undefined,
      source: this.id,
      sourceUrl: doi ? `https://doi.org/${doi}` : "https://unpaywall.org",
      confidence: 0.75,
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
