import { describe, it, expect } from "vitest";
import {
  classify,
  isExactPrimaryMatch,
  countExactPrimaryMatches,
} from "../src/classifier";
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

describe("isExactPrimaryMatch", () => {
  const entry = (over: any) => ({
    tier: 1,
    hasStrongIdentifierMatch: true,
    diffs: [] as FieldDiff[],
    ...over,
  });

  it("is true for a tier-1/2 id-confirmed match with no critical conflict", () => {
    expect(isExactPrimaryMatch(entry({ tier: 1 }))).toBe(true);
    expect(isExactPrimaryMatch(entry({ tier: 2 }))).toBe(true);
  });

  it("is false without a strong identifier", () => {
    expect(
      isExactPrimaryMatch(entry({ hasStrongIdentifierMatch: false })),
    ).toBe(false);
  });

  it("is false for a tier-3 source", () => {
    expect(isExactPrimaryMatch(entry({ tier: 3 }))).toBe(false);
  });

  it("is false when a critical field conflicts", () => {
    expect(
      isExactPrimaryMatch(
        entry({ diffs: [{ field: "year", status: "mismatch" } as FieldDiff] }),
      ),
    ).toBe(false);
  });

  it("ignores conflicts on non-critical fields", () => {
    expect(
      isExactPrimaryMatch(
        entry({
          diffs: [{ field: "volume", status: "mismatch" } as FieldDiff],
        }),
      ),
    ).toBe(true);
  });
});

describe("countExactPrimaryMatches", () => {
  it("counts only qualifying tier-1/2 id-confirmed sources", () => {
    const m = new Map<string, any>();
    m.set("a", { tier: 1, hasStrongIdentifierMatch: true, diffs: [] });
    m.set("b", { tier: 2, hasStrongIdentifierMatch: true, diffs: [] });
    m.set("c", { tier: 3, hasStrongIdentifierMatch: true, diffs: [] });
    m.set("d", { tier: 1, hasStrongIdentifierMatch: false, diffs: [] });
    expect(countExactPrimaryMatches(m)).toBe(2);
  });
});
