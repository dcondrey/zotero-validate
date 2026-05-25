import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrossrefAdapter } from "../src/adapters/crossref";
import { OpenAlexAdapter } from "../src/adapters/openalex";
import { DblpAdapter } from "../src/adapters/dblp";
import { OpenReviewAdapter } from "../src/adapters/openreview";
import { OpenLibraryAdapter } from "../src/adapters/openlibrary";
import { SemanticScholarAdapter } from "../src/adapters/semanticscholar";
import { PubMedAdapter } from "../src/adapters/pubmed";
import { AclAnthologyAdapter } from "../src/adapters/aclanthology";

declare global {
  var Zotero: any;
}

beforeEach(() => {
  global.Zotero = { debug: vi.fn() };
});

describe("CrossrefAdapter", () => {
  describe("normalize", () => {
    const adapter = new CrossrefAdapter();

    it("should handle missing author array", () => {
      const record = (adapter as any).normalize({
        DOI: "10.1234/test",
        title: ["Test"],
      });
      expect(record.authors).toEqual([]);
      expect(record.title).toBe("Test");
    });

    it("should extract year from date-parts", () => {
      const record = (adapter as any).normalize({
        title: ["Test"],
        published: { "date-parts": [[2023, 5, 15]] },
      });
      expect(record.year).toBe(2023);
    });

    it("should handle missing title", () => {
      const record = (adapter as any).normalize({ DOI: "10.1234/test" });
      expect(record.title).toBe("");
    });

    it("should handle empty title array", () => {
      const record = (adapter as any).normalize({
        DOI: "10.1234/test",
        title: [],
      });
      expect(record.title).toBe("");
    });

    it("should handle missing date-parts", () => {
      const record = (adapter as any).normalize({ title: ["Test"] });
      expect(record.year).toBeUndefined();
    });

    it("should handle missing container-title", () => {
      const record = (adapter as any).normalize({ title: ["Test"] });
      expect(record.venue).toBeUndefined();
    });
  });

  describe("fetch error logging", () => {
    it("should log errors on getById failure", async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error("timeout"))) as any;
      const adapter = new CrossrefAdapter();
      const result = await adapter.getById({ doi: "10.1234/test" });
      expect(result).toBeNull();
      expect(Zotero.debug).toHaveBeenCalledWith(
        expect.stringContaining("Crossref getById failed"),
      );
    });

    it("should log errors on search failure", async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error("timeout"))) as any;
      const adapter = new CrossrefAdapter();
      const result = await adapter.search({ title: "Test" });
      expect(result).toEqual([]);
      expect(Zotero.debug).toHaveBeenCalledWith(
        expect.stringContaining("Crossref search failed"),
      );
    });
  });
});

describe("OpenAlexAdapter", () => {
  describe("parseAuthorName", () => {
    const adapter = new OpenAlexAdapter();

    it('should handle simple "First Last" names', () => {
      const result = (adapter as any).parseAuthorName("John Smith");
      expect(result).toEqual({ family: "Smith", given: "John" });
    });

    it("should handle comma-separated names", () => {
      const result = (adapter as any).parseAuthorName("Smith, John");
      expect(result).toEqual({ family: "Smith", given: "John" });
    });

    it('should handle "van der" prefix', () => {
      const result = (adapter as any).parseAuthorName("Jan van der Meer");
      expect(result.family).toBe("van der Meer");
      expect(result.given).toBe("Jan");
    });

    it('should handle "de la" prefix', () => {
      const result = (adapter as any).parseAuthorName("Francisco de la Cruz");
      expect(result.family).toBe("de la Cruz");
      expect(result.given).toBe("Francisco");
    });

    it("should handle single names", () => {
      const result = (adapter as any).parseAuthorName("Madonna");
      expect(result.family).toBe("Madonna");
      expect(result.given).toBe("");
    });

    it('should handle "von" prefix', () => {
      const result = (adapter as any).parseAuthorName("Ludwig von Beethoven");
      expect(result.family).toBe("von Beethoven");
      expect(result.given).toBe("Ludwig");
    });
  });

  describe("normalize", () => {
    const adapter = new OpenAlexAdapter();

    it("should clean DOI URL format", () => {
      const record = (adapter as any).normalize({
        doi: "https://doi.org/10.1234/test",
        title: "Test",
        authorships: [],
      });
      expect(record.identifiers.doi).toBe("10.1234/test");
    });

    it("should extract PMID", () => {
      const record = (adapter as any).normalize({
        title: "Test",
        authorships: [],
        ids: { pmid: "https://pubmed.ncbi.nlm.nih.gov/12345" },
      });
      expect(record.identifiers.pmid).toBe("12345");
    });

    it("should handle missing authorships", () => {
      const record = (adapter as any).normalize({ title: "Test" });
      expect(record.authors).toEqual([]);
    });
  });
});

describe("DblpAdapter", () => {
  const adapter = new DblpAdapter();

  it("should transform a complete record", () => {
    const record = (adapter as any).transformRecord({
      title: "Test Paper",
      key: "conf/test/2023",
      authors: { author: [{ text: "John Smith" }] },
      year: "2023",
      venue: "ICML",
      type: "Conference and Workshop Papers",
      doi: "10.1234/test",
    });
    expect(record.title).toBe("Test Paper");
    expect(record.authors[0].family).toBe("Smith");
    expect(record.year).toBe(2023);
    expect(record.venue?.type).toBe("conference");
    expect(record.identifiers.dblpKey).toBe("conf/test/2023");
  });

  it("should handle single author as object", () => {
    const record = (adapter as any).transformRecord({
      title: "Test",
      key: "k",
      authors: { author: { text: "Jane Doe" } },
    });
    expect(record.authors).toHaveLength(1);
    expect(record.authors[0].family).toBe("Doe");
  });

  it("should handle single author as string", () => {
    const record = (adapter as any).transformRecord({
      title: "Test",
      key: "k",
      authors: { author: "Jane Doe" },
    });
    expect(record.authors).toHaveLength(1);
    expect(record.authors[0].family).toBe("Doe");
  });

  it("should handle missing authors", () => {
    const record = (adapter as any).transformRecord({
      title: "Test",
      key: "k",
    });
    expect(record.authors).toEqual([]);
  });

  it("should default venue type to journal", () => {
    const record = (adapter as any).transformRecord({
      title: "Test",
      key: "k",
      venue: "Some Journal",
      type: "Journal Articles",
    });
    expect(record.venue?.type).toBe("journal");
  });
});

describe("OpenReviewAdapter", () => {
  const adapter = new OpenReviewAdapter();

  it("should transform a complete note", () => {
    const record = (adapter as any).transformNote({
      id: "abc123",
      content: {
        title: { value: "Deep Learning Paper" },
        authors: { value: ["John Smith", "Jane Doe"] },
        venue: { value: "NeurIPS 2023 Workshop" },
      },
      mdate: 1672531200000,
    });
    expect(record.title).toBe("Deep Learning Paper");
    expect(record.authors).toHaveLength(2);
    expect(record.authors[0].family).toBe("Smith");
    expect(record.venue?.type).toBe("workshop");
    expect(record.identifiers.openReviewId).toBe("abc123");
  });

  it("should handle seconds timestamp", () => {
    const record = (adapter as any).transformNote({
      id: "x",
      content: { title: { value: "Test" } },
      tcdate: 1672531200,
    });
    expect(record.year).toBe(2022);
  });

  it("should handle missing content fields", () => {
    const record = (adapter as any).transformNote({
      id: "x",
      content: {},
    });
    expect(record.title).toBe("");
    expect(record.authors).toEqual([]);
    expect(record.venue?.name).toBe("OpenReview Preprint");
  });

  it("should default venue to preprint", () => {
    const record = (adapter as any).transformNote({
      id: "x",
      content: { venue: { value: "ICLR 2024" } },
    });
    expect(record.venue?.type).toBe("preprint");
  });
});

describe("OpenLibraryAdapter", () => {
  const adapter = new OpenLibraryAdapter();

  it("should transform a book record", () => {
    const record = (adapter as any).transformBook("9780123456789", {
      title: "Test Book",
      authors: [{ name: "John Smith" }],
      publish_date: "January 2020",
      publishers: [{ name: "Academic Press" }],
      identifiers: { isbn_13: ["9780123456789"] },
      number_of_pages: 350,
    });
    expect(record.title).toBe("Test Book");
    expect(record.authors[0].family).toBe("Smith");
    expect(record.year).toBe(2020);
    expect(record.venue?.type).toBe("book");
    expect(record.venue?.pages).toBe("350");
    expect(record.identifiers.isbn).toBe("9780123456789");
  });

  it("should fall back to passed isbn when identifiers missing", () => {
    const record = (adapter as any).transformBook("0123456789", {
      title: "Test",
      authors: [],
    });
    expect(record.identifiers.isbn).toBe("0123456789");
  });

  it("should transform a search doc", () => {
    const record = (adapter as any).transformSearchDoc({
      title: "Search Result",
      author_name: ["Jane Doe"],
      isbn: ["9780123456789"],
      publisher: ["MIT Press"],
      first_publish_year: 2019,
      key: "/works/OL123W",
    });
    expect(record.title).toBe("Search Result");
    expect(record.authors[0].family).toBe("Doe");
    expect(record.year).toBe(2019);
    expect(record.venue?.name).toBe("MIT Press");
  });

  it("should handle missing search doc fields", () => {
    const record = (adapter as any).transformSearchDoc({
      title: "Minimal",
      key: "/works/OL1W",
    });
    expect(record.authors).toEqual([]);
    expect(record.venue?.name).toBe("Book Archive");
  });
});

describe("SemanticScholarAdapter", () => {
  const adapter = new SemanticScholarAdapter();

  it("should transform a complete record", () => {
    const record = (adapter as any).transformRecord({
      paperId: "abc123",
      title: "ML Paper",
      authors: [{ name: "John Smith" }],
      year: 2023,
      venue: "NeurIPS",
      externalIds: { DOI: "10.1234/test", ArXiv: "2301.12345" },
      publicationVenue: { type: "conference" },
    });
    expect(record.title).toBe("ML Paper");
    expect(record.authors[0].family).toBe("Smith");
    expect(record.year).toBe(2023);
    expect(record.identifiers.doi).toBe("10.1234/test");
    expect(record.identifiers.arxivId).toBe("2301.12345");
    expect(record.venue?.type).toBe("conference");
  });

  it("should handle missing external IDs", () => {
    const record = (adapter as any).transformRecord({
      paperId: "x",
      title: "Test",
      authors: [],
    });
    expect(record.identifiers.doi).toBeUndefined();
    expect(record.identifiers.arxivId).toBeUndefined();
  });

  it("should default venue type to other", () => {
    const record = (adapter as any).transformRecord({
      paperId: "x",
      title: "Test",
      authors: [],
      venue: "Some Venue",
      publicationVenue: { type: "unknown-type" },
    });
    expect(record.venue?.type).toBe("other");
  });
});

describe("PubMedAdapter", () => {
  const adapter = new PubMedAdapter();

  it("should transform a complete record", () => {
    const record = (adapter as any).transformRecord("12345", {
      title: "Medical Study",
      authors: [{ name: "Smith JA" }],
      pubdate: "2023 Jan",
      fulljournalname: "Nature Medicine",
      source: "Nat Med",
      volume: "29",
      issue: "1",
      pages: "100-110",
      articleids: [{ idtype: "doi", value: "10.1038/test" }],
    });
    expect(record.title).toBe("Medical Study");
    expect(record.year).toBe(2023);
    expect(record.identifiers.pmid).toBe("12345");
    expect(record.identifiers.doi).toBe("10.1038/test");
    expect(record.venue?.name).toBe("Nat Med");
    expect(record.venue?.volume).toBe("29");
  });

  it("should handle missing article IDs", () => {
    const record = (adapter as any).transformRecord("99", {
      title: "Test",
      authors: [],
    });
    expect(record.identifiers.doi).toBeUndefined();
    expect(record.identifiers.pmid).toBe("99");
  });

  it("should handle missing authors", () => {
    const record = (adapter as any).transformRecord("1", {
      title: "Test",
    });
    expect(record.authors).toEqual([]);
  });
});

describe("AclAnthologyAdapter", () => {
  const adapter = new AclAnthologyAdapter();

  it("should parse BibTeX with nested braces", () => {
    const bib = `@inproceedings{doe2023,
  title = {Deep Learning for {BERT} Models},
  author = {Doe, John and Smith, Jane},
  year = {2023},
  booktitle = {ACL 2023},
}`;
    const record = (adapter as any).parseBibtex(bib, "2023.acl-1.1");
    expect(record.title).toBe("Deep Learning for BERT Models");
    expect(record.authors).toHaveLength(2);
    expect(record.authors[0].family).toBe("Doe");
    expect(record.authors[0].given).toBe("John");
    expect(record.year).toBe(2023);
    expect(record.venue?.type).toBe("conference");
  });

  it("should handle author in Given Family format", () => {
    const bib = `@inproceedings{x,
  title = {Test},
  author = {John Doe},
  year = {2023},
}`;
    const record = (adapter as any).parseBibtex(bib, "test-id");
    expect(record.authors[0].family).toBe("Doe");
    expect(record.authors[0].given).toBe("John");
  });

  it("should return null for empty title", () => {
    const bib = `@inproceedings{x,
  author = {Doe, John},
  year = {2023},
}`;
    const record = (adapter as any).parseBibtex(bib, "test-id");
    expect(record).toBeNull();
  });

  it("should transform Crossref record with ACL URL", () => {
    const item = {
      URL: "https://aclanthology.org/2023.acl-long.1/",
      title: ["Test Paper"],
      author: [{ given: "John", family: "Doe" }],
      DOI: "10.18653/v1/2023.acl-long.1",
      "container-title": ["Proceedings of ACL"],
      type: "proceedings-article",
      created: { "date-parts": [[2023, 7, 1]] },
    };
    const record = (adapter as any).transformCrossrefToAcl(item);
    expect(record).not.toBeNull();
    expect(record.identifiers.aclAnthologyId).toBe("2023.acl-long.1");
    expect(record.title).toBe("Test Paper");
  });

  it("should return null for non-ACL Crossref record", () => {
    const item = {
      URL: "https://example.com/paper",
      title: ["Test"],
    };
    const record = (adapter as any).transformCrossrefToAcl(item);
    expect(record).toBeNull();
  });
});

describe("CrossrefAdapter venue type mapping", () => {
  const adapter = new CrossrefAdapter();

  it("should map journal-article to journal", () => {
    const record = (adapter as any).normalize({
      title: ["Test"],
      "container-title": ["Nature"],
      type: "journal-article",
    });
    expect(record.venue?.type).toBe("journal");
  });

  it("should map proceedings-article to conference", () => {
    const record = (adapter as any).normalize({
      title: ["Test"],
      "container-title": ["ICML"],
      type: "proceedings-article",
    });
    expect(record.venue?.type).toBe("conference");
  });

  it("should map book-chapter to book", () => {
    const record = (adapter as any).normalize({
      title: ["Test"],
      "container-title": ["Handbook"],
      type: "book-chapter",
    });
    expect(record.venue?.type).toBe("book");
  });

  it("should map posted-content to preprint", () => {
    const record = (adapter as any).normalize({
      title: ["Test"],
      "container-title": ["SSRN"],
      type: "posted-content",
    });
    expect(record.venue?.type).toBe("preprint");
  });
});
