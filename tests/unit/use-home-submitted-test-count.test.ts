import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadCount } = vi.hoisted(() => ({ loadCount: vi.fn() }));
vi.mock("../../src/lib/homeSubmittedTestCount", () => ({ loadHomeSubmittedTestCount: loadCount }));
import { useHomeSubmittedTestCount } from "../../src/pages/useHomeSubmittedTestCount";

describe("homepage count refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    loadCount.mockReset();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders immediately while loading, then refreshes the count once a minute", async () => {
    let finish!: (count: number) => void;
    loadCount.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useHomeSubmittedTestCount(true));
    expect(result.current).toBeNull();
    await act(async () => finish(72));
    expect(result.current).toBe(72);
    loadCount.mockResolvedValue(73);
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current).toBe(73);
    expect(loadCount).toHaveBeenCalledTimes(2);
  });

  it("skips hidden tabs and overlapping requests, then refreshes on return", async () => {
    loadCount.mockResolvedValue(72);
    const { result } = renderHook(() => useHomeSubmittedTestCount(true));
    await act(async () => {});
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(loadCount).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    loadCount.mockResolvedValue(74);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(loadCount).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(74);
  });

  it("uses an unnumbered fallback on failure, recovers, and cancels work on unmount", async () => {
    loadCount.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue(75);
    const { result, unmount } = renderHook(() => useHomeSubmittedTestCount(true));
    await act(async () => {});
    expect(result.current).toBeNull();
    await act(async () => window.dispatchEvent(new Event("focus")));
    expect(result.current).toBe(75);
    const signal = loadCount.mock.calls[1][0] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
      window.dispatchEvent(new Event("focus"));
    });
    expect(loadCount).toHaveBeenCalledTimes(2);
  });

  it("does not request remote data when unconfigured or using local fixtures", () => {
    const { result, rerender } = renderHook<
      number | null,
      { enabled: boolean; fixtureCount?: number }
    >(
      ({ enabled, fixtureCount }: { enabled: boolean; fixtureCount?: number }) =>
        useHomeSubmittedTestCount(enabled, fixtureCount),
      { initialProps: { enabled: false, fixtureCount: undefined } },
    );
    expect(result.current).toBeNull();
    rerender({ enabled: true, fixtureCount: 0 });
    expect(result.current).toBe(0);
    expect(loadCount).not.toHaveBeenCalled();
  });
});
