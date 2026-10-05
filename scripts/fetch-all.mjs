#!/usr/bin/env node
// 一键下载全部课程素材：卫星瓦片 + 字体 + 音乐
// 用法: node scripts/fetch-all.mjs
import { execSync } from "node:child_process";

const PROJECTS = ["xuanzang", "archimedes", "archimedes_xhs", "zhangqian", "faxian", "marcopolo"];
const ROOT = new URL("..", import.meta.url).pathname;

for (const p of PROJECTS) {
  const script = `${p}/scripts/fetch-tiles.mjs`;
  try {
    console.log(`\n===== ${p} 瓦片 =====`);
    execSync(`node ${script}`, { cwd: ROOT, stdio: "inherit" });
  } catch (e) {
    console.log(`  (跳过 ${p}: ${e.status})`);
  }
}

// 字体 + 音乐（共用源：从 xuanzang/scripts/fetch-assets.mjs 已下载过的会跳过）
console.log("\n===== 字体 / 音乐 =====");
try {
  execSync("node xuanzang/scripts/fetch-assets.mjs", { cwd: ROOT, stdio: "inherit" });
} catch (e) { /* already handled */ }

console.log("\n✅ 全部素材就绪");
