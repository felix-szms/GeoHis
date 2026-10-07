#!/usr/bin/env node
// 仓库完整性校验：CI 与本地提交前共用
// 用法: node scripts/validate.mjs
// 检查项：
//   1. 全部 JSON 可解析（stations/assets/meta/hyperframes/package/courses）
//   2. 全部 .js/.mjs 通过 node --check
//   3. HTML 本地引用完整（脚本/引擎/数据/封面缺失即失败；未 fetch 的瓦片字体音乐仅告警）
//   4. 引擎结构与各课 assets.json 参数合法性
//   5. site/courses.json 与课程目录一一对应
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const COURSES = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo", "archimedes_xhs"];
const SITE_COURSES = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo"];
const errors = [], warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const rel = (p) => path.relative(ROOT, p);

// ---------- 1. JSON ----------
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "render") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "assets") walk(p, out); }
    else out.push(p);
  }
  return out;
}
for (const p of walk(ROOT)) {
  if (p.endsWith(".json")) {
    try { JSON.parse(readFileSync(p, "utf8")); }
    catch (e) { err(`JSON 解析失败: ${rel(p)} — ${e.message}`); }
  }
}

// ---------- 2. 语法 ----------
const codeFiles = [path.join(ROOT, "engine"), path.join(ROOT, "scripts"), path.join(ROOT, "site/scripts"),
  ...COURSES.map((c) => path.join(ROOT, c, "scripts")), path.join(ROOT, "deploy")]
  .flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => /\.(js|mjs)$/.test(f)).map((f) => path.join(d, f)) : []))
  .concat(COURSES.flatMap((c) => ["app.js", "interactive.js"].map((f) => path.join(ROOT, c, f)).filter(existsSync))
    .concat([path.join(ROOT, "engine/app.js"), path.join(ROOT, "engine/interactive.js")]));
for (const f of new Set(codeFiles)) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { err(`语法错误: ${rel(f)} — ${String(e.stderr).split("\n")[0]}`); }
}

// ---------- 3. HTML 引用 ----------
const OPTIONAL = /(assets\/(tiles|fonts|music)|shared\/fonts)\//; // fetch 前允许缺失
function checkHtml(fp) {
  const html = readFileSync(fp, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .concat([...html.matchAll(/"imports"\s*:\s*{\s*"three"\s*:\s*"([^"]+)"/g)].map((m) => m[1]))
    .filter((r) => !/^(https?:|\/\/|#|data:|mailto:)/.test(r))
    .filter((r) => !r.includes("${")); // 页内 JS 模板字符串，非静态引用
  for (const r of new Set(refs)) {
    const target = path.resolve(path.dirname(fp), r.split("?")[0]);
    if (existsSync(target)) continue;
    const msg = `${rel(fp)} → ${r}`;
    if (OPTIONAL.test(r)) warn(`引用未 fetch 的素材（可忽略）: ${msg}`);
    else err(`引用缺失: ${msg}`);
  }
}
for (const c of COURSES)
  for (const f of ["index.html", "interactive.html"])
    if (existsSync(path.join(ROOT, c, f))) checkHtml(path.join(ROOT, c, f));
checkHtml(path.join(ROOT, "site/index.html"));

// ---------- 4. 引擎与 assets.json ----------
for (const f of ["engine/app.js", "engine/interactive.js", "engine/serve.mjs", "engine/fetch-assets.mjs",
  "engine/vendor/gsap.min.js", "engine/vendor/three.module.js", "engine/vendor/three.core.js"])
  if (!existsSync(path.join(ROOT, f))) err(`引擎文件缺失: ${f}`);
for (const c of COURSES) {
  const fp = path.join(ROOT, c, "data/assets.json");
  if (!existsSync(fp)) { err(`${c}: 缺少 data/assets.json`); continue; }
  const cfg = JSON.parse(readFileSync(fp, "utf8"));
  const co = cfg.corridor;
  if (!co || !(co.west < co.east) || !(co.south < co.north)) err(`${c}: assets.json 走廊参数非法`);
  if (!Array.isArray(cfg.zooms) || !cfg.zooms.every((z) => z >= 4 && z <= 8)) err(`${c}: zooms 非法`);
}

// ---------- 5. 课程清单 ↔ 目录 ----------
const courses = JSON.parse(readFileSync(path.join(ROOT, "site/courses.json"), "utf8")).courses;
for (const c of courses) {
  const dir = path.join(ROOT, c.id);
  for (const f of ["interactive.html", "cover.jpg", "data/stations.json"])
    if (!existsSync(path.join(dir, f))) err(`courses.json 条目 ${c.id} 缺少 ${f}`);
  if (!SITE_COURSES.includes(c.id)) err(`courses.json 条目 ${c.id} 未挂载进服务器路由`);
}

// ---------- 汇总 ----------
console.log(`检查完成：${errors.length} 错误 · ${warnings.length} 提示`);
for (const w of warnings.slice(0, 10)) console.log("  [warn] " + w);
for (const e of errors) console.log("  [ERROR] " + e);
process.exit(errors.length ? 1 : 0);
