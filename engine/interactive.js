// 互动驱动器：把鼠标/键盘操作翻译成时间 t，画面全部复用 app.js 的渲染函数
// 播放 = t 匀速前进；跳站 = gsap 补间飞行；一切视觉状态仍是 t 的纯函数
let APP = null;
const $ = (id) => document.getElementById(id);
const ui = {
  play: $("playBtn"), prev: $("prevBtn"), next: $("nextBtn"),
  progress: $("progress"), progresswrap: $("progresswrap"),
  time: $("time"), now: $("nowplaying"), keys: $("keys"),
  panel: $("panel"), panelBtn: $("panelBtn"),
  chapterList: $("chapterList"), stationList: $("stationList"),
  modeFollow: $("modeFollow"), modeOverview: $("modeOverview"),
  mute: $("muteBtn"), videoLink: $("videoLink"), brand: $("brand"),
  bgm: $("bgm"), loader: $("loader"), loaderBar: $("loaderBar"),
  speed: $("speedBtn"), fs: $("fsBtn"), yr: $("yr"),
  root: $("root"),
};

// ---------- 1920×1080 画布自适应缩放（保持 16:9 居中） ----------
function fit() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  ui.root.style.transform = `scale(${s})`;
  ui.root.style.left = `${Math.max(0, (innerWidth - 1920 * s) / 2)}px`;
  ui.root.style.top = `${Math.max(0, (innerHeight - 1080 * s) / 2)}px`;
  ui.root.style.position = "absolute";
}
addEventListener("resize", fit);
fit();

const fmt = (s) => {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// 当前历史年份：按站点到达时间线性插值
function yearAt(t) {
  const st = APP.stations, TK = APP.TK;
  if (t <= TK[0]) return st[0].year;
  for (let k = 0; k < st.length - 1; k++) {
    if (t >= TK[k] && t <= TK[k + 1]) {
      const f = (t - TK[k]) / (TK[k + 1] - TK[k]);
      return Math.round(st[k].year + (st[k + 1].year - st[k].year) * f);
    }
  }
  return st[st.length - 1].year;
}


// ---------- 状态 ----------
let playing = false;
let raf = null;
let last = null;
let dragging = false;
let rate = 1; // 播放倍速
let jumps = []; // [{t,label}] 章节+站点统一跳转表

// ---------- 播放循环 ----------
function loop(ts) {
  if (last != null) {
    const dt = Math.min(0.12, (ts - last) / 1000);
    const ended = APP.advance(dt * rate);
    syncUI();
    if (ended) { pause(true); return; }
  }
  last = ts;
  raf = requestAnimationFrame(loop);
}
// 配乐对位：preload=none 时 duration 未知（NaN），直接赋 currentTime 会抛异常——
// 先触发播放加载，元数据就绪后再定位
function syncBgmTo(t) {
  if (ui.bgm.muted) return;
  const seek = () => { if (isFinite(ui.bgm.duration)) ui.bgm.currentTime = Math.min(t, Math.max(0, ui.bgm.duration - 1)); };
  ui.bgm.play().catch(() => {});
  if (ui.bgm.readyState >= 1) seek();
  else ui.bgm.addEventListener("loadedmetadata", seek, { once: true });
}
function play() {
  if (playing) return;
  if (APP.t >= APP.DUR - 0.05) { APP.seek(0); if (isFinite(ui.bgm.duration)) ui.bgm.currentTime = 0; }
  playing = true;
  ui.play.textContent = "❚❚";
  syncBgmTo(APP.t);
  last = null;
  raf = requestAnimationFrame(loop);
}
function pause(atEnd = false) {
  playing = false;
  ui.play.textContent = "▶";
  ui.bgm.pause();
  if (raf) cancelAnimationFrame(raf);
  raf = null;
  if (!atEnd) syncUI();
}
function toggle() { playing ? pause() : play(); }

// ---------- 跳转 ----------
function flyTo(t) {
  pause();
  APP.flyTo(t, 1.8, syncUI);
  if (!ui.bgm.muted && ui.bgm.duration) {
    ui.bgm.currentTime = Math.min(t, Math.max(0, ui.bgm.duration - 1));
  }
}
function jumpDelta(dir) {
  if (!jumps.length) return;
  const t = APP.t + (dir > 0 ? 0.35 : -0.35);
  let target;
  if (dir > 0) target = jumps.find((j) => j.t > t);
  else target = [...jumps].reverse().find((j) => j.t < t);
  if (!target) target = dir > 0 ? jumps[jumps.length - 1] : jumps[0];
  flyTo(target.t);
}

// ---------- 地形分段条（第 2 层）：显示当前路段的地理语义 ----------
const segChip = document.createElement("div");
segChip.id = "segchip";
segChip.style.cssText =
  "position:absolute;bottom:100px;left:50%;transform:translateX(-50%);z-index:20;max-width:860px;" +
  "display:flex;align-items:baseline;gap:12px;padding:7px 18px;background:rgba(10,8,5,0.74);" +
  "border:1px solid rgba(206,166,92,0.35);border-radius:4px;color:#d8c79c;font-size:15px;" +
  "letter-spacing:0.08em;transition:opacity .5s;opacity:0;pointer-events:none;white-space:nowrap";
(document.getElementById("ui") || document.body).appendChild(segChip);
const TYPE_LBL = {
  desert: "沙漠", pass: "山口", mountain: "山地", sea: "海路", river: "河谷",
  valley: "河谷", oasis: "绿洲", steppe: "草原", plain: "平原", lake: "湖海",
};
let lastSegKey = "";
function updateSegChip(t, st) {
  const seg = (APP.segments || []).find((s) => st.id >= s.from && st.id < s.to);
  const inJourney = t >= APP.T_OPEN_END && t < APP.T_OV;
  if (seg && inJourney) {
    const key = seg.from + "-" + seg.to;
    if (key !== lastSegKey) {
      lastSegKey = key;
      segChip.innerHTML =
        `<span style="color:#9fb8c9;font-size:13px;letter-spacing:.2em">${TYPE_LBL[seg.type] || seg.type} · 地形</span>` +
        `<span style="color:#efe0b5">${seg.name}</span>` +
        (seg.note ? `<span style="color:#a5987a;font-size:13px">— ${seg.note}</span>` : "");
    }
    segChip.style.opacity = "1";
  } else {
    segChip.style.opacity = "0";
    lastSegKey = "";
  }
}

// ---------- 年份刻度映射 ----------
// 进度条以「真实年份」定标：片头/片尾各占 2%，旅程段按年份线性铺开——
// 史料中的漫长空白（张骞十年扣押、法显候风五月）在时间轴上真实可见
// Y0/Y1 在 buildUI（APP 就绪后）初始化
let Y0 = 0, Y1 = 1;
const LEAD = 2, TAIL = 2; // 片头/片尾占用的百分比
function pctOfT(t) {
  const t0 = APP.TK[0], t1 = APP.TK[APP.TK.length - 1];
  if (t <= t0) return (t / Math.max(1, t0)) * LEAD;
  if (t >= t1) return 100 - TAIL + ((t - t1) / Math.max(1, APP.DUR - t1)) * TAIL;
  const y = yearAt(t);
  return LEAD + ((100 - LEAD - TAIL) * (y - Y0)) / Math.max(1e-6, Y1 - Y0);
}
function tOfPct(p) {
  const t0 = APP.TK[0], t1 = APP.TK[APP.TK.length - 1];
  if (p <= LEAD) return (p / LEAD) * t0;
  if (p >= 100 - TAIL) return t1 + ((p - (100 - TAIL)) / TAIL) * (APP.DUR - t1);
  const y = Y0 + ((p - LEAD) / (100 - LEAD - TAIL)) * (Y1 - Y0);
  const st = APP.stations;
  for (let k = 0; k < st.length - 1; k++) {
    if (y >= st[k].year && y <= st[k + 1].year) {
      const dy = st[k + 1].year - st[k].year;
      const f = dy === 0 ? 0 : (y - st[k].year) / dy;
      return APP.TK[k] + f * (APP.TK[k + 1] - APP.TK[k]);
    }
  }
  return APP.TK[st.length - 1];
}

// ---------- UI 同步 ----------
function syncUI() {
  const t = APP.t;
  const pct = pctOfT(t);
  if (!dragging) {
    ui.progress.value = pct;
    ui.progress.style.setProperty("--p", pct + "%");
  }
  ui.time.textContent = `${fmt(t)} / ${fmt(APP.DUR)}`;
    const yv = yearAt(t);
    if (ui.yr) ui.yr.textContent = yv < 0 ? `前${-yv}年` : `${yv}年`;
  const st = APP.stationAt(t);
  updateSegChip(t, st);
  ui.now.innerHTML = `第 ${String(st.id).padStart(2, "0")} 站 · ${st.name}<small>${st.modern}</small>`;
  [...ui.stationList.children].forEach((el, i) => {
    el.classList.toggle("current", APP.stations[i] && APP.stations[i].id === st.id);
  });
  [...ui.chapterList.children].forEach((el) => {
    const lo = +el.dataset.t, hi = +el.dataset.tEnd;
    el.classList.toggle("current", t >= lo && t < hi);
  });
}

// ---------- 构建 ----------
function buildUI() {
  const DUR = APP.DUR;
  Y0 = Math.min(...APP.stations.map((s) => s.year));
  Y1 = Math.max(...APP.stations.map((s) => s.year));
  ui.brand.innerHTML = `${APP.title} · 互动课堂`;

  // 进度条站点刻度（按真实年份定位）
  APP.TK.forEach((tk, i) => {
    const d = document.createElement("div");
    d.className = "tick" + (APP.stations[i].major ? " major" : "");
    d.style.left = `calc(${pctOfT(tk).toFixed(2)}% - 1px)`;
    ui.progresswrap.appendChild(d);
  });

  // 年份标尺：旅程段按整年刻度标注（前138 —— 前126 …）
  {
    const span = Math.max(1, Y1 - Y0);
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((s) => span / s <= 7) || 2000;
    for (let y = Math.ceil(Y0 / step) * step; y <= Y1; y += step) {
      const d = document.createElement("div");
      d.textContent = y < 0 ? `前${-y}` : `${y}`;
      d.style.cssText =
        `position:absolute;left:calc(${(LEAD + ((100 - LEAD - TAIL) * (y - Y0)) / span).toFixed(2)}% + 2px);` +
        "top:-15px;font-size:11px;letter-spacing:.08em;color:#6f6650;pointer-events:none;white-space:nowrap";
      ui.progresswrap.appendChild(d);
    }
  }

  // 章节（片头/总览/致谢）；总览落点在相机变焦完成之后（T_OV+8.5）
  const chapters = [
    { label: "片 头", t: 0.5, tEnd: APP.T_OPEN_END },
    { label: "总 览", t: APP.T_OV + 8.5, tEnd: APP.T_CR + 0.5 },
    { label: "致 谢", t: APP.T_CR + 1, tEnd: DUR },
  ];
  chapters.forEach((c) => {
    const d = document.createElement("div");
    d.className = "item chap";
    d.dataset.t = c.t; d.dataset.tEnd = c.tEnd;
    d.innerHTML = `<span class="nm">${c.label}</span><span class="yr">${fmt(c.t)}</span>`;
    d.onclick = () => flyTo(c.t);
    ui.chapterList.appendChild(d);
  });

  // 站点
  APP.stations.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "item";
    d.innerHTML = `<span class="no">${String(s.id).padStart(2, "0")}</span><span class="nm">${s.name}</span><span class="yr">${s.year < 0 ? "前" + (-s.year) : s.year}</span>`;
    d.onclick = () => flyTo(Math.max(0.5, APP.TK[i] - 0.01));
    ui.stationList.appendChild(d);
  });

  jumps = [
    ...chapters.map((c) => ({ t: c.t, label: c.label })),
    ...APP.stations.map((s, i) => ({ t: Math.max(0.5, APP.TK[i] - 0.01), label: s.name })),
  ].sort((a, b) => a.t - b.t);

  // 控件事件

  // 倍速 / 全屏
  const RATES = [[0.5, "½x"], [1, "1x"], [2, "2x"]];
  let rateIdx = 1;
  if (ui.speed) ui.speed.onclick = () => {
    rateIdx = (rateIdx + 1) % RATES.length;
    rate = RATES[rateIdx][0];
    ui.speed.textContent = RATES[rateIdx][1];
  };
  if (ui.fs) ui.fs.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  ui.play.onclick = toggle;
  ui.prev.onclick = () => jumpDelta(-1);
  ui.next.onclick = () => jumpDelta(1);
  ui.progress.addEventListener("input", () => {
    dragging = true;
    const pct = parseFloat(ui.progress.value);
    ui.progress.style.setProperty("--p", pct + "%");
    APP.seek(tOfPct(pct));
    if (!ui.bgm.muted && ui.bgm.duration) {
      ui.bgm.currentTime = Math.min(APP.t, Math.max(0, ui.bgm.duration - 1));
    }
  });
  ui.progress.addEventListener("change", () => { dragging = false; syncUI(); });
  ui.modeFollow.onclick = () => setMode(false);
  ui.modeOverview.onclick = () => setMode(true);
  ui.mute.onclick = () => {
    ui.bgm.muted = !ui.bgm.muted;
    ui.mute.textContent = ui.bgm.muted ? "🔇" : "🔊";
    if (!ui.bgm.muted && playing) syncBgmTo(APP.t);
  };
  // 知识卡最小化切换（点击 − 折叠为标题栏，+ 展开）
  const cardEl = document.getElementById("stationcard");
  const minBtn = document.getElementById("card-min");
  if (minBtn && cardEl) {
    minBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      cardEl.classList.toggle("minimized");
      minBtn.textContent = cardEl.classList.contains("minimized") ? "+" : "−";
    });
  }

  ui.panelBtn.onclick = () => ui.panel.classList.toggle("hidden");
  // 站点环境下显示「课程列表」，项目本地预览显示「观看影片」
  const onSite = location.pathname.includes("/courses/");
  ui.videoLink.textContent = onSite ? "⌂ 课程列表" : "观看影片";
  ui.videoLink.onclick = () => location.href = onSite ? "../../" : "index.html";

  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" && e.target !== ui.progress) return;
    if (e.key === " ") { e.preventDefault(); toggle(); }
    else if (e.key === "ArrowRight") jumpDelta(1);
    else if (e.key === "ArrowLeft") jumpDelta(-1);
    else if (e.key === "o" || e.key === "O") setMode(!APP.isOverview());
    else if (e.key === "m" || e.key === "M") ui.mute.onclick();
    else if (e.key === "f" || e.key === "F") ui.fs && ui.fs.onclick();
    else if (e.key === "r" || e.key === "R") APP.resetViewport && APP.resetViewport();
  });

  // 地图交互提示（拖拽/缩放为运行时注入的能力，提示文案随之动态补全）
  // 修复：syncUI 每帧覆写 #nowplaying.innerHTML 会连带销毁 #keys —— 先移出到父级使其常驻
  if (ui.keys && ui.now && ui.keys.parentNode === ui.now) ui.now.parentNode.appendChild(ui.keys);
  if (ui.keys) ui.keys.textContent += " · 拖拽平移 · 滚轮缩放 · R 复位";

  // 初始：片头 + 跟随模式
  APP.setOverview(false);
  APP.seek(2.2);
  syncUI();

  // ---------- 进度记忆 + 分享定位 ----------
  const LS = "gzmap-last-" + (window.COURSE_ID || "course");
  const saveProgress = () => { try { localStorage.setItem(LS, String(APP.t)); } catch (e) {} };
  ui.progress.addEventListener("change", saveProgress);
  addEventListener("pagehide", saveProgress);
  setInterval(() => { if (playing) saveProgress(); }, 5000);

  const urlT = parseFloat(new URLSearchParams(location.search).get("t") || "0");
  const saved = parseFloat(localStorage.getItem(LS) || "0");
  if (urlT > 0) {
    flyTo(Math.min(APP.DUR - 1, Math.max(0.5, urlT)), 1.4);
  } else if (saved > 15 && saved < APP.DUR - 8) {
    const toast = document.createElement("div");
    toast.style.cssText = "position:absolute;top:72px;left:50%;transform:translateX(-50%);z-index:35;display:flex;gap:10px";
    toast.innerHTML = `<button class="btn">上次学到 ${fmt(saved)} · 继续学习</button><button class="btn" style="opacity:0.65">忽略</button>`;
    toast.children[0].onclick = () => { flyTo(saved); toast.remove(); };
    toast.children[1].onclick = () => toast.remove();
    document.getElementById("ui").appendChild(toast);
    setTimeout(() => toast.remove(), 12000);
  }
}
function setMode(overview) {
  APP.setOverview(overview);
  ui.modeFollow.classList.toggle("active", !overview);
  ui.modeOverview.classList.toggle("active", overview);
}

// ---------- 等待 app.js 就绪 ----------
const waitReady = () => {
  if (window.APP) {
    APP = window.APP;
    buildUI();
    ui.loader.classList.add("done");
    setTimeout(() => ui.loader.remove(), 800);
  } else {
    ui.loaderBar.style.width = Math.min(92, (ui.loaderBar.style.width.replace("%", "") | 0) + 6) + "%";
    setTimeout(waitReady, 120);
  }
};
waitReady();
