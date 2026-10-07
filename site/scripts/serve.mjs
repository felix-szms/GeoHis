// 「跟着地图学历史」站点服务器：主页 + 多课程路由（静态，无后端逻辑）
// 用法: node scripts/serve.mjs [port]   默认 8913
// 路由：/                  → site/index.html
//       /courses.json      → 站点课程清单
//       /shared/...        → site/shared/...
//       /engine/...        → 仓库根 engine/（app.js / interactive.js / vendor）
//       /courses/<id>/...  → 对应课程目录（目录默认 interactive.html）
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ROOT = path.resolve(SITE, ".."); // 仓库根 —— 用于挂载各课程项目目录与 engine/
const PORT = Number(process.argv[2] || 8913);
const HOST = process.argv[3] || "0.0.0.0"; // 容器/局域网可访问；仅本机调试可传 127.0.0.1

// 课程挂载表：/courses/<id>/... → 对应项目目录
const COURSE_MOUNTS = {
  xuanzang: path.join(ROOT, "xuanzang"),
  archimedes: path.join(ROOT, "archimedes"),
  zhangqian: path.join(ROOT, "zhangqian"),
  faxian: path.join(ROOT, "faxian"),
  marcopolo: path.join(ROOT, "marcopolo"),
};

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".webp": "image/webp", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

async function serveFile(res, fp) {
  const data = await readFile(fp);
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let fp;
    if (urlPath === "/" || urlPath === "/index.html") {
      fp = path.join(SITE, "index.html");
    } else if (urlPath === "/courses.json") {
      fp = path.join(SITE, "courses.json");
    } else if (urlPath.startsWith("/shared/")) {
      fp = path.join(SITE, urlPath.slice(1));
    } else if (urlPath.startsWith("/engine/")) {
      fp = path.join(ROOT, urlPath.slice(1));
    } else {
      const m = urlPath.match(/^\/courses\/([^/]+)(\/.*)?$/);
      const root = m && COURSE_MOUNTS[m[1]];
      if (!root) { res.writeHead(404); res.end("course not found"); return; }
      const rest = (m[2] || "/").replace(/^\/+/, "");
      fp = path.join(root, rest || "interactive.html");
      if (urlPath.endsWith("/")) fp = path.join(fp, "interactive.html");
    }
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    await serveFile(res, fp);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, HOST, () => console.log(`跟着地图学历史 → http://127.0.0.1:${PORT} [${HOST}]`));
