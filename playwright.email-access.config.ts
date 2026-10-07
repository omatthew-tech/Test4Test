import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  testMatch: "email-access.spec.ts",
  outputDir: ".tmp/email-access-browser",
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:4173" },
  projects: [
    { name: "email-mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "email-desktop", use: { viewport: { width: 1440, height: 900 } } },
  ],
});
