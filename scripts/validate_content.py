#!/usr/bin/env python3
"""校验 data/content 下的原创语法、阅读、听力题库。

约束：
- 语法填空的 blank.s + blank.a 必须能精确还原例句；
- 选项数量、答案下标、解析与等级归属必须完整；
- 每级阅读 3 篇（短文/中文/情报检索各 1 篇）、听力 6 题（课题理解/即时应答各 3 题）。
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / "data" / "content"
LEVELS = ["n5", "n4", "n3", "n2", "n1"]

errors: list[str] = []
ids: set[str] = set()


def check_id(rid: str, where: str) -> None:
    if not rid or not isinstance(rid, str):
        errors.append(f"{where}: 缺少有效 id")
        return
    if rid in ids:
        errors.append(f"{where}: id 重复 {rid}")
    ids.add(rid)


def text(obj: dict, key: str, where: str, min_len: int = 1) -> str:
    value = obj.get(key)
    if not isinstance(value, str) or len(value.strip()) < min_len:
        errors.append(f"{where}: 字段 {key} 缺失或过短")
        return ""
    return value


def validate_grammar(path: Path, level: str) -> int:
    rows = json.loads(path.read_text(encoding="utf-8"))
    for row in rows:
        gid = row.get("id", "?")
        where = f"{path.name}:{gid}"
        check_id(gid, where)
        if row.get("level") != level.upper():
            errors.append(f"{where}: level 应为 {level.upper()}")
        for key in ("pattern", "meaning", "formation", "note"):
            text(row, key, where)
        example = row.get("example") or {}
        ja = text(example, "ja", where)
        text(example, "zh", where)
        blank = row.get("blank") or {}
        s = text(blank, "s", where)
        a = text(blank, "a", where)
        if s and a and "___" in s and s.replace("___", a) != ja:
            errors.append(f"{where}: blank 无法还原例句 -> {s.replace('___', a)!r} != {ja!r}")
        if s and "___" not in s:
            errors.append(f"{where}: blank.s 缺少占位符 ___")
        if not isinstance(row.get("tags"), list) or not row["tags"]:
            errors.append(f"{where}: tags 缺失")
    return len(rows)


def validate_reading(path: Path, level: str) -> tuple[int, int]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    kinds = [r.get("kind") for r in rows]
    for kind in ("short", "medium", "info"):
        if kinds.count(kind) < 1:
            errors.append(f"{path.name}: 缺少 {kind} 阅读")
    if len(rows) != 3:
        errors.append(f"{path.name}: 应有 3 篇阅读，实际 {len(rows)}")
    qcount = 0
    for row in rows:
        rid = row.get("id", "?")
        where = f"{path.name}:{rid}"
        check_id(rid, where)
        if row.get("level") != level.upper():
            errors.append(f"{where}: level 应为 {level.upper()}")
        if row.get("kind") not in ("short", "medium", "info"):
            errors.append(f"{where}: kind 非法的 {row.get('kind')!r}")
        text(row, "title", where)
        if len(text(row, "passage", where, 60)) == 0:
            errors.append(f"{where}: 正文过短")
        questions = row.get("questions") or []
        if not 1 <= len(questions) <= 3:
            errors.append(f"{where}: 题数应为 1–3，实际 {len(questions)}")
        for i, q in enumerate(questions):
            qw = f"{where}:q{i + 1}"
            text(q, "q", qw)
            text(q, "explain", qw)
            options = q.get("options") or []
            if len(options) != 4 or any(not str(o).strip() for o in options):
                errors.append(f"{qw}: 需要 4 个非空选项")
            answer = q.get("answer")
            if not isinstance(answer, int) or not 0 <= answer < len(options):
                errors.append(f"{qw}: answer 下标无效")
            qcount += 1
    return len(rows), qcount


def validate_listening(path: Path, level: str) -> int:
    rows = json.loads(path.read_text(encoding="utf-8"))
    types = [r.get("type") for r in rows]
    if len(rows) != 6:
        errors.append(f"{path.name}: 应有 6 道听力，实际 {len(rows)}")
    if types.count("point") != 3 or types.count("response") != 3:
        errors.append(f"{path.name}: 应为 3 道 point + 3 道 response，实际 {types}")
    for row in rows:
        lid = row.get("id", "?")
        where = f"{path.name}:{lid}"
        check_id(lid, where)
        if row.get("level") != level.upper():
            errors.append(f"{where}: level 应为 {level.upper()}")
        if row.get("type") not in ("point", "response"):
            errors.append(f"{where}: type 非法的 {row.get('type')!r}")
        text(row, "script", where, 8)
        text(row, "question", where)
        text(row, "explain", where)
        options = row.get("options") or []
        if len(options) != 4 or any(not str(o).strip() for o in options):
            errors.append(f"{where}: 需要 4 个非空选项")
        answer = row.get("answer")
        if not isinstance(answer, int) or not 0 <= answer < len(options):
            errors.append(f"{where}: answer 下标无效")
    return len(rows)


def main() -> int:
    if not CONTENT.exists():
        print(f"找不到 {CONTENT}", file=sys.stderr)
        return 1

    grammar_total = reading_total = reading_q = listening_total = 0
    print("原创内容校验")
    print("-" * 48)
    for level in LEVELS:
        g_path = CONTENT / f"grammar-{level}.json"
        r_path = CONTENT / f"reading-{level}.json"
        l_path = CONTENT / f"listening-{level}.json"
        for path in (g_path, r_path, l_path):
            if not path.exists():
                errors.append(f"缺少文件 {path.name}")
                continue
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                errors.append(f"{path.name}: JSON 解析失败 {exc}")
                continue
            if path == g_path:
                grammar_total += validate_grammar(path, level)
            elif path == r_path:
                p, q = validate_reading(path, level)
                reading_total += p
                reading_q += q
            else:
                listening_total += validate_listening(path, level)
        print(f"{level.upper()}: 语法 / 阅读 / 听力 已校验")

    print("-" * 48)
    print(f"语法点 {grammar_total} · 阅读 {reading_total} 篇/{reading_q} 题 · 听力 {listening_total} 题")
    print(f"唯一 id {len(ids)}")

    if errors:
        print(f"\n发现 {len(errors)} 个问题：", file=sys.stderr)
        for err in errors[:80]:
            print(f" - {err}", file=sys.stderr)
        return 1
    print("全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
