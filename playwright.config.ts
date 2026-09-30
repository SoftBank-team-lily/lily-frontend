import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3210", reducedMotion: "reduce" },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3210",
    url: "http://127.0.0.1:3210", reuseExistingServer: false,
  },
});
