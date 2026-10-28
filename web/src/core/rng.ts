/** 可复现随机数与洗牌工具（保证"打乱顺序"可测试、可复现） */

/** mulberry32：小而快的确定性 PRNG */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** Fisher-Yates 洗牌（原地） */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 加权随机取 n 个不重复元素 */
export function sampleWeighted<T>(items: T[], weights: number[], n: number, rng: () => number = Math.random): T[] {
  const pool = items.map((it, i) => ({ it, w: Math.max(0, weights[i] ?? 0) }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    if (total <= 0) break;
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) {
        idx = i;
        break;
      }
      idx = i;
    }
    out.push(pool[idx].it);
    pool.splice(idx, 1);
  }
  return out;
}

/** 从数组中随机取 n 个不重复元素 */
export function sampleN<T>(items: T[], n: number, rng: () => number = Math.random): T[] {
  return shuffle(items, rng).slice(0, Math.min(n, items.length));
}
