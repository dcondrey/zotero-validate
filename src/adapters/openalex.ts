import {
  SourceAdapter,
  CanonicalRecord,
  Identifier,
  SearchQuery,
  PluginPrefs,
} from "../types";

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
    } else {
      return null;
    }

    try {
      const timeoutMs = (prefs["behavior.timeout_sec"] || 10) * 1000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(this.getUrl(path, prefs), {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return null;
      const data = await response.json();
      return this.normalize(data);
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
      const timeoutMs = (prefs["behavior.timeout_sec"] || 10) * 1000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return [];
      const data = await response.json();
      return (data.results || [])
        .map((item: any) => this.normalize(item))
        .slice(0, 5);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: OpenAlex search failed - ${e}`);
      return [];
    }
  }

  private parseAuthorName(raw: string): { family: string; given: string } {
    const commaIdx = raw.indexOf(",");
    if (commaIdx !== -1) {
      return {
        family: raw.slice(0, commaIdx).trim(),
        given: raw.slice(commaIdx + 1).trim(),
      };
    }
    const parts = raw.split(" ");
    if (parts.length <= 1) return { family: raw, given: "" };
    const prefixes = new Set([
      "van",
      "von",
      "de",
      "del",
      "der",
      "di",
      "la",
      "le",
      "el",
      "al",
      "bin",
      "ibn",
    ]);
    let splitAt = parts.length - 1;
    while (splitAt > 1 && prefixes.has(parts[splitAt - 1].toLowerCase())) {
      splitAt--;
    }
    return {
      family: parts.slice(splitAt).join(" "),
      given: parts.slice(0, splitAt).join(" "),
    };
  }

  private normalize(item: any): CanonicalRecord {
    const authors = (item.authorships || []).map((a: any) => {
      const raw = a.author?.display_name || "";
      const parsed = this.parseAuthorName(raw);
      return { ...parsed, raw };
    });

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
          }
        : undefined,
      source: this.id,
      sourceUrl: item.id || "",
      confidence: 1.0,
      rawResponse: item,
    };
  }
}
