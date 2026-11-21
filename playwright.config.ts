import { defineConfig } from "@playwright/test";

const baseURL = "http://localhost:3000";

// Chromium only (spec 0003). Two widths, both color schemes. Runs against a production
// build (`pnpm build && pnpm start`) with ENABLE_DESIGN_PAGE=true set at build time.
// The full chat flow (e2e/flow.spec.ts) also needs a database and BETTER_AUTH_SECRET.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "phone-light",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 800 },
        colorScheme: "light",
      },
    },
    {
      name: "phone-dark",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 800 },
        colorScheme: "dark",
      },
    },
    {
      name: "desktop-light",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        colorScheme: "light",
      },
    },
    {
      name: "desktop-dark",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        colorScheme: "dark",
      },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Every AI call uses the scripted fake models (spec 0007), so the full flow test
    // costs nothing. `env.ts` ignores it on a production deploy.
    env: { E2E_FAKE_AI: "true" },
  },
});
