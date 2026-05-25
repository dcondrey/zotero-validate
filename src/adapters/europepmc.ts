import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, safeString, safeArray, safeGet } from "../http";

const BASE_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest";

export class EuropePMCAdapter implements SourceAdapter {
  readonly id = "europepmc";
  readonly displayName = "Europe PMC";
  readonly tier = 1 as const;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 10, concurrent: 3 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.europepmc.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    let queryTerm: string | undefined;
    if (identifier.doi) {
      queryTerm = `DOI:${identifier.doi}`;
    } else if (identifier.pmid) {
      queryTerm = `PMID:${identifier.pmid}`;
    } else if (identifier.arxivId) {
      queryTerm = `ARXIV:${identifier.arxivId}`;
    }
    if (!queryTerm) return null;

    try {
      const url = new URL(`${BASE_URL}/search`);
      url.searchParams.append("query", queryTerm);
      url.searchParams.append("format", "json");
      url.searchParams.append("resultType", "core");

      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(url.toString(), {}, timeout);
      const results = safeArray(safeGet(data, "resultList", "result"));
      if (results.length === 0) return null;
      return this.normalize(results[0], 0.95);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: EuropePMC getById failed - ${e}`);
      return null;
    }
  }

  async search(
    query: SearchQuery,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    try {
      const url = new URL(`${BASE_URL}/search`);
      url.searchParams.append("query", query.title);
      url.searchParams.append("format", "json");
      url.searchParams.append("resultType", "core");
      url.searchParams.append("pageSize", "5");

      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(url.toString(), {}, timeout);
      const results = safeArray(safeGet(data, "resultList", "result"));
      return results
        .map((item: any) => this.normalize(item, 0.8))
        .filter((r): r is CanonicalRecord => r !== null);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: EuropePMC search failed - ${e}`);
      return [];
    }
  }

  private normalize(item: any, confidence: number): CanonicalRecord | null {
    if (!item || typeof item !== "object") return null;

    const title = safeString(safeGet(item, "title"));
    const authorList = safeArray(safeGet(item, "authorList", "author"));
    const authors = authorList.map((a: any) =>
      parseAuthorName(safeString(a?.fullName)),
    );

    const year = parseYear(safeGet(item, "pubYear"));
    const doi = safeString(safeGet(item, "doi"));
    const pmid = safeString(safeGet(item, "pmid"));
    const journalTitle = safeString(
      safeGet(item, "journalInfo", "journal", "title"),
    );
    const volume = safeString(safeGet(item, "journalInfo", "volume"));
    const issue = safeString(safeGet(item, "journalInfo", "issue"));
    const pages = safeString(safeGet(item, "pageInfo"));

    const arxivId = safeString(safeGet(item, "arxivId"));

    const identifiers: Identifier = {};
    if (doi) identifiers.doi = doi;
    if (pmid) identifiers.pmid = pmid;
    if (arxivId) identifiers.arxivId = arxivId;

    let sourceUrl = "";
    if (doi) {
      sourceUrl = `https://doi.org/${doi}`;
    } else if (pmid) {
      sourceUrl = `https://europepmc.org/article/MED/${pmid}`;
    }

    return {
      identifiers,
      title,
      authors,
      year,
      venue: journalTitle
        ? {
            name: journalTitle,
            type: "journal",
            volume: volume || undefined,
            issue: issue || undefined,
            pages: pages || undefined,
          }
        : undefined,
      source: this.id,
      sourceUrl,
      confidence,
      rawResponse: item,
    };
  }
}
