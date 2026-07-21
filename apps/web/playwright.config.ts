import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  grep: /@smoke/,
  reporter: [['list']]
});
