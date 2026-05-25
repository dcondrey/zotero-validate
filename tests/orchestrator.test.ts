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
});
