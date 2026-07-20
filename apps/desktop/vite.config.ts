/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": r("./src"),
      "@fishes/shared": r("../../packages/shared/src/index.ts"),
      "@fishes/sdk/mock-server": r("../../packages/sdk/src/mockServer.ts"),
      "@fishes/sdk": r("../../packages/sdk/src/index.ts"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
