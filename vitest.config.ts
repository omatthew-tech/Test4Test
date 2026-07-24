import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const storybookDirectory = fileURLToPath(new URL("./.storybook", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@test4test/design-system": fileURLToPath(
        new URL("./design-system/index.ts", import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    include: ["@storybook/react-vite", "react-router-dom", "storybook/test"],
  },
  test: {
    projects: [
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "jsdom",
        },
      },
      {
        extends: true,
        plugins: [
          react(),
          storybookTest({
            configDir: storybookDirectory,
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
