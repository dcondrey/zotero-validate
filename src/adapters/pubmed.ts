import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON } from "../http";

export class PubMedAdapter implements SourceAdapter {
  readonly id = "pubmed";
  readonly displayName = "PubMed (NCBI)";
  readonly tier = 1; // High validation integrity authority
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 3, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.pubmed.enabled"] !== false; // Default to true if not explicitly dead
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    let pmid = identifier.pmid;
    const timeout = prefs?.["behavior.timeout_sec"] || 10;

    // Resolve DOI via Esearch first if direct PMID is absent
    if (!pmid && identifier.doi) {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(identifier.doi)}[aid]&retmode=json`;
      try {
        const sData = await fetchJSON(searchUrl, {}, timeout);
        pmid = sData?.esearchresult?.idlist?.[0];
      } catch {
        return null;
      }
    }

    if (!pmid) return null;

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    try {
      const data = await fetchJSON(summaryUrl, {}, timeout);
      const record = data?.result?.[pmid];
      return record ? this.transformRecord(pmid, record) : null;
    } catch (e) {
      throw new Error(
        `Fetch error: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    let term = `${query.title}[Title]`;
    if (query.authors && query.authors.length > 0) {
      term += ` AND ${query.authors[0]}[Author]`;
    }

    const timeout = prefs?.["behavior.timeout_sec"] || 10;
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=3&retmode=json`;
    try {
      const sData = await fetchJSON(searchUrl, {}, timeout);
      const ids: string[] = sData?.esearchresult?.idlist || [];
      if (ids.length === 0) return [];

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
      const summaryData = await fetchJSON(summaryUrl, {}, timeout);

      return ids
        .map((id) =>
          summaryData?.result?.[id]
            ? this.transformRecord(id, summaryData.result[id], 0.8)
            : null,
        )
        .filter((r): r is CanonicalRecord => r !== null);
    } catch (e) {
      throw new Error(
        `Search query breakdown: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private transformRecord(
    pmid: string,
    raw: any,
    confidence: number = 0.95,
  ): CanonicalRecord {
    const authors = (raw.authors || []).map((a: any) => {
      // PubMed returns structured format natively: "Smith JO"
      const parts = (a?.name || "").trim().split(/\s+/);
      const family = parts[0] || "";
      const given = parts.slice(1).join(" ");
      return { family, given, raw: a?.name || "" };
    });

    // Extract potential DOI buried deep inside native article IDs wrapper
    let doi: string | undefined;
    let resolvedPmid = pmid;
    if (Array.isArray(raw.articleids)) {
      const doiObj = raw.articleids.find((id: any) => id.idtype === "doi");
      if (doiObj) doi = doiObj.value;
      const pmidObj = raw.articleids.find((id: any) => id.idtype === "pubmed");
      if (pmidObj?.value) resolvedPmid = pmidObj.value;
    }

    return {
      identifiers: { pmid: resolvedPmid, doi },
      title: raw.title || "",
      authors,
      year: raw.pubdate ? parseInt(raw.pubdate.substring(0, 4), 10) : undefined,
      venue: {
        name: raw.source || raw.fulljournalname || "",
        type: "journal",
        volume: raw.volume,
        issue: raw.issue,
        pages: raw.pages,
      },
      source: this.id,
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      confidence,
      rawResponse: raw,
    };
  }
}
