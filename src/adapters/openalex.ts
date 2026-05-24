import { SourceAdapter, CanonicalRecord, Identifier, SearchQuery, PluginPrefs } from './types';

export class OpenAlexAdapter implements SourceAdapter {
    id = 'openalex';
    displayName = 'OpenAlex';
    tier = 1 as const;
    requiresCredential = false;
    rateLimit = { perSecond: 10, concurrent: 5 }; // Polite pool

    isConfigured(prefs: PluginPrefs): boolean {
        return prefs['sources.openalex.enabled'] !== false; 
    }

    private getUrl(path: string, prefs: PluginPrefs): string {
        const url = new URL(`https://api.openalex.org${path}`);
        const email = prefs['sources.openalex.email'];
        if (email) {
            url.searchParams.append('mailto', email);
        }
        return url.toString();
    }

    async getById(identifier: Identifier, prefs: PluginPrefs = {}): Promise<CanonicalRecord | null> {
        let path = '';
        if (identifier.doi) {
            path = `/works/doi:${identifier.doi}`;
        } else if (identifier.pmid) {
            path = `/works/pmid:${identifier.pmid}`;
        } else {
            return null;
        }

        try {
            const response = await fetch(this.getUrl(path, prefs));
            if (!response.ok) return null;
            const data = await response.json();
            return this.normalize(data);
        } catch (e) {
            return null;
        }
    }

    async search(query: SearchQuery, prefs: PluginPrefs = {}): Promise<CanonicalRecord[]> {
         if (!query.title) return [];
         try {
             // Basic search by title
             const url = new URL(this.getUrl('/works', prefs));
             url.searchParams.append('search', query.title);
             const response = await fetch(url.toString());
             if (!response.ok) return [];
             const data = await response.json();
             return (data.results || []).map((item: any) => this.normalize(item)).slice(0, 5);
         } catch (e) {
             return [];
         }
    }

    private normalize(item: any): CanonicalRecord {
        const authors = (item.authorships || []).map((a: any) => {
            const raw = a.author?.display_name || '';
            const parts = raw.split(' ');
            return {
                family: parts.length > 1 ? parts.slice(-1)[0] : raw,
                given: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
                raw
            };
        });

        const identifiers: Identifier = {};
        if (item.doi) identifiers.doi = item.doi.replace('https://doi.org/', '');
        if (item.ids?.pmid) identifiers.pmid = item.ids.pmid.replace('https://pubmed.ncbi.nlm.nih.gov/', '');

        return {
            identifiers,
            title: item.title || '',
            authors,
            year: item.publication_year,
            venue: item.primary_location?.source?.display_name ? {
                name: item.primary_location.source.display_name,
                type: item.primary_location.source.type === 'journal' ? 'journal' : 'other'
            } : undefined,
            source: this.id,
            sourceUrl: item.id || '',
            confidence: 1.0,
            rawResponse: item
        };
    }
}
