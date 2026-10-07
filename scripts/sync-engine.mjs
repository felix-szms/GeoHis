#!/usr/bin/env node
// 引擎同步：把仓库根 engine/ 的单源副本分发到各课程 engine/（gitignore，构建产物）
// 用法: node scripts/sync-engine.mjs
// 各课程页面（含 hyperframes 逐帧渲染）引用课程内 ./engine/，保证课程目录自包含；
// 改引擎代码只改根 engine/，然后跑本脚本全站生效。
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.GEOHIS_ROOT
  ? path.resolve(process.env.GEOHIS_ROOT)
  : path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ENGINE = path.join(ROOT, "engine");
const COURSES = ["xuanzang", "archimedes", "zhangqian", "faxian", "marcopolo", "archimedes_xhs"];

for (const c of COURSES) {
  const dst = path.join(ROOT, c, "engine");
  rmSync(dst, { recursive: true, force: true });
  cpSync(ENGINE, dst, { recursive: true });
  console.log(`同步 ${c}/engine/`);
}
console.log("引擎同步完成（6 门课程）");
