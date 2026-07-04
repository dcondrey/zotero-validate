import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, fetchText } from "../http";

export class AclAnthologyAdapter implements SourceAdapter {
  readonly id = "aclanthology";
  readonly displayName = "ACL Anthology";
  readonly tier = 1; // Direct primary publisher archive
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 2, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.aclanthology.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    const aclId = identifier.aclAnthologyId;
    if (!aclId) return null;

    // ACL documents are addressable via direct static BibTeX strings
    const timeout = prefs?.["behavior.timeout_sec"] || 10;
    const url = `https://aclanthology.org/${encodeURIComponent(aclId)}.bib`;
    try {
      const bibText = await fetchText(url, {}, timeout);
      if (!bibText) return null;
      return this.parseBibtex(bibText, aclId);
    } catch (e) {
      throw new Error(
        `ACL Fetch failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    // The ACL Anthology search engine uses a public indexing interface via Crossref metadata tags.
    // We target the ACL container directly to isolate results cleanly.
    const timeout = prefs?.["behavior.timeout_sec"] || 10;
    const cleanTitle = encodeURIComponent(query.title);
    const filter = encodeURIComponent(
      "container-title:Association for Computational Linguistics",
    );
    const url = `https://api.crossref.org/works?query.title=${cleanTitle}&filter=${filter}&rows=3`;

    try {
      const data = await fetchJSON(url, {}, timeout);
      const items = data?.message?.items || [];
      return items
        .map((item: any) => this.transformCrossrefToAcl(item))
        .filter((r: any): r is CanonicalRecord => r !== null);
    } catch (e) {
      throw new Error(
        `ACL Search breakdown: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private parseBibtex(bib: string, aclId: string): CanonicalRecord | null {
    const extractField = (field: string): string => {
      const regex = new RegExp(
        `${field}\\s*=\\s*["{]([\\s\\S]*?)["}],?\\s*(?:\\n|\\r|$)`,
        "i",
      );
      const match = bib.match(regex);
      return match ? match[1].replace(/[{}]/g, "").trim() : "";
    };

    const title = extractField("title").replace(/\s+/g, " ");
    if (!title) return null;

    const rawAuthors = extractField("author");
    const authors = rawAuthors
      .split(/\s+and\s+/i)
      .filter((name) => name.trim())
      .map((name) => {
        const parts = name.trim().split(/,\s*/);
        let family = "";
        let given = "";
        if (parts.length > 1) {
          [family, given] = parts;
        } else {
          const spaceParts = name.trim().split(/\s+/);
          family = spaceParts.pop() || "";
          given = spaceParts.join(" ");
        }
        return { family, given, raw: name };
      });

    const yearStr = extractField("year");
    const booktitle = extractField("booktitle");
    const journal = extractField("journal");

    return {
      identifiers: {
        aclAnthologyId: aclId,
        doi: extractField("doi") || undefined,
      },
      title,
      authors,
      year: yearStr ? parseInt(yearStr, 10) : undefined,
      venue:
        booktitle || journal
          ? {
              name: booktitle || journal,
              type: journal ? "journal" : "conference",
              pages: extractField("pages") || undefined,
              volume: extractField("volume") || undefined,
            }
          : undefined,
      source: this.id,
      sourceUrl: `https://aclanthology.org/${aclId}`,
      confidence: 0.95,
      rawResponse: { rawBibtex: bib },
    };
  }

  private transformCrossrefToAcl(item: any): CanonicalRecord | null {
    // Locate the ACL identifier explicitly from the Crossref return string URLs
    const url = item.URL || "";
    const aclMatch = url.match(/aclanthology\.org\/([A-Za-z0-9.-]+)\/?$/);
    if (!aclMatch) return null;

    const authors = (item.author || []).map((a: any) => ({
      family: a.family || "",
      given: a.given || "",
      raw: `${a.given} ${a.family}`.trim(),
    }));

    return {
      identifiers: {
        aclAnthologyId: aclMatch[1],
        doi: item.DOI,
      },
      title: item.title?.[0] || "",
      authors,
      year: item.created?.["date-parts"]?.[0]?.[0],
      venue: item["container-title"]?.[0]
        ? {
            name: item["container-title"][0],
            type: item.type === "journal-article" ? "journal" : "conference",
          }
        : undefined,
      source: this.id,
      sourceUrl: url,
      confidence: 0.9,
      rawResponse: item,
    };
  }
}
