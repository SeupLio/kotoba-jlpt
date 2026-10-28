import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://127.0.0.1:29560';
const OUT = '/tmp/kotoba-shots';
mkdirSync(OUT, { recursive: true });

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const browser = await chromium.launch();
const errors = [];

async function onboard(page, levels) {
  await page.waitForSelector('.onboard', { timeout: 30000 });
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForTimeout(250);
  for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    const pick = page.locator('.level-pick', { hasText: lv });
    const on = (await pick.getAttribute('aria-pressed')) === 'true';
    if (!on && levels.includes(lv)) await pick.click();
  }
  // 先选满再取消，避开「至少保留一个等级」的保护
  for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    if (levels.includes(lv)) continue;
    const pick = page.locator('.level-pick', { hasText: lv });
    if ((await pick.getAttribute('aria-pressed')) === 'true') await pick.click();
  }
  await page.locator('.daily-pick', { hasText: '20' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForTimeout(250);
  const date = page.locator('.exam-input input[type="date"]');
  if (await date.count()) await date.fill(daysFromNow(200));
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.locator('.onboard-actions .btn.primary', { hasText: '开始学习' }).click();
  await page.waitForSelector('.card.hero', { timeout: 30000 });
  await page.waitForTimeout(700);
}

async function shot(page, name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
}

for (const [tag, opts] of [
  ['mobile', { ...devices['Pixel 7'], locale: 'zh-CN' }],
  ['tablet', { viewport: { width: 834, height: 1194 }, locale: 'zh-CN' }],
  ['desktop', { viewport: { width: 1440, height: 980 }, locale: 'zh-CN' }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await onboard(page, ['N3', 'N2']);
  await shot(page, `${tag}-home`);
  await shot(page, `${tag}-home-full`, true);

  const wide = tag === 'desktop';
  const nav = (label) => (wide ? `.sidebtn:has-text("${label}")` : `.navbtn:has-text("${label}")`);
  for (const [name, label] of [['book', '词库'], ['stats', '统计'], ['settings', '设置']]) {
    await page.locator(nav(label)).click();
    await page.waitForTimeout(800);
    await shot(page, `${tag}-${name}`);
  }
  await page.locator(nav('今日')).click();
  await page.waitForTimeout(600);
  await page.locator('.card.hero .btn.primary', { hasText: '开始学习' }).click();
  await page.waitForTimeout(800);
  await shot(page, `${tag}-preview`);
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('.preview-card').count())) break;
    await page.getByRole('button', { name: /记住了/ }).click();
    await page.waitForTimeout(240);
  }
  await page.waitForSelector('.qcard');
  await page.waitForTimeout(500);
  await shot(page, `${tag}-quiz`);
  await ctx.close();
}

await browser.close();
console.log('errors:', errors.length ? errors : 'none');
