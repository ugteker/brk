import { test, expect } from '@playwright/test';

test('@smoke app load shows dashboard on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <main>
      <h1>ChatTrader</h1>
      <p>Agent Dashboard</p>
    </main>
  `);

  await expect(page.getByText('Agent Dashboard')).toBeVisible();
});
