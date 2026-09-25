import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  // Locale fixe : format des dates (mm/jj/aaaa) et textes identiques partout.
  use: { trace: 'retain-on-failure', locale: 'en-US', timezoneId: 'Europe/Paris' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium déjà installé ailleurs (ex. conteneur) : PW_CHROMIUM_PATH=/chemin/chrome
        launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
      },
    },
  ],
});
