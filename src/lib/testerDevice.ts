import type { TesterDevice } from "../types";
import { isDesktopEarnDevice } from "./earnDevice";

type DeviceNavigator = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
  userAgentData?: { mobile?: boolean; platform?: string };
};

export function detectTesterDevice(
  navigatorRef: DeviceNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): TesterDevice | null {
  if (!navigatorRef) return null;

  const { userAgent, platform, maxTouchPoints, userAgentData } = navigatorRef;
  const signals = `${userAgent} ${platform}`;
  if (
    /windows phone|iemobile|kaios|kindle|silk\/|smart.?tv|hbbtv|tizen|webos|playstation|xbox|nintendo/i.test(
      signals,
    )
  ) {
    return null;
  }

  const ios = /\b(iphone|ipad|ipod|ios|ipados)\b/i.test(signals);
  const android = /\bandroid\b/i.test(signals);
  if (ios && android) return null;

  // Desktop-mode iPads can identify as Macs. Do not guess from touch support alone.
  const ambiguousMac =
    /mac/i.test(`${signals} ${userAgentData?.platform ?? ""}`) && maxTouchPoints > 1;
  const legacyDevice: TesterDevice | null = ios
    ? "ios"
    : android
      ? "android"
      : isDesktopEarnDevice({ userAgent, platform, maxTouchPoints })
        ? "computer"
        : null;

  let hintedDevice: TesterDevice | null = null;
  const hint = userAgentData?.platform ?? "";
  if (/^(ios|ipados)$/i.test(hint)) hintedDevice = "ios";
  else if (/^android$/i.test(hint)) hintedDevice = "android";
  else if (/^(windows|macos|linux|chrome os)$/i.test(hint) && !ambiguousMac) {
    hintedDevice = "computer";
  }

  if (hintedDevice && legacyDevice && hintedDevice !== legacyDevice) return null;
  const device = hintedDevice ?? legacyDevice;
  if (
    device === "computer" &&
    (userAgentData?.mobile === true || ambiguousMac || /mobile|tablet/i.test(signals))
  ) {
    return null;
  }
  return device;
}
