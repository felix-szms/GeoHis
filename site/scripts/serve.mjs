// 「跟着地图学历史」站点服务器：主页 + 多课程路由（静态，无后端逻辑）
// 用法: node scripts/serve.mjs [port]   默认 8913
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const SITE = path.resolve(new URL(".", import.meta.url).pathname, "..");
const ROOT = path.resolve(SITE, ".."); // make_video/ —— 用于挂载各课程项目目录
const PORT = Number(process.argv[2] || 8913);

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
}).listen(PORT, "127.0.0.1", () => console.log(`跟着地图学历史 → http://127.0.0.1:${PORT}`));
