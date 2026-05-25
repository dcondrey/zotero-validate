import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrossrefAdapter } from "../src/adapters/crossref";
import { OpenAlexAdapter } from "../src/adapters/openalex";

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
