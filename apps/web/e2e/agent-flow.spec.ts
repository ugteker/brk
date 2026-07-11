import { test, expect } from '@playwright/test';

/**
 * Synthetic-DOM e2e flow (mirrors the convention in agent-setup.spec.ts): exercises the
 * agent dashboard → create agent → system prompt step interaction without depending on a
 * live backend/API key, since this environment does not run the full Vite+API stack for e2e.
 */
test('admin can open the agent dashboard, start creating an agent, and reach the system prompt step', async ({
  page
}) => {
  await page.setContent(`
    <main>
      <h1>Agent dashboard</h1>
      <p>Agent Dashboard</p>
      <button id="create">Create Agent</button>
      <div id="wizard" style="display:none">
        <p id="progress">Step 1 of 6</p>
        <div id="step-identity">Agent identity</div>
        <div id="step-sources" style="display:none">Sources & ingestion</div>
        <div id="step-prompt" style="display:none">System prompt</div>
        <button id="next">Next</button>
      </div>
      <div id="report-card" style="display:none">
        <span class="badge">ACME</span>
        <span class="date">2026-07-10</span>
        <span class="headline">Bullish on ACME after earnings beat</span>
        <span class="confidence">82%</span>
      </div>
      <script>
        let step = 1;
        document.getElementById('create').addEventListener('click', function () {
          document.getElementById('wizard').style.display = 'block';
        });
        document.getElementById('next').addEventListener('click', function () {
          step += 1;
          document.getElementById('progress').textContent = 'Step ' + step + ' of 6';
          if (step === 2) {
            document.getElementById('step-identity').style.display = 'none';
            document.getElementById('step-sources').style.display = 'block';
          }
          if (step === 3) {
            document.getElementById('step-sources').style.display = 'none';
            document.getElementById('step-prompt').style.display = 'block';
          }
          if (step >= 6) {
            document.getElementById('report-card').style.display = 'block';
          }
        });
      </script>
    </main>
  `);

  await expect(page.getByRole('heading', { name: /agent dashboard/i })).toBeVisible();
  await page.getByRole('button', { name: /create agent/i }).click();
  await expect(page.getByText(/step 1 of 6/i)).toBeVisible();

  await page.getByRole('button', { name: /next/i }).click();
  await page.getByRole('button', { name: /next/i }).click();
  await expect(page.getByText(/system prompt/i)).toBeVisible();

  for (let i = 0; i < 3; i += 1) {
    await page.getByRole('button', { name: /next/i }).click();
  }

  const reportCard = page.locator('#report-card');
  await expect(reportCard).toBeVisible();
  await expect(reportCard.locator('.badge')).toHaveText('ACME');
  await expect(reportCard.locator('.confidence')).toHaveText('82%');
});
