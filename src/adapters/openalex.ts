import {
  SourceAdapter,
  CanonicalRecord,
  Identifier,
  SearchQuery,
  PluginPrefs,
} from "../types";
import { politeFetch } from "../http";
import { parseAuthorName } from "./utils";

export class OpenAlexAdapter implements SourceAdapter {
  id = "openalex";
  displayName = "OpenAlex";
  tier = 1 as const;
  requiresCredential = false;
  rateLimit = { perSecond: 10, concurrent: 5 }; // Polite pool

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.openalex.enabled"] !== false;
  }

  private getUrl(path: string, prefs: PluginPrefs): string {
    const url = new URL(`https://api.openalex.org${path}`);
    const email = prefs["sources.openalex.email"];
    if (email) {
      url.searchParams.append("mailto", email);
    }
    return url.toString();
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    let path = "";
    if (identifier.doi) {
      path = `/works/doi:${identifier.doi}`;
    } else if (identifier.pmid) {
      path = `/works/pmid:${identifier.pmid}`;
    } else if (identifier.arxivId) {
      path = `/works/arxiv:${identifier.arxivId}`;
    } else {
      return null;
    }

    try {
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const response = await politeFetch(this.getUrl(path, prefs), {}, timeout);
      if (!response.ok) return null;
      const data = await response.json();
      return this.normalize(data, 1.0);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: OpenAlex getById failed - ${e}`);
      return null;
    }
  }

  async search(
    query: SearchQuery,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];
    try {
      // Basic search by title
      const url = new URL(this.getUrl("/works", prefs));
      url.searchParams.append("search", query.title);
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const response = await politeFetch(url.toString(), {}, timeout);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.results || [])
        .map((item: any) => this.normalize(item, 0.85))
        .slice(0, 5);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: OpenAlex search failed - ${e}`);
      return [];
    }
  }

  private normalize(item: any, confidence: number): CanonicalRecord {
    const authors = (item.authorships || []).map((a: any) =>
      parseAuthorName(a.author?.display_name || ""),
    );

    const identifiers: Identifier = {};
    if (item.doi) identifiers.doi = item.doi.replace("https://doi.org/", "");
    if (item.ids?.pmid)
      identifiers.pmid = item.ids.pmid.replace(
        "https://pubmed.ncbi.nlm.nih.gov/",
        "",
      );

    return {
      identifiers,
      title: item.title || "",
      authors,
      year: item.publication_year,
      venue: item.primary_location?.source?.display_name
        ? {
            name: item.primary_location.source.display_name,
            type:
              item.primary_location.source.type === "journal"
                ? "journal"
                : "other",
            volume: item.biblio?.volume,
            issue: item.biblio?.issue,
            pages:
              item.biblio?.first_page && item.biblio?.last_page
                ? `${item.biblio.first_page}-${item.biblio.last_page}`
                : item.biblio?.first_page,
          }
        : undefined,
      source: this.id,
      sourceUrl: item.id || "",
      confidence,
      rawResponse: item,
    };
  }
}
