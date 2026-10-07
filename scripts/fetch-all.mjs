#!/usr/bin/env node
// 一键下载全部课程素材：逐课程调用共享引擎的参数化下载器
// 走廊/层级/近景带/配乐参数在各课程 data/assets.json（唯一数据源）
// 用法: node scripts/fetch-all.mjs [--tiles|--fonts|--music|--all]
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const PROJECTS = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo", "archimedes_xhs"];

for (const p of PROJECTS) {
  try {
    console.log(`\n===== ${p} =====`);
    execSync(`node ../../engine/fetch-assets.mjs ${process.argv.slice(2).join(" ")}`, {
      cwd: path.join(ROOT, p), stdio: "inherit",
    });
  } catch (e) {
    console.log(`  (跳过 ${p}: ${e.status})`);
  }
}
console.log("\n✅ 全部素材就绪");
