import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1920, height: 1080 },
  },
});
