/**
 * Regenerates the README screenshots in docs/screenshots/.
 *
 *   npm run build && npm run screenshots
 *
 * Serves the production build, answers the app's own API calls from
 * scripts/fixtures.mjs, and captures light and dark views. It fails on any
 * console or page error, so it doubles as a smoke test of the built bundle.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { buildFixtures, IDENTITY } from './fixtures.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'docs/screenshots');
const PORT = 4173;
const NOW = Date.now();

const { projects, flagsByProject, scheduledChanges, approvalRequests } = buildFixtures(NOW);

function json(route, body) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

/** Answer /api/me and /api/ld/* from the fixtures instead of the Worker. */
async function stubApi(page, { authenticated, methods = { oauth: true, token: true } }) {
  await page.route('**/api/auth-methods', (route) => json(route, methods));

  await page.route('**/api/me', (route) =>
    authenticated
      ? json(route, IDENTITY)
      : route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"authenticated":false}',
        }),
  );

  await page.route('**/api/ld/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/ld/', '');
    if (path === 'projects') return json(route, projects);
    if (path === 'approval-requests') return json(route, approvalRequests);

    const flagList = path.match(/^flags\/([^/]+)$/);
    if (flagList) {
      return json(route, flagsByProject[flagList[1]] ?? { items: [], totalCount: 0 });
    }

    const changes = path.match(
      /^projects\/([^/]+)\/flags\/([^/]+)\/environments\/([^/]+)\/scheduled-changes$/,
    );
    if (changes) {
      const key = `${changes[1]}/${changes[2]}/${changes[3]}`;
      return json(route, { items: scheduledChanges[key] ?? [] });
    }

    return json(route, { items: [] });
  });
}

const problems = [];

/** The signed-out screen is *supposed* to see a 401 from /api/me. */
const EXPECTED = /status of 401/;

function watchForErrors(page, label) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (EXPECTED.test(text)) return;
    problems.push(`${label}: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`));
}

await mkdir(OUT_DIR, { recursive: true });

const server = await preview({
  root: ROOT,
  preview: { port: PORT, host: '127.0.0.1', strictPort: true },
  logLevel: 'error',
});
const base = `http://127.0.0.1:${PORT}`;

const browser = await chromium.launch({
  // Honours PLAYWRIGHT_BROWSERS_PATH when Playwright manages the download.
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

try {
  // Sign-in screen, with the access-token form expanded.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    watchForErrors(page, 'login');
    await stubApi(page, { authenticated: false });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByText('Sign in with LaunchDarkly').waitFor();
    await page.getByRole('button', { name: /Use an access token instead/ }).click();
    await page.getByLabel('Access token').waitFor();
    await page.screenshot({ path: `${OUT_DIR}/login.png` });
    await page.close();
  }

  // The same screen on a deployment with no OAuth client registered.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 780 } });
    watchForErrors(page, 'login-token-only');
    await stubApi(page, { authenticated: false, methods: { oauth: false, token: true } });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByLabel('Access token').waitFor();
    const oauthButtons = await page.getByText('Sign in with LaunchDarkly').count();
    if (oauthButtons > 0) problems.push('login-token-only: OAuth button shown when unconfigured');
    await page.screenshot({ path: `${OUT_DIR}/login-token-only.png` });
    await page.close();
  }

  for (const theme of ['default', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    watchForErrors(page, theme);
    await page.addInitScript((value) => {
      window.localStorage.setItem('ldsc:theme', value);
    }, theme);
    await stubApi(page, { authenticated: true });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByText('What happens next').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);

    const suffix = theme === 'dark' ? '-dark' : '';
    await page.screenshot({ path: `${OUT_DIR}/dashboard${suffix}.png`, fullPage: true });

    // Hover a column so the chart screenshot includes its tooltip.
    const chart = page.locator('.chart__svg');
    const box = await chart.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.145, box.y + box.height * 0.6);
      await page.waitForTimeout(250);
    }
    await page.locator('.chart').screenshot({ path: `${OUT_DIR}/chart${suffix}.png` });

    const counts = await page.evaluate(() => ({
      agendaItems: document.querySelectorAll('.agenda__item').length,
      tableRows: document.querySelectorAll('tbody tr').length,
      tooltips: document.querySelectorAll('.chart__tooltip').length,
    }));
    console.log(`${theme}: ${JSON.stringify(counts)}`);
    if (counts.agendaItems === 0 || counts.tableRows === 0) {
      problems.push(`${theme}: dashboard rendered no changes`);
    }
    if (counts.tooltips === 0) problems.push(`${theme}: chart tooltip did not appear on hover`);

    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}

if (problems.length) {
  console.error('\nFailures:');
  for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`\nScreenshots written to docs/screenshots/`);
