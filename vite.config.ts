import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { versionStaticAssets } from "./scripts/version-static-assets.mjs";

export default defineConfig({
  plugins: [versionStaticAssets(), react()],
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
