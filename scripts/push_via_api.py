# -*- coding: utf-8 -*-
"""通过 GitHub Git Data API 在远端分支之上追加一次提交。

用法：
    python scripts/push_via_api.py <owner/repo> <branch> [commit-ish]

行为：
- 以远端分支当前 HEAD 为父提交，使用 base_tree 叠加本地已跟踪文件；
- 远端独有的文件（例如网页端提交的 `.github/workflows/ci.yml`）会被保留；
- 令牌缺少 workflow 权限时跳过 `.github/workflows/*`，不会删除远端 workflow；
- 令牌从 git credential（host=github.com）读取，不落盘、不打印。

适用于 git push 因令牌缺 workflow 权限被整次拒绝的情况。
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
WORKFLOW_PREFIX = ".github/workflows/"


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


def remote_head(s: requests.Session, repo: str, branch: str) -> tuple[str | None, str | None]:
    r = s.get(f"{API}/repos/{repo}/git/ref/heads/{branch}", timeout=30)
    if r.status_code == 404:
        return None, None
    r.raise_for_status()
    commit_sha = r.json()["object"]["sha"]
    c = s.get(f"{API}/repos/{repo}/git/commits/{commit_sha}", timeout=30)
    c.raise_for_status()
    return commit_sha, c.json()["tree"]["sha"]


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
    # 缺失时表现为 404。这里跳过本地 workflow 文件，并让 base_tree 保留远端版本。
    skipped = [f for f in files if f[0].startswith(WORKFLOW_PREFIX)]
    files = [f for f in files if not f[0].startswith(WORKFLOW_PREFIX)]
    print(f"[1/5] 待上传 {len(files)} 个文件（跳过 {len(skipped)} 个需 workflow 权限的文件）")

    parent, base_tree = remote_head(s, repo, branch)
    if parent:
        print(f"[2/5] 远端 {branch} 当前 HEAD {parent[:12]}，将在其之上提交")
    else:
        print(f"[2/5] 远端 {branch} 不存在，将创建首个提交")
        # 空仓库不能直接建 tree 之外的东西；先写占位文件让仓库非空。
        probe = s.post(f"{API}/repos/{repo}/git/blobs", json={"content": "eA==", "encoding": "base64"}, timeout=30)
        if probe.status_code == 409:
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
    print(f"[3/5] 已创建 blob，合计 {total/1024/1024:.1f} MB")

    tree_entries = [
        {
            "path": path,
            "mode": "100755" if mode == "100755" else "100644",
            "type": "blob",
            "sha": sha,
        }
        for path, sha, mode, _ in results
    ]
    tree_payload: dict = {"tree": tree_entries}
    if base_tree:
        tree_payload["base_tree"] = base_tree
    r = s.post(f"{API}/repos/{repo}/git/trees", json=tree_payload, timeout=120)
    if r.status_code >= 400:
        print("tree 错误:", r.status_code, r.text[:600])
    r.raise_for_status()
    tree_sha = r.json()["sha"]
    print(f"[4/5] 创建 tree {tree_sha}")

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
    commit_payload: dict = {"message": msg, "tree": tree_sha}
    if parent:
        commit_payload["parents"] = [parent]
    r = s.post(f"{API}/repos/{repo}/git/commits", json=commit_payload, timeout=60)
    r.raise_for_status()
    commit_sha = r.json()["sha"]
    print(f"[5/5] 创建 commit {commit_sha}")

    if parent:
        r = s.patch(
            f"{API}/repos/{repo}/git/refs/heads/{branch}",
            json={"sha": commit_sha, "force": False},
            timeout=60,
        )
    else:
        r = s.post(
            f"{API}/repos/{repo}/git/refs",
            json={"ref": f"refs/heads/{branch}", "sha": commit_sha},
            timeout=60,
        )
    r.raise_for_status()
    print(f"完成：https://github.com/{repo}/tree/{branch}")
    if skipped:
        print("\n以下文件因令牌缺少 workflow 权限未上传（远端原文件保持不变）：")
        for path, *_ in skipped:
            print("  -", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
