import { describe, it, expect, vi } from "vitest";
import {
  fieldToZoteroField,
  correctionValueFor,
  applyCorrections,
} from "../src/ui";
import { FieldDiff } from "../src/types";

function corr(field: string, sourceValue: any): FieldDiff {
  return { field, status: "mismatch", sourceValue };
}

function mockItem(opts: { rejectField?: string; failSave?: boolean } = {}) {
  const fields: Record<string, string> = {};
  return {
    fields,
    setField: vi.fn((f: string, v: string) => {
      if (opts.rejectField === f)
        throw new Error("field invalid for item type");
      fields[f] = v;
    }),
    saveTx: vi.fn(() =>
      opts.failSave
        ? Promise.reject(new Error("db locked"))
        : Promise.resolve(),
    ),
  };
}

describe("fieldToZoteroField", () => {
  it("maps known fields and rejects the rest", () => {
    expect(fieldToZoteroField("title")).toBe("title");
    expect(fieldToZoteroField("year")).toBe("date");
    expect(fieldToZoteroField("journal")).toBe("publicationTitle");
    expect(fieldToZoteroField("authors")).toBeNull();
    expect(fieldToZoteroField("nonsense")).toBeNull();
  });
});

describe("correctionValueFor", () => {
  it("stringifies a mappable value", () => {
    expect(correctionValueFor(corr("year", 2007))).toBe("2007");
    expect(correctionValueFor(corr("title", "A Title"))).toBe("A Title");
  });
  it("returns null for unmappable fields or missing values", () => {
    expect(correctionValueFor(corr("authors", "Doe"))).toBeNull();
    expect(correctionValueFor(corr("title", undefined))).toBeNull();
    expect(correctionValueFor(corr("title", null))).toBeNull();
  });
});

describe("applyCorrections", () => {
  it("applies all mappable fields with a single saveTx", async () => {
    const item = mockItem();
    const n = await applyCorrections(item, [
      corr("title", "Corrected Title"),
      corr("year", 2007),
    ]);
    expect(n).toBe(2);
    expect(item.setField).toHaveBeenCalledTimes(2);
    expect(item.saveTx).toHaveBeenCalledTimes(1); // batched, not per-field
    expect(item.fields.title).toBe("Corrected Title");
    expect(item.fields.date).toBe("2007"); // year -> date, stringified
  });

  it("skips unmappable fields and missing values without saving", async () => {
    const item = mockItem();
    const n = await applyCorrections(item, [
      corr("authors", "Someone"),
      corr("title", undefined),
    ]);
    expect(n).toBe(0);
    expect(item.saveTx).not.toHaveBeenCalled();
  });

  it("keeps applying other fields when the item type rejects one", async () => {
    const item = mockItem({ rejectField: "volume" });
    const n = await applyCorrections(item, [
      corr("title", "T"),
      corr("volume", "5"),
      corr("year", 2020),
    ]);
    expect(n).toBe(2);
    expect(item.saveTx).toHaveBeenCalledTimes(1);
    expect(item.fields.volume).toBeUndefined();
    expect(item.fields.title).toBe("T");
    expect(item.fields.date).toBe("2020");
  });

  it("returns 0 when the save fails", async () => {
    const item = mockItem({ failSave: true });
    const n = await applyCorrections(item, [corr("title", "T")]);
    expect(n).toBe(0);
  });
});
