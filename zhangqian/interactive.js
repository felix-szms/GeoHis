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

// ---------- 状态 ----------
let playing = false;
let raf = null;
let last = null;
let dragging = false;
let jumps = []; // [{t,label}] 章节+站点统一跳转表

// ---------- 播放循环 ----------
function loop(ts) {
  if (last != null) {
    const dt = Math.min(0.12, (ts - last) / 1000);
    const ended = APP.advance(dt);
    syncUI();
    if (ended) { pause(true); return; }
  }
  last = ts;
  raf = requestAnimationFrame(loop);
}
function play() {
  if (playing) return;
  if (APP.t >= APP.DUR - 0.05) { APP.seek(0); ui.bgm.currentTime = 0; }
  playing = true;
  ui.play.textContent = "❚❚";
  if (!ui.bgm.muted) {
    ui.bgm.currentTime = Math.min(APP.t, Math.max(0, ui.bgm.duration - 1));
    ui.bgm.play().catch(() => {});
  }
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

// ---------- UI 同步 ----------
function syncUI() {
  const t = APP.t;
  const pct = (t / APP.DUR) * 100;
  if (!dragging) {
    ui.progress.value = pct;
    ui.progress.style.setProperty("--p", pct + "%");
  }
  ui.time.textContent = `${fmt(t)} / ${fmt(APP.DUR)}`;
  const st = APP.stationAt(t);
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
  ui.brand.innerHTML = `${APP.title} · 互动课堂`;

  // 进度条站点刻度
  APP.TK.forEach((tk, i) => {
    const d = document.createElement("div");
    d.className = "tick" + (APP.stations[i].major ? " major" : "");
    d.style.left = `calc(${(tk / DUR) * 100}% - 1px)`;
    ui.progresswrap.appendChild(d);
  });

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
  ui.play.onclick = toggle;
  ui.prev.onclick = () => jumpDelta(-1);
  ui.next.onclick = () => jumpDelta(1);
  ui.progress.addEventListener("input", () => {
    dragging = true;
    const pct = parseFloat(ui.progress.value);
    ui.progress.style.setProperty("--p", pct + "%");
    APP.seek((pct / 100) * DUR);
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
    if (!ui.bgm.muted && playing) { ui.bgm.currentTime = Math.min(APP.t, Math.max(0, ui.bgm.duration - 1)); ui.bgm.play().catch(() => {}); }
  };
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
  });

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
