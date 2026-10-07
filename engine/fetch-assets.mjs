#!/usr/bin/env node
// 共享引擎 · 参数化素材下载器（全部课程共用，取代各课程散落的 fetch-*.mjs）
// 走廊/层级/近景带/配乐全部由 <course>/data/assets.json 驱动 —— 换题材只改数据不改脚本
// 用法（在课程目录下）: node ../../engine/fetch-assets.mjs [--tiles|--fonts|--music|--all]
// 已存在的文件自动跳过，可反复执行断点续传
import { mkdirSync, existsSync, writeFileSync, statSync, cpSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = path.resolve(ENGINE, "..");
const COURSE = process.cwd();
const A = (p) => path.join(COURSE, "assets", p);
const UA = "Mozilla/5.0 GeoHis-engine/1.0";
const args = new Set(process.argv.slice(2));
const want = (k) => args.has("--all") || args.has("--" + k) || process.argv.length <= 2;

const cfgPath = path.join(COURSE, "data", "assets.json");
if (!existsSync(cfgPath)) {
  console.error(`缺少 ${cfgPath}（走廊/层级/配乐参数文件）`);
  process.exit(1);
}
const CFG = JSON.parse((await import("node:fs")).readFileSync(cfgPath, "utf8"));
// { corridor:{west,east,south,north}, margin:1, zooms:[7], z8:{mode:"full"|"zones"|"none", zones:[{w,e,s,n}]}, music:"eastern-thought.mp3" }

const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const SAT = (z, x, y) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
const DEM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

let ok = 0, skip = 0, fail = 0;
async function fetchBuf(url, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(timer); }
}
async function grab(url, dest, min) {
  if (existsSync(dest) && statSync(dest).size >= min) { skip++; return true; }
  for (let a = 1; a <= 3; a++) {
    try {
      const buf = await fetchBuf(url);
      if (buf.length < min) throw new Error(`too small (${buf.length}B)`);
      mkdirSync(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok++; return true;
    } catch (e) {
      if (a === 3) { fail++; console.log("FAIL", path.relative(COURSE, dest), e.message); return false; }
      await new Promise((r) => setTimeout(r, 800 * a));
    }
  }
}

const MARGIN = CFG.margin ?? 0;
async function tiles() {
  const c = CFG.corridor;
  console.log(`== 瓦片 走廊 w${c.west} e${c.east} s${c.south} n${c.north} zooms[${CFG.zooms}] margin=${MARGIN} ==`);
  for (const z of CFG.zooms) {
    const x0 = lng2tx(c.west, z) - MARGIN, x1 = lng2tx(c.east, z) + MARGIN;
    const y0 = lat2ty(c.north, z) - MARGIN, y1 = lat2ty(c.south, z) + MARGIN;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        await grab(SAT(z, x, y), A(`tiles/sat/${z}/${x}/${y}.jpg`), 1500);
        await grab(DEM(z, x, y), A(`tiles/dem/${z}/${x}/${y}.png`), 100);
      }
    console.log(` z${z} done ok=${ok} skip=${skip} fail=${fail}`);
  }
  // z8 卫星近景带（可选；缺失时场景自动回退 z7 贴图）
  const z8 = CFG.z8 ?? { mode: "none" };
  if (z8.mode === "full") {
    const x0 = 2 * (lng2tx(c.west, 7) - MARGIN), x1 = 2 * (lng2tx(c.east, 7) + MARGIN) + 1;
    const y0 = 2 * (lat2ty(c.north, 7) - MARGIN), y1 = 2 * (lat2ty(c.south, 7) + MARGIN) + 1;
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        await grab(SAT(8, x, y), A(`tiles/sat/8/${x}/${y}.jpg`), 1500);
    console.log(` z8(full) done ok=${ok} skip=${skip} fail=${fail}`);
  } else if (z8.mode === "zones") {
    const seen = new Set();
    for (const zn of z8.zones)
      for (let x = lng2tx(zn.w, 8); x <= lng2tx(zn.e, 8); x++)
        for (let y = lat2ty(zn.n, 8); y <= lat2ty(zn.s, 8); y++) {
          const k = `${x},${y}`;
          if (seen.has(k)) continue;
          seen.add(k);
          await grab(SAT(8, x, y), A(`tiles/sat/8/${x}/${y}.jpg`), 1500);
        }
    console.log(` z8(zones) done ok=${ok} skip=${skip} fail=${fail}`);
  }
  writeFileSync(A("tiles/manifest.json"), JSON.stringify({ corridor: c, zooms: CFG.zooms }, null, 2));
}

const FONTS = [
  ["https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf", "MaShanZheng-Regular.ttf", 100000],
  ["https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-serif@release/SubsetOTF/CN/SourceHanSerifCN-Regular.otf", "SourceHanSerifCN-Regular.otf", 1000000],
  ["https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-serif@release/SubsetOTF/CN/SourceHanSerifCN-Bold.otf", "SourceHanSerifCN-Bold.otf", 1000000],
];
async function fonts() {
  console.log("== 字体 ==");
  for (const [url, name, min] of FONTS) await grab(url, A(`fonts/${name}`), min);
}

const MUSIC_URLS = {
  "eastern-thought.mp3": [
    "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Eastern%20Thought.mp3",
    "https://incompetech.filmmusic.io/wp-content/uploads/2024/06/Eastern-Thought.mp3",
  ],
  // archimedes_xhs（竖屏变体）页面引用
  "wallpaper.mp3": [
    "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3",
  ],
};
async function music() {
  const name = CFG.music || "eastern-thought.mp3";
  console.log(`== 配乐 ${name} ==`);
  for (const url of MUSIC_URLS[name] || []) {
    if (await grab(url, A(`music/${name}`), 500000)) return;
  }
  console.log("  ! 配乐下载失败（页面仍可用，无声）");
}

(async () => {
  console.log(`课程素材 → ${COURSE}`);
  if (want("tiles")) await tiles();
  if (want("fonts")) await fonts();
  if (want("music")) await music();
  // 字体就绪后同步一份到站点共享目录（首页 CSS 引用 site/shared/fonts/）
  if (want("fonts")) {
    const shared = path.join(ROOT, "site", "shared", "fonts");
    mkdirSync(shared, { recursive: true });
    for (const [, name] of FONTS) {
      const src = A(`fonts/${name}`);
      if (existsSync(src) && !existsSync(path.join(shared, name))) cpSync(src, path.join(shared, name));
    }
  }
  console.log(`完成：ok=${ok} skip=${skip} fail=${fail}`);
})();
