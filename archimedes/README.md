# 阿基米德 · 路线图动画视频（60s）

与《玄奘西行》（`../xuanzang/`）同一套框架生成的第二部作品：把"阿基米德的一生"
画成地中海上的往返航线。60 秒 · 1920×1080 · 24fps · 含配乐（萨蒂《Gymnopedie No.1》，
Kevin MacLeod 演奏版，CC BY 3.0）。

## 成品

- `render/archimedes_final.mp4` — 母版（62.8MB）
- `render/archimedes_share.mp4` — 分享版（13.8MB，faststart）
- 渲染：`npx hyperframes render --fps 24 -q high -o render/archimedes_final.mp4`（约 1 分钟）

## 互动网页版（教学用途）

`interactive.html` —— 与视频同一渲染核心的交互页面：

```bash
node scripts/serve.mjs 8910
# 浏览器打开 http://127.0.0.1:8910/interactive.html
```

- **教学模式相机**：北向恒定朝上、上帝视角俯视（`app.js` 里 `window.__INTERACTIVE` 切换）
- 上一站/下一站（←→ 或按钮）、可拖动进度条（带站点刻度）、目录面板（章节+全部站点点击跳转）
- 跟随/总览两种视图（O 键）、播放/暂停（空格）、配乐同步播放与静音（M）
- 跳站时相机沿航线平滑飞行（t 补间），画面与视频逐帧同源
- 1920×1080 画布按窗口等比缩放，适配投影/平板

部署：把整个目录静态托管即可（nginx / 任意对象存储 + CDN），入口 `interactive.html`。

## 与玄奘项目的差异（框架已泛化）

本项目的 `app.js` 是**题材无关**版本：时间轴、开场相机、年代标签、统计数字、
片头片尾文案全部来自 `data/stations.json` 的 `meta` 字段。换题材只需：

1. 改 `data/stations.json`：
   - `meta.timing` —— 时长/题卡/旅程/总览/credits 的时间切分与停留时长
   - `meta.openCamera` —— 开场镜头经纬度
   - `meta.eraLegLabels` —— 去/返程的年代后缀（西行纪/东归纪 或 游学纪/归乡纪）
   - `stations[].leg` —— `"out"`(去程) / `"ret"`(归程)，决定站点定位搜索的曲线区间
   - `stations[].labelOnMap` / `labelDx,labelDy` —— 总览地图上的标签显隐与偏移（密集区防重叠）
   - `meta.ending.stats` —— 数字滚动统计（整数自动 count-up）
2. `node scripts/fetch-assets.mjs tiles`（改脚本里 `CORRIDOR` 为新路线范围）
3. `npx hyperframes render`

### 本片数据要点

- 8 站：叙拉古 → 亚历山大（游学）→ 返叙拉古：尤里卡 → 杠杆 → 割圆术 → 球与圆柱 → 罗马围城 → 之死
- 航线：西西里 ↔ 尼罗河三角洲的往返弧线，去程偏南、回程偏北，总览呈"眼睛"形
- 海路题材专用调整：地形材质加 `emissiveMap` 自发光（Blue Marble 深海瓦片本身近黑，
  纯光照下会死黑），`#grade` 调色层减弱
- 史实处理：尤里卡出自维特鲁威（晚约 200 年）、临终情节出自普鲁塔克，文案均用"相传"标注

## 素材许可（片尾已署名）

- 地图：NASA Blue Marble（公有领域）、Mapzen/AWS Terrain Tiles
- 音乐："Gymnopedie No.1"（萨蒂曲）Kevin MacLeod 演奏（CC BY 3.0, incompetech）
- 插图：费蒂《阿基米德肖像》1620、浴缸版画、Giulio Parigi《火镜》、法雕肖像页等（均公有领域）
- 字体：马善政毛笔楷书（OFL）、思源宋体（SIL OFL）

## 本地预览

```bash
node scripts/serve.mjs 8910   # 或任意静态服务器
# 浏览器打开 http://127.0.0.1:8910/index.html
```
