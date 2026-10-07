#!/usr/bin/env node
// 一次性缓存 bust（第 2 批）：archimedes 系本地变体引擎引用加 ?v=2
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
for (const [c, files] of [
  ["archimedes", ["index.html", "interactive.html"]],
  ["archimedes_xhs", ["index.html"]],
]) {
  for (const f of files) {
    const fp = path.join(ROOT, c, f);
    if (!existsSync(fp)) continue;
    const src = readFileSync(fp, "utf8");
    const out = src
      .replace(/src="\.\/app\.js"/g, 'src="./app.js?v=2"')
      .replace(/src="\.\/interactive\.js"/g, 'src="./interactive.js?v=2"');
    if (out !== src) { writeFileSync(fp, out); console.log(`bust ${c}/${f}`); }
  }
}
console.log("done");
