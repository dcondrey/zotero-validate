import { describe, it, expect, vi } from "vitest";
import { canValidateItem } from "../src/can-validate";

function mockItem(fields: Record<string, any> = {}, creators: any[] = []) {
  return {
    getField: vi.fn((f: string) => fields[f] ?? ""),
    getCreators: vi.fn(() => creators),
  };
}

describe("canValidateItem", () => {
  it("accepts an item with a DOI", () => {
    expect(canValidateItem(mockItem({ DOI: "10.1/x" }))).toBe(true);
  });

  it("accepts an item with an ISBN", () => {
    expect(canValidateItem(mockItem({ ISBN: "9780123456789" }))).toBe(true);
  });

  it("accepts an item with a PMID in extra", () => {
    expect(canValidateItem(mockItem({ extra: "PMID: 12345678" }))).toBe(true);
  });

  it("accepts an item with a title and at least one creator", () => {
    expect(
      canValidateItem(mockItem({ title: "A Paper" }, [{ lastName: "Doe" }])),
    ).toBe(true);
  });

  it("rejects a title with no creators", () => {
    expect(canValidateItem(mockItem({ title: "A Paper" }, []))).toBe(false);
  });

  it("rejects creators with no title", () => {
    expect(canValidateItem(mockItem({}, [{ lastName: "Doe" }]))).toBe(false);
  });

  it("rejects an item with no usable metadata", () => {
    expect(canValidateItem(mockItem({}, []))).toBe(false);
  });

  it("returns a boolean, not a truthy field value", () => {
    expect(canValidateItem(mockItem({ DOI: "10.1/x" }))).toStrictEqual(true);
  });
});
