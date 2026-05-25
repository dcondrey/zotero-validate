import { SourceAdapter, Identifier, SearchQuery, PluginPrefs, CanonicalRecord } from "../types";

export class PubMedAdapter implements SourceAdapter {
  readonly id = "pubmed";
  readonly displayName = "PubMed (NCBI)";
  readonly tier = 1; // High validation integrity authority
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 3, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.pubmed.enabled"] !== false; // Default to true if not explicitly dead
  }

  async getById(identifier: Identifier, prefs?: PluginPrefs): Promise<CanonicalRecord | null> {
    let pmid = identifier.pmid;

    // Resolve DOI via Esearch first if direct PMID is absent
    if (!pmid && identifier.doi) {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(identifier.doi)}[aid]&retmode=json`;
      try {
        const sRes = await fetch(searchUrl);
        const sData = await sRes.json();
        pmid = sData.esearchresult?.idlist?.[0];
      } catch {
        return null;
      }
    }

    if (!pmid) return null;

    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`;
    try {
      const response = await fetch(summaryUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      const record = data.result?.[pmid];
      return record ? this.transformRecord(pmid, record) : null;
    } catch (e) {
      throw new Error(`Fetch error: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  async search(query: SearchQuery, prefs?: PluginPrefs): Promise<CanonicalRecord[]> {
    if (!query.title) return [];
    
    let term = `${query.title}[Title]`;
    if (query.authors && query.authors.length > 0) {
      term += ` AND ${query.authors[0]}[Author]`;
    }

    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=3&retmode=json`;
    try {
      const sRes = await fetch(searchUrl);
      if (!sRes.ok) return [];
      const sData = await sRes.json();
      const ids: string[] = sData.esearchresult?.idlist || [];
      if (ids.length === 0) return [];

      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(",")}&retmode=json`;
      const summaryRes = await fetch(summaryUrl);
      const summaryData = await summaryRes.json();

      return ids
        .map((id) => summaryData.result?.[id] ? this.transformRecord(id, summaryData.result[id]) : null)
        .filter((r): r is CanonicalRecord => r !== null);
    } catch (e) {
      throw new Error(`Search query breakdown: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  private transformRecord(pmid: string, raw: any): CanonicalRecord {
    const authors = (raw.authors || []).map((a: any) => {
      // PubMed returns structured format natively: "Smith JO"
      const parts = a.name.trim().split(/\s+/);
      const family = parts[0] || "";
      const given = parts.slice(1).join(" ");
      return { family, given, raw: a.name };
    });

    // Extract potential DOI buried deep inside native article IDs wrapper
    let doi: string | undefined;
    if (Array.isArray(raw.articleids)) {
      const doiObj = raw.articleids.find((id: any) => id.idtype === "doi");
      if (doiObj) doi = doiObj.value;
    }

    return {
      identifiers: { pmid, doi },
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
      confidence: 0.95,
      rawResponse: raw,
    };
  }
}