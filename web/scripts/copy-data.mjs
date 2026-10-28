// 把 data/processed 的词库与 data/content 的原创语法/阅读/听力同步到 web/public/data。
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../data/processed');
const contentSrc = path.resolve(here, '../../data/content');
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

let contentCount = 0;
if (existsSync(contentSrc)) {
  const contentDest = path.join(dest, 'content');
  await mkdir(contentDest, { recursive: true });
  const contentFiles = (await readdir(contentSrc)).filter((f) => f.endsWith('.json'));
  for (const f of contentFiles) {
    await cp(path.join(contentSrc, f), path.join(contentDest, f));
  }
  contentCount = contentFiles.length;
}

console.log(`[copy-data] 已同步 ${files.length} 个词库文件 + ${contentCount} 个原创内容文件 → public/data`);
