import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";

export class OpenReviewAdapter implements SourceAdapter {
  readonly id = "openreview";
  readonly displayName = "OpenReview";
  readonly tier = 2; // Preprints, clear track records, peer review context
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.openreview.enabled"] === true;
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    const orId = identifier.openReviewId;
    if (!orId) return null;

    const url = `https://api2.openreview.net/notes?id=${encodeURIComponent(orId)}`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const note = data.notes?.[0];
      return note ? this.transformNote(note) : null;
    } catch (e) {
      throw new Error(
        `OpenReview ID lookup failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    // API v2 allows exact/prefix parsing lookups directly against note fields
    const url = `https://api2.openreview.net/notes?content.title=${encodeURIComponent(query.title)}&limit=3`;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const notes = data.notes || [];
      return notes.map((note: any) => this.transformNote(note));
    } catch (e) {
      throw new Error(
        `OpenReview Search failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private transformNote(note: any): CanonicalRecord {
    const content = note.content || {};

    // OpenReview structure stores field schema entries inside a specialized .value metadata wrapper
    const title =
      typeof content.title?.value === "string" ? content.title.value : "";

    let rawAuthors: string[] = [];
    if (Array.isArray(content.authors?.value)) {
      rawAuthors = content.authors.value;
    }

    const authors = rawAuthors.map((name: string) => {
      const parts = name.trim().split(/\s+/);
      const family = parts.length > 1 ? parts.pop() || "" : name;
      return { family, given: parts.join(" "), raw: name };
    });

    // Determine the year safely from revision/creation milestones
    let year: number | undefined;
    const dateTs = note.mdate || note.tcdate;
    if (dateTs) {
      year = new Date(dateTs < 1e12 ? dateTs * 1000 : dateTs).getFullYear();
    }

    const venueName =
      typeof content.venue?.value === "string"
        ? content.venue.value
        : "OpenReview Preprint";

    return {
      identifiers: {
        openReviewId: note.id,
      },
      title,
      authors,
      year,
      venue: {
        name: venueName,
        type: venueName.toLowerCase().includes("workshop")
          ? "workshop"
          : "preprint",
      },
      source: this.id,
      sourceUrl: `https://openreview.net/forum?id=${note.id}`,
      confidence: 0.85,
      rawResponse: note,
    };
  }
}
