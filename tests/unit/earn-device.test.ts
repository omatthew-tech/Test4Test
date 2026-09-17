import { afterEach, expect, it, vi } from "vitest";
import { isDesktopEarnDevice } from "../../src/lib/earnDevice";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0],
  ["Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0],
  ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", 0],
  ["Chromebook", "Mozilla/5.0 (X11; CrOS x86_64)", "Linux x86_64", 0],
  ["touchscreen PC", "Mozilla/5.0 (Windows NT 10.0)", "Win32", 10],
])(
  "defaults %s to websites without requiring client hints",
  (_name, userAgent, platform, maxTouchPoints) => {
    expect(isDesktopEarnDevice({ userAgent, platform, maxTouchPoints })).toBe(true);
  },
);

it.each([
  ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone"],
  ["Android phone", "Mozilla/5.0 (Linux; Android 14) Mobile", "Linux armv8l"],
  ["Android tablet", "Mozilla/5.0 (Linux; Android 14)", "Linux armv8l"],
  ["iPad", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "iPad"],
  ["iPad desktop mode", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel"],
  ["Kindle tablet", "Mozilla/5.0 (Linux) Silk/3.2", "Linux"],
])("keeps %s preferences even with a false mobile hint", (_name, userAgent, platform) => {
  expect(
    isDesktopEarnDevice({
      userAgent,
      platform,
      maxTouchPoints: 5,
      userAgentData: { mobile: false },
    }),
  ).toBe(false);
});

it("honors mobile client hints and recognizes desktop platform hints", () => {
  const device = { userAgent: "", platform: "", maxTouchPoints: 0 };
  expect(
    isDesktopEarnDevice({ ...device, userAgentData: { mobile: true, platform: "Windows" } }),
  ).toBe(false);
  expect(
    isDesktopEarnDevice({ ...device, userAgentData: { mobile: false, platform: "Windows" } }),
  ).toBe(true);
  expect(
    isDesktopEarnDevice({ ...device, userAgentData: { mobile: false, platform: "Android" } }),
  ).toBe(false);
});

it("keeps unknown devices unchanged, including when navigator is unavailable", () => {
  expect(isDesktopEarnDevice({ userAgent: "Unknown", platform: "", maxTouchPoints: 0 })).toBe(
    false,
  );
  vi.stubGlobal("navigator", undefined);
  expect(isDesktopEarnDevice()).toBe(false);
});
