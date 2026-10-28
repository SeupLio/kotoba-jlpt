# -*- coding: utf-8 -*-
"""生成 PWA / 浏览器图标：icon-192/512、maskable 版本与 icon.svg。

图形与 Android 自适应图标、应用内 Logo 组件共用同一套几何：
墨色圆角方块 + 朱红朝日 + 和纸色摊开的书。
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

from gen_android_icons import INK, render_mark, render_tile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "web" / "public"

ICON_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="言葉 Kotoba">
  <title>言葉 Kotoba</title>
  <rect width="512" height="512" rx="118" fill="#24221f"/>
  <circle cx="256" cy="198" r="106" fill="#c0392b"/>
  <path d="M82 258 C154 232 212 242 256 280 C300 242 358 232 430 258 L430 376 C358 350 300 360 256 398 C212 360 154 350 82 376 Z" fill="#f7f4ee"/>
  <path d="M256 280 V398" stroke="#24221f" stroke-width="15" stroke-linecap="round"/>
  <g stroke="#24221f" stroke-width="7" stroke-linecap="round" opacity=".22">
    <path d="M126 306 H206"/>
    <path d="M126 330 H196"/>
    <path d="M126 354 H184"/>
    <path d="M306 306 H386"/>
    <path d="M316 330 H386"/>
    <path d="M328 354 H386"/>
  </g>
</svg>
"""


def main() -> int:
    if not PUBLIC.exists():
        print(f"未找到 web/public 目录：{PUBLIC}")
        return 1

    for size in (192, 512):
        img = render_tile(size * 4).resize((size, size), Image.LANCZOS)
        out = PUBLIC / f"icon-{size}.png"
        img.save(out)
        print("  ", out.relative_to(ROOT), img.size)

    # maskable：满色背景 + 标志缩到中心 78%，避开系统圆形/圆角裁切
    for size in (192, 512):
        img = Image.new("RGBA", (size * 4, size * 4), INK)
        inner = int(size * 4 * 0.78)
        mark = render_mark(inner)
        img.alpha_composite(mark, ((size * 4 - inner) // 2, (size * 4 - inner) // 2))
        out = PUBLIC / f"icon-maskable-{size}.png"
        img.resize((size, size), Image.LANCZOS).save(out)
        print("  ", out.relative_to(ROOT), (size, size))

    (PUBLIC / "icon.svg").write_text(ICON_SVG, encoding="utf-8")
    print("   icon.svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
