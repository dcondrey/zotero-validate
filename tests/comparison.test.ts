import { describe, it, expect } from 'vitest';
import { compareTitles, compareAuthors, compareIdentifiers } from '../src/comparison';

describe('comparison engine', () => {
    describe('compareTitles', () => {
        it('should match identical titles', () => {
            expect(compareTitles('Hello World', 'Hello World')).toBe(true);
        });

        it('should strip LaTeX commands', () => {
            expect(compareTitles('\\emph{Hello} World', 'Hello World')).toBe(true);
            expect(compareTitles('\\textbf{Hello} \\textit{World}', 'Hello World')).toBe(true);
        });

        it('should normalize case and punctuation', () => {
            expect(compareTitles('hello world:', 'Hello World.')).toBe(true);
        });
        
        it('should allow minor typos (Levenshtein >= 0.95)', () => {
            expect(compareTitles('A very long title about something specific', 'A very long title about somthing specific')).toBe(true);
        });

        it('should fail on major differences', () => {
            expect(compareTitles('Hello World', 'Goodbye World')).toBe(false);
        });
    });

    describe('compareAuthors', () => {
        it('should match exactly', () => {
            const zAuthors = [{ firstName: 'John', lastName: 'Doe' }];
            const sAuthors = [{ given: 'John', family: 'Doe', raw: 'John Doe' }];
            expect(compareAuthors(zAuthors, sAuthors as any).status).toBe('match');
        });

        it('should match with initials', () => {
            const zAuthors = [{ firstName: 'J. R.', lastName: 'Doe' }];
            const sAuthors = [{ given: 'John Robert', family: 'Doe', raw: '' }];
            expect(compareAuthors(zAuthors, sAuthors as any).status).toBe('match');
        });

        it('should fail on out of order', () => {
             const zAuthors = [{ firstName: 'A', lastName: 'B' }, { firstName: 'C', lastName: 'D' }];
             const sAuthors = [{ given: 'C', family: 'D', raw: '' }, { given: 'A', family: 'B', raw: '' }];
             expect(compareAuthors(zAuthors, sAuthors as any).status).toBe('mismatch');
        });

        it('should handle et al. truncation if 3+ authors missing', () => {
             const zAuthors = [{ firstName: 'A', lastName: 'B' }];
             const sAuthors = [
                 { given: 'A', family: 'B', raw: '' },
                 { given: 'C', family: 'D', raw: '' },
                 { given: 'E', family: 'F', raw: '' },
                 { given: 'G', family: 'H', raw: '' }
             ];
             expect(compareAuthors(zAuthors, sAuthors as any).status).toBe('match');
        });
        
        it('should fail et al. truncation if <3 authors missing', () => {
             const zAuthors = [{ firstName: 'A', lastName: 'B' }];
             const sAuthors = [
                 { given: 'A', family: 'B', raw: '' },
                 { given: 'C', family: 'D', raw: '' }
             ];
             expect(compareAuthors(zAuthors, sAuthors as any).status).toBe('mismatch');
        });
    });

    describe('compareIdentifiers', () => {
        it('should normalize DOIs', () => {
            expect(compareIdentifiers('10.1000/xyz123', 'https://doi.org/10.1000/XYZ123', 'doi')).toBe(true);
        });
        it('should handle arXiv versions', () => {
            expect(compareIdentifiers('2301.12345v1', '2301.12345v1', 'arxivId')).toBe(true);
            expect(compareIdentifiers('2301.12345', '2301.12345v2', 'arxivId')).toBe(true);
            expect(compareIdentifiers('2301.12345v1', '2301.12345v2', 'arxivId')).toBe(false);
        });
    });
});