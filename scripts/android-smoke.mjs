// Android 模拟器冒烟：通过 WebView DevTools 协议（页面级 CDP）自动走完整流程。
// 前置：模拟器已启动、APK 已安装并打开，且执行过
//   adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const WebSocket = require('playwright-core/lib/utilsBundle').ws;

const OUT = process.env.OUT || 'E:/tmp/kotoba-android';
const ADB = process.env.ADB || `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const CDP = process.env.CDP || 'http://127.0.0.1:9222';
mkdirSync(OUT, { recursive: true });

const shots = [];
const errors = [];
let step = 0;

function adb(...args) {
  return execFileSync(ADB, args, { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024 }).trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await fetch(`${CDP}/json`).then((r) => r.json());
const target = targets.find((t) => t.type === 'page' && t.url.includes('localhost'));
if (!target) throw new Error('未找到 WebView 页面，确认 APK 已启动');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
});

let seq = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { res, rej, timer } = pending.get(msg.id);
    clearTimeout(timer);
    pending.delete(msg.id);
    if (msg.error) rej(new Error(`${msg.error.message} (${msg.method || ''})`));
    else res(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(`console: ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(`exception: ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
  }
});

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id);
      rej(new Error(`CDP timeout: ${method}`));
    }, 20000);
    pending.set(id, { res, rej, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');

async function ev(fn, ...args) {
  const expr = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  }
  return r.result?.value;
}

async function bodyText() {
  return ev(() => document.body.innerText);
}

async function waitFor(sel, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await ev((s) => !!document.querySelector(s), sel)) return;
    await sleep(200);
  }
  throw new Error(`waitFor timeout: ${sel}`);
}

async function clickSel(sel) {
  const ok = await ev((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, sel);
  if (!ok) throw new Error(`click missing: ${sel}`);
  await sleep(450);
}

async function clickText(sel, text) {
  const ok = await ev(([s, t]) => {
    const el = [...document.querySelectorAll(s)].find((e) => (e.innerText || e.textContent || '').includes(t));
    if (!el) return false;
    el.click();
    return true;
  }, [sel, text]);
  if (!ok) throw new Error(`clickText missing: ${sel} / ${text}`);
  await sleep(450);
}

async function fill(sel, value) {
  const ok = await ev(([s, v]) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, [sel, value]);
  if (!ok) throw new Error(`fill missing: ${sel}`);
  await sleep(250);
}

/** 预习卡会隔几个词再回来，连续点「记住了」直到进入测验。 */
async function clearPreview(max = 14) {
  for (let i = 0; i < max; i++) {
    if (!(await ev(() => !!document.querySelector('.preview-card')))) return true;
    const clicked = await ev(() => {
      const btn = [...document.querySelectorAll('.preview-card .btn.primary')].find((b) =>
        (b.innerText || '').includes('记住了'),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) return false;
    await sleep(380);
  }
  return !(await ev(() => !!document.querySelector('.preview-card')));
}

function deviceShot(name) {
  const png = execFileSync(ADB, ['-e', 'exec-out', 'screencap', '-p'], { maxBuffer: 30 * 1024 * 1024 });
  const file = `${OUT}/${String(++step).padStart(2, '0')}-${name}.png`;
  writeFileSync(file, png);
  shots.push(file);
  return file;
}

console.log('title:', await ev(() => document.title));
console.log('webview:', await ev(() => `${innerWidth}x${innerHeight} dpr=${devicePixelRatio}`));
console.log('ua:', await ev(() => navigator.userAgent.slice(0, 80)));

// 引导
if (await ev(() => !!document.querySelector('.onboard'))) {
  deviceShot('onboarding');
  await clickText('.onboard-actions .btn.primary, .onboard-actions .btn', '下一步');
  await sleep(300);
  const n3 = await ev(() => {
    const el = [...document.querySelectorAll('.level-pick')].find((e) => e.innerText.includes('N3'));
    if (!el || el.getAttribute('aria-pressed') === 'true') return 'already';
    el.click();
    return 'clicked';
  });
  console.log('select N3:', n3);
  await clickText('.daily-pick', '20');
  deviceShot('onboarding-levels');
  await clickText('.onboard-actions .btn.primary, .onboard-actions .btn', '下一步');
  await sleep(300);
  if (await ev(() => !!document.querySelector('.exam-input input[type="date"]'))) {
    const d = new Date();
    d.setDate(d.getDate() + 240);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await fill('.exam-input input[type="date"]', iso);
    await ev(() => document.activeElement?.blur?.());
  }
  deviceShot('onboarding-exam');
  await clickText('.onboard-actions .btn.primary', '开始学习');
  await waitFor('.card.hero');
  await sleep(800);
}
deviceShot('home');

const home = await ev(() => {
  const t = document.body.innerText;
  return {
    hero: !!document.querySelector('.card.hero'),
    pace: t.includes('天') && t.includes('考试'),
    load: t.includes('未来 7 天') || t.includes('复习负载'),
    mastery: t.includes('熟练'),
    nav: !!document.querySelector('.bottomnav'),
  };
});
console.log('home:', JSON.stringify(home));

// 进入学习
await clickSel('.card.hero .btn.primary');
await waitFor('.preview-card, .qcard');
if (await ev(() => !!document.querySelector('.preview-card'))) {
  deviceShot('preview');
  await clearPreview();
  await sleep(400);
}
await waitFor('.qcard');
deviceShot('quiz');

async function state() {
  return ev(() => {
    const q = document.querySelector('.qcard');
    if (!q) return { kind: 'none' };
    if (document.querySelector('.typing-input')) return { kind: 'typing', feedback: !!document.querySelector('.feedback') };
    const opts = [...document.querySelectorAll('.opt')].filter((o) => !o.disabled);
    if (opts.length) return { kind: 'choice', n: opts.length, feedback: !!document.querySelector('.feedback') };
    return { kind: 'unknown', text: q.innerText.slice(0, 80) };
  });
}

async function answer() {
  const s = await state();
  if (s.kind === 'choice') {
    await clickSel('.opt:not([disabled])');
    return true;
  }
  if (s.kind === 'typing') {
    await fill('.typing-input', 'あ');
    const submitted = await ev(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('提交') && !b.disabled);
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!submitted) return false;
    await sleep(400);
    return true;
  }
  return false;
}

async function next() {
  const hasNext = await ev(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (b) => /^(下一个|继续|完成)$/.test(b.innerText.trim()) && !b.disabled,
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (hasNext) {
    await sleep(450);
    return true;
  }
  return false;
}

// 第一题：作答 → 撤销 → 重答（验证撤销与队列回滚）
if ((await state()).kind !== 'none') {
  await answer();
  const undo = await ev(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('撤销') && b.offsetParent);
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (undo) {
    await sleep(500);
    const s2 = await state();
    console.log('undo:', s2.feedback ? 'FAILED(feedback still visible)' : 'ok');
    deviceShot('undo');
    await answer();
  } else {
    console.log('undo: no button');
  }
  await next();
}

const modes = new Set();
let answered = 0;
let previews = 0;
for (let i = 0; i < 24; i++) {
  if (await ev(() => !!document.querySelector('.preview-card'))) {
    previews++;
    await clearPreview();
    await sleep(300);
    continue;
  }
  const s = await state();
  if (s.kind === 'none') break;
  if (s.feedback) {
    await next();
    continue;
  }
  const kind = await ev(() => {
    if (document.querySelector('.typing-input')) return 'typing';
    if (document.querySelector('.audio-stage')) return 'audio';
    if (document.querySelector('.qprompt')) return 'cloze';
    if (document.querySelector('.qword.qzh')) return 'zh2jp';
    if (document.querySelector('.qword')) return 'jp2zh-ish';
    if (document.querySelector('.opt')) return 'choice';
    return 'unknown';
  });
  modes.add(kind);
  if (!(await answer())) break;
  answered++;
  if (kind === 'typing' && !shots.some((s) => s.endsWith('typing-feedback.png'))) {
    await sleep(700);
    deviceShot('typing-feedback');
    await sleep(300);
    const ime = adb('-e', 'shell', 'dumpsys', 'input_method');
    console.log('typing keyboard shown:', /mInputShown=true|mIsInputViewShown=true/.test(ime));
  }
  if (!(await next())) break;
}
deviceShot('after-quiz');
console.log('answered:', answered, 'previews:', previews, 'modes:', [...modes].join(','));

// 退出学习 → 结算
if (await ev(() => !!document.querySelector('.summary'))) {
  deviceShot('settlement');
} else if (await ev(() => !!document.querySelector('.qcard, .preview-card'))) {
  const exitOk = await ev(() => {
    const btn = document.querySelector('[aria-label="退出学习"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (exitOk) {
    await waitFor('.summary, .card.hero', 10000);
    await sleep(400);
    deviceShot('settlement');
    const summaryText = await ev(() => document.querySelector('.summary')?.innerText.slice(0, 120) || '');
    console.log('summary:', summaryText.replace(/\n/g, ' / '));
  }
}
if (await ev(() => !!document.querySelector('.summary'))) {
  const backHome = await ev(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.innerText.includes('返回首页'));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!backHome) await send('Page.reload', { ignoreCache: false });
  await waitFor('.card.hero');
  await sleep(600);
}
deviceShot('home-after-study');

// 词库搜索
await clickText('.navbtn', '词库');
await sleep(400);
deviceShot('wordbook');
const searchSel = 'input[placeholder*="搜索"]';
if (await ev((s) => !!document.querySelector(s), searchSel)) {
  await fill(searchSel, '駅');
  await sleep(700);
  deviceShot('wordbook-search');
  const found = await ev(() => document.body.innerText.includes('駅'));
  console.log('search 駅:', found ? 'ok' : 'not-found');
  await fill(searchSel, '');
  await sleep(300);
}

// 统计
await clickText('.navbtn', '统计');
await sleep(700);
deviceShot('stats');
console.log('stats svg:', await ev(() => document.querySelectorAll('svg').length));

// 设置 / 深色
await clickText('.navbtn', '设置');
await sleep(500);
deviceShot('settings');
const themeOk = await ev(() => {
  const field = [...document.querySelectorAll('.field')].find((f) => f.innerText.includes('深色主题'));
  const sw = field?.querySelector('.switch');
  if (!sw) return false;
  sw.click();
  return true;
});
if (themeOk) {
  await sleep(700);
  deviceShot('dark');
  console.log('theme after click:', await ev(() => document.documentElement.getAttribute('data-theme')));
  await ev(() => {
    const field = [...document.querySelectorAll('.field')].find((f) => f.innerText.includes('深色主题'));
    field?.querySelector('.switch')?.click();
  });
  await sleep(400);
}

// IndexedDB 持久化
const rows = await ev(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('kotoba-jlpt');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const count = await new Promise((res, rej) => {
    const tx = db.transaction('progress', 'readonly');
    const req = tx.objectStore('progress').count();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return count;
});
console.log('progress rows:', rows);

// 离线重载（本地资源应仍可启动）
adb('-e', 'shell', 'svc', 'wifi', 'disable');
adb('-e', 'shell', 'svc', 'data', 'disable');
await send('Page.reload', { ignoreCache: false });
await sleep(1800);
await waitFor('.app-shell, .onboard', 30000);
const offline = await ev(() => ({
  shell: !!document.querySelector('.app-shell'),
  onboarding: !!document.querySelector('.onboard'),
  nav: !!document.querySelector('.bottomnav'),
}));
deviceShot('offline-reload');
console.log('offline reload:', JSON.stringify(offline));
adb('-e', 'shell', 'svc', 'wifi', 'enable');
adb('-e', 'shell', 'svc', 'data', 'enable');

// 物理返回键：首次按应提示「再按一次」，应用不退出
if (!(await ev(() => !!document.querySelector('.app-shell')))) {
  await send('Page.reload', { ignoreCache: false });
  await waitFor('.app-shell', 30000);
}
await clickText('.navbtn', '设置');
await sleep(400);
adb('-e', 'shell', 'input', 'keyevent', '4');
await sleep(800);
const back = await ev(() => ({
  alive: !!document.querySelector('.app-shell'),
  home: !!document.querySelector('.card.hero'),
  toast: [...document.querySelectorAll('.toast')].map((t) => t.innerText).join('|'),
}));
deviceShot('after-back');
console.log('back:', JSON.stringify(back));

// 横屏
adb('-e', 'shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
adb('-e', 'shell', 'settings', 'put', 'system', 'user_rotation', '1');
await sleep(1500);
deviceShot('landscape');
console.log('landscape:', await ev(() => `${innerWidth}x${innerHeight}`));
adb('-e', 'shell', 'settings', 'put', 'system', 'user_rotation', '0');
await sleep(800);

console.log('console errors:', errors.length ? errors : 'none');
console.log('shots:', shots.length, OUT);
ws.close();
