type EarnNavigator = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & {
  userAgentData?: { mobile?: boolean; platform?: string };
};

export function isDesktopEarnDevice(
  navigatorRef: EarnNavigator | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
) {
  if (!navigatorRef) return false;

  const userAgent = navigatorRef.userAgent;
  const platform = navigatorRef.userAgentData?.platform || navigatorRef.platform;
  const deviceSignals = `${platform} ${userAgent}`;

  // Tablets can report mobile=false, and iPadOS can identify itself as macOS.
  if (
    navigatorRef.userAgentData?.mobile === true ||
    /android|iphone|ipad|ipod|ios|mobile|tablet|kindle|silk/i.test(deviceSignals) ||
    (/mac/i.test(platform) && navigatorRef.maxTouchPoints > 1)
  ) {
    return false;
  }

  // Unknown devices keep the existing preferences; viewport width is not a device signal.
  return /windows|win32|win64|mac|linux|cros|chrome os/i.test(deviceSignals);
}
