import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Chromium déjà installé ailleurs : PW_CHROMIUM_PATH=/chemin/chrome, sinon celui
// d'un conteneur Claude Code (web), sinon le navigateur de Playwright.
const CONTAINER_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.PW_CHROMIUM_PATH ||
  (process.env.CLAUDE_CODE_REMOTE === 'true' && fs.existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : undefined);

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  // Locale fixe : format des dates (mm/jj/aaaa) et textes identiques partout.
  // Animations coupées (prefers-reduced-motion) : tests déterministes. Les
  // animations ont leurs propres tests (e2e/animation.spec.ts), qui les réactivent.
  use: { trace: 'retain-on-failure', locale: 'en-US', timezoneId: 'Europe/Paris', reducedMotion: 'reduce' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath },
      },
    },
  ],
});
