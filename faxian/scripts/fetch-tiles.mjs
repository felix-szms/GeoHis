// 法显项目瓦片抓取：走廊 z7(sat+dem) + 近景带 z8(sat)
// 用法: node scripts/fetch-tiles.mjs
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const A = (p) => path.join(ROOT, "assets", p);
const UA = "Mozilla/5.0 faxian-video/1.0";
const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
};

const CORRIDOR = { west: 65, east: 122, south: 5, north: 47 };
let ok = 0, skip = 0, fail = 0;

async function grab(url, dest, min) {
  if (existsSync(dest) && statSync(dest).size >= min) { skip++; return; }
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(35000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < min) throw new Error("tiny");
      mkdirSync(path.dirname(dest), { recursive: true });
      await writeFile(dest, buf);
      ok++; return;
    } catch (e) {
      if (a === 2) { fail++; console.log("FAIL", dest.split("assets/")[1], e.message); }
      await new Promise((r2) => setTimeout(r2, 800));
    }
  }
}

// z7 全走廊（sat + dem）
const x0 = lng2tx(CORRIDOR.west, 7) - 1, x1 = lng2tx(CORRIDOR.east, 7) + 1;
const y0 = lat2ty(CORRIDOR.north, 7) - 1, y1 = lat2ty(CORRIDOR.south, 7) + 1;
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    await grab(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/7/${y}/${x}.jpeg`,
      A(`tiles/sat/7/${x}/${y}.jpg`), 1500);
    await grab(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/7/${x}/${y}.png`,
      A(`tiles/dem/7/${x}/${y}.png`), 100);
  }
  console.log(`z7 x=${x} ok=${ok} skip=${skip} fail=${fail}`);
}

// z8 卫星近景带：印度/中亚陆区 + 崂山登陆区
const z8Zones = [
  { w: CORRIDOR.west - 1, e: CORRIDOR.east + 1, s: 22, n: 42 },
  { w: 118, e: 122, s: 33, n: 38 },
];
const seen = new Set();
for (const zn of z8Zones) {
  for (let x = lng2tx(zn.w, 8); x <= lng2tx(zn.e, 8); x++) {
    for (let y = lat2ty(zn.n, 8); y <= lat2ty(zn.s, 8); y++) {
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await grab(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/8/${y}/${x}.jpeg`,
        A(`tiles/sat/8/${x}/${y}.jpg`), 1500);
    }
  }
}
writeFileSync(A("tiles/manifest.json"), JSON.stringify({ corridor: CORRIDOR, zooms: [7] }, null, 2));
console.log("全部完成", { ok, skip, fail });
