import { describe, expect, it } from "vitest";
import { mapConcurrent } from "../../src/lib/concurrent";

describe("bounded work", () => {
  it("preserves order while permitting only three active operations", async () => {
    let active = 0,
      peak = 0;
    const result = await mapConcurrent([5, 4, 3, 2, 1, 0], 3, async (value) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active--;
      return value * 2;
    });
    expect(peak).toBe(3);
    expect(result).toEqual([10, 8, 6, 4, 2, 0]);
  });
  it("waits for in-flight work on failure so a retry cannot race unfinished uploads", async () => {
    let completed = false;
    const seen: number[] = [];
    await expect(
      mapConcurrent([0, 1, 2], 2, async (value) => {
        seen.push(value);
        if (!value) throw new Error("upload failed");
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed = true;
      }),
    ).rejects.toThrow("upload failed");
    expect(completed).toBe(true);
    expect(seen).toEqual([0, 1]);
  });
});
