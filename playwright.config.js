import { defineConfig, devices } from '@playwright/test';

/* The site is static, so the test server is just a file server. CI runs the
 * same command a developer runs locally — there is no separate CI path to
 * drift out of sync. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:8777',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI runners have no GPU; without this the WebGL sequence never boots
        // and every homepage test fails for the wrong reason
        // headless:false uses the full chromium build rather than the
        // headless shell, which is the binary that ships in some sandboxes;
        // combined with xvfb in CI this runs anywhere
        launchOptions: {
          executablePath: process.env.CHROMIUM_PATH || undefined,
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
        }
      }
    }
  ],

  webServer: {
    command: 'npx --yes http-server . -p 8777 -c-1 --silent',
    url: 'http://127.0.0.1:8777',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
