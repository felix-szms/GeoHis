// 张骞项目瓦片补全：按 app.js 实际请求范围取全 z7(z: sat+dem) 与 z8(sat)
// 用法: node scripts/fetch-tiles.mjs
import { mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const A = (p) => path.join(ROOT, "assets", p);
const UA = "Mozilla/5.0 zhangqian-video/1.0";
const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z);
};

const CORRIDOR = { west: 65, east: 112, south: 23.5, north: 47 };
const TX0 = lng2tx(CORRIDOR.west, 7) - 1, TX1 = lng2tx(CORRIDOR.east, 7) + 1;
const TY0 = lat2ty(CORRIDOR.north, 7) - 1, TY1 = lat2ty(CORRIDOR.south, 7) + 1;

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

for (const z of [7]) {
  for (let x = TX0; x <= TX1; x++) {
    for (let y = TY0; y <= TY1; y++) {
      await grab(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
        A(`tiles/sat/${z}/${x}/${y}.jpg`), 1500);
      await grab(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
        A(`tiles/dem/${z}/${x}/${y}.png`), 100);
    }
  }
  console.log(`z${z} done ok=${ok} skip=${skip} fail=${fail}`);
}
// z8 卫星（z7 范围 × 2）
const z8 = 8;
const x0 = 2 * TX0, x1 = 2 * TX1 + 1, y0 = 2 * TY0, y1 = 2 * TY1 + 1;
for (let x = x0; x <= x1; x++) {
  for (let y = y0; y <= y1; y++) {
    await grab(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z8}/${y}/${x}.jpeg`,
      A(`tiles/sat/${z8}/${x}/${y}.jpg`), 1500);
  }
  console.log(`z8 x=${x} ok=${ok} skip=${skip} fail=${fail}`);
}
writeFileSync(A("tiles/manifest.json"), JSON.stringify({ corridor: CORRIDOR, zooms: [7] }, null, 2));
console.log("全部完成", { ok, skip, fail });
