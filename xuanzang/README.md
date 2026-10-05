# 玄奘西行 · 路线图动画视频

复刻 B 站 UP 主「i陆三金」用 Claude Opus 5.5 制作的《玄奘西行》路线图动画
（[原视频](https://www.bilibili.com/video/BV1BnhX6tEie/)）。4 分 22 秒 · 1920×1080 · 24fps，
完全由代码生成，无任何视频剪辑软件参与。

技术栈与原片片尾 credits 一致：**three.js（3D 卫星地形）+ GSAP（确定性时间轴）+ HyperFrames（逐帧渲染 HTML → MP4）**。

## 成品

- `render/xuanzang_final.mp4` — 最终成片（1080p24，含配乐）
- `interactive.html` — **互动网页版**：与视频同一渲染核心，北向锁定上帝视角，
  上一站/下一站（←→）、目录跳转、拖动进度条、跟随/总览切换（O）、配乐同步
- 本地预览：`node scripts/serve.mjs 8911` → 打开 `interactive.html`（互动）或 `index.html`（影片合成）
- 部署：整目录静态托管即可，教学入口用 `interactive.html`
- 渲染：`npx hyperframes render --fps 24 -q high -o render/xuanzang_final.mp4`（约 10 分钟，Apple Silicon 硬件加速）

## 结构

```
index.html            合成主体（HyperFrames composition：data-* 时间轴 + DOM 覆盖层 + 音轨）
app.js                three.js 场景 + 确定性动画（一切画面状态都是绝对时间 t 的纯函数）
data/stations.json    ★ 全部内容数据：28 站史实数据、去程/归途路线折线、西游记原型标签、文案
assets/tiles/         NASA Blue Marble 卫星贴图（z4-z8）+ AWS/Mapzen 高程瓦片（z7），已本地缓存
assets/fonts/         马善政毛笔楷书（Google Fonts, OFL）+ 思源宋体（adobe-fonts, SIL OFL）
assets/music/         Kevin MacLeod "Eastern Thought"（CC BY 3.0, incompetech）—— 与原片同曲
assets/art/           公有领域古典版画（1592 金陵世德堂本 / 李卓吾批评本 / 榆林窟壁画等, Wikimedia Commons）
scripts/fetch-assets.mjs  素材下载脚本（瓦片/字体/音乐/插图，全部本地化保证确定性渲染）
```

## 工作原理

1. **数据驱动**：`data/stations.json` 里的 28 个站点沿路线弧长参数化，自动推导每站的到达时间
   （大站停留 4.2s，小站 1.1s），旅程总长固定 15s–229s。
2. **确定性渲染**：`app.js` 不用 requestAnimationFrame，一切状态由 `update(t)` 计算——
   HyperFrames 用 Puppeteer 逐帧 seek GSAP 时间轴（`window.__timelines.main`），截图后 FFmpeg 编码。
   同一输入永远得到同一输出。
3. **地形**：z7 高程瓦片解码（terrarium 编码）生成 3D 网格，z8 卫星贴图 4 合 1 铺面，
   暗角 + 暖色 multiply 调色层做出电影感。
4. **路线**：CatmullRom 平滑折线 → 两层加法混合发光 Tube（uProgress 控制绘制进度），
   高程采样让路线贴地。

## 换题材（丝绸之路 / 郑和下西洋 / 长征……）

1. 改 `data/stations.json`：站点（名称/坐标/文案/年份）、`routes` 折线、`tags` 标签、结尾统计数字
2. `node scripts/fetch-assets.mjs --tiles`（改脚本里 `CORRIDOR` 为新路线的经纬度范围）
3. 重新渲染。相机、总览取景、里程 HUD 全部自适应。

## 依赖

- Node ≥ 22、FFmpeg（`brew install ffmpeg`）
- `npm install`（hyperframes / three / gsap）
- Chrome Headless Shell：`npx hyperframes browser ensure`

## 许可与署名（已写入片尾 credits）

- 地图数据：NASA Blue Marble（公有领域）、Terrain Tiles · Mapzen/AWS Open Data
- 音乐："Eastern Thought" Kevin MacLeod（CC BY 3.0, incompetech.com）
- 字体：马善政毛笔楷书（OFL）、思源宋体（SIL OFL）
- 插图：公有领域古版画（Wikimedia Commons）
