import { FieldDiff } from "./types";

export type ClassificationStatus =
  "VERIFIED" | "VERIFIED_WITH_CORRECTIONS" | "FLAGGED";

export interface ClassificationResult {
  status: ClassificationStatus;
  primaryMatches: number;
  corrections: FieldDiff[];
  diagnostic: string;
}

export interface SourceDiffs {
  tier: number;
  diffs: FieldDiff[];
  hasStrongIdentifierMatch: boolean;
}

const CRITICAL_FIELDS = ["title", "authors", "year"];

// An "exact" primary match: a tier-1/2 source confirmed by a strong identifier
// with no conflict on a critical field. Reaching `minRequired` of these is what
// makes an item VERIFIED, so the orchestrator uses the same predicate to know
// when further source queries are provably unnecessary.
export function isExactPrimaryMatch(entry: SourceDiffs): boolean {
  if (entry.tier > 2 || !entry.hasStrongIdentifierMatch) return false;
  return !entry.diffs.some(
    (d) => d.status === "mismatch" && CRITICAL_FIELDS.includes(d.field),
  );
}

export function countExactPrimaryMatches(
  diffsBySource: Map<string, SourceDiffs>,
): number {
  let count = 0;
  for (const entry of diffsBySource.values()) {
    if (isExactPrimaryMatch(entry)) count++;
  }
  return count;
}

export function classify(
  diffsBySource: Map<string, SourceDiffs>,
  minRequired: number = 2,
): ClassificationResult {
  let exactPrimaryMatches = 0;
  let partialPrimaryMatches = 0;
  let tier3Supports = 0;
  const allCorrections = new Map<string, FieldDiff>();

  for (const entry of diffsBySource.values()) {
    const { tier, diffs, hasStrongIdentifierMatch } = entry;
    const conflicts = diffs.filter((d) => d.status === "mismatch");
    const missing = diffs.filter(
      (d) => d.status === "missing-zotero" || d.status === "missing-source",
    );
    const criticalConflicts = conflicts.filter((d) =>
      CRITICAL_FIELDS.includes(d.field),
    );

    if (tier > 2) {
      // Tier 3 sources count as supporting evidence when they have a strong ID match
      // and no critical conflicts
      if (criticalConflicts.length === 0 && hasStrongIdentifierMatch) {
        tier3Supports++;
      }
      continue;
    }

    if (isExactPrimaryMatch(entry)) {
      exactPrimaryMatches++;
      for (const m of missing) {
        if (!allCorrections.has(m.field)) {
          allCorrections.set(m.field, m);
        }
      }
    } else if (
      hasStrongIdentifierMatch ||
      (diffs.find((d) => d.field === "title")?.status === "match" &&
        diffs.find((d) => d.field === "authors")?.status === "match")
    ) {
      partialPrimaryMatches++;
      for (const m of [...conflicts, ...missing]) {
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

  // Tier 3 sources can boost a single primary match to meet the threshold
  const totalPrimary = exactPrimaryMatches + partialPrimaryMatches;
  if (totalPrimary > 0 && totalPrimary + tier3Supports >= minRequired) {
    const corrections = Array.from(allCorrections.values());
    // VERIFIED requires at least one identifier-confirmed primary match;
    // a title-only (fuzzy) match boosted by Tier 3 stays as corrections.
    const idConfirmed = exactPrimaryMatches > 0;
    return {
      status:
        corrections.length === 0 && idConfirmed
          ? "VERIFIED"
          : "VERIFIED_WITH_CORRECTIONS",
      primaryMatches: totalPrimary,
      corrections,
      diagnostic: `Verified with Tier 3 supporting evidence (${tier3Supports} supporting source${tier3Supports > 1 ? "s" : ""}).`,
    };
  }

  return {
    status: "FLAGGED",
    primaryMatches: totalPrimary,
    corrections: Array.from(allCorrections.values()),
    diagnostic: "Insufficient authoritative matches or conflicting data.",
  };
}
