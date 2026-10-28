# -*- coding: utf-8 -*-
"""通过 GitHub Git Data API 推送提交（当 git 协议/SSH 通道不可用时的兜底方案）。

用法：
    python scripts/push_via_api.py <owner/repo> <branch> [commit-ish]

commit-ish 用于取提交信息，默认 HEAD。
令牌从 git credential（host=github.com）读取，不落盘、不打印。
"""
from __future__ import annotations

import base64
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
API = "https://api.github.com"


def get_token() -> str:
    out = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("未能从 git credential 获取令牌")


def tracked_files() -> list[tuple[str, str, str]]:
    """以 git 索引为准，保证与 .gitignore 的取舍完全一致。

    返回 (路径, blob SHA, 模式)；上传内容直接取自索引 blob，避免工作区的
    CRLF 行尾混入远端仓库。
    """
    out = subprocess.run(
        ["git", "ls-files", "-s"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    items: list[tuple[str, str, str]] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        meta, path = line.split("\t", 1)
        mode, sha, _stage = meta.split()
        items.append((path, sha, mode))
    return items


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    repo = sys.argv[1]                      # owner/name
    branch = sys.argv[2] if len(sys.argv) > 2 else "main"

    token = get_token()
    s = requests.Session()
    s.headers.update(
        {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
    )

    files = tracked_files()
    # GitHub 要求令牌带 `workflow` 权限才允许写入 .github/workflows/*，
    # 缺失时表现为 404。这类文件跳过并在最后提示，不影响其余内容推送。
    skipped = [f for f in files if f[0].startswith(".github/workflows/")]
    files = [f for f in files if not f[0].startswith(".github/workflows/")]
    print(f"[1/5] 待上传 {len(files)} 个文件（跳过 {len(skipped)} 个需 workflow 权限的文件）")

    # GitHub 不允许在完全空的仓库上创建 blob，先写一个占位文件让仓库非空；
    # 随后用 force 更新分支指向真正的首个提交，占位提交会成为孤儿，历史保持干净。
    probe = s.post(f"{API}/repos/{repo}/git/blobs", json={"content": "eA==", "encoding": "base64"}, timeout=30)
    if probe.status_code == 409:
        print("[0/5] 仓库为空，先创建占位提交")
        s.put(
            f"{API}/repos/{repo}/contents/.gitkeep",
            json={"message": "chore: bootstrap repository", "content": ""},
            timeout=30,
        ).raise_for_status()

    def make_blob(item):
        path, sha, mode = item
        data = subprocess.run(
            ["git", "cat-file", "blob", sha],
            cwd=ROOT,
            capture_output=True,
            check=True,
        ).stdout
        r = s.post(f"{API}/repos/{repo}/git/blobs", json={
            "content": base64.b64encode(data).decode(),
            "encoding": "base64",
        }, timeout=60)
        r.raise_for_status()
        return path, r.json()["sha"], mode, len(data)

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(make_blob, files))
    total = sum(r[3] for r in results)
    print(f"[2/4] 已创建 blob，合计 {total/1024/1024:.1f} MB")

    tree = [
        {
            "path": path,
            "mode": "100755" if mode == "100755" else "100644",
            "type": "blob",
            "sha": sha,
        }
        for path, sha, mode, _ in results
    ]
    r = s.post(f"{API}/repos/{repo}/git/trees", json={"tree": tree}, timeout=120)
    if r.status_code >= 400:
        print("tree 错误:", r.status_code, r.text[:600])
        print("样例条目:", json.dumps(tree[:2], ensure_ascii=False))
    r.raise_for_status()
    tree_sha = r.json()["sha"]
    print(f"[3/4] 创建 tree {tree_sha}")

    msg_ref = sys.argv[3] if len(sys.argv) > 3 else "HEAD"
    msg = subprocess.run(
        ["git", "log", "-1", "--pretty=%B", msg_ref],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    ).stdout.strip()
    r = s.post(
        f"{API}/repos/{repo}/git/commits",
        json={"message": msg, "tree": tree_sha, "parents": []},
        timeout=60,
    )
    r.raise_for_status()
    commit_sha = r.json()["sha"]
    print(f"[4/4] 创建 commit {commit_sha}")

    # 首次推送：创建分支引用
    r = s.post(
        f"{API}/repos/{repo}/git/refs",
        json={"ref": f"refs/heads/{branch}", "sha": commit_sha},
        timeout=60,
    )
    if r.status_code == 422:
        r = s.patch(
            f"{API}/repos/{repo}/git/refs/heads/{branch}",
            json={"sha": commit_sha, "force": True},
            timeout=60,
        )
    r.raise_for_status()
    print(f"完成：https://github.com/{repo}/tree/{branch}")
    if skipped:
        print("\n以下文件因令牌缺少 workflow 权限未上传，请在本地执行 git push 补上：")
        for path, *_ in skipped:
            print("  -", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
