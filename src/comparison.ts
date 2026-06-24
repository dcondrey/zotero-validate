import { CanonicalRecord, FieldDiff } from "./types";

// ASSUMPTION: Zotero Item API
// Assuming standard Zotero 7/8/10 getField methods exist.
// This interface abstracts what we need from a Zotero Item for comparison.
export interface ZoteroItemMock {
  getField(field: string): any;
  getCreators(): Array<{
    firstName: string;
    lastName: string;
    fieldMode: number;
  }>;
}

function stripLatex(input: string): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === "\\") {
      i++;
      if (i >= input.length) break;
      if (input[i] === "{" || input[i] === "}") {
        i++;
        continue;
      }
      let cmd = "";
      while (i < input.length && input[i] >= "a" && input[i] <= "z") {
        cmd += input[i];
        i++;
      }
      if (i < input.length && input[i] === "{") {
        let depth = 1;
        i++;
        let content = "";
        while (i < input.length && depth > 0) {
          if (input[i] === "{") depth++;
          else if (input[i] === "}") depth--;
          if (depth > 0) content += input[i];
          i++;
        }
        result += content;
      } else if (cmd.length > 0) {
        result += " ";
      } else {
        result += input[i] || "";
        i++;
      }
    } else if (input[i] === "{" || input[i] === "}") {
      i++;
    } else if (input[i] === "$") {
      i++;
      while (i < input.length && input[i] !== "$") {
        result += input[i];
        i++;
      }
      if (i < input.length) i++;
    } else {
      result += input[i];
      i++;
    }
  }
  return result;
}

const SMART_QUOTES: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
};
const DASHES = new Set([
  "\u2010",
  "\u2011",
  "\u2012",
  "\u2013",
  "\u2014",
  "\u2015",
]);

function normalizeTitle(title: string): string {
  if (!title) return "";
  let s = stripLatex(title);
  let out = "";
  for (const ch of s) {
    if (SMART_QUOTES[ch]) out += SMART_QUOTES[ch];
    else if (DASHES.has(ch)) out += "-";
    else out += ch;
  }
  return out
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,:;!?]$/, "");
}

function levenshteinRatio(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  if (s1.length > 1000 || s2.length > 1000) {
    return s1 === s2 ? 1.0 : 0.0;
  }

  let prevRow = Array(s1.length + 1)
    .fill(0)
    .map((_, i) => i);
  const currRow = Array(s1.length + 1).fill(0);

  for (let j = 1; j <= s2.length; j++) {
    currRow[0] = j;
    for (let i = 1; i <= s1.length; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      currRow[i] = Math.min(
        currRow[i - 1] + 1,
        prevRow[i] + 1,
        prevRow[i - 1] + cost,
      );
    }
    prevRow = [...currRow];
  }
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - prevRow[s1.length] / maxLen;
}

function normalizeFamilyName(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .map((part) => part.charAt(0).toLowerCase())
    .join("");
}

export function compareTitles(t1: string, t2: string): boolean {
  return levenshteinRatio(normalizeTitle(t1), normalizeTitle(t2)) >= 0.95;
}

function matchAuthorByName(
  zA: { firstName: string; lastName: string },
  sA: { family: string; given: string },
): boolean {
  if (normalizeFamilyName(zA.lastName) !== normalizeFamilyName(sA.family)) {
    return false;
  }
  if (zA.firstName && sA.given) {
    const zInitials = getInitials(zA.firstName);
    const sInitials = getInitials(sA.given);
    if (!zInitials.startsWith(sInitials) && !sInitials.startsWith(zInitials)) {
      return false;
    }
  }
  return true;
}

export function compareAuthors(
  zoteroAuthors: Array<{ firstName: string; lastName: string }>,
  sourceAuthors: CanonicalRecord["authors"],
): FieldDiff {
  if (!zoteroAuthors || zoteroAuthors.length === 0) {
    return { field: "authors", status: "missing-zotero" };
  }
  if (!sourceAuthors || sourceAuthors.length === 0) {
    return { field: "authors", status: "missing-source" };
  }

  const unmatchedSource = [...sourceAuthors];

  for (const zA of zoteroAuthors) {
    const idx = unmatchedSource.findIndex((sA) => matchAuthorByName(zA, sA));
    if (idx === -1) {
      return {
        field: "authors",
        status: "mismatch",
        diagnostic: `No matching source author for: ${zA.lastName}`,
      };
    }
    unmatchedSource.splice(idx, 1);
  }

  if (unmatchedSource.length >= 3) {
    return {
      field: "authors",
      status: "match",
      diagnostic: "Matched (with et al. truncation)",
    };
  }
  if (unmatchedSource.length > 0) {
    return {
      field: "authors",
      status: "mismatch",
      diagnostic: `Source has ${unmatchedSource.length} more author(s) than Zotero, which is insufficient for et al. truncation`,
    };
  }
  return { field: "authors", status: "match" };
}

export function compareIdentifiers(
  zId: string,
  sId: string,
  type: string,
): boolean {
  if (!zId || !sId) return false;
  if (type === "doi") {
    const stripDoiPrefix = (id: string): string => {
      const lower = id.toLowerCase();
      for (const prefix of [
        "https://doi.org/",
        "http://doi.org/",
        "https://dx.doi.org/",
        "http://dx.doi.org/",
      ]) {
        if (lower.startsWith(prefix)) return lower.slice(prefix.length);
      }
      return lower;
    };
    return stripDoiPrefix(zId) === stripDoiPrefix(sId);
  }
  if (type === "isbn") {
    const cleanZ = zId.replace(/[^0-9X]/gi, "").toUpperCase();
    const cleanS = sId.replace(/[^0-9X]/gi, "").toUpperCase();
    if (cleanZ === cleanS) return true;
    if (cleanZ.length === 13 && cleanS.length === 10) {
      return (
        cleanZ.startsWith("978") && cleanZ.slice(3, 12) === cleanS.slice(0, 9)
      );
    }
    if (cleanS.length === 13 && cleanZ.length === 10) {
      return (
        cleanS.startsWith("978") && cleanS.slice(3, 12) === cleanZ.slice(0, 9)
      );
    }
    return false;
  }
  // arxivId versions
  if (type === "arxivId") {
    const normalizeArxivId = (id: string): string => {
      let normalized = id.trim().toLowerCase();
      const urlMatch = normalized.match(/arxiv\.org\/(?:abs|pdf)\/([^?#]+)/);
      if (urlMatch) normalized = urlMatch[1];
      normalized = normalized
        .replace(/^arxiv:/, "")
        .replace(/\.pdf$/, "")
        .replace(/v\d+$/, "");
      return normalized;
    };
    return normalizeArxivId(zId) === normalizeArxivId(sId);
  }
  return zId === sId;
}

export function compareRecords(
  item: ZoteroItemMock,
  record: CanonicalRecord,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Title
  const zTitle = item.getField("title");
  if (!zTitle && !record.title) {
    diffs.push({ field: "title", status: "match" });
  } else if (!zTitle) {
    diffs.push({
      field: "title",
      status: "missing-zotero",
      sourceValue: record.title,
    });
  } else if (!record.title) {
    diffs.push({
      field: "title",
      status: "missing-source",
      zoteroValue: zTitle,
    });
  } else if (compareTitles(zTitle, record.title)) {
    diffs.push({
      field: "title",
      status: "match",
      zoteroValue: zTitle,
      sourceValue: record.title,
    });
  } else {
    diffs.push({
      field: "title",
      status: "mismatch",
      zoteroValue: zTitle,
      sourceValue: record.title,
      diagnostic: "Levenshtein ratio < 0.95",
    });
  }

  // Authors
  const zCreators = item.getCreators() || [];
  const zAuthors = zCreators.filter((c) => c.fieldMode !== 1); // rough proxy for author
  diffs.push(compareAuthors(zAuthors, record.authors));

  // Year
  const zDate = item.getField("date");
  let zYear: number | undefined;
  if (zDate) {
    const parsed = Date.parse(zDate);
    if (!isNaN(parsed)) {
      zYear = new Date(parsed).getFullYear();
    } else {
      const digits = zDate.slice(0, 4);
      const num = parseInt(digits, 10);
      if (num >= 1000 && num <= 9999) zYear = num;
    }
  }

  if (!zYear && !record.year) diffs.push({ field: "year", status: "match" });
  else if (!zYear)
    diffs.push({
      field: "year",
      status: "missing-zotero",
      sourceValue: record.year,
    });
  else if (!record.year)
    diffs.push({ field: "year", status: "missing-source", zoteroValue: zYear });
  else if (zYear === record.year)
    diffs.push({
      field: "year",
      status: "match",
      zoteroValue: zYear,
      sourceValue: record.year,
    });
  else
    diffs.push({
      field: "year",
      status: "mismatch",
      zoteroValue: zYear,
      sourceValue: record.year,
    });

  // Polymorphic venue field comparison based on item type
  const itemType = item.getField("itemType") || "journalArticle";

  if (record.venue) {
    if (itemType === "journalArticle") {
      const zVolume = item.getField("volume");
      if (record.venue.volume && zVolume && zVolume !== record.venue.volume) {
        diffs.push({
          field: "volume",
          status: "mismatch",
          zoteroValue: zVolume,
          sourceValue: record.venue.volume,
        });
      }
      const zIssue = item.getField("issue");
      if (record.venue.issue && zIssue && zIssue !== record.venue.issue) {
        diffs.push({
          field: "issue",
          status: "mismatch",
          zoteroValue: zIssue,
          sourceValue: record.venue.issue,
        });
      }
      const zPages = item.getField("pages");
      if (record.venue.pages && zPages && zPages !== record.venue.pages) {
        diffs.push({
          field: "pages",
          status: "mismatch",
          zoteroValue: zPages,
          sourceValue: record.venue.pages,
        });
      }
    } else if (itemType === "book") {
      const zPublisher = item.getField("publisher");
      if (
        record.venue.name &&
        zPublisher &&
        zPublisher.toLowerCase() !== record.venue.name.toLowerCase()
      ) {
        diffs.push({
          field: "publisher",
          status: "mismatch",
          zoteroValue: zPublisher,
          sourceValue: record.venue.name,
        });
      }
    }
  }

  return diffs;
}
