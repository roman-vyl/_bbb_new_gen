import { defineConfig } from "@playwright/test";

const workbenchBaseUrl =
  process.env.PLAYWRIGHT_BASE_URL ?? process.env.WORKBENCH_URL ?? "http://127.0.0.1:5173";

export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  use: {
    baseURL: workbenchBaseUrl,
    viewport: { width: 1920, height: 1080 },
  },
});
