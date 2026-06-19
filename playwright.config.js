// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: '.omo',
  testMatch: '**/task-10-*.spec.js',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:80',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: true,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: '.omo/test-results',
});
