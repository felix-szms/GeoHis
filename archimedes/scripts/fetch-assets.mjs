#!/usr/bin/env node
// 阿基米德项目素材抓取：地中海瓦片（NASA/AWS）、Gymnopedie No.1 配乐、公有领域插图
// 全部落地本地缓存，渲染期零网络请求
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const A = (p) => path.join(ROOT, "assets", p);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 archimedes-video/1.0";

async function fetchTo(url, dest, minSize = 500, tries = 3) {
  if (existsSync(dest) && statSync(dest).size >= minSize) {
    console.log(`  = 已存在 ${path.relative(ROOT, dest)}`);
    return true;
  }
  for (let a = 1; a <= tries; a++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < minSize) throw new Error(`too small ${buf.length}B`);
      mkdirSync(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      console.log(`  + ${path.relative(ROOT, dest)} (${(buf.length / 1024).toFixed(0)}KB)`);
      return true;
    } catch (e) {
      console.log(`  ! ${a}次失败: ${e.message}`);
      if (a === tries) return false;
      await new Promise((r) => setTimeout(r, 1000 * a));
    }
  }
}

const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

const CORRIDOR = { west: 9, east: 37, south: 26.5, north: 43.5 };

async function tiles() {
  console.log("== 瓦片（地中海）==");
  let fail = 0, ok = 0;
  for (const z of [6, 7]) {
    const x0 = lng2tx(CORRIDOR.west, z) - 1, x1 = lng2tx(CORRIDOR.east, z) + 1;
    const y0 = lat2ty(CORRIDOR.north, z) - 1, y1 = lat2ty(CORRIDOR.south, z) + 1;
    console.log(` z${z}: x${x0}-${x1} y${y0}-${y1} (${(x1 - x0 + 1) * (y1 - y0 + 1)} 瓦/层)`);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const sat = await fetchTo(
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
          A(`tiles/sat/${z}/${x}/${y}.jpg`), 1500);
        const dem = await fetchTo(
          `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
          A(`tiles/dem/${z}/${x}/${y}.png`), 100);
        ok += (sat ? 1 : 0) + (dem ? 1 : 0);
        fail += (sat ? 0 : 1) + (dem ? 0 : 1);
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }
  // z8 卫星贴图（近景清晰度）
  // z8 范围直接从 z7 边界推导，保证场景 z8 子瓦片请求全覆盖
  const z = 8;
  const x0 = 2 * (lng2tx(CORRIDOR.west, 7) - 1), x1 = 2 * (lng2tx(CORRIDOR.east, 7) + 1) + 1;
  const y0 = 2 * (lat2ty(CORRIDOR.north, 7) - 1), y1 = 2 * (lat2ty(CORRIDOR.south, 7) + 1) + 1;
  console.log(` z8 sat: x${x0}-${x1} y${y0}-${y1} (${(x1 - x0 + 1) * (y1 - y0 + 1)} 瓦)`);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const sat = await fetchTo(
        `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
        A(`tiles/sat/${z}/${x}/${y}.jpg`), 1500);
      ok += sat ? 1 : 0; fail += sat ? 0 : 1;
      await new Promise((r) => setTimeout(r, 40));
    }
  }
  console.log(` 瓦片完成 ok=${ok} fail=${fail}`);
  writeFileSync(A("tiles/manifest.json"), JSON.stringify({ corridor: CORRIDOR, zooms: [6, 7] }, null, 2));
}

async function music() {
  console.log("== 配乐 ==");
  // Gymnopedie No. 1 (Satie) — Kevin MacLeod, CC BY 3.0, incompetech
  const url = "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Gymnopedie%20No%201.mp3";
  const dest = A("music/gymnopedie-no1.mp3");
  const target = 10000000; // 完整文件约 6-10MB，靠 curl 续传补完（见 README）
  if (existsSync(dest) && statSync(dest).size > 4000000) { console.log("  = 已存在"); return; }
  await fetchTo(url, dest, 100000);
  console.log(`  (若时长不足，用 curl -C - 循环续传至完整)`);
}

(async () => {
  const which = process.argv.slice(2)[0] || "all";
  if (which === "all" || which === "tiles") await tiles();
  if (which === "all" || which === "music") await music();
  console.log("完成");
})();
