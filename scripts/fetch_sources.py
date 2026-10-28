#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fetch_sources.py — 下载构建词库所需的原始数据源。

数据源（详见 docs/04-数据来源与许可.md）：
  1. OpenJLPT  (evanclan/OpenJLPT)          JLPT N5-N1 分级词表 + 例句，CC BY-SA 4.0
  2. Japanese-Chinese-thesaurus             日→中 释义库（Unlicense 声明）

用法：
    python scripts/fetch_sources.py            # 下载全部
    python scripts/fetch_sources.py --only ojlpt
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

OJLPT_ZIP = "https://codeload.github.com/evanclan/OpenJLPT/tar.gz/refs/heads/main"
JAZH_REPO = "https://github.com/lxl66566/Japanese-Chinese-thesaurus.git"

UA = {"User-Agent": "kotoba-jlpt/1.0 (+https://github.com/Belovedarling/kotoba-jlpt)"}


def _download(url: str, dest: Path, timeout: int = 600) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"  ↓ {url}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r, open(dest, "wb") as f:
        shutil.copyfileobj(r, f)
    return dest


def fetch_openjlpt() -> None:
    """OpenJLPT 仓库较大，只取 data/json/vocab 下的五个文件。"""
    out_dir = RAW / "openjlpt" / "data" / "json" / "vocab"
    if (out_dir / "n1.json").exists():
        print("  ✓ OpenJLPT 已存在，跳过")
        return
    tmp = ROOT / ".cache" / "openjlpt.tar.gz"
    _download(OJLPT_ZIP, tmp)
    print("  … 解包")
    import tarfile

    out_dir.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tmp, mode="r:gz") as tf:
        for member in tf.getmembers():
            name = member.name
            if "/data/json/vocab/" in name and name.endswith(".json"):
                member.name = os.path.basename(name)
                tf.extract(member, out_dir)
    (RAW / "openjlpt" / "SOURCE.txt").write_text(
        f"OpenJLPT — {OJLPT_ZIP}\nLicense: CC BY-SA 4.0\n", encoding="utf-8"
    )
    tmp.unlink(missing_ok=True)


def fetch_jazh() -> None:
    out_dir = RAW / "ja-zh"
    if (out_dir / "final.json").exists():
        print("  ✓ 日中释义库已存在，跳过")
        return
    tmp = ROOT / ".cache" / "ja-zh"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True, exist_ok=True)
    print(f"  ↓ git clone {JAZH_REPO}")
    subprocess.run(
        ["git", "clone", "--depth", "1", JAZH_REPO, str(tmp)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy(tmp / "final.json", out_dir / "final.json")
    for lic in ("LICENSE",):
        if (tmp / lic).exists():
            shutil.copy(tmp / lic, out_dir / lic)
    (out_dir / "SOURCE.txt").write_text(
        f"Japanese-Chinese-thesaurus — {JAZH_REPO}\nLicense: Unlicense (upstream declaration)\n",
        encoding="utf-8",
    )
    shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["ojlpt", "ja-zh"], default=None)
    args = ap.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    print("== 数据源下载 ==")
    try:
        if args.only in (None, "ojlpt"):
            fetch_openjlpt()
        if args.only in (None, "ja-zh"):
            fetch_jazh()
    except Exception as exc:  # noqa: BLE001
        print(f"[失败] {exc}", file=sys.stderr)
        return 1
    print("== 完成 ==")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
