import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { OpenCitationsAdapter } from "../src/adapters/opencitations";
import { OrcidAdapter } from "../src/adapters/orcid";
import { ArxivAdapter } from "../src/adapters/arxiv";
import { OpenAlexAdapter } from "../src/adapters/openalex";
import { PubMedAdapter } from "../src/adapters/pubmed";
import { SemanticScholarAdapter } from "../src/adapters/semanticscholar";
import { DblpAdapter } from "../src/adapters/dblp";
import { OpenLibraryAdapter } from "../src/adapters/openlibrary";
import { OpenReviewAdapter } from "../src/adapters/openreview";

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

describe("OpenAlex contract (real API response)", () => {
  it("maps a recorded OpenAlex work", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixture("openalex.json"))),
    ) as any;
    const rec = await new OpenAlexAdapter().getById({ doi: DOI });
    expect(rec).not.toBeNull();
    expect(rec!.title).toContain("Sharing Detailed Research Data");
    expect(rec!.identifiers.doi).toBe(DOI);
    expect(rec!.year).toBe(2007);
    expect(rec!.authors[0].family).toBe("Piwowar");
    expect(rec!.venue?.name).toBe("PLoS ONE");
  });
});

describe("PubMed contract (real esummary response)", () => {
  it("maps a recorded PubMed esummary record", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixture("pubmed-esummary.json"))),
    ) as any;
    const rec = await new PubMedAdapter().getById({ pmid: "17375194" });
    expect(rec).not.toBeNull();
    expect(rec!.title.toLowerCase()).toContain(
      "sharing detailed research data",
    );
    expect(rec!.identifiers.pmid).toBe("17375194");
    expect(rec!.identifiers.doi).toBe(DOI);
    expect(rec!.authors[0].family).toBe("Piwowar");
    expect(rec!.year).toBe(2007);
    expect(rec!.venue?.name).toBeTruthy();
  });
});

describe("Semantic Scholar contract (real API response)", () => {
  it("maps a recorded Semantic Scholar paper", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixture("semanticscholar.json"))),
    ) as any;
    const rec = await new SemanticScholarAdapter().getById({ doi: DOI });
    expect(rec).not.toBeNull();
    expect(rec!.title).toContain("Sharing Detailed Research Data");
    expect(rec!.identifiers.doi).toBe(DOI);
    expect(rec!.identifiers.pmid).toBe("17375194");
    expect(rec!.year).toBe(2007);
    expect(rec!.venue?.name).toBe("PLoS ONE");
  });
});

describe("DBLP contract (real API response)", () => {
  it("maps a recorded DBLP hit", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixture("dblp.json"))),
    ) as any;
    const rec = await new DblpAdapter().getById({
      dblpKey: "conf/dac/ZhangYY21",
    });
    expect(rec).not.toBeNull();
    expect(rec!.title).toContain("Attentional Transfer");
    expect(rec!.identifiers.doi).toBe("10.1109/DAC18074.2021.9586227");
    expect(rec!.identifiers.dblpKey).toBe("conf/dac/ZhangYY21");
    expect(rec!.year).toBe(2021);
    expect(rec!.venue?.name).toBe("DAC");
    expect(rec!.venue?.type).toBe("conference");
  });
});

describe("OpenReview contract (real search response)", () => {
  it("parses a recorded OpenReview search result", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixture("openreview-search.json"))),
    ) as any;
    const recs = await new OpenReviewAdapter().search({
      title: "attention is all you need",
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].title).toContain("GAN Vocoder");
    expect(recs[0].authors.length).toBeGreaterThan(0);
    expect(recs[0].source).toBe("openreview");
  });

  it("returns null gracefully when notes?id= is forbidden (403)", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response("", { status: 403 })),
    ) as any;
    const rec = await new OpenReviewAdapter().getById({
      openReviewId: "abc123",
    });
    expect(rec).toBeNull();
  });
});

describe("Open Library contract (real /api/books response)", () => {
  it("maps a recorded Open Library book", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse(fixture("openlibrary.json"))),
    ) as any;
    const rec = await new OpenLibraryAdapter().getById({
      isbn: "9780262033848",
    });
    expect(rec).not.toBeNull();
    expect(rec!.title).toBe("Introduction to Algorithms");
    expect(rec!.authors).toHaveLength(4);
    expect(rec!.authors[0].family).toBe("Cormen");
    expect(rec!.year).toBe(2009);
    expect(rec!.venue?.name).toBe("The MIT Press");
    expect(rec!.venue?.type).toBe("book");
  });
});
