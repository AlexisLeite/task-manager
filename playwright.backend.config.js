import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "worktrack-e2e-"));
export default defineConfig({
  testDir: "./tests",
  testMatch: "backend.spec.js",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:4174/api/health",
    reuseExistingServer: false,
    env: { PORT: "4174", WORKTRACK_DB: join(dir, "test.sqlite") },
  },
});
