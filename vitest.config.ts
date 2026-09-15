import { defineConfig } from "vitest/config";
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    fileParallelism: false,
    testTimeout: 30000,
  },
});
