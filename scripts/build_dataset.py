#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_dataset.py — 构建 kotoba-jlpt 词库。

输入：
    data/raw/openjlpt/data/json/vocab/n{5,4,3,2,1}.json   （OpenJLPT, CC BY-SA 4.0）
    data/raw/ja-zh/final.json                             （日→中 释义库）
    data/overrides/zh_glosses.json                        （人工补录的中文释义）

输出：
    data/processed/n5.json … n1.json      每级词表
    data/processed/index.json             总索引
    data/processed/meta.json              统计与覆盖率
    reports/missing_zh.txt                仍缺中文释义的词（供继续补录）

用法：
    python scripts/build_dataset.py
    python scripts/build_dataset.py --no-confusable   # 跳过干扰项计算（更快）
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
OVERRIDES = ROOT / "data" / "overrides"
REPORTS = ROOT / "reports"

LEVELS = ["N5", "N4", "N3", "N2", "N1"]

# ---------------------------------------------------------------- 词性归一化
POS_ZH = {
    "n": "名词", "n-adv": "副词性名词", "n-t": "时间名词", "n-pref": "名词性前缀",
    "n-suf": "名词性后缀", "pn": "代词", "adj-no": "连体词",
    "adv": "副词", "adv-to": "副词（と）",
    "adj-i": "形容词（い）", "adj-na": "形容动词（な）", "adj-t": "タルト型形容词",
    "adj-f": "连体修饰语", "adj-kari": "カリ形容词", "adj-ku": "ク形容词",
    "adj-shiku": "シク形容词", "adj-nari": "ナリ形容词", "adj-pn": "连体词",
    "v1": "一段动词", "v1-s": "一段动词", "v5k": "五段动词", "v5g": "五段动词",
    "v5s": "五段动词", "v5t": "五段动词", "v5n": "五段动词", "v5b": "五段动词",
    "v5m": "五段动词", "v5r": "五段动词", "v5u": "五段动词", "v5k-s": "五段动词",
    "v5u-s": "五段动词", "v5aru": "五段动词", "v5r-i": "五段动词",
    "vs": "サ变动词", "vs-i": "サ变动词", "vs-s": "サ变动词", "vs-c": "サ变动词",
    "vk": "カ变动词", "vz": "ザ变动词", "v4r": "四段动词",
    "vt": "他动词", "vi": "自动词", "aux-v": "助动词", "aux": "助动词",
    "exp": "短语/惯用", "int": "感叹词", "conj": "接续词", "pref": "前缀",
    "suf": "后缀", "cop": "助动词", "cop-da": "助动词", "ctr": "量词/助数词",
    "unc": "未分类", "prt": "助词", "interj": "感叹词",
    "num": "数词", "adj-ix": "形容词（い）",
}
# 少数词条在源数据里缺少词性（或误标），按辞书与常用用法人工补齐
WORD_POS_FIX = {
    "溝|こう": ["名词"],
    "煌々と|こうこうと": ["副词"],
    "嫋か|しなやか": ["形容动词（な）"],
    "其れ共|それとも": ["接续词"],
    "中腹|ちゅうっぱら": ["名词"],
    "何々|どれどれ": ["代词"],
    "矢鱈に|やたらに": ["副词"],
    "一段と|いちだんと": ["副词"],
    "いっていらっしゃい|いっていらっしゃい": ["短语/惯用"],
    "おげんきで|おげんきで": ["短语/惯用"],
    "おまちください|おまちください": ["短语/惯用"],
    "ごぞんじですか|ごぞんじですか": ["短语/惯用"],
}
# 大类，用于干扰项分组
POS_BUCKET = {
    "名词": "N", "副词性名词": "N", "时间名词": "N", "名词性前缀": "N", "名词性后缀": "N",
    "代词": "N", "量词/助数词": "N", "数词": "N",
    "形容词（い）": "ADJ", "形容动词（な）": "ADJ", "タルト型形容词": "ADJ",
    "カリ形容词": "ADJ", "ク形容词": "ADJ", "シク形容词": "ADJ", "ナリ形容词": "ADJ",
    "连体词": "ADJ", "连体修饰语": "ADJ",
    "一段动词": "V", "五段动词": "V", "サ变动词": "V", "カ变动词": "V",
    "ザ变动词": "V", "四段动词": "V", "助动词": "V",
    "副词": "ADV", "副词（と）": "ADV",
    "短语/惯用": "EXP", "感叹词": "EXP", "接续词": "EXP", "助词": "EXP",
    "前缀": "AFFIX", "后缀": "AFFIX",
}


def pos_labels(codes: list[str]) -> list[str]:
    out: list[str] = []
    for c in codes:
        zh = POS_ZH.get(c)
        if zh and zh not in out:
            out.append(zh)
    return out or ["未分类"]


def pos_bucket(labels: list[str]) -> str:
    for lb in labels:
        b = POS_BUCKET.get(lb)
        if b:
            return b
    return "OTHER"


# ---------------------------------------------------------------- 日文工具
HIRA = re.compile(r"[ぁ-ゟ]")
KANA = re.compile(r"[ぁ-ゟ゠-ヿ]")


def norm_form(s: str) -> str:
    """归一化词形：去掉空格/波浪号/中点等噪声。"""
    return re.sub(r"[\s～~\-－・･.,、。]", "", s or "")


def strip_okuri(s: str) -> str:
    """去掉词尾送假名：食べる -> 食べ"""
    return re.sub(r"[ぁ-ゟ]+$", "", s or "")


def is_kana_only(s: str) -> bool:
    return bool(s) and all(KANA.match(ch) for ch in s)


# ---------------------------------------------------------------- 中文释义库
READING_IN_VALUE = re.compile(r"^[（(]([^）)]{1,40})[）)]")
ACCENT = re.compile(r"[⓪①②③④⑤⑥⑦⑧⑨⑩]",)
POS_BRACKET = re.compile(r"【([^】]{1,10})】")
LEAD_PAREN = re.compile(r"^[（(][^）)]*[）)]\s*")
LEAD_POS = re.compile(r"^【[^】]{1,10}】\s*")


# 无括号形式的词性标记（释义库中混用多种写法）
POS_TOKEN = (
    r"(?:名词|专有词|专|熟语|惯用语|成语|副词|形容动词|连体词|感叹词|接续词|"
    r"名·他动\d?|名·自动\d?|名·自他\d?|名·ナ形|名·イ形|"
    r"自动\d?|他动\d?|自他\d?|动\d?|名|ナ形|イ形|副|形|连体|感|接|助|代|量)"
)


def strip_dangling(s: str) -> str:
    """丢弃不配对的括号，避免出现「味道）甜的」这类残缺释义。"""
    stack: list[tuple[int, str]] = []
    drop: set[int] = set()
    for i, ch in enumerate(s):
        if ch in "（(":
            stack.append((i, ch))
        elif ch in "）)":
            want = "（" if ch == "）" else "("
            if stack and stack[-1][1] == want:
                stack.pop()
            else:
                drop.add(i)
    for i, _ in stack:
        drop.add(i)
    return "".join(ch for i, ch in enumerate(s) if i not in drop)


def clean_zh(raw: str) -> str:
    """把释义库里的原始串清洗成纯中文释义。"""
    s = raw.replace("\n", " ").strip()
    s = ACCENT.sub("", s)                       # 音调符号 ①②⓪…
    s = LEAD_PAREN.sub("", s)                   # 开头的（假名读音）
    # 残留的 【词性】 / 词性】 之类前缀
    if "】" in s[:16]:
        s = s[s[:16].rfind("】") + 1:]
    s = re.sub(r"^[【\[][^】\]]{0,12}[】\]]?\s*", "", s)
    # 字符类排除括号：括号是释义的一部分（如「（味道）甜的」），不能被当作前缀吞掉
    s = re.sub(r"^\s*" + POS_TOKEN + r"[^\u4e00-\u9fff（）()]*", "", s, count=1)
    s = re.sub(r"^[^\u4e00-\u9fff（）()]{1,3}(?=[\u4e00-\u9fff])", "", s, count=1)
    # 词性标记被截断后残留的前缀：容词 / 词 / 名]
    s = re.sub(r"^(?:容词|形容词|形容动词|名词|动词|副词|连体词|接续词|感叹词|词)\s+", "", s)
    s = re.sub(r"^名[\]】]\s*", "", s)
    s = re.sub(r"[；;]\s*$", "", s)
    s = re.sub(r"\s{2,}", " ", s)
    s = strip_dangling(s)
    return s.strip(" 　;；,、")


def unwrap_outer(s: str) -> str:
    """只去掉「整段被括号包住」的外壳，保留「（味道）甜的」这类语境限定。"""
    pairs = {"（": "）", "(": ")", "【": "】", "[": "]"}
    s = s.strip(" 　;；,、")
    while len(s) >= 2 and s[0] in pairs and s[-1] == pairs[s[0]]:
        op = s[0]
        close = pairs[op]
        depth = 0
        matched_at = -1
        for i, ch in enumerate(s):
            if ch == op:
                depth += 1
            elif ch == close:
                depth -= 1
                if depth == 0:
                    matched_at = i
                    break
        if matched_at != len(s) - 1:
            break
        s = s[1:-1].strip(" 　;；,、")
    return s


def split_zh(s: str) -> list[str]:
    """把一个释义串切成若干条短义项；括号内的分隔符不切。"""
    if not s:
        return []
    pairs = {"（": "）", "(": ")", "【": "】", "[": "]"}
    parts: list[str] = []
    buf: list[str] = []
    stack: list[str] = []
    for ch in s:
        if ch in pairs:
            stack.append(pairs[ch])
        elif stack and ch == stack[-1]:
            stack.pop()
        if ch in "；;，,/／" and not stack:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))

    out: list[str] = []
    for p in parts:
        p = unwrap_outer(p)
        if not p:
            continue
        if len(p) > 30:  # 过长通常是语法说明，截断
            p = p[:30] + "…"
        if p not in out:
            out.append(p)
        if len(out) >= 6:
            break
    return out or ([s[:30]] if s else [])


KANJI_RE = re.compile(r"[一-鿿々〆]")


def kanji_set(s: str) -> set[str]:
    return set(KANJI_RE.findall(s or ""))


class ZhDict:
    """日→中 释义索引：按词形 + 按读音两种键。"""

    def __init__(self, path: Path):
        self.raw: dict[str, str] = json.load(open(path, encoding="utf-8"))
        self.by_form: dict[str, list[tuple[str, str]]] = defaultdict(list)
        self.by_reading: dict[str, list[tuple[str, str]]] = defaultdict(list)
        for k, v in self.raw.items():
            fk = norm_form(k)
            self.by_form[fk].append((k, v))
            m = READING_IN_VALUE.match(v.strip())
            if m:
                self.by_reading[norm_form(m.group(1))].append((k, v))
            # 词形本身是纯假名时，也当作读音键
            if is_kana_only(fk):
                self.by_reading[fk].append((k, v))

    @staticmethod
    def _kanji_ok(word: str, key: str) -> bool:
        """拒绝同音误配：衛星≠衛生、課程≠過程、運≠うん。

        只允许完全相同的汉字集合，或「子供 / 子ども」这类仅差一个字的写法变体。
        假名词条本身没有汉字，仍可按读音匹配。
        """
        kw, kk = kanji_set(word), kanji_set(key)
        if not kw:
            return True
        if not kk:
            return False
        if kw == kk:
            return True
        return (kw <= kk or kk <= kw) and len(kw ^ kk) <= 1

    def lookup(self, word: str, reading: str) -> tuple[list[str], str]:
        f = norm_form(word)
        r = norm_form(reading)
        for key in (f, strip_okuri(f)):
            if key and key in self.by_form:
                cands = [c for c in self.by_form[key] if self._kanji_ok(word, c[0])]
                for _, v in sorted(cands, key=lambda c: len(c[1])):
                    got = split_zh(clean_zh(v))
                    if got:
                        return got, "dict:form"
        if r and r in self.by_reading:
            cands = [c for c in self.by_reading[r] if self._kanji_ok(word, c[0])]
            for _, v in sorted(cands, key=lambda c: len(c[1])):
                got = split_zh(clean_zh(v))
                if got:
                    return got, "dict:reading"
        return [], ""


# ---------------------------------------------------------------- 例句
def pick_examples(items: list[dict], limit: int = 2) -> list[dict]:
    """优先短句、带假名注音的例句。"""
    def score(e: dict) -> tuple[int, int]:
        ja = e.get("ja", "")
        return (0 if e.get("furigana") else 1, len(ja))

    ranked = sorted(items, key=score)
    out = []
    for e in ranked[:limit]:
        out.append({
            "ja": e.get("ja", ""),
            "furigana": e.get("furigana", ""),
            "en": e.get("en", ""),
        })
    return out


FURIGANA_RE = re.compile(r"\{([^{}|]+)\|([^{}]+)\}")


def furigana_to_ruby(furi: str) -> list[dict]:
    """{漢|かん} 形式 -> [{t:'漢', r:'かん'}]，供前端渲染注音。"""
    out: list[dict] = []
    pos = 0
    for m in FURIGANA_RE.finditer(furi or ""):
        if m.start() > pos:
            out.append({"t": furi[pos:m.start()]})
        out.append({"t": m.group(1), "r": m.group(2)})
        pos = m.end()
    if pos < len(furi or ""):
        out.append({"t": furi[pos:]})
    return out


# ---------------------------------------------------------------- 干扰项
def char_set(s: str) -> set[str]:
    return set(s or "")


def similarity(a: dict, b: dict) -> float:
    """形近 / 音近 / 同性 综合相似度，取值 0~1。"""
    sa, sb = char_set(a["word"]), char_set(b["word"])
    jw = len(sa & sb) / len(sa | sb) if (sa | sb) else 0.0
    ra, rb = char_set(a["reading"]), char_set(b["reading"])
    jr = len(ra & rb) / len(ra | rb) if (ra | rb) else 0.0
    la, lb = len(a["reading"]), len(b["reading"])
    lp = 1.0 - abs(la - lb) / max(8, max(la, lb))
    same_pos = 1.0 if a["bucket"] == b["bucket"] else 0.0
    # 同音/同首字额外加权
    same_head = 1.0 if (a["word"] and b["word"] and a["word"][0] == b["word"][0]) else 0.0
    return 0.36 * jw + 0.30 * jr + 0.12 * lp + 0.14 * same_pos + 0.08 * same_head


def build_confusables(words: list[dict], top_k: int = 10) -> None:
    """为同级每个词预计算 top_k 个易混淆词 id（用于生成高质量干扰项）。"""
    buckets: dict[str, list[dict]] = defaultdict(list)
    for w in words:
        buckets[w["bucket"]].append(w)
    for w in words:
        w["_cf"] = []
    for bucket, group in buckets.items():
        n = len(group)
        if n < 2:
            continue
        for i in range(n):
            a = group[i]
            scored: list[tuple[float, str]] = []
            for j in range(n):
                if i == j:
                    continue
                b = group[j]
                if abs(len(a["reading"]) - len(b["reading"])) > 5:
                    continue
                s = similarity(a, b)
                if s > 0.18:
                    scored.append((s, b["id"]))
            scored.sort(reverse=True)
            a["_cf"] = [cid for _, cid in scored[:top_k]]
    # 同级的纯随机备用池，保证任何词都能凑够干扰项
    all_ids = [w["id"] for w in words]


# ---------------------------------------------------------------- 主流程
def build(level: str, zh: ZhDict, overrides: dict, confusable: bool) -> tuple[list[dict], list[str]]:
    src = RAW / "openjlpt" / "data" / "json" / "vocab" / f"{level.lower()}.json"
    data = json.load(open(src, encoding="utf-8"))
    out: list[dict] = []
    missing: list[str] = []

    for idx, item in enumerate(data, start=1):
        word = (item.get("word") or "").strip()
        reading = (item.get("reading") or "").strip()
        if not word or not reading:
            continue
        codes = item.get("pos") or []
        labels = pos_labels(list(codes))
        fix = WORD_POS_FIX.get(f"{word}|{reading}") or WORD_POS_FIX.get(word)
        if fix:
            labels = fix
        bucket = pos_bucket(labels)

        okey = f"{word}|{reading}"
        zh_list: list[str] = []
        zh_src = ""
        if okey in overrides:
            zh_list = [x for x in overrides[okey] if x]
            zh_src = "override"
        elif word in overrides:
            zh_list = [x for x in overrides[word] if x]
            zh_src = "override"
        if not zh_list:
            zh_list, zh_src = zh.lookup(word, reading)
        if not zh_list:
            missing.append(okey + "\t" + "; ".join(item.get("meanings", [])))

        examples = pick_examples(item.get("examples") or [])
        ex0 = examples[0] if examples else None

        out.append({
            "id": f"{level.lower()}-{idx:04d}",
            "level": level,
            "word": word,
            "reading": reading,
            "romaji": item.get("romaji", ""),
            "pos": labels,
            "bucket": bucket,
            "zh": zh_list,
            "en": [m for m in (item.get("meanings") or [])][:4],
            "zhSrc": zh_src or "none",
            "jmdictId": item.get("jmdict_id"),
            "example": ({
                "ja": ex0["ja"],
                "ruby": furigana_to_ruby(ex0.get("furigana", "")),
                "en": ex0["en"],
            } if ex0 else None),
            "order": idx,
        })

    if confusable:
        t0 = time.time()
        build_confusables(out)
        print(f"  · {level} 干扰项计算 {time.time() - t0:.1f}s")
    else:
        for w in out:
            w["_cf"] = []

    for w in out:
        w["cf"] = w.pop("_cf")
    return out, missing


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-confusable", action="store_true")
    args = ap.parse_args()

    t_start = time.time()
    PROCESSED.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)

    zh_path = RAW / "ja-zh" / "final.json"
    if not zh_path.exists():
        print("缺少 data/raw/ja-zh/final.json，请先运行 scripts/fetch_sources.py", file=sys.stderr)
        return 1
    zh = ZhDict(zh_path)

    overrides = {}
    for ov_path in sorted(OVERRIDES.glob("zh_glosses*.json")):
        overrides.update(json.load(open(ov_path, encoding="utf-8")))
    print(f"人工补充释义 {len(overrides)} 条（来自 {len(list(OVERRIDES.glob('zh_glosses*.json')))} 个文件）")

    index = {"levels": [], "generatedAt": datetime.now(timezone.utc).isoformat()}
    all_missing: list[str] = []
    stats = {}

    for level in LEVELS:
        print(f"== {level} ==")
        words, missing = build(level, zh, overrides, confusable=not args.no_confusable)
        (PROCESSED / f"{level.lower()}.json").write_text(
            json.dumps(words, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
        )
        total = len(words)
        with_zh = sum(1 for w in words if w["zh"])
        src_counter = Counter(w["zhSrc"] for w in words)
        index["levels"].append({
            "level": level,
            "count": total,
            "withZh": with_zh,
            "file": f"{level.lower()}.json",
        })
        stats[level] = {
            "count": total,
            "withZh": with_zh,
            "coverage": round(100 * with_zh / max(1, total), 2),
            "sources": dict(src_counter),
        }
        print(f"  {total} 词，中文覆盖 {with_zh}（{stats[level]['coverage']}%）")
        all_missing += [f"[{level}] {m}" for m in missing]

    (PROCESSED / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    meta = {
        "generatedAt": index["generatedAt"],
        "levels": stats,
        "total": sum(v["count"] for v in stats.values()),
        "totalWithZh": sum(v["withZh"] for v in stats.values()),
        "sources": {
            "openjlpt": "evanclan/OpenJLPT (CC BY-SA 4.0)",
            "ja-zh": "lxl66566/Japanese-Chinese-thesaurus (Unlicense)",
            "overrides": "kotoba-jlpt 人工补录 (CC0)",
        },
        "buildSeconds": round(time.time() - t_start, 1),
    }
    meta["coverage"] = round(100 * meta["totalWithZh"] / max(1, meta["total"]), 2)
    (PROCESSED / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (REPORTS / "missing_zh.txt").write_text("\n".join(all_missing), encoding="utf-8")
    print(f"\n总计 {meta['total']} 词，中文覆盖 {meta['coverage']}%，"
          f"缺 {len(all_missing)} 条 → reports/missing_zh.txt")
    print(f"耗时 {meta['buildSeconds']}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
