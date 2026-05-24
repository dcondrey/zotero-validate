import { CanonicalRecord, FieldDiff } from './types';

// ASSUMPTION: Zotero Item API
// Assuming standard Zotero 7/8/10 getField methods exist.
// This interface abstracts what we need from a Zotero Item for comparison.
export interface ZoteroItemMock {
  getField(field: string): any;
  getCreators(): Array<{ firstName: string; lastName: string; fieldMode: number }>;
}

function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\\(emph|textit|textbf)\{([^}]+)\}/g, '$2') // Strip simple LaTeX
    .replace(/[\u2018\u2019]/g, "'") // Smart quotes to ASCII
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, '-') // Dashes to ASCII
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
    .toLowerCase()
    .replace(/[.,:;!?]$/, ''); // Strip trailing punctuation
}

function levenshteinRatio(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;
  const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) matrix[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  const maxLen = Math.max(s1.length, s2.length);
  return 1 - (matrix[s2.length][s1.length] / maxLen);
}

function normalizeFamilyName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function getInitials(name: string): string {
    return name.split(/[\s-]+/).map(part => part.charAt(0).toLowerCase()).join('');
}

export function compareTitles(t1: string, t2: string): boolean {
  return levenshteinRatio(normalizeTitle(t1), normalizeTitle(t2)) >= 0.95;
}

export function compareAuthors(zoteroAuthors: Array<{ firstName: string; lastName: string }>, sourceAuthors: CanonicalRecord['authors']): FieldDiff {
  if (!zoteroAuthors || zoteroAuthors.length === 0) {
      return { field: 'authors', status: 'missing-zotero' };
  }
  if (!sourceAuthors || sourceAuthors.length === 0) {
      return { field: 'authors', status: 'missing-source' };
  }

  let matchCount = 0;
  let isEtAl = false;
  
  for (let i = 0; i < zoteroAuthors.length; i++) {
      if (i >= sourceAuthors.length) {
          return { field: 'authors', status: 'mismatch', diagnostic: 'Zotero has more authors than source' };
      }
      
      const zA = zoteroAuthors[i];
      const sA = sourceAuthors[i];
      
      if (normalizeFamilyName(zA.lastName) !== normalizeFamilyName(sA.family)) {
          return { field: 'authors', status: 'mismatch', diagnostic: `Mismatch at position ${i + 1}: ${zA.lastName} vs ${sA.family}` };
      }
      
      // Compare given names if both exist
      if (zA.firstName && sA.given) {
          const zInitials = getInitials(zA.firstName);
          const sInitials = getInitials(sA.given);
          if (!zInitials.startsWith(sInitials) && !sInitials.startsWith(zInitials)) {
             return { field: 'authors', status: 'mismatch', diagnostic: `Given name mismatch at position ${i + 1}: ${zA.firstName} vs ${sA.given}` };
          }
      }
      matchCount++;
  }

  // Handle et al. truncation check
  if (sourceAuthors.length > zoteroAuthors.length) {
      if (sourceAuthors.length - zoteroAuthors.length >= 3) {
          isEtAl = true; // Zotero list is a valid truncated prefix of a long author list
      } else {
           return { field: 'authors', status: 'mismatch', diagnostic: 'Source has more authors than Zotero, but not enough for et al. truncation' };
      }
  }

  return { 
      field: 'authors', 
      status: 'match',
      diagnostic: isEtAl ? 'Matched (with et al. truncation)' : undefined
  };
}

export function compareIdentifiers(zId: string, sId: string, type: string): boolean {
    if (!zId || !sId) return false;
    if (type === 'doi') {
        return zId.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '') === sId.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
    }
    if (type === 'isbn') {
        const cleanZ = zId.replace(/-/g, '');
        const cleanS = sId.replace(/-/g, '');
        // Basic match, ignoring 10 vs 13 conversion complexity for now
        return cleanZ.endsWith(cleanS) || cleanS.endsWith(cleanZ);
    }
    // arxivId versions
    if (type === 'arxivId') {
       const [baseZ, vZ] = zId.split('v');
       const [baseS, vS] = sId.split('v');
       if (baseZ !== baseS) return false;
       if (vZ && vS && vZ !== vS) return false; // Mismatch version but both exist
       return true; // Match base, or one lacks version
    }
    return zId === sId;
}

export function compareRecords(item: ZoteroItemMock, record: CanonicalRecord): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Title
  const zTitle = item.getField('title');
  if (!zTitle && !record.title) {
     diffs.push({ field: 'title', status: 'match' });
  } else if (!zTitle) {
      diffs.push({ field: 'title', status: 'missing-zotero', sourceValue: record.title });
  } else if (!record.title) {
      diffs.push({ field: 'title', status: 'missing-source', zoteroValue: zTitle });
  } else if (compareTitles(zTitle, record.title)) {
      diffs.push({ field: 'title', status: 'match', zoteroValue: zTitle, sourceValue: record.title });
  } else {
      diffs.push({ field: 'title', status: 'mismatch', zoteroValue: zTitle, sourceValue: record.title, diagnostic: 'Levenshtein ratio < 0.95' });
  }

  // Authors
  const zCreators = item.getCreators() || [];
  const zAuthors = zCreators.filter(c => c.fieldMode !== 1); // rough proxy for author
  diffs.push(compareAuthors(zAuthors, record.authors));

  // Year
  const zDate = item.getField('date');
  let zYear: number | undefined;
  if (zDate) {
      const match = zDate.match(/\d{4}/);
      if (match) zYear = parseInt(match[0], 10);
  }
  
  if (!zYear && !record.year) diffs.push({ field: 'year', status: 'match' });
  else if (!zYear) diffs.push({ field: 'year', status: 'missing-zotero', sourceValue: record.year });
  else if (!record.year) diffs.push({ field: 'year', status: 'missing-source', zoteroValue: zYear });
  else if (zYear === record.year) diffs.push({ field: 'year', status: 'match', zoteroValue: zYear, sourceValue: record.year });
  else diffs.push({ field: 'year', status: 'mismatch', zoteroValue: zYear, sourceValue: record.year });

  return diffs;
}