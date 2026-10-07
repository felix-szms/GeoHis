#!/usr/bin/env node
// 一次性缓存 bust：课程 HTML 中的 engine 引用加 ?v= 版本参数
// （此前 .js 曾被下发 7 天强缓存，需一次性换 URL 逼浏览器取新文件；此后 nginx 已改为 no-cache）
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const COURSES = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo", "archimedes_xhs"];
let n = 0;
for (const c of COURSES)
  for (const f of ["index.html", "interactive.html"]) {
    const fp = path.join(ROOT, c, f);
    if (!existsSync(fp)) continue;
    const src = readFileSync(fp, "utf8");
    const out = src
      .replace(/"\.\/engine\/vendor\/three\.module\.js"/g, '"./engine/vendor/three.module.js?v=2"')
      .replace(/src="\.\/engine\/vendor\/gsap\.min\.js"/g, 'src="./engine/vendor/gsap.min.js?v=2"')
      .replace(/src="\.\/engine\/app\.js"/g, 'src="./engine/app.js?v=2"')
      .replace(/src="\.\/engine\/interactive\.js"/g, 'src="./engine/interactive.js?v=2"');
    if (out !== src) { writeFileSync(fp, out); n++; console.log(`bust ${c}/${f}`); }
  }
console.log(`done (${n} files)`);
