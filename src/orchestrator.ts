import {
  SourceAdapter,
  CanonicalRecord,
  Identifier,
  PluginPrefs,
  FieldDiff,
} from "./types";
import { CrossrefAdapter } from "./adapters/crossref";
import { OpenAlexAdapter } from "./adapters/openalex";
import { DblpAdapter } from "./adapters/dblp";
import { PubMedAdapter } from "./adapters/pubmed";
import { SemanticScholarAdapter } from "./adapters/semanticscholar";
import { AclAnthologyAdapter } from "./adapters/aclanthology";
import { OpenReviewAdapter } from "./adapters/openreview";
import { ArxivAdapter } from "./adapters/arxiv";
import { OpenLibraryAdapter } from "./adapters/openlibrary";
import { compareRecords, ZoteroItemMock } from "./comparison";
import { classify, ClassificationResult } from "./classifier";
import { LLMClient } from "./llm";

// ==========================================
// 1. PLACE THE RATE LIMITER HERE (Outside)
// ==========================================
class TokenBucketRateLimiter {
  private queue: (() => void)[] = [];
  private activeConnections = 0;
  private tokens: number;
  private lastRefill: number = Date.now();
  private isProcessing = false;

  constructor(
    private perSecond: number,
    private maxConcurrent: number,
  ) {
    this.tokens = perSecond;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.activeConnections < this.maxConcurrent && this.tokens >= 1) {
      this.tokens--;
      this.activeConnections++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleProcess();
    });
  }

  release(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
    this.scheduleProcess();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed > 0) {
      this.tokens = Math.min(
        this.perSecond,
        this.tokens + elapsed * this.perSecond,
      );
      this.lastRefill = now;
    }
  }

  private scheduleProcess() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.refill();
    while (
      this.queue.length > 0 &&
      this.activeConnections < this.maxConcurrent &&
      this.tokens >= 1
    ) {
      this.tokens--;
      this.activeConnections++;
      const next = this.queue.shift();
      if (next) next();
    }

    if (this.queue.length > 0) {
      this.isProcessing = true;
      const tokensNeeded = 1 - this.tokens;
      const delay = Math.max(50, (tokensNeeded / this.perSecond) * 1000);
      setTimeout(() => {
        this.isProcessing = false;
        this.scheduleProcess();
      }, delay);
    }
  }
}

// ==========================================
// 2. YOUR MAIN ORCHESTRATOR CLASS
// ==========================================
export class Orchestrator {
  private adapters: SourceAdapter[] = [
    new CrossrefAdapter(),
    new OpenAlexAdapter(),
    new DblpAdapter(),
    new PubMedAdapter(),
    new SemanticScholarAdapter(),
    new AclAnthologyAdapter(),
    new OpenReviewAdapter(),
    new ArxivAdapter(),
    new OpenLibraryAdapter(),
  ];
  private llmClient: LLMClient;
  private limiters = new Map<string, TokenBucketRateLimiter>();
  private inFlightRequests = new Map<string, Promise<CanonicalRecord | null>>();
  static programmaticMutations = new Set<string>();

  constructor(private getPrefs: () => PluginPrefs) {
    this.llmClient = new LLMClient(getPrefs);
  }

  static isShielded(itemKey: string): boolean {
    return this.programmaticMutations.has(itemKey);
  }

  private getRequestKey(identifier: Identifier, title?: string): string {
    if (identifier.doi) return `doi:${identifier.doi.toLowerCase()}`;
    if (identifier.pmid) return `pmid:${identifier.pmid}`;
    if (identifier.arxivId) return `arxiv:${identifier.arxivId.toLowerCase()}`;
    if (identifier.isbn) return `isbn:${identifier.isbn}`;
    if (title) return `title:${title.toLowerCase().trim().slice(0, 100)}`;
    return `nonce:${Date.now()}-${Math.random()}`;
  }

  private async deduplicatedFetch(
    adapter: SourceAdapter,
    identifier: Identifier,
    title: string,
    authors: string[],
    prefs: PluginPrefs,
  ): Promise<CanonicalRecord | null> {
    const key = `${adapter.id}:${this.getRequestKey(identifier, title)}`;

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key)!;
    }

    const requestPromise = (async () => {
      try {
        let record: CanonicalRecord | null = null;
        if (Object.keys(identifier).length > 0) {
          record = await adapter.getById(identifier, prefs);
        }
        if (!record && title) {
          const results = await adapter.search({ title, authors }, prefs);
          if (results.length > 0) record = results[0];
        }
        return record;
      } finally {
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, requestPromise);
    return requestPromise;
  }

  private getLimiter(adapter: SourceAdapter): TokenBucketRateLimiter {
    if (!this.limiters.has(adapter.id)) {
      this.limiters.set(
        adapter.id,
        new TokenBucketRateLimiter(
          adapter.rateLimit.perSecond,
          adapter.rateLimit.concurrent,
        ),
      );
    }
    return this.limiters.get(adapter.id)!;
  }

  private extractIdentifier(item: any): Identifier {
    const id: Identifier = {};
    const doi = item.getField("DOI");
    if (doi && /^10\.\d{4,}\/\S+$/.test(doi)) id.doi = doi;

    const isbn = item.getField("ISBN");
    if (isbn) {
      const cleanIsbn = isbn.replace(/-/g, "");
      if (/^\d{10}(\d{3})?$/.test(cleanIsbn)) id.isbn = isbn;
    }

    const extra = item.getField("extra") || "";
    const pmidMatch = extra.match(/PMID:\s*(\d{1,10})\b/i);
    if (pmidMatch) id.pmid = pmidMatch[1];

    const arxivMatch = extra.match(/arXiv:\s*(\d{4}\.\d{4,5}(?:v\d+)?)\b/i);
    if (arxivMatch) id.arxivId = arxivMatch[1];

    return id;
  }

  async validateItem(
    item: any,
    force: boolean = false,
  ): Promise<ClassificationResult> {
    const prefs = this.getPrefs();

    // Freshness check
    const extra = item.getField("extra") || "";
    if (!force && extra.includes("ReferenceValidator:")) {
      try {
        const reportMatch = extra.match(/^ReferenceValidator:\s*(\{.*\})$/m);
        if (!reportMatch) throw new Error("no report found");
        const report = JSON.parse(reportMatch[1]);
        if (
          report === null ||
          typeof report !== "object" ||
          typeof report.timestamp !== "number" ||
          !report.result ||
          typeof report.result.status !== "string"
        ) {
          throw new Error("malformed report");
        }
        const validStatuses = [
          "VERIFIED",
          "VERIFIED_WITH_CORRECTIONS",
          "FLAGGED",
        ];
        if (!validStatuses.includes(report.result.status)) {
          throw new Error("invalid status");
        }
        const daysOld = (Date.now() - report.timestamp) / (1000 * 60 * 60 * 24);
        if (daysOld < (prefs["behavior.freshness_days"] || 90)) {
          return {
            status: report.result.status,
            primaryMatches: Number(report.result.primaryMatches) || 0,
            corrections: Array.isArray(report.result.corrections)
              ? report.result.corrections
              : [],
            diagnostic: String(report.result.diagnostic || ""),
          };
        }
      } catch (e) {
        // Invalid report, re-validate
      }
    }

    // Inside orchestrator.ts -> validateItem()
    const identifier = this.extractIdentifier(item);
    const diffsBySource = new Map<
      string,
      { tier: number; diffs: FieldDiff[]; hasStrongIdentifierMatch: boolean }
    >();
    const title = item.getField("title");
    const allCandidates: CanonicalRecord[] = [];
    const adapterErrors: string[] = [];

    const authors = item
      .getCreators()
      .map((c: any) => c.lastName)
      .filter(Boolean);

    const promises = this.adapters.map(async (adapter) => {
      if (!adapter.isConfigured(prefs)) return;

      const limiter = this.getLimiter(adapter);
      await limiter.acquire();

      try {
        const record = await this.deduplicatedFetch(
          adapter,
          identifier,
          title,
          authors,
          prefs,
        );
        const hasStrongId =
          Object.keys(identifier).length > 0 && record !== null;

        if (record) {
          allCandidates.push(record);
          const diffs = compareRecords(item, record);
          diffsBySource.set(adapter.id, {
            tier: adapter.tier,
            diffs,
            hasStrongIdentifierMatch: hasStrongId,
          });
        }
      } catch (e) {
        let message = "unknown error";
        if (e instanceof Error) {
          message = String(e.message || e.name || "exception");
        } else if (typeof e === "string") {
          message = e;
        }
        const clipped = message.slice(0, 150);
        adapterErrors.push(`${adapter.displayName.slice(0, 30)}: ${clipped}`);
        Zotero.debug(
          `ReferenceValidator: Adapter ${adapter.id} failed - ${clipped}`,
        );
      } finally {
        limiter.release();
      }
    });

    await Promise.all(promises);

    const minSources = prefs["behavior.min_sources"] || 2;
    let result = classify(diffsBySource, minSources);

    if (adapterErrors.length > 0) {
      result = {
        ...result,
        diagnostic: result.diagnostic + " Errors: " + adapterErrors.join("; "),
      };
    }

    // LLM Adjudication (Step 6)
    if (result.status === "FLAGGED" && prefs["behavior.use_llm"]) {
      const llmResult = await this.llmClient.adjudicate(item, allCandidates);
      if (llmResult) {
        result = llmResult;
      }
    }

    await this.persistResult(item, result);
    return result;
  }

  // Inside orchestrator.ts
  private async persistResult(item: any, result: ClassificationResult) {
    const valTags = [
      "validated",
      "validated-with-corrections",
      "validation-flagged",
    ];
    const newTag =
      result.status === "VERIFIED"
        ? "validated"
        : result.status === "VERIFIED_WITH_CORRECTIONS"
          ? "validated-with-corrections"
          : "validation-flagged";

    const report = {
      timestamp: Date.now(),
      result,
    };

    const itemId = String(item.id || "");
    try {
      Orchestrator.programmaticMutations.add(itemId);

      const freshItem = Zotero.Items.get(item.id) || item;
      let extra = freshItem.getField("extra") || "";
      extra = extra
        .split("\n")
        .filter((line: string) => !line.startsWith("ReferenceValidator:"))
        .join("\n")
        .trim();
      extra = `${extra}\nReferenceValidator: ${JSON.stringify(report)}`.trim();

      const oldTags = freshItem.getTags().map((t: any) => t.tag);
      for (const t of oldTags) {
        if (valTags.includes(t)) freshItem.removeTag(t);
      }

      freshItem.addTag(newTag);
      freshItem.setField("extra", extra);
      await freshItem.saveTx();
    } catch (e) {
      Zotero.debug(
        `ReferenceValidator: Failed to persist result cleanly - ${e}`,
      );
    } finally {
      Orchestrator.programmaticMutations.delete(itemId);
    }
  }
}
