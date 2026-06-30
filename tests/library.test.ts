import { describe, it, expect, vi, beforeEach } from "vitest";
import { GlobalReferenceLibrary } from "../src/library";

declare global {
  var Zotero: any;
  var IOUtils: any;
}

function validEntry(key = "doi:10.1/x"): any {
  return {
    identifierKey: key,
    identifiers: { doi: "10.1/x" },
    title: "A Title",
    canonicalRecord: {
      identifiers: {},
      title: "A Title",
      authors: [],
      source: "crossref",
      sourceUrl: "",
      confidence: 1,
      rawResponse: null,
    },
    validationResult: {
      status: "VERIFIED",
      primaryMatches: 2,
      corrections: [],
      diagnostic: "",
    },
    validatedAt: 123,
    usageCount: 0,
    usages: [],
  };
}

function bytesOf(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

beforeEach(() => {
  global.Zotero = { DataDirectory: { dir: "/tmp" }, debug: vi.fn() };
});

describe("GlobalReferenceLibrary.load", () => {
  it("filters out entries with an invalid status or missing key", async () => {
    const bad = validEntry("doi:bad");
    bad.validationResult.status = "HACKED";
    const noKey = validEntry("");
    global.IOUtils = {
      exists: vi.fn(async () => true),
      read: vi.fn(async () => bytesOf([validEntry("doi:good"), bad, noKey])),
    };

    const lib = new GlobalReferenceLibrary();
    await lib.load();

    expect(lib.size).toBe(1);
    expect(lib.getAll()[0].identifierKey).toBe("doi:good");
  });

  it("loads the versioned object format", async () => {
    global.IOUtils = {
      exists: vi.fn(async () => true),
      read: vi.fn(async () =>
        bytesOf({ schemaVersion: 2, entries: [validEntry("doi:v2")] }),
      ),
    };

    const lib = new GlobalReferenceLibrary();
    await lib.load();

    expect(lib.size).toBe(1);
    expect(lib.getAll()[0].identifierKey).toBe("doi:v2");
  });

  it("normalizes missing usage bookkeeping without dropping the entry", async () => {
    const entry = validEntry("doi:nousage");
    delete entry.usageCount;
    delete entry.usages;
    global.IOUtils = {
      exists: vi.fn(async () => true),
      read: vi.fn(async () => bytesOf([entry])),
    };

    const lib = new GlobalReferenceLibrary();
    await lib.load();

    const loaded = lib.getAll()[0];
    expect(loaded.usageCount).toBe(0);
    expect(loaded.usages).toEqual([]);
  });
});

describe("GlobalReferenceLibrary.save", () => {
  it("persists the versioned object format", async () => {
    let written: Uint8Array | null = null;
    global.IOUtils = {
      exists: vi.fn(async () => false),
      read: vi.fn(async () => new Uint8Array()),
      write: vi.fn(async (_path: string, bytes: Uint8Array) => {
        written = bytes;
      }),
    };

    const lib = new GlobalReferenceLibrary();
    lib.add(
      { doi: "10.1/x" },
      "A Title",
      validEntry().canonicalRecord,
      validEntry().validationResult,
    );
    await lib.flush();

    expect(written).not.toBeNull();
    const obj = JSON.parse(new TextDecoder().decode(written!));
    expect(obj.schemaVersion).toBe(2);
    expect(obj.entries).toHaveLength(1);
  });
});
