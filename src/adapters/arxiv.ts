import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";

export class ArxivAdapter implements SourceAdapter {
  readonly id = "arxiv";
  readonly displayName = "arXiv e-Print Archive";
  readonly tier = 1; // Primary document repository
  readonly requiresCredential = false;

  // arXiv's official usage policy strictly requests no more than 1 request every 3 seconds
  readonly rateLimit = { perSecond: 0.33, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.arxiv.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    const arxivId = identifier.arxivId;
    if (!arxivId) return null;

    const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`;
    return this.executeArxivQuery(url);
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    let searchTerms = `ti:"${query.title}"`;
    if (query.authors && query.authors.length > 0) {
      searchTerms += ` AND au:"${query.authors[0]}"`;
    }

    const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(searchTerms)}&max_results=3`;

    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const xmlText = await response.text();

      // Use native Zotero Gecko runtime DOMParser
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const entries = xmlDoc.getElementsByTagName("entry");

      const records: CanonicalRecord[] = [];
      for (let i = 0; i < entries.length; i++) {
        const record = this.transformEntry(entries[i]);
        if (record) records.push(record);
      }
      return records;
    } catch (e) {
      throw new Error(
        `arXiv Search failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private async executeArxivQuery(
    url: string,
  ): Promise<CanonicalRecord | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xmlText = await response.text();

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, "text/xml");
      const entry = xmlDoc.getElementsByTagName("entry")[0];

      return entry ? this.transformEntry(entry) : null;
    } catch (e) {
      throw new Error(
        `arXiv Fetch failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private transformEntry(entry: Element): CanonicalRecord | null {
    const rawTitle = entry.getElementsByTagName("title")[0]?.textContent || "";
    // Clean up arXiv's automatic formatting newlines and spacing strings
    const title = rawTitle.replace(/\s+/g, " ").trim();
    if (!title || title.toLowerCase() === "error") return null;

    const idUrl = entry.getElementsByTagName("id")[0]?.textContent || "";
    const arxivIdMatch = idUrl.match(/abs\/([A-Za-z0-9.-]+v?\d*)$/);
    const arxivId = arxivIdMatch ? arxivIdMatch[1] : undefined;

    // Pull down and loop through all assigned authors
    const authorElements = entry.getElementsByTagName("author");
    const authors = Array.from(authorElements).map((auth) => {
      const name = auth.getElementsByTagName("name")[0]?.textContent || "";
      const parts = name.trim().split(/\s+/);
      const family = parts.length > 1 ? parts.pop() || "" : name;
      return { family, given: parts.join(" "), raw: name };
    });

    const publishedStr =
      entry.getElementsByTagName("published")[0]?.textContent || "";
    const year = publishedStr
      ? new Date(publishedStr).getFullYear()
      : undefined;

    // Extract DOI if the preprint has already transitioned to a published journal state
    const doiElement =
      entry.getElementsByTagNameNS("http://arxiv.org/schemas/atom", "doi")[0] ||
      entry.getElementsByTagName("doi")[0];
    const doi = doiElement?.textContent || undefined;

    return {
      identifiers: { arxivId, doi },
      title,
      authors,
      year,
      venue: {
        name: "arXiv Preprint",
        type: "preprint",
      },
      source: this.id,
      sourceUrl: idUrl || `https://arxiv.org/abs/${arxivId}`,
      confidence: 0.95,
      rawResponse: entry.outerHTML,
    };
  }
}
