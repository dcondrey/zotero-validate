import { describe, it, expect, beforeAll } from "vitest";
import { setHttpIdentity } from "../src/http";
import { CrossrefAdapter } from "../src/adapters/crossref";
import { OpenAlexAdapter } from "../src/adapters/openalex";
import { DataCiteAdapter } from "../src/adapters/datacite";
import { EuropePMCAdapter } from "../src/adapters/europepmc";
import { PubMedAdapter } from "../src/adapters/pubmed";
import { SemanticScholarAdapter } from "../src/adapters/semanticscholar";
import { ArxivAdapter } from "../src/adapters/arxiv";
import { DblpAdapter } from "../src/adapters/dblp";
import { OpenLibraryAdapter } from "../src/adapters/openlibrary";
import { OrcidAdapter } from "../src/adapters/orcid";
import { OpenCitationsAdapter } from "../src/adapters/opencitations";
import { UnpaywallAdapter } from "../src/adapters/unpaywall";
import { AclAnthologyAdapter } from "../src/adapters/aclanthology";
import { OpenReviewAdapter } from "../src/adapters/openreview";

// Live end-to-end health check: hits the REAL upstream APIs and asserts each
// adapter parses a correct record. Skipped unless RUN_LIVE=1 so the default
// suite stays hermetic and offline. Run: `npm run test:live`.
const LIVE = process.env.RUN_LIVE === "1";
const suite = LIVE ? describe : describe.skip;

const DOI = "10.1371/journal.pone.0000308"; // Piwowar 2007, widely indexed
const T = 30000;

declare global {
  var Zotero: any;
}

beforeAll(() => {
  global.Zotero = { debug: () => {} };
  setHttpIdentity({
    version: "0.2.0",
    mailto: process.env.CONTACT_EMAIL || "reference-validator@example.com",
  });
});

suite("live source health", () => {
  it(
    "crossref",
    async () => {
      const r = await new CrossrefAdapter().getById({ doi: DOI });
      expect(r?.title.toLowerCase()).toContain(
        "sharing detailed research data",
      );
    },
    T,
  );

  it(
    "openalex",
    async () => {
      const r = await new OpenAlexAdapter().getById({ doi: DOI });
      expect(r?.title.toLowerCase()).toContain(
        "sharing detailed research data",
      );
      expect(r?.identifiers.doi).toBe(DOI);
    },
    T,
  );

  it(
    "datacite",
    async () => {
      const r = await new DataCiteAdapter().getById({
        doi: "10.5281/zenodo.10000",
      });
      expect(r).not.toBeNull();
      expect(r?.identifiers.doi).toBeTruthy();
    },
    T,
  );

  it(
    "europepmc",
    async () => {
      const r = await new EuropePMCAdapter().getById({ doi: DOI });
      expect(r?.title.toLowerCase()).toContain("sharing");
      expect(r?.identifiers.pmid).toBeTruthy();
    },
    T,
  );

  it(
    "pubmed",
    async () => {
      const r = await new PubMedAdapter().getById({ pmid: "17375194" });
      expect(r?.title.toLowerCase()).toContain("sharing");
      expect(r?.identifiers.doi).toBe(DOI);
    },
    T,
  );

  it(
    "semanticscholar (public tier may rate-limit)",
    async () => {
      const r = await new SemanticScholarAdapter().getById(
        { doi: DOI },
        { "sources.semanticscholar.key": process.env.S2_KEY },
      );
      // Accept a rate-limit (null); fail only on wrong data.
      expect(r === null || /sharing/i.test(r.title)).toBe(true);
    },
    T,
  );

  it(
    "arxiv",
    async () => {
      const r = await new ArxivAdapter().getById({ arxivId: "1706.03762" });
      expect(r?.title).toBe("Attention Is All You Need");
    },
    T,
  );

  it(
    "dblp (search; DOI getById is unsupported by the API)",
    async () => {
      const rs = await new DblpAdapter().search({
        title: "Attentional Transfer is All You Need",
      });
      expect(rs.length).toBeGreaterThan(0);
      expect(rs[0].identifiers.dblpKey).toBeTruthy();
    },
    T,
  );

  it(
    "openlibrary",
    async () => {
      const r = await new OpenLibraryAdapter().getById({
        isbn: "9780262033848",
      });
      expect(r?.title).toBe("Introduction to Algorithms");
    },
    T,
  );

  it(
    "orcid",
    async () => {
      const r = await new OrcidAdapter().getById({ doi: DOI });
      expect(r?.title.toLowerCase()).toContain("sharing");
    },
    T,
  );

  it(
    "opencitations",
    async () => {
      const r = await new OpenCitationsAdapter().getById({ doi: DOI });
      expect(r?.title.toLowerCase()).toContain(
        "sharing detailed research data",
      );
      expect(r?.identifiers.pmid).toBe("17375194");
    },
    T,
  );

  it.skipIf(!process.env.UNPAYWALL_EMAIL)(
    "unpaywall (needs UNPAYWALL_EMAIL)",
    async () => {
      const r = await new UnpaywallAdapter().getById(
        { doi: DOI },
        { "sources.crossref.email": process.env.UNPAYWALL_EMAIL },
      );
      expect(r?.title.toLowerCase()).toContain("sharing");
    },
    T,
  );

  it(
    "aclanthology",
    async () => {
      const r = await new AclAnthologyAdapter().getById({
        aclAnthologyId: "2023.acl-long.1",
      });
      expect(r?.title).toBeTruthy();
    },
    T,
  );

  it(
    "openreview (search; getById is auth-gated 403)",
    async () => {
      const rs = await new OpenReviewAdapter().search({
        title: "attention is all you need",
      });
      expect(rs.length).toBeGreaterThan(0);
      expect(rs[0].title).toBeTruthy();
    },
    T,
  );
});
