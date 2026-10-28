/**
 * 截取界面预览图（用于 README 与自查）。
 * 用法：node scripts/capture.mjs http://127.0.0.1:29560
 */
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:29560';
const OUT = resolve('docs/screenshots');
mkdirSync(OUT, { recursive: true });

const shots = [];
const browser = await chromium.launch();

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console error]', m.text().slice(0, 160));
  });
  return { ctx, page };
}

/** 首次打开走三步引导，顺便截图。 */
async function onboarding(page, { levels, daily, examInDays, prefix = 'mobile' }) {
  await page.waitForSelector('.onboard', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${prefix}-onboarding.png` });
  shots.push(`${prefix}-onboarding.png`);

  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForTimeout(300);
  for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    const pick = page.locator('.level-pick', { hasText: lv });
    const pressed = (await pick.getAttribute('aria-pressed')) === 'true';
    if (!pressed && levels.includes(lv)) await pick.click();
  }
  // 选满目标等级后再取消不需要的，避免触发「至少保留一个」保护
  for (const lv of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    if (levels.includes(lv)) continue;
    const pick = page.locator('.level-pick', { hasText: lv });
    if ((await pick.getAttribute('aria-pressed')) === 'true') await pick.click();
  }
  await page.locator('.daily-pick', { hasText: String(daily) }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${prefix}-onboarding-levels.png` });
  shots.push(`${prefix}-onboarding-levels.png`);

  await page.getByRole('button', { name: '下一步' }).click();
  await page.waitForTimeout(300);
  const dateInput = page.locator('.exam-input input[type="date"]');
  if (await dateInput.count()) await dateInput.fill(daysFromNow(examInDays));
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${prefix}-onboarding-exam.png` });
  shots.push(`${prefix}-onboarding-exam.png`);

  await page.locator('.onboard-actions .btn.primary', { hasText: '开始学习' }).click();
  await page.waitForSelector('.card.hero', { timeout: 30000 });
  await page.waitForTimeout(800);
}

/** 新词预习后会隔几个词再回来，连续确认直到测验出现。 */
async function ensureQuiz(page) {
  for (let i = 0; i < 12; i++) {
    if (!(await page.locator('.preview-card').count())) break;
    await page.getByRole('button', { name: /记住了/ }).click();
    await page.waitForTimeout(240);
  }
  if (await page.locator('.qcard').count()) await page.waitForTimeout(180);
}

/** 作答一题：依次尝试选择题、拼写题、自评卡三种交互。 */
let pickCursor = 0;

async function currentKind(page) {
  if (await page.locator('.typing-input').count()) return 'typing';
  if (await page.locator('.opt:not([disabled])').count()) return 'choice';
  return 'self';
}

async function answerOnce(page, kind) {
  if (kind === 'choice') {
    const opts = page.locator('.opt:not([disabled])');
    const n = await opts.count();
    await opts.nth(pickCursor % n).click();
    pickCursor += 2;
  } else if (kind === 'typing') {
    const input = page.locator('.typing-input').first();
    await input.fill('あ');
    const submit = page.locator('button', { hasText: '提交' }).first();
    if (await submit.count()) await submit.click();
  } else {
    await page.locator('.opt').first().click();
  }
  await page.waitForTimeout(320);
}

/**
 * 先按轮换位置作答；若答错，记录正确答案并撤销重答。
 * 截图脚本因此能得到干净的正确率，同时顺带验证撤销链路。
 */
async function answerOne(page, shotWrong) {
  const kind = await currentKind(page);
  await answerOnce(page, kind);
  const ok = await page.locator('.feedback.ok').count();
  if (!ok) {
    if (shotWrong) {
      await page.waitForTimeout(250);
      await page.locator('.feedback').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.waitForTimeout(200);
      await page.screenshot({ path: shotWrong });
      shots.push('mobile-feedback.png');
    }
    let correct = '';
    const muted = page.locator('.feedback .muted');
    if (await muted.count()) {
      correct = ((await muted.first().textContent()) ?? '').replace(/^.*正确答案：/, '').trim();
    }
    await page.getByRole('button', { name: '撤销' }).click();
    await page.waitForTimeout(260);
    if (kind === 'self') {
      await page.locator('.opt').first().click();
    } else if (kind === 'choice' && correct) {
      const picked = await page.evaluate((ans) => {
        const els = [...document.querySelectorAll('.opt')];
        const el =
          els.find((e) => {
            const spans = e.querySelectorAll('span');
            return (spans[spans.length - 1]?.textContent ?? '').trim() === ans;
          }) ?? els.find((e) => (e.textContent ?? '').includes(ans));
        if (!el) return false;
        el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      }, correct);
      if (!picked) console.log('  [warn] 撤销后未找到正确选项：', correct);
    } else if (kind === 'typing' && correct) {
      await page.locator('.typing-input').first().fill(correct);
      await page.locator('button', { hasText: '提交' }).first().click();
    }
    await page.waitForTimeout(420);
  } else if (shotWrong) {
    await page.waitForTimeout(250);
    await page.locator('.feedback').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(200);
    await page.screenshot({ path: shotWrong });
    shots.push('mobile-feedback.png');
  }
  return kind;
}

async function nextOne(page) {
  const next = page.locator('button', { hasText: '下一个' }).first();
  if (await next.count()) {
    await next.click();
    await page.waitForTimeout(280);
    await ensureQuiz(page);
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------- 移动端 */
{
  const { ctx, page } = await newPage({ ...devices['Pixel 7'], locale: 'zh-CN' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await onboarding(page, { levels: ['N3', 'N2'], daily: 20, examInDays: 200 });

  await page.screenshot({ path: `${OUT}/mobile-home.png` });
  shots.push('mobile-home.png');

  // 学习页：新词预习 → 测验 → 反馈
  await page.locator('.card.hero .btn.primary', { hasText: '开始学习' }).click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/mobile-preview.png` });
  shots.push('mobile-preview.png');

  await ensureQuiz(page);
  await page.screenshot({ path: `${OUT}/mobile-study.png` });
  shots.push('mobile-study.png');

  const kind = await answerOne(page, `${OUT}/mobile-feedback.png`);
  console.log('  首题题型：', kind ?? '未知');

  // 再连续作答 7 题，让统计页有真实数据（同时验证多题型可作答）
  for (let i = 0; i < 7; i++) {
    if (!(await nextOne(page))) break;
    await answerOne(page);
    await page.waitForTimeout(250);
  }
  await nextOne(page);

  // 返回首页：队列做完会直接进结算；中途关闭也会先结算，再点「返回首页」
  const alreadySummary = await page.locator('.summary').count();
  if (!alreadySummary) {
    const closeBtn = page.locator('.study-head .btn').first();
    if (await closeBtn.count()) {
      await closeBtn.click();
      await page.waitForTimeout(800);
    }
  }
  await page.waitForSelector('.summary', { timeout: 10000 }).catch(() => {});
  if (await page.locator('.summary').count()) {
    await page.waitForTimeout(2400);
    await page.screenshot({ path: `${OUT}/mobile-summary.png` });
    if (!shots.includes('mobile-summary.png')) shots.push('mobile-summary.png');
    await page.getByRole('button', { name: '返回首页' }).click();
    await page.waitForTimeout(700);
  } else {
    console.log('  [warn] 退出学习后未出现结算页');
  }
  // 等结算 toast 消失，避免遮挡词库首屏
  await page.waitForTimeout(2300);

  for (const [key, label] of [
    ['book', '词库'],
    ['stats', '统计'],
    ['settings', '设置'],
  ]) {
    const nav = page.locator('.navbtn', { hasText: label });
    if (!(await nav.count())) {
      console.log(`  [skip] 未找到导航项：${label}`);
      continue;
    }
    await nav.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/mobile-${key}.png` });
    shots.push(`mobile-${key}.png`);
  }

  // 深色主题：点击「深色主题」旁的开关键
  await page.locator('.navbtn', { hasText: '设置' }).click();
  await page.waitForTimeout(600);
  const themeSwitch = page.locator('.field', { hasText: '深色主题' }).locator('.switch');
  if (await themeSwitch.count()) {
    await themeSwitch.click();
    await page.waitForTimeout(400);
    const theme = await page.getAttribute('html', 'data-theme');
    console.log('  主题：', theme);
    await page.locator('.navbtn', { hasText: '今日' }).click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/mobile-dark.png` });
    shots.push('mobile-dark.png');
  } else {
    console.log('  [skip] 未找到主题开关');
  }

  await ctx.close();
}

/* ---------------------------------------------------------------- 桌面端 */
{
  const { ctx, page } = await newPage({ viewport: { width: 1440, height: 980 }, locale: 'zh-CN' });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await onboarding(page, { levels: ['N2'], daily: 30, examInDays: 200, prefix: 'desktop' });

  await page.screenshot({ path: `${OUT}/desktop-home.png`, fullPage: false });
  shots.push('desktop-home.png');

  for (const [key, label] of [
    ['book', '词库'],
    ['stats', '统计'],
    ['settings', '设置'],
  ]) {
    await page.locator('.sidebtn', { hasText: label }).click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/desktop-${key}.png` });
    shots.push(`desktop-${key}.png`);
  }
  await ctx.close();
}

await browser.close();
console.log(`已生成 ${shots.length} 张：\n` + shots.map((s) => '  ' + s).join('\n'));
