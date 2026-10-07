import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { versionStaticAssets } from "./scripts/version-static-assets.mjs";

export default defineConfig({
  plugins: [versionStaticAssets(), react()],
  optimizeDeps: {
    // Only the app is a development entry point; generated reports, Storybook
    // output, and archived mockups do not need dependency discovery.
    entries: ["index.html"],
  },
  build: {
    // Keep fresh URLs after the Windows asset-directory casing correction.
    assetsDir: "assets/earn-activation-v1",
  },
  resolve: {
    alias: {
      "@test4test/design-system": fileURLToPath(
        new URL("./design-system/index.ts", import.meta.url),
      ),
    },
  },
});
