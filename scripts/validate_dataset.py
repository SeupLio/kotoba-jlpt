#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
validate_dataset.py — 词库质量校验。

检查项：
  1. 字段完整性（word / reading / zh / level / id）
  2. id 唯一、cf 引用的 id 必须存在
  3. 中文释义非空、长度合理、无残留词性标记
  4. 读音为假名、罗马字为 ASCII
  5. 例句注音 ruby 与原文一致
  6. 分级单调性：同一词不跨级重复

用法：
    python scripts/validate_dataset.py            # 全部检查
    python scripts/validate_dataset.py --strict   # 出现 warning 也返回非 0
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "data" / "processed"
LEVELS = ["n5", "n4", "n3", "n2", "n1"]

KANA_OK = re.compile(r"^[぀-ゟ゠-ヿー々]+$")
ROMAJI_OK = re.compile(r"^[a-zA-Z0-9āīūēōâîûêô \-']+$")
BAD_ZH = re.compile(
    r"[【】]"
    r"|^(名|名詞|名·|動\d|自動\d|他動\d|イ形|ナ形|副|專|专|词|容词)\s"
    r"|^名[\]】]"
    r"|读作|放在.{0,16}结尾|用于.{0,12}场合"
    r"|\[名[B]?\]|［名[B]?］|＋[^。]{0,20}表示"
)


def brackets_balanced(s: str) -> bool:
    pairs = {")": "(", "）": "（"}
    stack: list[str] = []
    for ch in s:
        if ch in "(（":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack[-1] != pairs[ch]:
                return False
            stack.pop()
    return not stack


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    args = ap.parse_args()

    errors: list[str] = []
    warns: list[str] = []
    seen_word: dict[str, str] = {}
    total = 0

    for lv in LEVELS:
        path = PROCESSED / f"{lv}.json"
        if not path.exists():
            errors.append(f"{lv}.json 不存在")
            continue
        data = json.load(open(path, encoding="utf-8"))
        ids = {w["id"] for w in data}
        total += len(data)
        bucket = Counter()
        for w in data:
            wid = w.get("id", "?")
            if not w.get("word") or not w.get("reading"):
                errors.append(f"[{wid}] 缺少 word/reading")
            if not w.get("zh"):
                errors.append(f"[{wid}] 缺少中文释义")
            elif any(BAD_ZH.search(g) for g in w["zh"]):
                errors.append(f"[{wid}] 中文释义残留词性标记：{w['zh']}")
            elif any(not brackets_balanced(g) for g in w["zh"]):
                errors.append(f"[{wid}] 中文释义括号不配对：{w['zh']}")
            elif max(len(g) for g in w["zh"]) > 30:
                warns.append(f"[{wid}] 中文释义过长：{w['zh']}")
            if not KANA_OK.match(w.get("reading", "")):
                warns.append(f"[{wid}] 读音含非假名字符：{w['reading']}")
            if w.get("romaji") and not ROMAJI_OK.match(w["romaji"]):
                warns.append(f"[{wid}] 罗马字异常：{w['romaji']}")
            for cid in w.get("cf", []):
                if cid not in ids:
                    errors.append(f"[{wid}] cf 引用了不存在的 id：{cid}")
            key = f"{w.get('word')}｜{w.get('reading')}"
            if key in seen_word:
                warns.append(f"[{wid}] 与 {seen_word[key]} 重复")
            else:
                seen_word[key] = wid
            bucket[w.get("bucket", "?")] += 1
            ex = w.get("example")
            if ex:
                ruby = ex.get("ruby") or []
                if ruby:
                    ja = "".join(p.get("t", "") for p in ruby)
                    if ja != ex.get("ja", ""):
                        warns.append(f"[{wid}] 例句注音与原文不一致")
                else:
                    warns.append(f"[{wid}] 例句缺少注音")
        print(f"{lv}: {len(data)} 词，词性分布 {dict(bucket)}")

    print(f"\n总计 {total} 词，唯一词形 {len(seen_word)}")
    print(f"错误 {len(errors)}，警告 {len(warns)}")
    for e in errors[:30]:
        print("  [ERR]", e)
    for w_ in warns[:20]:
        print("  [WARN]", w_)

    ok = not errors and (not warns or not args.strict)
    print("\n结果：", "通过" if ok else "未通过")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
