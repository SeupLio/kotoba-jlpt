# -*- coding: utf-8 -*-
"""生成 Android 图标与启动屏。

品牌图形：墨色底 + 朱红朝日 + 和纸色摊开的书。
形状全部由脚本自绘（不依赖字体、不引入第三方美术资产）：
  · 朝日：朱红圆，象征“日复一日的积累”
  · 书页：摊开的和纸，中间一道墨色书脊，对应“言葉 / 词汇”
几何与 web/src/components/Brand.tsx、web/public/icon.svg 完全一致。

用法：python scripts/gen_android_icons.py
依赖：Pillow
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "web" / "android" / "app" / "src" / "main" / "res"

# 品牌色
INK = (36, 34, 31, 255)          # #24221f 墨
VERMILION = (192, 57, 43, 255)   # #c0392b 朱
WASHI = (247, 244, 238, 255)     # #f7f4ee 和纸

SERIF_CANDIDATES = [
    "C:/Windows/Fonts/yumindb.ttf",
    "C:/Windows/Fonts/yumin.ttf",
    "C:/Windows/Fonts/msmincho.ttc",
    "C:/Windows/Fonts/simsun.ttc",
]
GOTHIC_CANDIDATES = [
    "C:/Windows/Fonts/YuGothB.ttc",
    "C:/Windows/Fonts/YuGothM.ttc",
    "C:/Windows/Fonts/meiryob.ttc",
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
]
CHINESE_CANDIDATES = [
    "C:/Windows/Fonts/msyhbd.ttc",
    "C:/Windows/Fonts/msyh.ttc",
    "C:/Windows/Fonts/simhei.ttf",
]


def load_font(size: int, kind: str = "gothic") -> ImageFont.FreeTypeFont:
    candidates = {
        "serif": SERIF_CANDIDATES,
        "chinese": CHINESE_CANDIDATES,
        "gothic": GOTHIC_CANDIDATES,
    }[kind]
    for p in candidates:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except Exception:  # noqa: BLE001
                continue
    raise SystemExit("未找到可用的中日文字体，无法生成启动屏文字")


def fit_font(text: str, box_w: int, box_h: int, kind: str = "gothic") -> ImageFont.FreeTypeFont:
    size = int(min(box_w, box_h))
    font = load_font(size, kind)
    probe = Image.new("RGBA", (size * 3, size * 3), (0, 0, 0, 0))
    d = ImageDraw.Draw(probe)
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    w, h = r - l, b - t
    if w == 0 or h == 0:
        return font
    scale = min(box_w / w, box_h / h)
    if abs(scale - 1.0) < 0.02:
        return font
    return load_font(max(8, int(size * scale)), kind)


def centered_text(
    canvas: Image.Image,
    text: str,
    box_w: int,
    box_h: int | None = None,
    color: tuple[int, int, int, int] = (255, 255, 255, 255),
    kind: str = "gothic",
) -> None:
    box_h = box_w if box_h is None else box_h
    font = fit_font(text, box_w, box_h, kind)
    d = ImageDraw.Draw(canvas)
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    w, h = r - l, b - t
    x = (canvas.width - w) / 2 - l
    y = (canvas.height - h) / 2 - t
    d.text((x, y), text, font=font, fill=color)


# ------------------------------------------------------------------ 图形

def _bezier(p0, p1, p2, p3, steps: int = 48):
    out = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0]
        y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]
        out.append((x, y))
    return out


def _rounded_line(d: ImageDraw.ImageDraw, a, b, width: int, fill):
    d.line([a, b], fill=fill, width=width)
    r = width / 2
    for x, y in (a, b):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def render_mark(px: int) -> Image.Image:
    """透明底上绘制完整品牌图形，坐标系固定为 512×512。"""
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = px / 512.0

    def pt(x: float, y: float):
        return (x * s, y * s)

    # 朝日
    d.ellipse([pt(150, 92), pt(362, 304)], fill=VERMILION)

    # 摊开的书：两段贝塞尔曲线构成上缘，书页底部再收回书脊
    outline = [pt(82, 258)]
    outline += [pt(x, y) for x, y in _bezier((82, 258), (154, 232), (212, 242), (256, 280))]
    outline += [pt(x, y) for x, y in _bezier((256, 280), (300, 242), (358, 232), (430, 258))]
    outline += [pt(430, 376)]
    outline += [pt(x, y) for x, y in _bezier((430, 376), (358, 350), (300, 360), (256, 398))]
    outline += [pt(x, y) for x, y in _bezier((256, 398), (212, 360), (154, 350), (82, 376))]
    d.polygon(outline, fill=WASHI)

    # 书脊
    _rounded_line(d, pt(256, 280), pt(256, 398), max(1, int(15 * s)), INK)

    # 书页上的浅墨线：单独一层，避免 alpha 被覆盖
    lines = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    ink_faint = (36, 34, 31, 56)
    for y in (306, 330, 354):
        left_end = {306: 206, 330: 196, 354: 184}[y]
        right_start = {306: 306, 330: 316, 354: 328}[y]
        _rounded_line(ld, pt(126, y), pt(left_end, y), max(1, int(7 * s)), ink_faint)
        _rounded_line(ld, pt(right_start, y), pt(386, y), max(1, int(7 * s)), ink_faint)
    img.alpha_composite(lines)
    return img


def render_tile(px: int) -> Image.Image:
    """完整应用图标：墨色圆角方块 + 品牌图形（透明角）。"""
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(px * 118 / 512)
    d.rounded_rectangle([0, 0, px - 1, px - 1], radius=radius, fill=INK)
    mark = render_mark(px)
    img.alpha_composite(mark)
    return img


def render_foreground(px: int, scale: float = 0.86) -> Image.Image:
    """自适应图标前景：透明底，图形缩进安全区。"""
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    inner = max(8, int(px * scale))
    mark = render_mark(inner)
    img.alpha_composite(mark, ((px - inner) // 2, (px - inner) // 2))
    return img


def _down(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.LANCZOS)


# ------------------------------------------------------------------ 自适应图标

def gen_foregrounds() -> None:
    """前景层：墨色背景由 XML 提供，这里只放缩进安全区的图形。"""
    for dpi, size in (("mdpi", 108), ("hdpi", 162), ("xhdpi", 216), ("xxhdpi", 324), ("xxxhdpi", 432)):
        img = _down(render_foreground(size * 4), size)
        out = RES / f"mipmap-{dpi}" / "ic_launcher_foreground.png"
        img.save(out)
        print("  fg", out.relative_to(ROOT), img.size)


def gen_legacy() -> None:
    """Android 8.0 以下：圆角方形 / 圆形完整图标。"""
    for dpi, size in (("mdpi", 48), ("hdpi", 72), ("xhdpi", 96), ("xxhdpi", 144), ("xxxhdpi", 192)):
        folder = RES / f"mipmap-{dpi}"
        folder.mkdir(parents=True, exist_ok=True)

        sq = _down(render_tile(size * 4), size)
        sq.save(folder / "ic_launcher.png")

        circle = render_tile(size * 4)
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
        circle.putalpha(mask)
        _down(circle, size).save(folder / "ic_launcher_round.png")
        print("  legacy", dpi, size)


# ------------------------------------------------------------------ 启动屏

def gen_splash(w: int, h: int) -> Image.Image:
    """和纸底 + 居中品牌图标 + 言葉 / Kotoba 字标，底部一道朱红细线。"""
    img = Image.new("RGB", (w, h), WASHI)
    unit = min(w, h)

    tile_size = int(unit * 0.26)
    word_h = int(unit * 0.15)
    sub_h = int(unit * 0.05)
    gap1 = int(unit * 0.07)
    gap2 = int(unit * 0.025)
    block_h = tile_size + gap1 + word_h + gap2 + sub_h
    top = max(int(unit * 0.05), (h - block_h) // 2)

    tile = _down(render_tile(tile_size * 4), tile_size)
    img.paste(tile, ((w - tile_size) // 2, top), tile)

    word_box = Image.new("RGBA", (w, word_h), (0, 0, 0, 0))
    centered_text(word_box, "言葉", int(unit * 0.62), int(word_h * 0.92), INK, kind="serif")
    img.paste(word_box, (0, top + tile_size + gap1), word_box)

    sub_box = Image.new("RGBA", (w, sub_h), (0, 0, 0, 0))
    centered_text(sub_box, "Kotoba · JLPT 词汇训练器", int(unit * 0.6), int(sub_h * 0.9), VERMILION, kind="chinese")
    img.paste(sub_box, (0, top + tile_size + gap1 + word_h + gap2), sub_box)

    bar_h = max(3, int(h * 0.006))
    ImageDraw.Draw(img).rectangle([0, h - bar_h, w, h], fill=VERMILION)
    return img


SPLASH_TARGETS = {
    "drawable": (480, 320),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
}


def gen_splashes() -> None:
    for folder, (w, h) in SPLASH_TARGETS.items():
        p = RES / folder / "splash.png"
        p.parent.mkdir(parents=True, exist_ok=True)
        gen_splash(w, h).save(p)
        print("  splash", folder, (w, h))


# ------------------------------------------------------------------ 资源文件

def write_background_color() -> None:
    p = RES / "values" / "ic_launcher_background.xml"
    p.write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        "<resources>\n"
        '    <color name="ic_launcher_background">#24221F</color>\n'
        "</resources>\n",
        encoding="utf-8",
    )
    print("  color -> #24221F")


def drop_unused_vector() -> None:
    """删除模板自带的绿色前景/背景矢量，避免与品牌图标混淆。"""
    for rel in ("drawable-v24/ic_launcher_foreground.xml", "drawable/ic_launcher_background.xml"):
        p = RES / rel
        if p.exists():
            p.unlink()
            print("  removed", rel)


def main() -> int:
    if not RES.exists():
        print(f"未找到 Android 资源目录：{RES}\n请先执行 npm run cap:add", file=sys.stderr)
        return 1
    print("[icons] 生成 Android 图标与启动屏")
    gen_foregrounds()
    gen_legacy()
    gen_splashes()
    write_background_color()
    drop_unused_vector()
    print("[icons] 完成")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
