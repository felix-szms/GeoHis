# 跟着地图学历史 · 互动历史课堂（网站）

纯前端静态站点，无后端。一期主打**历史人物篇**，已预留 线路网络史 / 战争·战役沙盘 / 文明演变 三个篇章位。

## 本地运行

```bash
cd site
node scripts/serve.mjs 8913
# 打开 http://127.0.0.1:8913
```

课程页地址（也可直接访问）：
- /courses/xuanzang/interactive.html —— 玄奘西行
- /courses/archimedes/interactive.html —— 阿基米德

支持分享定位：`interactive.html?t=74` 直接落到第 74 秒。
再次进入同一课程会出现「上次学到 XX:XX · 继续学习」按钮（localStorage 记忆）。

## 目录结构

```
site/
├── index.html            # 主页（Hero + 系列筛选 + 课程卡片墙 + 署名页脚）
├── courses.json          # 全站课程清单（series 四篇预留 + courses 卡片数据）
├── shared/               # 全站共享：字体（毛笔楷书/思源宋体）、gsap
└── scripts/serve.mjs     # 站点服务器：主页 + /courses/<id>/ 路由挂载
```

课程本体仍在各自项目目录（`make_video/xuanzang/`、`make_video/archimedes/`），
站点服务器把它们挂载到 `/courses/<id>/` 路径下——**单一数据源，无需复制**。

## 新增课程流水线

1. `mkdir <new-course>`：从现有课程复制框架文件（app.js / interactive.js / index.html / scripts/serve.mjs），
   改 `data/stations.json`（站点、航线、文案、timing）与 `window.COURSE_ID`
2. 抓素材：`fetch-assets.mjs` 改走廊范围（瓦片）+ Commons 插图 + 音乐
3. `npx hyperframes render` 出横屏/竖屏视频（可选）
4. `site/courses.json` 加一条课程卡片数据 + 生成封面（ffmpeg 抽帧）
5. `site/scripts/serve.mjs` 的 `COURSE_MOUNTS` 表加一行挂载

## 部署（纯静态，无后端）

任选其一：
- **对象存储 + CDN**：构建 dist 后全量上传
- **nginx**：root 指向 dist，注意 CJK 字体与瓦片的 MIME 已由扩展名映射
- **Docker**：`FROM nginx:alpine` + `COPY dist /usr/share/nginx/html`

dist 组成 = `site/`（不含 scripts）+ 各课程目录（**不含 node_modules 与 render/**，
但需保留 `node_modules/three/build/three.module.js` 单文件，importmap 依赖它；
后续可 vendor 化到 shared/vendor 彻底去 node_modules）。现状单课程 dist 约 70–80MB，
字体子集化 + 瓦片裁剪后可压至 ~25MB。

## 互动功能清单（课堂页）

播放/暂停（空格）· 上一站/下一站（←→）· 目录跳站 · 拖动进度条 · 跟随/总览（O）·
静音（M）· 分享定位（?t=秒）· 上次进度续学 · 北向锁定上帝视角
