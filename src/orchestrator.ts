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
import { DataCiteAdapter } from "./adapters/datacite";
import { EuropePMCAdapter } from "./adapters/europepmc";
import { OpenCitationsAdapter } from "./adapters/opencitations";
import { UnpaywallAdapter } from "./adapters/unpaywall";
import { IAScholarAdapter } from "./adapters/iascholar";
import { OrcidAdapter } from "./adapters/orcid";
import { GoogleScholarAdapter } from "./adapters/googlescholar";
import { compareRecords } from "./comparison";
import { classify, ClassificationResult } from "./classifier";
import { LLMClient } from "./llm";
import { GlobalReferenceLibrary } from "./library";

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
    new DataCiteAdapter(),
    new EuropePMCAdapter(),
    new OrcidAdapter(),
    new OpenCitationsAdapter(),
    new UnpaywallAdapter(),
    new IAScholarAdapter(),
    new GoogleScholarAdapter(),
  ];
  private llmClient: LLMClient;
  private limiters = new Map<string, TokenBucketRateLimiter>();
  private inFlightRequests = new Map<
    string,
    Promise<{ record: CanonicalRecord | null; idBased: boolean }>
  >();
  private library: GlobalReferenceLibrary;
  static programmaticMutations = new Set<string>();

  constructor(private getPrefs: () => PluginPrefs) {
    this.llmClient = new LLMClient(getPrefs);
    this.library = new GlobalReferenceLibrary();
  }

  async init(): Promise<void> {
    await this.library.load();
  }

  getLibrary(): GlobalReferenceLibrary {
    return this.library;
  }

  static isShielded(itemKey: string): boolean {
    return this.programmaticMutations.has(itemKey);
  }

  private getRequestKey(
    identifier: Identifier,
    title?: string,
    authors?: string[],
  ): string {
    if (identifier.doi) return `doi:${identifier.doi.toLowerCase()}`;
    if (identifier.pmid) return `pmid:${identifier.pmid}`;
    if (identifier.arxivId) return `arxiv:${identifier.arxivId.toLowerCase()}`;
    if (identifier.isbn) return `isbn:${identifier.isbn}`;
    if (title) {
      const authorPart =
        authors && authors.length > 0
          ? `:${authors[0].toLowerCase().trim()}`
          : "";
      return `title:${title.toLowerCase().trim().slice(0, 200)}${authorPart}`;
    }
    return `nonce:${Date.now()}-${Math.random()}`;
  }

  private async deduplicatedFetch(
    adapter: SourceAdapter,
    identifier: Identifier,
    title: string,
    authors: string[],
    prefs: PluginPrefs,
  ): Promise<{ record: CanonicalRecord | null; idBased: boolean }> {
    const key = `${adapter.id}:${this.getRequestKey(identifier, title, authors)}`;

    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key)!;
    }

    const attemptFetch = async (): Promise<{
      record: CanonicalRecord | null;
      idBased: boolean;
    }> => {
      let record: CanonicalRecord | null = null;
      let idBased = false;
      if (Object.keys(identifier).length > 0) {
        record = await adapter.getById(identifier, prefs);
        if (record) idBased = true;
      }
      if (!record && title) {
        const results = await adapter.search({ title, authors }, prefs);
        if (results.length > 0) record = results[0];
      }
      return { record, idBased };
    };

    const requestPromise = (async () => {
      try {
        return await attemptFetch();
      } catch (firstError) {
        const isTransient =
          firstError instanceof Error &&
          (firstError.name === "AbortError" ||
            firstError.message.includes("fetch") ||
            firstError.message.includes("network") ||
            firstError.message.includes("ECONNRESET"));
        if (!isTransient) throw firstError;
        try {
          return await attemptFetch();
        } catch {
          throw firstError;
        }
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
    const rawDoi = item.getField("DOI");
    if (rawDoi) {
      const doi = String(rawDoi)
        .trim()
        .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
      if (/^10\.\d{4,}\/\S+$/.test(doi)) id.doi = doi;
    }

    const isbn = item.getField("ISBN");
    if (isbn) {
      const cleanIsbn = String(isbn).replace(/[\s-]/g, "").toUpperCase();
      if (/^\d{9}[\dX]$/.test(cleanIsbn) || /^\d{13}$/.test(cleanIsbn)) {
        id.isbn = isbn;
      }
    }

    const extra = item.getField("extra") || "";
    const lines: string[] = extra.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!id.pmid && trimmed.toUpperCase().startsWith("PMID:")) {
        const val = trimmed.slice(5).trim();
        if (val.length > 0 && val.length <= 10 && /^\d+$/.test(val)) {
          id.pmid = val;
        }
      }
      if (!id.arxivId && trimmed.toLowerCase().startsWith("arxiv:")) {
        const val = trimmed.slice(6).trim();
        if (
          /^\d{4}\.\d{4,5}(v\d+)?$/.test(val) ||
          /^[a-z-]+(\.[a-z]{2})?\/\d{7}(v\d+)?$/i.test(val)
        ) {
          id.arxivId = val;
        }
      }
    }

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
        const reportLine = extra
          .split("\n")
          .find((line: string) => line.startsWith("ReferenceValidator:"));
        if (!reportLine) throw new Error("no report found");
        const jsonStr = reportLine.slice("ReferenceValidator:".length).trim();
        const report = JSON.parse(jsonStr);
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

    const identifier = this.extractIdentifier(item);
    const title = item.getField("title");

    if (!force) {
      const libraryEntry = this.library.lookup(identifier, title);
      if (libraryEntry) {
        const freshnessMs = (prefs["behavior.freshness_days"] || 90) * 86400000;
        if (Date.now() - libraryEntry.validatedAt < freshnessMs) {
          const collectionName = item.getCollections?.()[0]?.name || "";
          this.library.recordUsage(
            identifier,
            title,
            item.id || 0,
            collectionName,
          );
          return libraryEntry.validationResult;
        }
      }
    }

    const diffsBySource = new Map<
      string,
      { tier: number; diffs: FieldDiff[]; hasStrongIdentifierMatch: boolean }
    >();
    const allCandidates: CanonicalRecord[] = [];
    const adapterErrors: string[] = [];

    const authors = item
      .getCreators()
      .map((c: any) => c.lastName)
      .filter(Boolean);

    const queryAdapter = async (adapter: SourceAdapter, id: Identifier) => {
      const limiter = this.getLimiter(adapter);
      await limiter.acquire();

      try {
        const { record, idBased } = await this.deduplicatedFetch(
          adapter,
          id,
          title,
          authors,
          prefs,
        );

        if (record) {
          allCandidates.push(record);
          const diffs = compareRecords(item, record);
          diffsBySource.set(adapter.id, {
            tier: adapter.tier,
            diffs,
            hasStrongIdentifierMatch: idBased,
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
    };

    // Phase 1: Query all adapters with original identifiers
    const configuredAdapters = this.adapters.filter((a) =>
      a.isConfigured(prefs),
    );
    await Promise.all(
      configuredAdapters.map((adapter) => queryAdapter(adapter, identifier)),
    );

    // Phase 2: Extract enriched identifiers from phase-1 results and
    // re-query adapters that returned no result
    const enriched: Identifier = { ...identifier };
    for (const candidate of allCandidates) {
      if (candidate.identifiers.doi && !enriched.doi)
        enriched.doi = candidate.identifiers.doi;
      if (candidate.identifiers.pmid && !enriched.pmid)
        enriched.pmid = candidate.identifiers.pmid;
      if (candidate.identifiers.arxivId && !enriched.arxivId)
        enriched.arxivId = candidate.identifiers.arxivId;
      if (candidate.identifiers.isbn && !enriched.isbn)
        enriched.isbn = candidate.identifiers.isbn;
    }

    const hasNewIds =
      Object.keys(enriched).length > Object.keys(identifier).length;
    if (hasNewIds) {
      const missedAdapters = configuredAdapters.filter(
        (a) => !diffsBySource.has(a.id),
      );
      if (missedAdapters.length > 0) {
        await Promise.all(
          missedAdapters.map((adapter) => queryAdapter(adapter, enriched)),
        );
      }
    }

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

    allCandidates.sort((a, b) => b.confidence - a.confidence);
    const bestCandidate = allCandidates[0];
    if (bestCandidate) {
      this.library.add(identifier, title, bestCandidate, result);
      const collectionName = item.getCollections?.()[0]?.name || "";
      this.library.recordUsage(identifier, title, item.id || 0, collectionName);
    }

    return result;
  }

  async shutdown(): Promise<void> {
    await this.library.flush();
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
