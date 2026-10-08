#!/usr/bin/env python
# 字体子集化：思源宋体（12MB×2）与马善政楷书（5.9MB）→ 仅保留实际用字 + GB2312 一级常用字
# 产物同名覆盖（保持 otf/ttf 格式与文件名），页面 @font-face 零改动；6 课 + site/shared 共 7 处
# 用法: python scripts/subset-fonts.py   （幂等，可重复执行）
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ["MaShanZheng-Regular.ttf", "SourceHanSerifCN-Regular.otf", "SourceHanSerifCN-Bold.otf"]
COURSES = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo", "archimedes_xhs"]

# ---------- 收集字符集 ----------
gb2312_chars = set()

# GB2312 一级常用字（3755 字，区位 16-55 区）——正文字体兜底
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            gb2312_chars.update(bytes([hi, lo]).decode("gb2312"))
        except UnicodeDecodeError:
            pass

# ---------- 字符集分档 ----------
# 标题字体（马善政楷书）只用于标题/大字：内容字符即可，不必全常用字库
content_chars = set()
for c in COURSES:
    p = ROOT / c / "data" / "stations.json"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        content_chars.update(json.dumps(d, ensure_ascii=False))
for c in COURSES + ["site"]:
    for f in list((ROOT / c).glob("*.html")):
        content_chars.update(f.read_text(encoding="utf-8"))
for f in [ROOT / "engine" / "app.js", ROOT / "engine" / "interactive.js",
          ROOT / "archimedes" / "app.js", ROOT / "archimedes" / "interactive.js",
          ROOT / "archimedes_xhs" / "app.js"]:
    if f.exists():
        content_chars.update(f.read_text(encoding="utf-8"))
content_chars.update(chr(i) for i in range(0x20, 0x7F))
content_chars.update("，。、；：？！「」『』（）《》〈〉·—…－％℃°′″ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩπ")

chars = content_chars | set(gb2312_chars)  # 正文字体（思源宋体）：内容 + 常用 3755 字
title_chars = content_chars                # 标题字体（马善政）：内容字符

charfile = ROOT / "scripts" / ".subset-chars.txt"
charfile.write_text("".join(sorted(chars)), encoding="utf-8")
titlefile = ROOT / "scripts" / ".subset-title-chars.txt"
titlefile.write_text("".join(sorted(title_chars)), encoding="utf-8")
print(f"字符集: 正文 {len(chars)} / 标题 {len(title_chars)} 个字符")

# ---------- 逐字体子集化 ----------
SRC = ROOT / "xuanzang" / "assets" / "fonts"
if not (SRC / FONTS[0]).exists():
    sys.exit(f"缺源字体 {SRC}（先跑 node scripts/fetch-all.mjs）")

targets = [ROOT / c / "assets" / "fonts" for c in COURSES]
targets.append(ROOT / "site" / "shared" / "fonts")

for name in FONTS:
    src = SRC / name
    out = ROOT / "scripts" / f".subset-{name}"
    before = src.stat().st_size
    charset = titlefile if name.startswith("MaShanZheng") else charfile
    subprocess.run([
        sys.executable, "-m", "fontTools.subset", str(src),
        f"--text-file={charset}",
        f"--output-file={out}",
        "--desubroutinize",      # CFF 瘦身
        "--drop-tables+=FFTM",
        "--name-IDs=*",
        "--notdef-outline",
    ], check=True)
    after = out.stat().st_size
    print(f"{name}: {before/1048576:.1f}MB → {after/1048576:.2f}MB")
    for d in targets:
        d.mkdir(parents=True, exist_ok=True)
        (d / name).write_bytes(out.read_bytes())
print("已分发到 6 门课程 + site/shared/fonts")
