import { SourceAdapter, CanonicalRecord, Identifier, PluginPrefs, FieldDiff } from './types';
import { CrossrefAdapter } from './adapters/crossref';
import { OpenAlexAdapter } from './adapters/openalex';
import { compareRecords, ZoteroItemMock } from './comparison';
import { classify, ClassificationResult } from './classifier';

export class Orchestrator {
    private adapters: SourceAdapter[] = [
        new CrossrefAdapter(),
        new OpenAlexAdapter()
    ];
    private activeRequests = 0;
    private maxConcurrent = 8; // From prefs later

    constructor(private getPrefs: () => PluginPrefs) {}

    private async limitConcurrency<T>(task: () => Promise<T>): Promise<T> {
        while (this.activeRequests >= this.maxConcurrent) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        this.activeRequests++;
        try {
            return await task();
        } finally {
            this.activeRequests--;
        }
    }

    private extractIdentifier(item: any): Identifier {
        const id: Identifier = {};
        const doi = item.getField('DOI');
        if (doi) id.doi = doi;
        
        const isbn = item.getField('ISBN');
        if (isbn) id.isbn = isbn;

        const extra = item.getField('extra') || '';
        const pmidMatch = extra.match(/PMID:\s*(\d+)/i);
        if (pmidMatch) id.pmid = pmidMatch[1];
        
        const arxivMatch = extra.match(/arXiv:\s*([\d.]+v?\d*)/i);
        if (arxivMatch) id.arxivId = arxivMatch[1];

        return id;
    }

    async validateItem(item: any, force: boolean = false): Promise<ClassificationResult> {
        const prefs = this.getPrefs();
        this.maxConcurrent = prefs['behavior.timeout_sec'] || 8;
        
        // Freshness check
        const extra = item.getField('extra') || '';
        if (!force && extra.includes('ReferenceValidator:')) {
             try {
                 const reportStr = extra.split('ReferenceValidator:')[1].trim().split('\n')[0];
                 const report = JSON.parse(reportStr);
                 const daysOld = (Date.now() - report.timestamp) / (1000 * 60 * 60 * 24);
                 if (daysOld < (prefs['behavior.freshness_days'] || 90)) {
                      return report.result as ClassificationResult;
                 }
             } catch (e) {
                 // Invalid report, re-validate
             }
        }

        const identifier = this.extractIdentifier(item);
        const diffsBySource = new Map<string, { tier: number, diffs: FieldDiff[], hasStrongIdentifierMatch: boolean }>();
        const title = item.getField('title');
        
        const promises = this.adapters.map(async (adapter) => {
            if (!adapter.isConfigured(prefs)) return;

            return this.limitConcurrency(async () => {
                try {
                    let record: CanonicalRecord | null = null;
                    let hasStrongId = false;

                    if (Object.keys(identifier).length > 0) {
                        record = await adapter.getById(identifier, prefs);
                        if (record) hasStrongId = true;
                    }

                    if (!record && title) {
                        const authors = item.getCreators().map((c: any) => c.lastName);
                        const results = await adapter.search({ title, authors }, prefs);
                        if (results.length > 0) {
                            record = results[0]; // Take top result for now
                        }
                    }

                    if (record) {
                        const diffs = compareRecords(item, record);
                        diffsBySource.set(adapter.id, {
                            tier: adapter.tier,
                            diffs,
                            hasStrongIdentifierMatch: hasStrongId
                        });
                    }
                } catch (e) {
                    Zotero.debug(`ReferenceValidator: Adapter ${adapter.id} failed - ${e}`);
                }
            });
        });

        await Promise.all(promises);

        const minSources = prefs['behavior.min_sources'] || 2;
        const result = classify(diffsBySource, minSources);

        await this.persistResult(item, result);
        return result;
    }

    private async persistResult(item: any, result: ClassificationResult) {
        // Tag application
        const tags = item.getTags().map((t: any) => t.tag);
        const valTags = ['validated', 'validated-with-corrections', 'validation-flagged'];
        
        // Remove old tags
        for (const t of tags) {
            if (valTags.includes(t)) item.removeTag(t);
        }

        if (result.status === 'VERIFIED') item.addTag('validated');
        else if (result.status === 'VERIFIED_WITH_CORRECTIONS') item.addTag('validated-with-corrections');
        else item.addTag('validation-flagged');

        // Extra field storage
        let extra = item.getField('extra') || '';
        // Remove old report
        extra = extra.replace(/ReferenceValidator:.*(\n|$)/g, '').trim();
        
        const report = {
            timestamp: Date.now(),
            result
        };
        
        extra = `${extra}\nReferenceValidator: ${JSON.stringify(report)}`.trim();
        item.setField('extra', extra);
        
        await item.saveTx();
    }
}