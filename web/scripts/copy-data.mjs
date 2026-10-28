// 把 data/processed 下的词库同步到 web/public/data，供前端静态加载。
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../data/processed');
const dest = path.resolve(here, '../public/data');

if (!existsSync(src)) {
  console.error('[copy-data] 找不到 data/processed，请先运行 python scripts/build_dataset.py');
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
const files = (await readdir(src)).filter((f) => f.endsWith('.json'));
for (const f of files) {
  await cp(path.join(src, f), path.join(dest, f));
}
console.log(`[copy-data] 已同步 ${files.length} 个词库文件 → public/data`);
