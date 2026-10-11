import { afterEach, expect, it, vi } from "vitest";
import { detectTesterDevice } from "../../src/lib/testerDevice";

afterEach(() => vi.unstubAllGlobals());

it.each([
  ["Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32", 0, "computer"],
  ["touchscreen PC", "Mozilla/5.0 (Windows NT 10.0)", "Win32", 10, "computer"],
  ["Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0, "computer"],
  ["Linux", "Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64", 0, "computer"],
  ["ChromeOS", "Mozilla/5.0 (X11; CrOS x86_64)", "Linux x86_64", 0, "computer"],
  ["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5, "ios"],
  ["iPad", "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "iPad", 5, "ios"],
  ["Android phone", "Mozilla/5.0 (Linux; Android 14) Mobile", "Linux armv8l", 5, "android"],
  ["Android tablet", "Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5, "android"],
  ["desktop-mode iPad", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5, null],
  ["unknown mobile", "Mozilla/5.0 Mobile", "", 5, null],
  ["Kindle", "Mozilla/5.0 (Linux; Android 9) Silk/3.2", "Linux", 5, null],
  [
    "legacy Windows phone",
    "Mozilla/5.0 (Windows Phone 10.0; Android 6.0) IEMobile",
    "Win32",
    5,
    null,
  ],
  ["smart TV", "Mozilla/5.0 (Linux; Android 11; SMART-TV)", "Linux", 0, null],
  ["unknown device", "Unknown", "", 0, null],
])("detects %s conservatively", (_name, userAgent, platform, maxTouchPoints, expected) => {
  expect(detectTesterDevice({ userAgent, platform, maxTouchPoints })).toBe(expected);
});

it.each([
  ["Windows", false, "computer"],
  ["macOS", false, "computer"],
  ["Chrome OS", false, "computer"],
  ["iOS", true, "ios"],
  ["Android", true, "android"],
  ["Android", false, "android"],
  ["Windows", true, null],
  ["", false, null],
])("uses a clear %s platform hint (mobile=%s)", (platform, mobile, expected) => {
  expect(
    detectTesterDevice({
      userAgent: "",
      platform: "",
      maxTouchPoints: 0,
      userAgentData: { platform, mobile },
    }),
  ).toBe(expected);
});

it("does not select a device from conflicting browser signals", () => {
  expect(
    detectTesterDevice({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      platform: "iPhone",
      maxTouchPoints: 5,
      userAgentData: { platform: "Android", mobile: true },
    }),
  ).toBeNull();
  expect(
    detectTesterDevice({
      userAgent: "Mozilla/5.0 (Windows NT 10.0)",
      platform: "Win32",
      maxTouchPoints: 0,
      userAgentData: { platform: "Android", mobile: false },
    }),
  ).toBeNull();
  expect(
    detectTesterDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 5,
      userAgentData: { platform: "macOS", mobile: false },
    }),
  ).toBeNull();
});

it("is safe without browser information", () => {
  vi.stubGlobal("navigator", undefined);
  expect(detectTesterDevice()).toBeNull();
});
