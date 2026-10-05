#!/usr/bin/env node
// 素材抓取：卫星/地形瓦片、字体、配乐、公有领域插图
// 全部下载到 assets/ 本地缓存 —— 合成运行期零网络请求，保证确定性渲染
// 用法: node scripts/fetch-assets.mjs [--tiles|--fonts|--music|--art|--all] (默认 --all)

import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const A = (p) => path.join(ROOT, "assets", p);
const args = new Set(process.argv.slice(2));
const want = (k) => args.has("--all") || args.has("--" + k) || process.argv.length <= 2;

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 xuanzang-video/1.0";

async function fetchBuf(url, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  } finally { clearTimeout(timer); }
}

async function fetchTo(url, dest, minSize = 500) {
  if (existsSync(dest) && statSync(dest).size >= minSize) {
    console.log(`  = 已存在 ${path.relative(ROOT, dest)}`);
    return true;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const buf = await fetchBuf(url);
      if (buf.length < minSize) throw new Error(`太小 (${buf.length}B)，疑似错误页`);
      mkdirSync(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      console.log(`  + ${path.relative(ROOT, dest)} (${(buf.length / 1024).toFixed(0)}KB)`);
      return true;
    } catch (e) {
      console.log(`  ! 第${attempt}次失败: ${e.message}`);
      if (attempt === 3) return false;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
}

// ---------- Web Mercator 瓦片工具 ----------
const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

// 路线走廊（含余量）：玄奘去程+归途覆盖的长安—中亚—北印度区域
const CORRIDOR = { west: 65, east: 112, south: 23.5, north: 47 };

async function fetchTiles() {
  console.log("== 瓦片 ==");
  let ok = 0, fail = 0, missing = 0;
  for (const z of [4, 5, 6, 7]) {
    const x0 = lng2tx(CORRIDOR.west, z), x1 = lng2tx(CORRIDOR.east, z);
    const y0 = lat2ty(CORRIDOR.north, z), y1 = lat2ty(CORRIDOR.south, z);
    console.log(` z${z}: x${x0}-${x1} y${y0}-${y1} (${(x1 - x0 + 1) * (y1 - y0 + 1)} 瓦/层)`);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        // 卫星：NASA GIBS Blue Marble 晕渲地形+水深（公有领域，与原片 credits 一致）
        const satUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
        const satOk = await fetchTo(satUrl, A(`tiles/sat/${z}/${x}/${y}.jpg`), 2000);
        // 高程：AWS/Mapzen terrarium 编码 PNG（AWS Open Data）
        const demUrl = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
        const demOk = await fetchTo(demUrl, A(`tiles/dem/${z}/${x}/${y}.png`), 100);
        ok += (satOk ? 1 : 0) + (demOk ? 1 : 0);
        fail += (satOk ? 0 : 1) + (demOk ? 0 : 1);
        if (!satOk || !demOk) missing++;
        await new Promise((r) => setTimeout(r, 60)); // 温和限速
      }
    }
  }
  console.log(` 瓦片完成: ok=${ok} fail=${fail}`);
  // 瓦片清单 + 走廊元数据，供场景加载器使用
  const manifest = { corridor: CORRIDOR, zooms: [4, 5, 6, 7] };
  writeFileSync(A("tiles/manifest.json"), JSON.stringify(manifest, null, 2));
}

// ---------- 字体 ----------
async function fetchFonts() {
  console.log("== 字体 ==");
  // 马善政毛笔楷书 = Google Fonts "Ma Shan Zheng" (OFL)，标题用
  await fetchTo(
    "https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf",
    A("fonts/MaShanZheng-Regular.ttf"), 100000
  );
  // 思源宋体 CN（OFL），正文用（regular + bold）
  const shs = [
    ["https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-serif@release/SubsetOTF/CN/SourceHanSerifCN-Regular.otf", "SourceHanSerifCN-Regular.otf"],
    ["https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-serif@release/SubsetOTF/CN/SourceHanSerifCN-Bold.otf", "SourceHanSerifCN-Bold.otf"],
  ];
  for (const [url, name] of shs) {
    const ok = await fetchTo(url, A(`fonts/${name}`), 1000000);
    if (!ok) console.log(`  ! ${name} 需要备选源`);
  }
}

// ---------- 配乐 ----------
async function fetchMusic() {
  console.log("== 配乐 ==");
  // 与原片同曲：Kevin MacLeod "Eastern Thought" (CC BY 3.0, incompetech.com)
  const candidates = [
    ["https://incompetech.com/music/royalty-free/mp3-royaltyfree/Eastern%20Thought.mp3", "eastern-thought.mp3"],
    ["https://incompetech.filmmusic.io/wp-content/uploads/2024/06/Eastern-Thought.mp3", "eastern-thought.mp3"],
  ];
  let done = false;
  for (const [url, name] of candidates) {
    if (await fetchTo(url, A(`music/${name}`), 500000)) { done = true; break; }
  }
  if (!done) console.log("  ! 配乐下载失败，稍后手动处理（渲染可先无音频出片）");
}

// ---------- 公有领域插图 ----------
async function fetchArt() {
  console.log("== 插图 ==");
  // Wikimedia Commons API 搜索公有领域《西游记》/玄奘相关版画与绘画
  const searches = [
    ["art1", "Journey to the West woodblock print"],
    ["art2", "Xuanzang painting"],
    ["art3", "西游记 插图 版画"],
  ];
  for (const [tag, q] of searches) {
    const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|mime|extmetadata&iiurlwidth=900`;
    try {
      const buf = await fetchBuf(api);
      const json = JSON.parse(buf.toString());
      const pages = Object.values(json?.query?.pages ?? {});
      let i = 0;
      for (const p of pages) {
        const info = p?.imageinfo?.[0];
        if (!info || !/image\/(jpeg|png)/.test(info.mime || "")) continue;
        const license = info.extmetadata?.LicenseShortName?.value || "";
        if (!/public domain|cc.*(by|sa)|pd/i.test(license)) continue;
        const url = info.thumburl || info.url;
        const ext = info.mime.includes("png") ? "png" : "jpg";
        const ok = await fetchTo(url, A(`art/${tag}-${i}.${ext}`), 20000);
        if (ok) { i++; if (i >= 3) break; }
      }
    } catch (e) {
      console.log(`  ! 搜索 "${q}" 失败: ${e.message}`);
    }
  }
}

(async () => {
  if (want("tiles")) await fetchTiles();
  if (want("fonts")) await fetchFonts();
  if (want("music")) await fetchMusic();
  if (want("art")) await fetchArt();
  console.log("全部完成");
})();
