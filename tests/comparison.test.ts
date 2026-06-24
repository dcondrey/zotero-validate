import { describe, it, expect } from "vitest";
import {
  compareTitles,
  compareAuthors,
  compareIdentifiers,
} from "../src/comparison";

describe("comparison engine", () => {
  describe("compareTitles", () => {
    it("should match identical titles", () => {
      expect(compareTitles("Hello World", "Hello World")).toBe(true);
    });

    it("should strip LaTeX commands", () => {
      expect(compareTitles("\\emph{Hello} World", "Hello World")).toBe(true);
      expect(
        compareTitles("\\textbf{Hello} \\textit{World}", "Hello World"),
      ).toBe(true);
    });

    it("should normalize case and punctuation", () => {
      expect(compareTitles("hello world:", "Hello World.")).toBe(true);
    });

    it("should allow minor typos (Levenshtein >= 0.95)", () => {
      expect(
        compareTitles(
          "A very long title about something specific",
          "A very long title about somthing specific",
        ),
      ).toBe(true);
    });

    it("should enforce the Levenshtein threshold at the boundary", () => {
      expect(compareTitles("abcdefghijklmnopqrst", "abcdefghijklmnopqrsx")).toBe(
        true,
      );
      expect(compareTitles("abcdefghijklmnopqrs", "abcdefghijklmnopqrx")).toBe(
        false,
      );
    });

    it("should normalize unicode dashes and smart quotes", () => {
      expect(
        compareTitles(
          "A Study\u2014With \u201cQuotes\u201d",
          'A Study-With "Quotes"',
        ),
      ).toBe(true);
    });

    it("should fail on major differences", () => {
      expect(compareTitles("Hello World", "Goodbye World")).toBe(false);
    });
  });

  describe("compareAuthors", () => {
    it("should match exactly", () => {
      const zAuthors = [{ firstName: "John", lastName: "Doe" }];
      const sAuthors = [{ given: "John", family: "Doe", raw: "John Doe" }];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should match with initials", () => {
      const zAuthors = [{ firstName: "J. R.", lastName: "Doe" }];
      const sAuthors = [{ given: "John Robert", family: "Doe", raw: "" }];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should match authors regardless of order", () => {
      const zAuthors = [
        { firstName: "A", lastName: "B" },
        { firstName: "C", lastName: "D" },
      ];
      const sAuthors = [
        { given: "C", family: "D", raw: "" },
        { given: "A", family: "B", raw: "" },
      ];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should handle duplicate surnames with different given names", () => {
      const zAuthors = [
        { firstName: "John", lastName: "Smith" },
        { firstName: "Alice", lastName: "Smith" },
      ];
      const sAuthors = [
        { given: "Alice", family: "Smith", raw: "" },
        { given: "John", family: "Smith", raw: "" },
      ];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should handle et al. truncation if 3+ authors missing", () => {
      const zAuthors = [{ firstName: "A", lastName: "B" }];
      const sAuthors = [
        { given: "A", family: "B", raw: "" },
        { given: "C", family: "D", raw: "" },
        { given: "E", family: "F", raw: "" },
        { given: "G", family: "H", raw: "" },
      ];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should fail et al. truncation if <3 authors missing", () => {
      const zAuthors = [{ firstName: "A", lastName: "B" }];
      const sAuthors = [
        { given: "A", family: "B", raw: "" },
        { given: "C", family: "D", raw: "" },
      ];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("mismatch");
    });
  });

  describe("compareIdentifiers", () => {
    it("should normalize DOIs", () => {
      expect(
        compareIdentifiers(
          "10.1000/xyz123",
          "https://doi.org/10.1000/XYZ123",
          "doi",
        ),
      ).toBe(true);
    });
    it("should handle arXiv versions", () => {
      expect(
        compareIdentifiers("2301.12345v1", "2301.12345v1", "arxivId"),
      ).toBe(true);
      expect(compareIdentifiers("2301.12345", "2301.12345v2", "arxivId")).toBe(
        true,
      );
      expect(
        compareIdentifiers("2301.12345v1", "2301.12345v2", "arxivId"),
      ).toBe(true);
    });

    it("should normalize arXiv URL and prefix wrappers", () => {
      expect(
        compareIdentifiers(
          "https://arxiv.org/abs/2301.12345v2",
          "arXiv:2301.12345",
          "arxivId",
        ),
      ).toBe(true);
      expect(
        compareIdentifiers(
          "https://arxiv.org/pdf/2301.12345v1.pdf",
          "2301.12345v3",
          "arxivId",
        ),
      ).toBe(true);
    });

    it("should match ISBN-10 to ISBN-13 via 978 prefix", () => {
      expect(compareIdentifiers("9780123456789", "0123456789", "isbn")).toBe(
        true,
      );
      expect(compareIdentifiers("0123456789", "9780123456789", "isbn")).toBe(
        true,
      );
    });

    it("should reject ISBNs with different content", () => {
      expect(compareIdentifiers("9780123456789", "0987654321", "isbn")).toBe(
        false,
      );
    });

    it("should match identical ISBNs with hyphens", () => {
      expect(
        compareIdentifiers("978-0-12-345678-9", "9780123456789", "isbn"),
      ).toBe(true);
    });

    it("should match ISBN-10 with X check digit and formatting", () => {
      expect(compareIdentifiers("9780804429573", "0-8044-2957-X", "isbn")).toBe(
        true,
      );
      expect(
        compareIdentifiers("0 8044 2957 X", "978-0-8044-2957-3", "isbn"),
      ).toBe(true);
    });
  });

  it("should normalize unicode escaped accented author names", () => {
    const zAuthors = [{ firstName: "Jos\u00e9", lastName: "Garc\u00eda" }];
    const sAuthors = [{ given: "Jose", family: "Garcia", raw: "" }];
    expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
  });

  describe("edge cases", () => {
    it("should normalize accented characters in author names", () => {
      const zAuthors = [{ firstName: "José", lastName: "García" }];
      const sAuthors = [{ given: "Jose", family: "Garcia", raw: "" }];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should match initials like J.R.R. to full names", () => {
      const zAuthors = [{ firstName: "J.R.R.", lastName: "Tolkien" }];
      const sAuthors = [
        { given: "John Ronald Reuel", family: "Tolkien", raw: "" },
      ];
      expect(compareAuthors(zAuthors, sAuthors as any).status).toBe("match");
    });

    it("should handle empty strings in compareTitles", () => {
      expect(compareTitles("", "")).toBe(true);
      expect(compareTitles("Hello", "")).toBe(false);
      expect(compareTitles("", "Hello")).toBe(false);
    });

    it("should handle undefined lastName in authors without crashing", () => {
      const zAuthors = [{ firstName: "John", lastName: undefined as any }];
      const sAuthors = [{ given: "John", family: "Doe", raw: "" }];
      const result = compareAuthors(zAuthors, sAuthors as any);
      expect(result.status).toBe("mismatch");
    });

    it("should handle null/undefined in compareTitles without crashing", () => {
      expect(compareTitles(null as any, "Hello")).toBe(false);
      expect(compareTitles("Hello", null as any)).toBe(false);
    });
  });
});
