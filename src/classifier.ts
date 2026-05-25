import { CanonicalRecord, FieldDiff } from "./types";

export type ClassificationStatus =
  | "VERIFIED"
  | "VERIFIED_WITH_CORRECTIONS"
  | "FLAGGED";

export interface ClassificationResult {
  status: ClassificationStatus;
  primaryMatches: number;
  corrections: FieldDiff[];
  diagnostic: string;
}

export function classify(
  diffsBySource: Map<
    string,
    { tier: number; diffs: FieldDiff[]; hasStrongIdentifierMatch: boolean }
  >,
  minRequired: number = 2,
): ClassificationResult {
  let exactPrimaryMatches = 0;
  let partialPrimaryMatches = 0;
  const allCorrections = new Map<string, FieldDiff>();

  // Analyze each source's diffs
  for (const [
    sourceId,
    { tier, diffs, hasStrongIdentifierMatch },
  ] of diffsBySource.entries()) {
    if (tier > 2) continue; // Only Tier 1 and 2 count toward minimum

    // Check if there are any mismatches in critical fields
    const criticalFields = ["title", "authors", "year"];
    const mismatches = diffs.filter(
      (d) =>
        d.status === "mismatch" ||
        d.status === "missing-zotero" ||
        d.status === "missing-source",
    );
    const criticalMismatches = mismatches.filter((d) =>
      criticalFields.includes(d.field),
    );

    if (criticalMismatches.length === 0 && hasStrongIdentifierMatch) {
      exactPrimaryMatches++;
    } else if (
      hasStrongIdentifierMatch ||
      (diffs.find((d) => d.field === "title")?.status === "match" &&
        diffs.find((d) => d.field === "authors")?.status === "match")
    ) {
      // Has strong ID match or strong Title+Author match, but has field discrepancies
      partialPrimaryMatches++;
      for (const m of mismatches) {
        // Simplified: just taking the first correction encountered for a field
        if (!allCorrections.has(m.field)) {
          allCorrections.set(m.field, m);
        }
      }
    }
  }

  if (exactPrimaryMatches >= minRequired) {
    return {
      status: "VERIFIED",
      primaryMatches: exactPrimaryMatches,
      corrections: [],
      diagnostic: "Verified against authoritative sources.",
    };
  }

  if (exactPrimaryMatches + partialPrimaryMatches >= minRequired) {
    return {
      status: "VERIFIED_WITH_CORRECTIONS",
      primaryMatches: exactPrimaryMatches + partialPrimaryMatches,
      corrections: Array.from(allCorrections.values()),
      diagnostic: "Verified with discrepancies. Corrections available.",
    };
  }

  return {
    status: "FLAGGED",
    primaryMatches: exactPrimaryMatches + partialPrimaryMatches,
    corrections: [],
    diagnostic: "Insufficient authoritative matches or conflicting data.",
  };
}
