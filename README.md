# 跟着地图学历史

> 把伟大的一生，画成一条可以交互的航线。

用 NASA 卫星地形 + three.js + 确定性逐帧渲染，把历史人物的迁徙路线做成**可交互的 3D 地图课堂**。每一条课程既有横屏/竖屏成片，也有可在浏览器中暂停、跳站、拖动进度的互动网页。

## 系列课程

| # | 课程 | 人物 | 航线 | 站点 | 片长 |
|---|------|------|------|------|------|
| 01 | 玄奘西行 | 玄奘 | 长安 → 那烂陀，陆路 | 28 | 4:22 |
| 02 | 阿基米德 | 前287—前212 | 地中海往返 | 10 | 1:06 |
| 03 | 张骞出使西域 | 前138—前126 | 长安 → 大月氏 → 长安 | 10 | 2:44 |
| 04 | 法显西行 | 399—412 | 长安 → 天竺 → 崂山（陆去海归） | 11 | 2:36 |
| 05 | 马可·波罗东行 | 1271—1295 | 威尼斯 → 大都 → 威尼斯 | 13 | 2:50 |

后续篇章：线路网络史 · 战争战役沙盘 · 文明演变（均已预留框架）。

## 快速开始

```bash
# 0) 前置依赖
#    Node.js >= 22, ffmpeg (brew install ffmpeg)

# 1) 安装依赖（每个课程项目）
cd xuanzang && npm install && cd ..

# 2) 下载素材（NASA 卫星瓦片 + 字体 + 音乐，全自动）
node scripts/fetch-all.mjs          # 一键下载全部（推荐）
# 或按项目单独下载
# cd zhangqian && node scripts/fetch-tiles.mjs && cd ../..

# 3) 启动网站
cd site && node scripts/serve.mjs 8913
# 浏览器打开 http://127.0.0.1:8913
```

单个课程预览：

```bash
cd xuanzang
node scripts/serve.mjs 8911
# 互动课堂 http://127.0.0.1:8911/interactive.html
# 影片合成 http://127.0.0.1:8911/index.html
```

## 渲染成片

```bash
cd xuanzang
npx hyperframes render --fps 24 -q high -o render/xuanzang_final.mp4
# 产出到 render/ 目录（不入 git）
```

## 项目结构

```
make_video/
├── site/                 # 教学网站主页（课程卡片墙 + 系列筛选）
│   ├── courses.json      # 全站课程清单（标题/封面/路径）
│   ├── scripts/serve.mjs # 站点服务器：主页 + /courses/<id>/ 路由
│   └── shared/           # 全站共享字体 + gsap
├── xuanzang/             # 课程项目（每课一个，可独立渲染）
│   ├── index.html        # 影片合成（HyperFrames 逐帧渲染入口）
│   ├── interactive.html  # 互动课堂页（暂停 / 跳站 / 进度记忆 / ?t= 分享）
│   ├── app.js            # three.js 地形场景 + 确定性渲染引擎
│   ├── interactive.js    # 互动驱动器（鼠标/键盘 → 时间轴 seek）
│   ├── data/stations.json# ★ 课程数据（站点/航线/文案/timing）
│   ├── assets/
│   │   ├── tiles/        # NASA 卫星贴图 + 高程瓦片（fetch 后生成）
│   │   ├── fonts/        # 毛笔楷书 + 思源宋体
│   │   ├── music/        # CC-BY 免版权配乐
│   │   └── art/          # 公有领域历史插图
│   └── scripts/fetch-tiles.mjs
├── archimedes/           # 同上
├── zhangqian/ faxian/ marcopolo/
└── engine/               # （预留）共用引擎
```

## 换一个题材

所有内容都由 `data/stations.json` 驱动。改站点、航线、文案和 `meta.timing`，
即可在**不写一行新代码**的前提下做出全新课程。详见各项目内 `data/stations.json`
和 `archimedes/README.md` 中的字段说明。

## 技术栈

| 层 | 工具 | 说明 |
|----|------|------|
| 3D 地形 | three.js | z7 高程网格 + z8 卫星贴图（NASA Blue Marble / AWS） |
| 时间轴 | GSAP | 全画面状态 = t 的纯函数，确定性逐帧 seek |
| 逐帧渲染 | HyperFrames | Puppeteer + FFmpeg，确定性输出 |
| 互动 | 原生 JS | 交互模式（`window.__INTERACTIVE`）：北向锁定正俯视 |
| 部署 | nginx / OSS | 纯静态，无后端 |

## 互动课堂功能

播放/暂停（空格）· 上一站/下一站（←→）· 目录跳站 · 拖动进度条 ·
跟随/总览双模式（O）· 北向锁定上帝视角 · 静音（M）· 分享定位（`?t=秒`）· 上次进度续学

## 素材来源与致谢

- 地图：NASA Blue Marble（公有领域）、Terrain Tiles · Mapzen / AWS Open Data
- 音乐：Kevin MacLeod（incompetech.com），CC BY 3.0
- 字体：马善政毛笔楷书、思源宋体（均为 SIL OFL）
- 历史插图：公有领域版画与绘画（Wikimedia Commons）

本仓库代码以 MIT 协议开源。引用的第三方素材各自遵循上述许可，
请保留片尾署名信息。
