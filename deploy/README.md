# 本地 Docker 部署

一键启动「跟着地图学历史」全站（主页 + 5 门课程互动课堂）：

```bash
docker compose up -d
# 浏览器打开 http://127.0.0.1:8913
```

## 组件

| 服务 | 说明 |
|------|------|
| `web` | nginx:1.27-alpine，端口 `8913:80`。路由复刻 `site/scripts/serve.mjs`：`/` 主页、`/shared/` 共享资源、`/engine/` 共享引擎、`/courses/<id>/` 挂载各课程目录（目录默认 `interactive.html`）。 |
| `assets-init` | 一次性任务（node:22-alpine）。先 `scripts/sync-engine.mjs` 同步引擎副本到各课程，再用 `deploy/fetch.mjs` 把运行时素材下载进仓库（瓦片/字体/音乐），全部为 gitignore 路径；幂等、断点续传，重复启动自动跳过已下载文件。 |

three/gsap 已 vendor 在 `engine/vendor/` 并随仓库分发，容器无需任何 npm install。

## 素材下载

`deploy/fetch.mjs`（并行 8，`FETCH_CONCURRENCY` 可调）与 `engine/fetch-assets.mjs`
（开发用串行版）读取**同一份**参数源——各课程 `data/assets.json`（走廊/层级/近景带/配乐），
分两阶段执行（`node deploy/fetch.mjs [--phase1|--phase2]`）：

- 阶段 1：z6/z7 地形瓦片 + 字体/音乐（站点可完整运行的最小集）
- 阶段 2：z8 卫星近景（纹理增强，缺失时页面自动回退 z7）

素材总量约 7500 个文件 / 400MB，首次下载约 10–25 分钟（取决于到 NASA GIBS / AWS S3 的网络）。
进度查看：`docker compose logs -f assets-init`。

## 数据流

```
浏览器 → nginx(web) → 仓库目录只读挂载 /srv
                      ├─ site/            主页 + 共享资源
                      ├─ engine/          共享引擎（/engine/ 路由）
                      └─ <course>/        各课程（html/data/assets/课程内 engine 副本）
assets-init → 仓库目录读写挂载 /srv（只写 gitignore 的素材路径与 */engine/ 副本）
```

## 常用操作

```bash
docker compose up -d            # 启动（首次自动同步引擎 + 下载素材）
docker compose logs -f assets-init   # 看素材下载进度
docker compose exec web nginx -s reload   # 改 nginx.conf 后热加载
docker compose restart web      # 或整容器重启
docker compose down             # 停止（素材保留在仓库目录，下次秒启）
```

换端口：改 `docker-compose.yml` 里 `"8913:80"` 的左侧端口。
Linux 服务器部署可把 `deploy/nginx.conf` 里的 `sendfile off` 改回 `on`（关闭它是因为
Docker Desktop 的 Windows 文件共享层上 sendfile 会挂起部分请求）。
