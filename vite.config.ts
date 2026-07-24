import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@test4test/design-system": fileURLToPath(new URL("./design-system/index.ts", import.meta.url)),
    },
  },
});
