import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataCiteAdapter } from "../src/adapters/datacite";
import { EuropePMCAdapter } from "../src/adapters/europepmc";
import { UnpaywallAdapter } from "../src/adapters/unpaywall";
import { IAScholarAdapter } from "../src/adapters/iascholar";
import { GoogleScholarAdapter } from "../src/adapters/googlescholar";

declare global {
  var Zotero: any;
}

beforeEach(() => {
  global.Zotero = { debug: vi.fn() };
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("DataCite contract", () => {
  const fixture = {
    data: {
      attributes: {
        doi: "10.5281/zenodo.1234",
        titles: [{ title: "An Example Dataset" }],
        creators: [{ name: "Smith, Jane" }, { name: "Doe, John" }],
        publicationYear: 2021,
        publisher: "Zenodo",
        types: { resourceTypeGeneral: "Dataset" },
      },
    },
  };

  it("maps a DataCite REST record to a canonical record", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(fixture))) as any;
    const record = await new DataCiteAdapter().getById({
      doi: "10.5281/zenodo.1234",
    });
    expect(record).not.toBeNull();
    expect(record!.title).toBe("An Example Dataset");
    expect(record!.authors).toHaveLength(2);
    expect(record!.authors[0].family).toBe("Smith");
    expect(record!.year).toBe(2021);
    expect(record!.identifiers.doi).toBe("10.5281/zenodo.1234");
    expect(record!.venue?.name).toBe("Zenodo");
    expect(record!.sourceUrl).toBe("https://doi.org/10.5281/zenodo.1234");
  });

  it("returns null when the attributes block is absent", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ data: null })),
    ) as any;
    const record = await new DataCiteAdapter().getById({ doi: "10.1/x" });
    expect(record).toBeNull();
  });
});

describe("EuropePMC contract", () => {
  const fixture = {
    resultList: {
      result: [
        {
          title: "A Clinical Study",
          authorList: {
            author: [{ fullName: "Smith J" }, { fullName: "Doe A" }],
          },
          pubYear: "2020",
          doi: "10.1000/xyz",
          pmid: "12345678",
          journalInfo: {
            journal: { title: "Journal of Examples" },
            volume: "12",
            issue: "3",
          },
          pageInfo: "100-110",
        },
      ],
    },
  };

  it("maps a Europe PMC search result to a canonical record", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(fixture))) as any;
    const record = await new EuropePMCAdapter().getById({ doi: "10.1000/xyz" });
    expect(record).not.toBeNull();
    expect(record!.title).toBe("A Clinical Study");
    expect(record!.authors).toHaveLength(2);
    expect(record!.authors[0].family).toBe("Smith");
    expect(record!.authors[0].given).toBe("J");
    expect(record!.identifiers.doi).toBe("10.1000/xyz");
    expect(record!.identifiers.pmid).toBe("12345678");
    expect(record!.year).toBe(2020);
    expect(record!.venue?.name).toBe("Journal of Examples");
    expect(record!.venue?.volume).toBe("12");
    expect(record!.venue?.pages).toBe("100-110");
  });

  it("returns null when the result list is empty", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ resultList: { result: [] } })),
    ) as any;
    const record = await new EuropePMCAdapter().getById({ doi: "10.1/x" });
    expect(record).toBeNull();
  });
});

describe("Unpaywall contract (documented schema)", () => {
  const fixture = {
    doi: "10.1000/open",
    title: "An Open Access Paper",
    year: 2019,
    journal_name: "Journal of Open Research",
    volume: "5",
    issue: "2",
    z_authors: [
      { given: "Jane", family: "Smith" },
      { given: "John", family: "Doe" },
    ],
  };

  it("maps an Unpaywall record (requires a configured email)", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(fixture))) as any;
    const record = await new UnpaywallAdapter().getById(
      { doi: "10.1000/open" },
      { "sources.crossref.email": "dev@example.com" },
    );
    expect(record).not.toBeNull();
    expect(record!.title).toBe("An Open Access Paper");
    expect(record!.identifiers.doi).toBe("10.1000/open");
    expect(record!.year).toBe(2019);
    expect(record!.venue?.name).toBe("Journal of Open Research");
    expect(record!.authors[0].family).toBe("Smith");
  });

  it("skips the lookup when no email is configured", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    const record = await new UnpaywallAdapter().getById({
      doi: "10.1000/open",
    });
    expect(record).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("IA Scholar (no working public JSON API)", () => {
  it("is disabled unless explicitly enabled", () => {
    const adapter = new IAScholarAdapter();
    expect(adapter.isConfigured({})).toBe(false);
    expect(adapter.isConfigured({ "sources.iascholar.enabled": true })).toBe(
      true,
    );
  });

  it("fails gracefully when the API returns HTML instead of JSON", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(
        new Response("<!DOCTYPE html><html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    ) as any;
    const record = await new IAScholarAdapter().getById({ doi: "10.1/x" });
    expect(record).toBeNull();
  });
});

describe("Google Scholar (stub)", () => {
  it("is disabled and returns no results", async () => {
    const adapter = new GoogleScholarAdapter();
    expect(adapter.isConfigured({})).toBe(false);
    expect(await adapter.getById({ doi: "10.1/x" })).toBeNull();
    expect(await adapter.search({ title: "anything" })).toEqual([]);
  });
});
