import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
      testIgnore: "**/mobile.spec.ts",
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testMatch: "**/mobile.spec.ts",
    },
  ],
  use: { baseURL: "http://127.0.0.1:3210", reducedMotion: "reduce" },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3210",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: false,
  },
});
