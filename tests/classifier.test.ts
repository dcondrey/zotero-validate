import { describe, it, expect } from "vitest";
import { classify } from "../src/classifier";
import { FieldDiff } from "../src/types";

describe("classifier", () => {
  it("should return VERIFIED when minimum primary matches are met", () => {
    const diffs = new Map();
    diffs.set("crossref", {
      tier: 1,
      diffs: [{ field: "title", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });
    diffs.set("openalex", {
      tier: 1,
      diffs: [{ field: "authors", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });

    const result = classify(diffs, 2);
    expect(result.status).toBe("VERIFIED");
    expect(result.primaryMatches).toBe(2);
  });

  it("should return VERIFIED_WITH_CORRECTIONS on field mismatch", () => {
    const diffs = new Map();
    diffs.set("crossref", {
      tier: 1,
      diffs: [
        { field: "title", status: "mismatch", diagnostic: "typo" } as FieldDiff,
      ],
      hasStrongIdentifierMatch: true,
    });
    diffs.set("openalex", {
      tier: 1,
      diffs: [
        { field: "title", status: "mismatch", diagnostic: "typo" } as FieldDiff,
      ],
      hasStrongIdentifierMatch: true,
    });

    const result = classify(diffs, 2);
    expect(result.status).toBe("VERIFIED_WITH_CORRECTIONS");
    expect(result.corrections.length).toBe(1);
    expect(result.corrections[0].field).toBe("title");
  });

  it("should return FLAGGED if insufficient sources match", () => {
    const diffs = new Map();
    diffs.set("crossref", {
      tier: 1,
      diffs: [],
      hasStrongIdentifierMatch: true,
    });
    // Only 1 match, but 2 required

    const result = classify(diffs, 2);
    expect(result.status).toBe("FLAGGED");
  });

  it("should allow Tier 3 sources to boost a single primary match", () => {
    const diffs = new Map();
    diffs.set("crossref", {
      tier: 1,
      diffs: [{ field: "title", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });
    diffs.set("unpaywall", {
      tier: 3,
      diffs: [{ field: "title", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });

    const result = classify(diffs, 2);
    expect(result.status).toBe("VERIFIED");
    expect(result.primaryMatches).toBe(1);
    expect(result.diagnostic).toContain("Tier 3");
  });

  it("should not promote a title-only primary match to VERIFIED via Tier 3", () => {
    const diffs = new Map();
    diffs.set("crossref", {
      tier: 1,
      diffs: [
        { field: "title", status: "match" } as FieldDiff,
        { field: "authors", status: "match" } as FieldDiff,
      ],
      hasStrongIdentifierMatch: false,
    });
    diffs.set("unpaywall", {
      tier: 3,
      diffs: [{ field: "title", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });

    const result = classify(diffs, 2);
    expect(result.status).toBe("VERIFIED_WITH_CORRECTIONS");
  });

  it("should not allow Tier 3 sources alone to verify", () => {
    const diffs = new Map();
    diffs.set("unpaywall", {
      tier: 3,
      diffs: [{ field: "title", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });
    diffs.set("opencitations", {
      tier: 3,
      diffs: [{ field: "title", status: "match" } as FieldDiff],
      hasStrongIdentifierMatch: true,
    });

    const result = classify(diffs, 2);
    expect(result.status).toBe("FLAGGED");
  });

  it("should include corrections in FLAGGED results", () => {
    const diffs = new Map();
    diffs.set("crossref", {
      tier: 1,
      diffs: [
        { field: "title", status: "match" } as FieldDiff,
        { field: "authors", status: "match" } as FieldDiff,
        { field: "year", status: "mismatch", sourceValue: 2024 } as FieldDiff,
      ],
      hasStrongIdentifierMatch: false,
    });

    const result = classify(diffs, 2);
    expect(result.status).toBe("FLAGGED");
    expect(result.corrections.length).toBeGreaterThan(0);
  });
});
