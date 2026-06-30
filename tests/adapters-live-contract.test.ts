import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { OpenCitationsAdapter } from "../src/adapters/opencitations";
import { OrcidAdapter } from "../src/adapters/orcid";
import { ArxivAdapter } from "../src/adapters/arxiv";

function textFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/atom+xml" },
  });
}

declare global {
  var Zotero: any;
}

// Fixtures are real responses recorded from the live APIs (see tests/fixtures).
function fixture(name: string): any {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"),
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  global.Zotero = { debug: vi.fn() };
});

const DOI = "10.1371/journal.pone.0000308";

describe("OpenCitations contract (real Meta API response)", () => {
  it("maps a recorded Meta record to a canonical record", async () => {
    const data = fixture("opencitations.json");
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(data))) as any;

    const rec = await new OpenCitationsAdapter().getById({ doi: DOI });
    expect(rec).not.toBeNull();
    expect(rec!.title).toContain("Sharing Detailed Research Data");
    expect(rec!.identifiers.doi).toBe(DOI);
    expect(rec!.identifiers.pmid).toBe("17375194");
    expect(rec!.authors).toHaveLength(3);
    expect(rec!.authors[0].family).toBe("Piwowar");
    expect(rec!.authors[0].given).toBe("Heather");
    expect(rec!.year).toBe(2007);
    expect(rec!.venue?.name).toBe("Plos One");
    expect(rec!.venue?.volume).toBe("2");
    expect(rec!.venue?.pages).toBe("e308");
  });
});

describe("ORCID contract (real two-step API responses)", () => {
  it("resolves an ORCID by DOI then maps the matching work", async () => {
    const search = fixture("orcid-search.json");
    const works = fixture("orcid-works.json");
    global.fetch = vi.fn((url: string) => {
      const body = String(url).includes("expanded-search") ? search : works;
      return Promise.resolve(jsonResponse(body));
    }) as any;

    const rec = await new OrcidAdapter().getById({ doi: DOI });
    expect(rec).not.toBeNull();
    expect(rec!.title.toLowerCase()).toContain(
      "sharing detailed research data",
    );
    expect(rec!.identifiers.doi).toBe(DOI);
    expect(rec!.year).toBe(2007);
    expect(rec!.venue?.name).toBe("PLoS ONE");
    expect(rec!.sourceUrl).toContain("0000-0003-1613-5981");
  });

  it("returns null when no ORCID claims the DOI", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ "expanded-result": [] })),
    ) as any;
    const rec = await new OrcidAdapter().getById({ doi: DOI });
    expect(rec).toBeNull();
  });
});

describe("arXiv contract (real Atom feed)", () => {
  it("parses a recorded arXiv Atom entry", async () => {
    const xml = textFixture("arxiv.xml");
    global.fetch = vi.fn(() => Promise.resolve(xmlResponse(xml))) as any;

    const rec = await new ArxivAdapter().getById({ arxivId: "1706.03762" });
    expect(rec).not.toBeNull();
    expect(rec!.title).toBe("Attention Is All You Need");
    expect(rec!.identifiers.arxivId).toContain("1706.03762");
    expect(rec!.authors.length).toBeGreaterThan(0);
    expect(rec!.year).toBe(2017);
    expect(rec!.venue?.type).toBe("preprint");
  });
});
