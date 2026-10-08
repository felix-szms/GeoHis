#!/usr/bin/env node
// 全球底图构建：下载 NASA GIBS z4 全球卫星瓦片（Blue Marble 晕渲地形+水深，256 张）
// 拼合为 4096×4096 单张 world-z4.jpg，供全部课程共用（引擎以 Web Mercator 同坐标系铺底）
// 用法: node scripts/build-world-map.mjs   （幂等，已存在则跳过；--force 重建）
import { mkdirSync, existsSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const Z = 4;
const N = 2 ** Z; // 16 × 16
const UA = "Mozilla/5.0 GeoHis-worldmap/1.0";
const tileDir = path.join(ROOT, "scripts", ".worldtiles");
// 产物放 engine/vendor/（随仓库分发，sync-engine.mjs 自动同步到各课程内 engine 副本）
const outSrc = path.join(ROOT, "engine", "vendor", "world-z4.jpg");

if (existsSync(outSrc) && !process.argv.includes("--force")) {
  console.log(`已存在 ${path.relative(ROOT, outSrc)}（${(statSync(outSrc).size / 1048576).toFixed(1)}MB），跳过；--force 重建`);
  process.exit(0);
}

const SAT = (z, x, y) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;

async function grab(x, y) {
  const dest = path.join(tileDir, `${x}_${y}.jpeg`);
  if (existsSync(dest) && statSync(dest).size >= 500) return dest;
  for (let a = 1; a <= 4; a++) {
    try {
      const res = await fetch(SAT(Z, x, y), { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) throw new Error("tiny");
      await writeFile(dest, buf);
      return dest;
    } catch (e) {
      if (a === 4) throw new Error(`瓦片 ${x},${y} 失败: ${e.message}`);
      await new Promise((r) => setTimeout(r, 800 * a));
    }
  }
}

console.log(`下载全球 z${Z} 瓦片 ${N * N} 张…`);
mkdirSync(tileDir, { recursive: true });
let done = 0;
const files = [];
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    files.push(await grab(x, y));
    if (++done % 32 === 0) console.log(`  ${done}/${N * N}`);
  }
}

console.log("拼合 4096×4096…");
const { Jimp } = await import("jimp");
let canvas;
try {
  canvas = new Jimp({ width: 4096, height: 4096, color: 0x0a1a2aff });
} catch (e) {
  canvas = new Jimp(4096, 4096, 0x0a1a2aff);
}
const PX2 = 4096 / N;
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const tile = await Jimp.read(files[y * N + x]);
    tile.resize({ w: PX2, h: PX2 });
    canvas.composite(tile, x * PX2, y * PX2);
  }
}
mkdirSync(path.dirname(outSrc), { recursive: true });
await canvas.write(outSrc, { quality: 72 });
console.log(`✓ ${path.relative(ROOT, outSrc)} ${(statSync(outSrc).size / 1048576).toFixed(1)}MB`);
