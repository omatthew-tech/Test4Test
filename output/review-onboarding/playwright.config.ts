import { defineConfig } from "@playwright/test";
import base from "../../playwright.a11y.config";

export default defineConfig({
  ...base,
  testDir: "../../tests/playwright",
  outputDir: "./validation",
  projects: base.projects?.map((project) => ({
    ...project,
    use: { ...project.use, baseURL: "http://127.0.0.1:5183" },
  })),
});
