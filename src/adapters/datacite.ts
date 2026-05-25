import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, safeString, safeArray, safeGet } from "../http";

const VENUE_TYPE_MAP: Record<
  string,
  "journal" | "conference" | "book" | "preprint" | "other"
> = {
  Dataset: "other",
  Software: "other",
  Text: "journal",
  Book: "book",
  ConferencePaper: "conference",
};

export class DataCiteAdapter implements SourceAdapter {
  readonly id = "datacite";
  readonly displayName = "DataCite";
  readonly tier = 1 as const;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 10, concurrent: 5 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.datacite.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    if (!identifier.doi) return null;

    try {
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(
        `https://api.datacite.org/dois/${encodeURIComponent(identifier.doi)}`,
        {},
        timeout,
      );
      const attrs = safeGet(data, "data", "attributes");
      if (!attrs) return null;
      return this.normalize(attrs, 1.0);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: DataCite getById failed - ${e}`);
      return null;
    }
  }

  async search(
    query: SearchQuery,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    try {
      const url = new URL("https://api.datacite.org/dois");
      url.searchParams.append("query", query.title);
      url.searchParams.append("page[size]", "5");

      const timeout = prefs["behavior.timeout_sec"] || 10;
      const data = await fetchJSON(url.toString(), {}, timeout);
      const items = safeArray(safeGet(data, "data"));
      return items
        .map((item: any) => this.normalize(safeGet(item, "attributes"), 0.8))
        .filter((r): r is CanonicalRecord => r !== null);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: DataCite search failed - ${e}`);
      return [];
    }
  }

  private normalize(attrs: any, confidence: number): CanonicalRecord | null {
    if (!attrs || typeof attrs !== "object") return null;

    const titles = safeArray(safeGet(attrs, "titles"));
    const title = safeString(safeGet(titles, "0", "title"));

    const creators = safeArray(safeGet(attrs, "creators"));
    const authors = creators.map((c: any) =>
      parseAuthorName(safeString(c?.name)),
    );

    const year = parseYear(safeGet(attrs, "publicationYear"));
    const doi = safeString(safeGet(attrs, "doi"));
    const publisher = safeString(safeGet(attrs, "publisher"));
    const resourceType = safeString(
      safeGet(attrs, "types", "resourceTypeGeneral"),
    );

    return {
      identifiers: { doi },
      title,
      authors,
      year,
      venue: publisher
        ? {
            name: publisher,
            type: this.mapVenueType(resourceType),
          }
        : undefined,
      source: this.id,
      sourceUrl: doi ? `https://doi.org/${doi}` : "",
      confidence,
      rawResponse: attrs,
    };
  }

  private mapVenueType(
    resourceType: string,
  ): "journal" | "conference" | "book" | "preprint" | "other" {
    return VENUE_TYPE_MAP[resourceType] || "other";
  }
}
