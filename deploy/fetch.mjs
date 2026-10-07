#!/usr/bin/env node
// GeoHis 部署素材下载器（并行版）：按各课程 data/assets.json 的走廊/近景带参数抓取全部运行时资源
// 与 engine/fetch-assets.mjs 共享同一份参数源（data/assets.json），本脚本提供：
//   - 并行下载（默认并发 8，FETCH_CONCURRENCY 可调）
//   - 两阶段：阶段1 = 地形 z6/z7 + 字体/音乐（站点可完整运行的最小集）；阶段2 = z8 近景（增强，可回退）
// three/gsap 已 vendor 在 engine/vendor/ 并随仓库分发，本脚本不再下载
// 幂等、断点续传，可反复执行。用法: node deploy/fetch.mjs [--phase1|--phase2]
import { mkdirSync, existsSync, writeFileSync, statSync, cpSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.GEOHIS_ROOT
  ? path.resolve(process.env.GEOHIS_ROOT)
  : path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const A = (course, p) => path.join(ROOT, course, "assets", p);
const UA = "Mozilla/5.0 GeoHis-deploy/1.0";
const CONCURRENCY = Number(process.env.FETCH_CONCURRENCY || 8);
const args = new Set(process.argv.slice(2));
const runP1 = !args.has("--phase2");
const runP2 = !args.has("--phase1");

const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};
const SAT = (z, x, y) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`;
const DEM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const COURSES = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo", "archimedes_xhs"];

// ---------- 任务队列 ----------
const tasks = []; // {url, dest, min}
let ok = 0, skip = 0, fail = 0;
const failures = [];

function need(url, dest, min = 100) {
  if (existsSync(dest) && statSync(dest).size >= min) { skip++; return; }
  tasks.push({ url, dest, min });
}

// ---------- 从各课程 data/assets.json 生成任务（与 engine/fetch-assets.mjs 同一份参数源） ----------
function buildTileTasks() {
  for (const course of COURSES) {
    const cfgPath = path.join(ROOT, course, "data", "assets.json");
    if (!existsSync(cfgPath)) { console.log(`! ${course} 缺少 data/assets.json，跳过`); continue; }
    const CFG = JSON.parse(readFileSync(cfgPath, "utf8"));
    const c = CFG.corridor, M = CFG.margin ?? 0;

    // 地形层级（sat+dem）
    for (const z of CFG.zooms) {
      for (let x = lng2tx(c.west, z) - M; x <= lng2tx(c.east, z) + M; x++)
        for (let y = lat2ty(c.north, z) - M; y <= lat2ty(c.south, z) + M; y++) {
          need(SAT(z, x, y), A(course, `tiles/sat/${z}/${x}/${y}.jpg`), 1500);
          need(DEM(z, x, y), A(course, `tiles/dem/${z}/${x}/${y}.png`), 100);
        }
    }
    const fp = A(course, "tiles/manifest.json");
    mkdirSync(path.dirname(fp), { recursive: true });
    if (!existsSync(fp)) writeFileSync(fp, JSON.stringify({ corridor: c, zooms: CFG.zooms }, null, 2));

    // z8 近景带（sat）
    const z8 = CFG.z8 ?? { mode: "none" };
    if (z8.mode === "full") {
      const x0 = 2 * (lng2tx(c.west, 7) - M), x1 = 2 * (lng2tx(c.east, 7) + M) + 1;
      const y0 = 2 * (lat2ty(c.north, 7) - M), y1 = 2 * (lat2ty(c.south, 7) + M) + 1;
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) need(SAT(8, x, y), A(course, `tiles/sat/8/${x}/${y}.jpg`), 1500);
    } else if (z8.mode === "zones") {
      const seen = new Set();
      for (const zn of z8.zones)
        for (let x = lng2tx(zn.w, 8); x <= lng2tx(zn.e, 8); x++)
          for (let y = lat2ty(zn.n, 8); y <= lat2ty(zn.s, 8); y++) {
            const k = `${x},${y}`;
            if (seen.has(k)) continue;
            seen.add(k);
            need(SAT(8, x, y), A(course, `tiles/sat/8/${x}/${y}.jpg`), 1500);
          }
    }
  }
}

// ---------- 字体 / 音乐 ----------
const FONTS = [
  ["https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf", "MaShanZheng-Regular.ttf", 100000],
  ["https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-serif@release/SubsetOTF/CN/SourceHanSerifCN-Regular.otf", "SourceHanSerifCN-Regular.otf", 1000000],
  ["https://cdn.jsdelivr.net/gh/adobe-fonts/source-han-serif@release/SubsetOTF/CN/SourceHanSerifCN-Bold.otf", "SourceHanSerifCN-Bold.otf", 1000000],
];
const MUSIC = [
  ["https://incompetech.com/music/royalty-free/mp3-royaltyfree/Eastern%20Thought.mp3", "eastern-thought.mp3"],
  ["https://incompetech.filmmusic.io/wp-content/uploads/2024/06/Eastern-Thought.mp3", "eastern-thought.mp3"],
];

function buildAssetTasks() {
  for (const [url, name, min] of FONTS) need(url, A("xuanzang", `fonts/${name}`), min);
  need(MUSIC[0][0], A("xuanzang", "music/eastern-thought.mp3"), 500000);
}

// ---------- 下载执行 ----------
async function fetchBuf(url, timeoutMs = 45000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally { clearTimeout(timer); }
}

async function runTask(t) {
  for (let a = 1; a <= 3; a++) {
    try {
      const buf = await fetchBuf(t.url);
      if (buf.length < t.min) throw new Error(`too small (${buf.length}B)`);
      mkdirSync(path.dirname(t.dest), { recursive: true });
      await writeFile(t.dest, buf);
      ok++;
      return;
    } catch (e) {
      if (a === 3) { fail++; failures.push(`${path.relative(ROOT, t.dest)}  ${e.message}`); return; }
      await new Promise((r) => setTimeout(r, 600 * a));
    }
  }
}

async function runQueue(label) {
  const list = tasks.splice(0);
  if (!list.length) { console.log(`[${label}] 无需下载（全部已就绪）`); return; }
  console.log(`[${label}] 待下载 ${list.length} 个文件（并发 ${CONCURRENCY}）`);
  let cursor = 0;
  const t0 = Date.now();
  async function worker() {
    while (cursor < list.length) {
      const t = list[cursor++];
      await runTask(t);
      const done = ok + fail;
      if (done % 200 === 0) {
        const rate = (done / ((Date.now() - t0) / 1000)).toFixed(1);
        console.log(`[${label}] ${done}/${list.length}（${rate} 个/秒，fail=${fail}）`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
}

// ---------- 本地分发（无网络） ----------
function spreadFiles() {
  // 字体：xuanzang → 其余课程 + site/shared
  const fontDirs = COURSES.filter((c) => c !== "xuanzang").map((c) => A(c, "fonts"));
  fontDirs.push(path.join(ROOT, "site", "shared", "fonts"));
  for (const [, name] of FONTS) {
    const src = A("xuanzang", `fonts/${name}`);
    if (!existsSync(src)) { console.log(`! 字体缺失：${name}（上游下载失败）`); continue; }
    for (const dir of fontDirs) {
      mkdirSync(dir, { recursive: true });
      const dst = path.join(dir, name);
      if (!existsSync(dst)) cpSync(src, dst);
    }
  }
  // 音乐：全部课程页面引用 eastern-thought.mp3
  const musicSrc = A("xuanzang", "music/eastern-thought.mp3");
  if (existsSync(musicSrc))
    for (const c of COURSES.filter((c) => c !== "xuanzang")) {
      mkdirSync(A(c, "music"), { recursive: true });
      const dst = A(c, "music/eastern-thought.mp3");
      if (!existsSync(dst)) cpSync(musicSrc, dst);
    }
}

(async () => {
  console.log(`GeoHis 素材准备 → ${ROOT}`);
  buildTileTasks();
  buildAssetTasks();

  // 阶段一 = 地形 + 字体/音乐（站点可完整运行的最小集）；阶段二 = z8 近景（增强）
  // 注意 dest 在 Windows 下是反斜杠路径，统一成正斜杠再匹配
  const norm = (t) => t.dest.split(path.sep).join("/");
  const all = tasks.splice(0);
  const p1 = all.filter((t) => !/tiles\/sat\/8\//.test(norm(t)));
  const p2 = all.filter((t) => /tiles\/sat\/8\//.test(norm(t)));
  // 字体/音乐优先（页面能否打开的先决条件），瓦片随后
  p1.sort((a, b) => Number(/tiles\//.test(norm(a))) - Number(/tiles\//.test(norm(b))));

  async function withFallback(pairs) {
    for (const [url, dest, min] of pairs) {
      if (existsSync(dest) && statSync(dest).size >= min) return true;
      try {
        const buf = await fetchBuf(url);
        if (buf.length < min) throw new Error("too small");
        mkdirSync(path.dirname(dest), { recursive: true });
        await writeFile(dest, buf);
        return true;
      } catch { /* 下一源 */ }
    }
    return false;
  }

  if (runP1) {
    tasks.push(...p1);
    await runQueue("阶段1 地形+基础");
    if (!(await withFallback(MUSIC.map(([u, n]) => [u, A("xuanzang", `music/${n}`), 500000]))))
      console.log("! 配乐下载失败（页面仍可用，无声）");
    spreadFiles();
  }
  if (runP2) {
    tasks.push(...p2);
    await runQueue("阶段2 z8近景");
    spreadFiles();
  }

  console.log(`\n完成：下载 ${ok} · 跳过 ${skip} · 失败 ${fail}`);
  if (failures.length) {
    console.log("失败清单（前 20 条）：");
    for (const f of failures.slice(0, 20)) console.log("  " + f);
    if (failures.length > 20) console.log(`  ...共 ${failures.length} 条，重跑本脚本可断点续传`);
  }
})();
