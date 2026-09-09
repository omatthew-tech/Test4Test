import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeTrustedSubmission } from "../../src/lib/homeTrustedSubmissions";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({
  supabaseUrl: "https://test.supabase.co",
  requireSupabase: () => ({ functions: { invoke } }),
}));
import { loadHomeTrustedLogos, productInitials } from "../../src/lib/homeTrustedLogos";

const submissions: HomeTrustedSubmission[] = [
  { id: "one", productName: "Example Product", productTypes: ["website"], description: "" },
  { id: "two", productName: "Second", productTypes: ["website"], description: "" },
];

describe("home card logo loading", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_DS_FIXTURES", "0");
    invoke.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("loads logos separately and accepts only requested IDs from our storage bucket", async () => {
    const signal = new AbortController().signal;
    invoke.mockResolvedValue({
      data: {
        logos: [
          {
            submissionId: "one",
            logoUrl:
              "https://test.supabase.co/storage/v1/object/public/home-trusted-logos/one/icon.png",
          },
          { submissionId: "two", logoUrl: "https://external.example/tracker.png" },
          { submissionId: "unrelated", logoUrl: "/brand/test4test-mark.svg" },
        ],
      },
      error: null,
    });
    expect(await loadHomeTrustedLogos(submissions, signal)).toEqual({
      one: "https://test.supabase.co/storage/v1/object/public/home-trusted-logos/one/icon.png",
      two: null,
    });
    expect(invoke).toHaveBeenCalledWith("get-home-trusted-logos", {
      body: { submissionIds: ["one", "two"] },
      signal,
    });
  });

  it("accepts the local brand mark and propagates lookup failures for the UI fallback", async () => {
    invoke.mockResolvedValueOnce({
      data: { logos: [{ submissionId: "one", logoUrl: "/brand/test4test-mark.svg" }] },
    });
    expect(await loadHomeTrustedLogos(submissions, new AbortController().signal)).toEqual({
      one: "/brand/test4test-mark.svg",
    });
    invoke.mockResolvedValueOnce({ error: new Error("unavailable") });
    await expect(loadHomeTrustedLogos(submissions, new AbortController().signal)).rejects.toThrow(
      "unavailable",
    );
  });

  it("uses deterministic local images in design fixtures without invoking the backend", async () => {
    vi.stubEnv("VITE_DS_FIXTURES", "1");
    expect(await loadHomeTrustedLogos(submissions, new AbortController().signal)).toEqual({
      one: "/brand/test4test-mark.svg",
      two: "/images/trusted-by/vidsyndicate.png",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("builds readable fallback initials for single, multiple, Unicode and empty names", () => {
    expect(productInitials("  Example Product  ")).toBe("EP");
    expect(productInitials("Loventro")).toBe("L");
    expect(productInitials("Éclair 日本")).toBe("É日");
    expect(productInitials(" ")).toBe("?");
  });
});
