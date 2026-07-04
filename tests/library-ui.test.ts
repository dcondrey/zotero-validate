import { describe, it, expect } from "vitest";
import { computeCollectionDelta } from "../src/library-ui";

describe("computeCollectionDelta", () => {
  it("adds tracked items that are missing and removes untracked ones", () => {
    const { toAdd, toRemove } = computeCollectionDelta([1, 2, 3], [2, 3, 4]);
    expect(toAdd).toEqual([1]);
    expect(toRemove).toEqual([4]);
  });

  it("is a no-op when the collection already matches", () => {
    const { toAdd, toRemove } = computeCollectionDelta([1, 2], [2, 1]);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual([]);
  });

  it("adds everything into an empty collection", () => {
    const { toAdd, toRemove } = computeCollectionDelta([5, 6], []);
    expect(toAdd).toEqual([5, 6]);
    expect(toRemove).toEqual([]);
  });

  it("removes everything when nothing is tracked", () => {
    const { toAdd, toRemove } = computeCollectionDelta([], [7, 8]);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual([7, 8]);
  });

  it("does not emit duplicate adds for a repeated tracked id", () => {
    const { toAdd } = computeCollectionDelta([9, 9], []);
    expect(toAdd).toEqual([9]);
  });
});
