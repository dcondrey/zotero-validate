import { parseAuthorName, parseDateYear } from "./utils";
import {
  SourceAdapter,
  Identifier,
  SearchQuery,
  PluginPrefs,
  CanonicalRecord,
} from "../types";

export class OpenLibraryAdapter implements SourceAdapter {
  readonly id = "openlibrary";
  readonly displayName = "Open Library (Books)";
  readonly tier = 2;
  readonly requiresCredential = false;
  readonly rateLimit = { perSecond: 1, concurrent: 1 };

  isConfigured(prefs: PluginPrefs): boolean {
    return prefs["sources.openlibrary.enabled"] !== false;
  }

  async getById(
    identifier: Identifier,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    const isbn = identifier.isbn?.replace(/-/g, "");
    if (!isbn) return null;

    const bibKey = `ISBN:${isbn}`;
    const url = `https://openlibrary.org/api/books?bibkeys=${bibKey}&format=json&jscmd=data`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const bookData = data[bibKey];
      return bookData ? this.transformBook(isbn, bookData) : null;
    } catch (e) {
      throw new Error(
        `Open Library ISBN check failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  async search(
    query: SearchQuery,
    prefs?: PluginPrefs,
  ): Promise<CanonicalRecord[]> {
    if (!query.title) return [];

    let qString = `title:${query.title}`;
    if (query.authors && query.authors.length > 0) {
      qString += ` AND author:${query.authors[0]}`;
    }

    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(qString)}&limit=3`;
    try {
      const response = await fetch(url);
      if (!response.ok) return [];
      const data = await response.json();

      const docs = data.docs || [];
      return docs.map((doc: any) => this.transformSearchDoc(doc));
    } catch (e) {
      throw new Error(
        `Open Library text search failed: ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  private transformBook(isbn: string, raw: any): CanonicalRecord {
    const authors = (raw.authors || []).map((a: any) =>
      parseAuthorName(a?.name || ""),
    );

    const year = parseDateYear(raw.publish_date);

    return {
      identifiers: {
        isbn:
          raw.identifiers?.isbn_13?.[0] ||
          raw.identifiers?.isbn_10?.[0] ||
          isbn,
      },
      title: raw.title || "",
      authors,
      year,
      venue: {
        name: raw.publishers?.[0]?.name || "Published Book",
        type: "book",
        pages: raw.number_of_pages?.toString(),
      },
      source: this.id,
      sourceUrl: raw.url || `https://openlibrary.org/isbn/${isbn}`,
      confidence: 0.9,
      rawResponse: raw,
    };
  }

  private transformSearchDoc(doc: any): CanonicalRecord {
    const rawAuthors = doc.author_name || [];
    const authors = rawAuthors.map((name: string) => parseAuthorName(name));

    return {
      identifiers: {
        isbn: doc.isbn?.[0],
      },
      title: doc.title || "",
      authors,
      year: doc.first_publish_year,
      venue: {
        name: doc.publisher?.[0] || "Book Archive",
        type: "book",
      },
      source: this.id,
      sourceUrl: `https://openlibrary.org${doc.key}`,
      confidence: 0.75,
      rawResponse: doc,
    };
  }
}
