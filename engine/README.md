# engine/ · 共享引擎

全站课程的公共运行时，**单源维护，全站生效**。各课程页面通过课程内 `engine/` 同步副本引用（见下），不再各自复制引擎代码。

## 组成

| 文件 | 说明 |
|------|------|
| `app.js` | three.js 地形场景 + 确定性渲染引擎（画面 = 时间 t 的纯函数） |
| `interactive.js` | 互动驱动器（播放/跳站/进度记忆，鼠标键盘 → 时间轴 seek） |
| `serve.mjs` | 课程独立预览服务器（绑 0.0.0.0，自动挂载 /engine/） |
| `fetch-assets.mjs` | 参数化素材下载器，读 `<course>/data/assets.json` |
| `vendor/` | gsap 3.15.0 · three 0.186.1（three.module.js + three.core.js，r167+ 的 three.module.js 必须与 three.core.js 成对出现） |
| `test-importmap.html` | 浏览器环境 importmap 冒烟测试页 |

## 同步机制（为什么各课程里还有一个 engine/ 目录）

hyperframes 以**课程目录为项目根**做逐帧渲染，页面引用不能越出课程目录。
因此仓库根 `engine/` 是唯一源，`scripts/sync-engine.mjs` 把它分发为各课程内
`engine/` 副本（已 gitignore）。改引擎代码的流程：

```bash
# 1. 只改根 engine/ 下的文件
# 2. 同步到全部课程
node scripts/sync-engine.mjs
# 3. 校验
node scripts/validate.mjs
```

CI 与 Docker 初始化（deploy/Dockerfile.init）都会自动执行同步。

## 变体说明

- `archimedes/` 与 `archimedes_xhs/` 保留**各自的本地** `app.js`/`interactive.js`：
  它们是海洋/竖屏变体（光照常量、相机距离补偿 camScale、海床自发光等差异），
  与本引擎的通用版本不同源。它们仍然共享 `vendor/`、`serve.mjs`、`fetch-assets.mjs`。
- 引擎基线取自张骞课程（含路线头部光斑 `depthTest: false` 修复，全站因此受益）。

## 素材参数（data/assets.json）

每门课程一份，走廊/层级/近景带/配乐全部数据化：

```json
{
  "corridor": { "west": 65, "east": 112, "south": 23.5, "north": 47 },
  "margin": 1,
  "zooms": [7],
  "z8": { "mode": "full" },
  "music": "eastern-thought.mp3"
}
```

- `zooms`：地形层级（sat+dem），如 archimedes 用 `[6, 7]`
- `z8.mode`：`full`（z7 范围×2 全覆盖）｜`zones`（指定近景带矩形，去重）｜`none`
- `margin`：各层级边界外扩瓦片数

下载：`cd <course> && node ../../engine/fetch-assets.mjs`（幂等断点续传）。
`deploy/fetch.mjs`（Docker 用并行版）读取**同一份** assets.json，参数单源。

## 性能注记

地形贴图请求已并行化：先建几何体并发出全部贴图请求（浏览器自行限并发），
模块求值结束前统一回填材质 —— 保持「模块就绪 = 场景完整」的确定性语义，
互动/逐帧渲染不受影响，加载耗时约为串行版的三分之一。
