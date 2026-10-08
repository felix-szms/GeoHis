#!/usr/bin/env node
// 一次性缓存 bust（第 3 批）：字体引用加 ?v=2（子集化后同名文件，需换 URL 摆脱 7 天旧缓存）
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const FONTS = ["MaShanZheng-Regular.ttf", "SourceHanSerifCN-Regular.otf", "SourceHanSerifCN-Bold.otf"];
const COURSES = readdirSync(ROOT).filter((d) => existsSync(path.join(ROOT, d, "data", "stations.json")));
let n = 0;
for (const dir of [...COURSES, "site"]) {
  for (const f of readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".html"))) {
    const fp = path.join(ROOT, dir, f);
    const src = readFileSync(fp, "utf8");
    let out = src;
    for (const font of FONTS) out = out.replaceAll(font + '")', font + '?v=2")');
    if (out !== src) { writeFileSync(fp, out); n++; console.log(`bust ${dir}/${f}`); }
  }
}
console.log(`done (${n} files)`);
