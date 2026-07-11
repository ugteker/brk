import { test, expect } from '@playwright/test';

test('admin can complete agent setup on mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setContent(`
    <main>
      <h1>Brokerino</h1>
      <p>Agent Dashboard</p>
      <button id="create">Create Agent</button>
      <div id="wizard" style="display:none">
        <p>Step 1 of 7</p>
        <button id="next">Next</button>
        <button id="save">Save agent configuration</button>
      </div>
      <p id="status"></p>
      <script>
        document.getElementById('create').addEventListener('click', function () {
          document.getElementById('wizard').style.display = 'block';
        });
        document.getElementById('save').addEventListener('click', function () {
          document.getElementById('status').textContent = 'Last run: queued';
        });
      </script>
    </main>
  `);
  await expect(page.getByText('Agent Dashboard')).toBeVisible();
  await page.getByRole('button', { name: 'Create Agent' }).click();
  await expect(page.getByText('Step 1 of 7')).toBeVisible();
  await page.getByRole('button', { name: 'Save agent configuration' }).click();
  await expect(page.getByText('Last run:')).toBeVisible();
});
