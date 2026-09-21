# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: microphone-journeys.spec.ts >> microphone check unlocks screen sharing at desktop
- Location: tests\playwright\microphone-journeys.spec.ts:1041:3

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 32
Received: 33
```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e6]:
    - link "Skip to content" [ref=e7] [cursor=pointer]:
      - /url: "#main-content"
    - generic [ref=e9]:
      - link "Test4Test home" [ref=e10] [cursor=pointer]:
        - /url: /
        - img [ref=e11]
        - generic [ref=e14]: Test4Test
      - navigation "Primary" [ref=e15]:
        - link "Earn" [ref=e16] [cursor=pointer]:
          - /url: /earn
        - link "Share" [ref=e17] [cursor=pointer]:
          - /url: /share
        - link "Analyze" [ref=e18] [cursor=pointer]:
          - /url: /analytics
      - button "Profile menu" [ref=e21] [cursor=pointer]:
        - img [ref=e22]
  - main [ref=e25]:
    - generic [ref=e28]:
      - heading "Test session" [level=1] [ref=e29]
      - generic [ref=e30]:
        - generic [ref=e31]:
          - generic [ref=e32]:
            - generic [ref=e33]:
              - generic [ref=e34]: App link
              - link "palettepilot.app" [ref=e36] [cursor=pointer]:
                - /url: https://palettepilot.app
                - text: palettepilot.app
                - img [ref=e37]
            - button "Report" [ref=e41] [cursor=pointer]:
              - img [ref=e42]
              - generic [ref=e44]: Report
          - generic [ref=e45]:
            - generic [ref=e46]: Tester instructions
            - list [ref=e47]:
              - listitem [ref=e48]: Create a board and inspect how easy it is to add references.
        - generic [ref=e49]:
          - list "Recording setup" [ref=e51]:
            - listitem [ref=e52]:
              - generic [ref=e54]:
                - status [ref=e55]
                - generic [ref=e56]:
                  - button "Enable microphone" [ref=e57] [cursor=pointer]
                  - img "Microphone activity is inactive until microphone access is enabled" [ref=e58]
            - listitem [ref=e64]:
              - generic [ref=e65]:
                - button "Share screen" [disabled] [ref=e67]
                - generic [ref=e68]: Select "Entire screen" and then click "Share"
            - listitem [ref=e69]:
              - generic [ref=e70]:
                - strong [ref=e71]: Prepare to think out loud
                - generic [ref=e72]: Find a quiet place. Close out any unwanted tabs. And share your honest thoughts. There are no right or wrong answers.
          - generic [ref=e73]:
            - group [ref=e74]:
              - generic "Already recorded?" [ref=e75] [cursor=pointer]:
                - generic [ref=e76]: Already recorded?
                - img [ref=e77]
            - generic [ref=e79]:
              - button "Go back" [ref=e80] [cursor=pointer]
              - button "Get started" [disabled] [ref=e81]
```

# Test source

```ts
  975  |     });
  976  |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(2);
  977  |     await page.evaluate(() => {
  978  |       window.__testRecordingPipDocument?.getElementById("recording-pip-resume")?.click();
  979  |     });
  980  |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(2);
  981  |     await expect(recordingCard.getByRole("heading", { name: "Task 2 of 3" })).toBeVisible();
  982  |     await expect.poll(readPipInstruction).toMatchObject({
  983  |       instruction: "Add two visual references to the board.",
  984  |       instructionChildCount: 0,
  985  |       nextButton: "Complete task",
  986  |       nextButtonSlate: true,
  987  |       progress: "Task 2 of 3",
  988  |     });
  989  | 
  990  |     await recordingCard.getByRole("button", { name: "Complete task", exact: true }).click();
  991  | 
  992  |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderPauseCount)).toBe(3);
  993  |     await expect(recordingCard.getByRole("heading", { name: "Task 3 of 3" })).toBeVisible();
  994  |     await expect(
  995  |       recordingCard.getByText(
  996  |         "Invite a collaborator and review <strong>sharing controls</strong>.",
  997  |         {
  998  |           exact: true,
  999  |         },
  1000 |       ),
  1001 |     ).toBeVisible();
  1002 |     await expect(recordingCard.getByRole("button", { name: "Start task" })).toBeFocused();
  1003 |     await expect.poll(readPipInstruction).toMatchObject({
  1004 |       finishButton: false,
  1005 |       focusedAction: "",
  1006 |       instruction: "Invite a collaborator and review <strong>sharing controls</strong>.",
  1007 |       instructionChildCount: 0,
  1008 |       nextButton: undefined,
  1009 |       nextButtonSlate: false,
  1010 |       pauseButton: false,
  1011 |       progress: "Task 3 of 3",
  1012 |       startTask: "Start task",
  1013 |     });
  1014 |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(2);
  1015 |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(0);
  1016 | 
  1017 |     await recordingCard.getByRole("button", { name: "Start task" }).click();
  1018 |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderResumeCount)).toBe(3);
  1019 |     await expect(recordingCard.getByRole("button", { name: "Finish recording" })).toBeFocused();
  1020 |     await expect.poll(readPipInstruction).toMatchObject({
  1021 |       finishButton: true,
  1022 |       instruction: "Invite a collaborator and review <strong>sharing controls</strong>.",
  1023 |       nextButton: undefined,
  1024 |       nextButtonSlate: false,
  1025 |       pauseButton: true,
  1026 |       progress: "Task 3 of 3",
  1027 |       startTask: undefined,
  1028 |     });
  1029 | 
  1030 |     await page.evaluate(() => {
  1031 |       window.__testRecordingPipDocument?.getElementById("recording-pip-finish")?.click();
  1032 |     });
  1033 |     await expect.poll(() => page.evaluate(() => window.__testMediaRecorderStopCount)).toBe(1);
  1034 |   });
  1035 | }
  1036 | 
  1037 | for (const viewport of [
  1038 |   { name: "mobile", width: 390, height: 844 },
  1039 |   { name: "desktop", width: 1440, height: 900 },
  1040 | ]) {
  1041 |   test(`microphone check unlocks screen sharing at ${viewport.name}`, async ({ page }) => {
  1042 |     await page.setViewportSize({ width: viewport.width, height: viewport.height });
  1043 |     await installMicrophoneFixture(page);
  1044 |     await page.goto("/test/submission-palette?ds-user=user-avery&ds-recording=1");
  1045 | 
  1046 |     const appLink = page.locator(".test-session__link").first();
  1047 |     const testerInstructions = page.locator(".test-session__instruction-list");
  1048 |     const appLinkLabel = page.getByText("App link", { exact: true });
  1049 |     const testerInstructionsLabel = page.getByText("Tester instructions", { exact: true });
  1050 |     await expect(appLink).toBeVisible();
  1051 |     await expect(appLink.locator(".test-session__link-label")).toHaveCount(0);
  1052 |     expect(
  1053 |       await appLink.evaluate((element) => {
  1054 |         const styles = window.getComputedStyle(element);
  1055 |         return {
  1056 |           borderWidth: styles.borderWidth,
  1057 |           color: styles.color,
  1058 |           padding: styles.padding,
  1059 |         };
  1060 |       }),
  1061 |     ).toEqual({
  1062 |       borderWidth: "0px",
  1063 |       color: await testerInstructions.evaluate((element) => window.getComputedStyle(element).color),
  1064 |       padding: "0px",
  1065 |     });
  1066 | 
  1067 |     const appLinkLabelBounds = await appLinkLabel.boundingBox();
  1068 |     const appLinkTextBounds = await appLink.locator("span").first().boundingBox();
  1069 |     const testerInstructionsLabelBounds = await testerInstructionsLabel.boundingBox();
  1070 |     const firstInstructionBounds = await testerInstructions.locator("li").first().boundingBox();
  1071 |     expect(appLinkLabelBounds).not.toBeNull();
  1072 |     expect(appLinkTextBounds).not.toBeNull();
  1073 |     expect(testerInstructionsLabelBounds).not.toBeNull();
  1074 |     expect(firstInstructionBounds).not.toBeNull();
> 1075 |     expect(Math.round((appLinkTextBounds?.y ?? 0) - (appLinkLabelBounds?.y ?? 0))).toBe(
       |                                                                                    ^ Error: expect(received).toBe(expected) // Object.is equality
  1076 |       Math.round((firstInstructionBounds?.y ?? 0) - (testerInstructionsLabelBounds?.y ?? 0)),
  1077 |     );
  1078 | 
  1079 |     const shareScreen = page.getByRole("button", { name: "Share screen" });
  1080 |     const inactiveIndicator = page.getByRole("img", {
  1081 |       name: "Microphone activity is inactive until microphone access is enabled",
  1082 |     });
  1083 |     const enableMicrophone = page.getByRole("button", { name: "Enable microphone" });
  1084 |     await expect(inactiveIndicator).toBeVisible();
  1085 |     expect(
  1086 |       await inactiveIndicator
  1087 |         .locator("span")
  1088 |         .evaluateAll((bars) => bars.map((bar) => window.getComputedStyle(bar).height)),
  1089 |     ).toEqual(["6px", "8px", "10px", "8px", "6px"]);
  1090 | 
  1091 |     const enableMicrophoneBounds = await enableMicrophone.boundingBox();
  1092 |     const inactiveIndicatorBounds = await inactiveIndicator.boundingBox();
  1093 |     expect(enableMicrophoneBounds).not.toBeNull();
  1094 |     expect(inactiveIndicatorBounds).not.toBeNull();
  1095 |     expect(inactiveIndicatorBounds?.height).toBe(enableMicrophoneBounds?.height);
  1096 | 
  1097 |     await enableMicrophone.click();
  1098 |     const microphoneDevice = page.getByLabel("Microphone device");
  1099 |     const activeIndicator = page.getByRole("img", {
  1100 |       name: "Voice activity level for the selected microphone",
  1101 |     });
  1102 |     await expect(microphoneDevice).toBeVisible();
  1103 |     await expect(
  1104 |       page.getByText('Test your microphone, say something like "Test... 1 2 3..."', {
  1105 |         exact: true,
  1106 |       }),
  1107 |     ).toBeVisible();
  1108 |     await expect(shareScreen).toBeDisabled();
  1109 |     await expect(activeIndicator).toBeVisible();
  1110 | 
  1111 |     const microphoneDeviceBounds = await microphoneDevice.boundingBox();
  1112 |     const activeIndicatorBounds = await activeIndicator.boundingBox();
  1113 |     expect(microphoneDeviceBounds).not.toBeNull();
  1114 |     expect(activeIndicatorBounds).not.toBeNull();
  1115 |     expect(activeIndicatorBounds?.height).toBe(microphoneDeviceBounds?.height);
  1116 | 
  1117 |     await page.evaluate(() => {
  1118 |       window.__testMicrophoneIsLoud = true;
  1119 |     });
  1120 | 
  1121 |     const passedIndicator = page.getByRole("img", { name: "Microphone test passed" });
  1122 |     await expect(passedIndicator).toBeVisible();
  1123 |     await expect(passedIndicator.locator("span")).toHaveCount(0);
  1124 |     const passedIndicatorBounds = await passedIndicator.boundingBox();
  1125 |     expect(passedIndicatorBounds).not.toBeNull();
  1126 |     expect(passedIndicatorBounds?.width).toBe(activeIndicatorBounds?.width);
  1127 |     expect(passedIndicatorBounds?.height).toBe(activeIndicatorBounds?.height);
  1128 |     await expect(shareScreen).toBeEnabled();
  1129 |     await expect(page.getByRole("status")).toHaveText(
  1130 |       "Microphone test passed. Step 2 is now available.",
  1131 |     );
  1132 |     await expect(passedIndicator.locator(".recording-mic-indicator__check")).toHaveCSS(
  1133 |       "position",
  1134 |       "absolute",
  1135 |     );
  1136 | 
  1137 |     await shareScreen.click();
  1138 |     const screenShareIndicator = page.getByRole("img", { name: "Screen sharing active" });
  1139 |     await expect(screenShareIndicator).toBeVisible();
  1140 |     const screenShareIndicatorBounds = await screenShareIndicator.boundingBox();
  1141 |     expect(screenShareIndicatorBounds).not.toBeNull();
  1142 |     expect(screenShareIndicatorBounds?.width).toBe(passedIndicatorBounds?.width);
  1143 |     expect(screenShareIndicatorBounds?.height).toBe(passedIndicatorBounds?.height);
  1144 | 
  1145 |     const hasHorizontalOverflow = await page.evaluate(
  1146 |       () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  1147 |     );
  1148 |     expect(hasHorizontalOverflow).toBe(false);
  1149 |   });
  1150 | }
  1151 | 
```