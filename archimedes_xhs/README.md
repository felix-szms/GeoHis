# 阿基米德 · 小红书竖屏版（66s）

《阿基米德》的知识博主竖屏重制版：**1080×1920（9:16）**、66 秒、10 个知识点、
钩子开场 + 冷知识字幕条 + 结尾引导卡。横屏原版保留在 `../archimedes/`。

## 成品

- `render/archimedes_xhs_final.mp4` — 竖屏母版（68.8MB）
- `render/archimedes_xhs_share.mp4` — 分享版（17.7MB，faststart，可直接发小红书）

## 与横屏版的差异

| | 横屏版（archimedes） | 小红书版（本项目） |
|---|---|---|
| 画幅 | 1920×1080 横屏 | 1080×1920 竖屏 9:16 |
| 节奏 | 纪录片式，站间按航线距离分配时长 | 等时长分段（`segEqual`），每站 ~5s 干净利落 |
| 开场 | 毛笔字题卡 6s | 3 秒钩子 + 人物名卡（`timing.hook` 时序可调） |
| 知识密度 | 8 站 | 10 站 + 每站一条「冷知识」字幕条（`note` 字段） |
| 结尾 | credits 署名页 | 「关注我」引导卡 + 底部一行 CC 署名（合规） |
| 相机 | 电影环绕运镜 | 同框架，`camScale: 2.0` 补偿竖屏窄视场 |

## 知识点位（10 站）

叙拉古出生 → 亚历山大留学（法罗斯灯塔）→ 螺旋泵（2300 年）→ 尤里卡（浮力）→
杠杆名言 → 割圆求 π（22/7，精度保持 800 年）→ 球与圆柱 2:3（西塞罗寻墓）→
罗马围城（火镜/起重机之爪，相传）→ 之死（"别弄乱我的圆"为后世传说）→
彩蛋：菲尔兹奖章上印着他的脸。

新增史料素材：菲尔兹奖章正面照、Felice Giani《阿基米德之死》、法罗斯灯塔版画、
阿基米德重写本页面、奥提伽岛航拍（均公有领域/CC，Wikimedia Commons）。

## 竖屏扩展（对泛化框架的增量，全部数据驱动）

```jsonc
// data/stations.json → meta
"canvas":   { "w": 1080, "h": 1920 },   // 画幅
"camScale": 2.0,                         // 竖屏窄视场的相机距离补偿
"ovMargin": 1.5,                         // 总览取景余量
"timing": {
  "hook": [0.3, 1.3, 2.2, 3.2],          // 钩子卡淡入/淡出时序
  "segEqual": true,                      // 站间等时长（快节奏）
  "cardHold": 4.0,                       // 知识卡持续时长
  "statsCount": 3                        // 统计数字滚动秒数
},
// stations[] 新增字段
"note": "冷知识字幕",        // 底部字幕条（无则隐藏）
"labelOnMap": false,         // 总览地图上隐藏该站标签（密集区防重叠）
"labelDx/Dy": -30, -52       // 标签手工偏移
```

## 渲染与预览

```bash
npx hyperframes render --fps 24 -q high -o render/archimedes_xhs_final.mp4  # ~1 分钟
node scripts/serve.mjs 8912   # 预览 http://127.0.0.1:8912/index.html
```

## 许可（结尾卡已含一行署名）

地图 NASA · 音乐 "Wallpaper" Kevin MacLeod（CC BY 3.0）· 图像 公有领域（Wikimedia Commons）·
字体 马善政毛笔楷书 / 思源宋体（OFL）
