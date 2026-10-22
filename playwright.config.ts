// E2E against a real Logger on a Rig (Target B, test build), never in CI.
// Chrome policies on the Rig pre-grant the Logger and dapboot to this origin.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  timeout: 180_000,
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
  },
});
