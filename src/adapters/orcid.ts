import { parseAuthorName, parseYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";
import { fetchJSON, safeString, safeArray, safeGet } from "../http";

const BASE_URL = "https://pub.orcid.org/v3.0";
const ACCEPT_JSON = { Accept: "application/json" };

export class OrcidAdapter implements SourceAdapter {
  readonly id = "orcid";
  readonly displayName = "ORCID";
  readonly tier = 2 as const;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.orcid.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs: PluginPrefs = {},
  ): Promise<CanonicalRecord | null> {
    if (!identifier.doi) return null;

    try {
      const timeout = prefs["behavior.timeout_sec"] || 10;
      const orcidId = await this.findOrcidByDoi(identifier.doi, timeout);
      if (!orcidId) return null;

      const work = await this.fetchWorkByDoi(orcidId, identifier.doi, timeout);
      if (!work) return null;

      return this.normalize(work, orcidId, identifier.doi);
    } catch (e) {
      Zotero.debug(`ReferenceValidator: ORCID getById failed - ${e}`);
      return null;
    }
  }

  async search(
    _query: SearchQuery,
    _prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    // ORCID search returns author profiles, not works.
    // Fetching works for each profile would require N additional API calls,
    // making it impractical for discovery. ORCID is useful for lookup
    // validation only.
    return [];
  }

  /**
   * Step 1: Search for ORCID IDs that claim a given DOI.
   * Returns the first matching ORCID ID, or null.
   */
  private async findOrcidByDoi(
    doi: string,
    timeout: number,
  ): Promise<string | null> {
    const url = `${BASE_URL}/expanded-search/?q=doi-self:${encodeURIComponent(doi)}&rows=5`;

    const data = await fetchJSON(url, { headers: ACCEPT_JSON }, timeout);
    if (!data) return null;

    const results = safeArray(data["expanded-result"]);
    if (results.length === 0) return null;

    const orcidId = safeString(results[0]["orcid-id"]);
    return orcidId || null;
  }

  /**
   * Step 2: Fetch the works for an ORCID profile and find the one
   * matching the target DOI.
   */
  private async fetchWorkByDoi(
    orcidId: string,
    doi: string,
    timeout: number,
  ): Promise<any | null> {
    const url = `${BASE_URL}/${encodeURIComponent(orcidId)}/works`;

    const data = await fetchJSON(url, { headers: ACCEPT_JSON }, timeout);
    if (!data) return null;

    const groups = safeArray(data.group);
    const normalizedDoi = doi.toLowerCase();

    for (const group of groups) {
      const summaries = safeArray(group["work-summary"]);
      for (const summary of summaries) {
        if (this.workMatchesDoi(summary, normalizedDoi)) {
          return summary;
        }
      }
    }

    return null;
  }

  /**
   * Check whether a work-summary's external-ids contain the target DOI.
   */
  private workMatchesDoi(summary: any, normalizedDoi: string): boolean {
    const externalIds = safeArray(
      safeGet(summary, "external-ids", "external-id"),
    );

    for (const eid of externalIds) {
      const idType = safeString(eid["external-id-type"]).toLowerCase();
      const idValue = safeString(eid["external-id-value"]).toLowerCase();
      if (idType === "doi" && idValue === normalizedDoi) {
        return true;
      }
    }

    return false;
  }

  /**
   * Transform an ORCID work-summary into a CanonicalRecord.
   * The ORCID profile that claimed this DOI is used as the primary author
   * source, supplemented by any additional data from the work metadata.
   */
  private normalize(
    summary: any,
    orcidId: string,
    doi: string,
  ): CanonicalRecord {
    if (!summary || typeof summary !== "object") {
      return this.emptyRecord(summary);
    }

    const title = safeString(safeGet(summary, "title", "title", "value"));
    const yearValue = safeGet(summary, "publication-date", "year", "value");
    const year = parseYear(yearValue);
    const journalTitle = safeString(safeGet(summary, "journal-title", "value"));

    // Extract all DOIs and other identifiers from external-ids
    const identifiers: Identifier = { doi };
    const externalIds = safeArray(
      safeGet(summary, "external-ids", "external-id"),
    );
    for (const eid of externalIds) {
      const idType = safeString(eid["external-id-type"]).toLowerCase();
      const idValue = safeString(eid["external-id-value"]);
      if (idType === "arxiv" && idValue) {
        identifiers.arxivId = idValue;
      } else if (idType === "pmid" && idValue) {
        identifiers.pmid = idValue;
      }
    }

    // ORCID work-summaries do not include a contributors list.
    // The best author data comes from the profile that claimed the work.
    // We parse the credit-name or construct from given/family if available.
    const authors = this.extractAuthorsFromSummary(summary);

    const venue = journalTitle
      ? {
          name: journalTitle,
          type: this.inferVenueType(journalTitle) as
            | "journal"
            | "conference"
            | "workshop"
            | "preprint"
            | "book"
            | "other",
        }
      : undefined;

    return {
      identifiers,
      title,
      authors,
      year,
      venue,
      source: this.id,
      sourceUrl: `https://orcid.org/${orcidId}`,
      confidence: 0.85,
      rawResponse: summary,
    };
  }

  /**
   * Extract author information from a work-summary.
   * ORCID work-summaries have limited contributor data; we extract
   * what is available from the contributors section if present.
   */
  private extractAuthorsFromSummary(
    summary: any,
  ): Array<{ family: string; given: string; raw: string }> {
    const contributors = safeArray(
      safeGet(summary, "contributors", "contributor"),
    );

    if (contributors.length === 0) {
      return [];
    }

    return contributors
      .map((contributor: any) => {
        const creditName = safeString(
          safeGet(contributor, "credit-name", "value"),
        );
        if (creditName) {
          return parseAuthorName(creditName);
        }
        return { family: "", given: "", raw: "" };
      })
      .filter(
        (author: { family: string; given: string; raw: string }) =>
          author.raw.length > 0,
      );
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

  /**
   * Simple heuristic for venue type based on journal title keywords.
   * ORCID does not provide structured venue type data.
   */
  private inferVenueType(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes("arxiv")) return "preprint";
    if (lower.includes("conference") || lower.includes("proceedings")) {
      return "conference";
    }
    if (lower.includes("workshop")) return "workshop";
    if (lower.includes("journal") || lower.includes("transactions")) {
      return "journal";
    }
    return "other";
  }
}
