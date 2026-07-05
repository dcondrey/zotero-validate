import { describe, it, expect, vi, beforeEach } from "vitest";
import { Orchestrator } from "../src/orchestrator";

declare global {
  var Zotero: any;
}

const ALL_DISABLED: Record<string, any> = {
  "sources.crossref.enabled": false,
  "sources.openalex.enabled": false,
  "sources.semanticscholar.enabled": false,
  "sources.arxiv.enabled": false,
  "sources.pubmed.enabled": false,
  "sources.dblp.enabled": false,
  "sources.openreview.enabled": false,
  "sources.aclanthology.enabled": false,
  "sources.openlibrary.enabled": false,
  "sources.datacite.enabled": false,
  "sources.europepmc.enabled": false,
  "sources.orcid.enabled": false,
  "sources.opencitations.enabled": false,
  "sources.unpaywall.enabled": false,
};

beforeEach(() => {
  global.Zotero = {
    debug: vi.fn(),
    Items: {
      get: vi.fn(() => null),
    },
  };
  global.fetch = vi.fn(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
  ) as any;
});

function mockItem(
  fields: Record<string, any> = {},
  creators: any[] = [],
  tags: any[] = [],
) {
  return {
    getField: vi.fn((f: string, ...args: any[]) => fields[f] ?? ""),
    getCreators: vi.fn(() => creators),
    getTags: vi.fn(() => tags.map((t) => ({ tag: t }))),
    addTag: vi.fn(),
    removeTag: vi.fn(),
    setField: vi.fn(),
    saveTx: vi.fn(),
    save: vi.fn(),
    key: "TEST_KEY",
    id: 12345,
  };
}

describe("Orchestrator", () => {
  describe("freshness cache", () => {
    it("should return cached result when fresh", async () => {
      const cached = JSON.stringify({
        timestamp: Date.now(),
        result: {
          status: "VERIFIED",
          primaryMatches: 2,
          corrections: [],
          diagnostic: "cached",
        },
      });
      const item = mockItem({
        extra: `Some note\nReferenceValidator: ${cached}`,
      });
      const orch = new Orchestrator(() => ({
        ...ALL_DISABLED,
        "behavior.freshness_days": 90,
      }));
      const result = await orch.validateItem(item);
      expect(result.status).toBe("VERIFIED");
      expect(result.diagnostic).toBe("cached");
    });

    it("should re-validate when cache is stale", async () => {
      const staleTime = Date.now() - 100 * 24 * 60 * 60 * 1000;
      const cached = JSON.stringify({
        timestamp: staleTime,
        result: {
          status: "VERIFIED",
          primaryMatches: 2,
          corrections: [],
          diagnostic: "old",
        },
      });
      const item = mockItem({ extra: `ReferenceValidator: ${cached}` });
      const orch = new Orchestrator(() => ({
        ...ALL_DISABLED,
        "behavior.freshness_days": 90,
      }));
      const result = await orch.validateItem(item);
      expect(result.status).toBe("FLAGGED");
    });

    it("should reject malformed cache data and re-query sources", async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
      ) as any;
      global.fetch = fetchMock;
      const item = mockItem({
        extra: 'ReferenceValidator: {"bogus": true}',
        title: "Test",
      });
      const orch = new Orchestrator(() => ({
        ...ALL_DISABLED,
        "sources.crossref.enabled": true,
      }));
      const result = await orch.validateItem(item);
      expect(result.status).toBe("FLAGGED");
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should reject cache with invalid status and re-query sources", async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({}) }),
      ) as any;
      global.fetch = fetchMock;
      const cached = JSON.stringify({
        timestamp: Date.now(),
        result: {
          status: "HACKED",
          primaryMatches: 0,
          corrections: [],
          diagnostic: "",
        },
      });
      const item = mockItem({
        extra: `ReferenceValidator: ${cached}`,
        title: "Test",
      });
      const orch = new Orchestrator(() => ({
        ...ALL_DISABLED,
        "sources.crossref.enabled": true,
      }));
      const result = await orch.validateItem(item);
      expect(result.status).toBe("FLAGGED");
      expect(fetchMock).toHaveBeenCalled();
    });

    it("should bypass cache when force=true", async () => {
      const cached = JSON.stringify({
        timestamp: Date.now(),
        result: {
          status: "VERIFIED",
          primaryMatches: 2,
          corrections: [],
          diagnostic: "cached",
        },
      });
      const item = mockItem({ extra: `ReferenceValidator: ${cached}` });
      const orch = new Orchestrator(() => ALL_DISABLED);
      const result = await orch.validateItem(item, true);
      expect(result.status).toBe("FLAGGED");
    });
  });

  describe("identifier extraction", () => {
    it("should validate DOI format", async () => {
      const item = mockItem({ DOI: "10.1234/test.123", title: "Test" });
      const orch = new Orchestrator(() => ALL_DISABLED);
      await orch.validateItem(item);
    });

    it("should extract a DOI stored as a URL into a bare DOI", () => {
      const orch = new Orchestrator(() => ALL_DISABLED);
      for (const url of [
        "https://doi.org/10.1234/abc.def",
        "http://dx.doi.org/10.1234/abc.def",
        "  10.1234/abc.def  ",
      ]) {
        const item = mockItem({ DOI: url });
        expect((orch as any).extractIdentifier(item).doi).toBe(
          "10.1234/abc.def",
        );
      }
    });

    it("should accept ISBN with spaces and an X check digit", () => {
      const orch = new Orchestrator(() => ALL_DISABLED);
      expect(
        (orch as any).extractIdentifier(mockItem({ ISBN: "0 8044 2957 X" }))
          .isbn,
      ).toBeTruthy();
      expect(
        (orch as any).extractIdentifier(mockItem({ ISBN: "978-0-8044-2957-3" }))
          .isbn,
      ).toBeTruthy();
      expect(
        (orch as any).extractIdentifier(mockItem({ ISBN: "12345" })).isbn,
      ).toBeUndefined();
    });

    it("should extract old-style arXiv identifiers from extra", () => {
      const orch = new Orchestrator(() => ALL_DISABLED);
      expect(
        (orch as any).extractIdentifier(
          mockItem({ extra: "arXiv: math.GT/0309136" }),
        ).arxivId,
      ).toBe("math.GT/0309136");
      expect(
        (orch as any).extractIdentifier(
          mockItem({ extra: "arXiv: 2301.12345v2" }),
        ).arxivId,
      ).toBe("2301.12345v2");
    });

    it("should reject malformed DOI and not use it for getById", async () => {
      const fetchMock = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: { items: [] } }),
        }),
      ) as any;
      global.fetch = fetchMock;
      const item = mockItem({ DOI: "not-a-doi", title: "Test" });
      const orch = new Orchestrator(() => ({
        ...ALL_DISABLED,
        "sources.crossref.enabled": true,
      }));
      await orch.validateItem(item);
      if (fetchMock.mock.calls.length > 0) {
        const urls = fetchMock.mock.calls.map((c: any) => c[0]);
        for (const url of urls) {
          expect(url).not.toContain("not-a-doi");
        }
      }
    });
  });

  describe("persistence", () => {
    it("should apply correct tag for FLAGGED result", async () => {
      const item = mockItem({});
      const orch = new Orchestrator(() => ALL_DISABLED);
      await orch.validateItem(item);
      expect(item.addTag).toHaveBeenCalledWith("validation-flagged");
      expect(item.saveTx).toHaveBeenCalled();
    });

    it("should handle save failure gracefully", async () => {
      const item = mockItem({});
      item.saveTx.mockRejectedValue(new Error("DB locked"));
      const orch = new Orchestrator(() => ALL_DISABLED);
      const result = await orch.validateItem(item);
      expect(result.status).toBe("FLAGGED");
      expect(Zotero.debug).toHaveBeenCalledWith(
        expect.stringContaining("Failed to persist"),
      );
    });
  });

  describe("phase-2 identifier enrichment", () => {
    it("re-queries a missed adapter with an identifier discovered in phase 1", async () => {
      const DOI = "10.5555/qet";
      const calledUrls: string[] = [];
      const jsonResp = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      global.fetch = vi.fn((url: string) => {
        calledUrls.push(String(url));
        if (String(url).includes("api.crossref.org") && url.includes("query")) {
          // Phase 1: title search yields a record carrying a DOI.
          return Promise.resolve(
            jsonResp({
              message: {
                items: [
                  {
                    DOI,
                    title: ["Quantum Enrichment Test"],
                    author: [{ family: "Doe", given: "J" }],
                    type: "journal-article",
                  },
                ],
              },
            }),
          );
        }
        if (String(url).includes("opencitations.net")) {
          return Promise.resolve(
            jsonResp([
              {
                id: `doi:${DOI}`,
                title: "Quantum Enrichment Test",
                author: "Doe, J",
                pub_date: "2021",
              },
            ]),
          );
        }
        return Promise.resolve(new Response("", { status: 404 }));
      }) as any;

      const item = mockItem({ title: "Quantum Enrichment Test" }, [
        { lastName: "Doe", fieldMode: 0 },
      ]);
      const orch = new Orchestrator(() => ({
        ...ALL_DISABLED,
        "sources.crossref.enabled": true,
        "sources.opencitations.enabled": true,
      }));
      await orch.validateItem(item);

      // OpenCitations has no search endpoint and the item had no DOI, so it can
      // only have been queried in phase 2 using the DOI Crossref surfaced.
      const ocCall = calledUrls.find(
        (u) => u.includes("opencitations.net") && u.includes(DOI),
      );
      expect(ocCall).toBeTruthy();
    });
  });

  describe("early exit", () => {
    it("skips an adapter still queued behind a shared limiter once VERIFIED", async () => {
      global.IOUtils = {
        exists: async () => false,
        read: async () => new Uint8Array(),
        write: async () => {},
      };

      const record = (source: string) => ({
        identifiers: {},
        title: "The Title",
        authors: [{ family: "Smith", given: "", raw: "Smith" }],
        year: 2007,
        source,
        sourceUrl: "",
        confidence: 1,
        rawResponse: {},
      });
      const fast = (id: string) => ({
        id,
        displayName: id,
        tier: 1,
        requiresCredential: false,
        rateLimit: { perSecond: 50, concurrent: 10 },
        isConfigured: () => true,
        getById: async () => record(id),
        search: async () => [],
      });

      // The slow adapter has concurrency 1 (a shared limiter). The first item's
      // request holds the only slot and blocks on a gate; the second item's
      // request queues behind it and, by the time it acquires, its item has
      // already reached VERIFIED, so it is skipped rather than run.
      let openGate: () => void = () => {};
      const gate = new Promise<void>((r) => (openGate = r));
      const cSlow = { n: 0 };
      const slow = {
        id: "slow",
        displayName: "slow",
        tier: 1,
        requiresCredential: false,
        rateLimit: { perSecond: 50, concurrent: 1 },
        isConfigured: () => true,
        getById: async () => {
          cSlow.n++;
          await gate;
          return record("slow");
        },
        search: async () => [],
      };

      const orch = new Orchestrator(() => ({ "behavior.min_sources": 2 }));
      (orch as any).adapters = [fast("fast1"), fast("fast2"), slow];

      const mk = (doi: string) =>
        mockItem({ DOI: doi, title: "The Title", date: "2007" }, [
          { lastName: "Smith", fieldMode: 0 },
        ]);
      const both = Promise.all([
        orch.validateItem(mk("10.1234/aaa"), true),
        orch.validateItem(mk("10.1234/bbb"), true),
      ]);

      await new Promise((r) => setTimeout(r, 30));
      openGate();
      const [rA, rB] = await both;

      expect(rA.status).toBe("VERIFIED");
      expect(rB.status).toBe("VERIFIED");
      expect(cSlow.n).toBe(1); // the second slow request was skipped, not run
      await orch.shutdown();
    });
  });
});
