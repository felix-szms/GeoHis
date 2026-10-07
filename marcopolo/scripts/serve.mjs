// 垫片：转发到共享引擎服务器（用法不变：node scripts/serve.mjs [port]）
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../../engine/serve.mjs";

const course = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
serve({ course, port: Number(process.argv[2] || 8911) });
