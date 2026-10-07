// 共享引擎 · 课程独立预览服务器
// 用法（在课程目录下）: node ../../engine/serve.mjs [port]
// 或由各课程 scripts/serve.mjs 垫片以 serve({ course, port }) 调用
// 路由：/        → 课程目录（目录默认 index.html，同旧版行为）
//       /engine/ → engine/ 目录（app.js / interactive.js / vendor）
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

export function serve({ course, port = 8910, host = "0.0.0.0" } = {}) {
  createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
      let base, rel;
      if (urlPath === "/" || urlPath === "/index.html") { base = course; rel = "index.html"; }
      else if (urlPath.startsWith("/engine/")) { base = ENGINE; rel = urlPath.slice("/engine/".length); }
      else { base = course; rel = urlPath.slice(1); }
      let fp = path.normalize(path.join(base, rel));
      if (!fp.startsWith(base)) { res.writeHead(403); res.end(); return; }
      try { if ((await stat(fp)).isDirectory()) fp = path.join(fp, "index.html"); } catch { /* 落到 readFile 404 */ }
      const data = await readFile(fp);
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404); res.end("not found");
    }
  }).listen(port, host, () =>
    console.log(`serving ${course} (+engine) at http://127.0.0.1:${port} [${host}]`),
  );
}

// 直接 CLI 调用时，课程目录取当前工作目录
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  serve({ course: process.cwd(), port: Number(process.argv[2] || 8910) });
}
