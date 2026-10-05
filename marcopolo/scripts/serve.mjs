// 极简静态文件服务器：预览/部署均可（node scripts/serve.mjs [port]）
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const PORT = Number(process.argv[2] || 8910);
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".png": "image/png", ".ttf": "font/ttf", ".otf": "font/otf", ".mp3": "audio/mpeg",
  ".woff2": "font/woff2", ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let fp = path.normalize(path.join(ROOT, urlPath));
    if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (urlPath.endsWith("/")) fp = path.join(fp, "index.html");
    const data = await readFile(fp);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`serving ${ROOT} at http://127.0.0.1:${PORT}`));
