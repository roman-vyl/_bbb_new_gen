import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      environment: "node",
      environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
    },
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "src"),
      },
    },
  }),
);
