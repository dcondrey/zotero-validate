import { safeString } from "../http";

const NAME_PREFIXES = new Set([
  "van",
  "von",
  "de",
  "del",
  "der",
  "di",
  "la",
  "le",
  "el",
  "al",
  "bin",
  "ibn",
]);

export function parseAuthorName(raw: string): {
  family: string;
  given: string;
  raw: string;
} {
  const name = safeString(raw).trim();
  if (!name) return { family: "", given: "", raw: "" };

  const commaIdx = name.indexOf(",");
  if (commaIdx !== -1) {
    return {
      family: name.slice(0, commaIdx).trim(),
      given: name.slice(commaIdx + 1).trim(),
      raw: name,
    };
  }

  const parts = name.split(/\s+/);
  if (parts.length <= 1) return { family: name, given: "", raw: name };

  let splitAt = parts.length - 1;
  while (splitAt > 1 && NAME_PREFIXES.has(parts[splitAt - 1].toLowerCase())) {
    splitAt--;
  }

  return {
    family: parts.slice(splitAt).join(" "),
    given: parts.slice(0, splitAt).join(" "),
    raw: name,
  };
}

export function parseYear(value: any): number | undefined {
  if (typeof value === "number" && value >= 1000 && value <= 9999) return value;
  if (typeof value === "string") {
    const n = parseInt(value, 10);
    if (n >= 1000 && n <= 9999) return n;
  }
  return undefined;
}

export function parseDateYear(dateStr: any): number | undefined {
  if (typeof dateStr !== "string" || !dateStr) return undefined;
  const words = dateStr.split(/\s+/);
  for (const w of words) {
    const n = parseInt(w, 10);
    if (n >= 1000 && n <= 9999) return n;
  }
  return undefined;
}

export function parseTimestampYear(ts: any): number | undefined {
  if (typeof ts !== "number" || ts <= 0) return undefined;
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const year = new Date(ms).getFullYear();
  return year >= 1000 && year <= 9999 ? year : undefined;
}
