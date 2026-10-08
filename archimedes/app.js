// 《阿基米德》路线图动画 —— 复用玄奘框架的题材无关版本
// 一切画面状态都是绝对时间 t 的纯函数：HyperFrames 逐帧 seek，无 rAF 循环
// 题材相关量全部来自 data/stations.json 的 meta（时间轴/文案/开场相机/年代标签）
import * as THREE from "three";

const W = 1920, H = 1080;

const DATA = await (await fetch("data/stations.json?v=2")).json();
const META = DATA.meta;
const TIMING = META.timing;
const CAMS = META.camScale || 1; // 竖屏等窄视场的相机距离补偿（默认 1）

// ---------- 交互模式（教学网页设 window.__INTERACTIVE = true） ----------
// 视频渲染：电影运镜；互动网页：北向锁定上帝视角
const TOP = !!window.__INTERACTIVE;
// 用户视口（仅互动模式）：拖拽平移 + 滚轮缩放。纯视口变换，不触碰时间轴
const VP = { panX: 0, panZ: 0, zoom: 1 };
// 站点所属旅程段：数据未写 leg 时按 legSplit 阈值推断（兼容玄奘数据）
const legOf = (st) => st.leg || (st.id <= (META.legSplit ?? DATA.stations.length) ? "out" : "ret");

// ---------- 时间轴布局（秒，来自 data.meta.timing） ----------
const DUR = TIMING.dur;
const T_OPEN_END = TIMING.openEnd;
const T_J0 = TIMING.j0, T_J1 = TIMING.j1;
const T_OV = TIMING.ov;
const T_CR = TIMING.cr;
const DWELL_MAJOR = TIMING.dwellMajor, DWELL_MINOR = TIMING.dwellMinor;
const KM_SCALE = TIMING.kmScale;

const TILE = 7;             // 地形/高程瓦片层级
const PX = 256;
const UNITS_PER_METER = 1 / 430;   // 高程纵向夸张系数

// ---------- Web Mercator ----------
const lngToX = (lng, z) => ((lng + 180) / 360) * Math.pow(2, z) * PX;
const latToY = (lat, z) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * Math.pow(2, z) * PX;
};
const xToLng = (x, z) => (x / (PX * Math.pow(2, z))) * 360 - 180;
const yToLat = (y, z) => {
  const n = Math.PI - 2 * Math.PI * (y / (PX * Math.pow(2, z)));
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

// 字体就绪后再进入构建：确保首帧起标题即为毛笔楷书
await Promise.all([
  document.fonts.load('100px "MaShanZheng"'),
  document.fonts.load('400 20px "SourceHanSerif"'),
  document.fonts.load('700 20px "SourceHanSerif"'),
]).catch(() => {});

// ---------- 场景基本 ----------
const canvas = document.getElementById("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0b08);
scene.fog = new THREE.Fog(0x0d0b08, 900, 2600);

const camera = new THREE.PerspectiveCamera(40, W / H, 1, 12000);

scene.add(new THREE.AmbientLight(0xfff2dc, 0.88));
const sun = new THREE.DirectionalLight(0xffdca8, 1.15);
sun.position.set(-1, 0.9, -0.55);
scene.add(sun);

// 衬底：地形网格范围之外的暗色大地（消灭画面边缘黑边）
const underlay = new THREE.Mesh(
  new THREE.PlaneGeometry(60000, 60000),
  new THREE.MeshBasicMaterial({ color: 0x171108 })
);
underlay.rotation.x = -Math.PI / 2;
underlay.position.y = -6;
scene.add(underlay);

// ---------- 地形（z7 高程网格 + z8 卫星贴图） ----------
const texLoader = new THREE.TextureLoader();
const demData = new Map();

function loadDem(x, y) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = PX;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      demData.set(`${x},${y}`, ctx.getImageData(0, 0, PX, PX).data);
      res();
    };
    img.onerror = () => res();
    img.src = `assets/tiles/dem/${TILE}/${x}/${y}.png`;
  });
}

function heightAt(wx, wy) {
  const tx = Math.floor(wx / PX), ty = Math.floor(wy / PX);
  const d = demData.get(`${tx},${ty}`);
  if (!d) return 0;
  const fx = Math.min(PX - 1.001, wx - tx * PX), fy = Math.min(PX - 1.001, wy - ty * PX);
  const ix = Math.floor(fx), iy = Math.floor(fy), rx = fx - ix, ry = fy - iy;
  const px = iy * PX + ix;
  const dec = (p) => (d[p] * 256 + d[p + 1] + d[p + 2] / 256) - 32768;
  const h00 = dec(px * 4), h10 = dec((px + 1) * 4), h01 = dec((px + PX) * 4), h11 = dec((px + PX + 1) * 4);
  const h = h00 * (1 - rx) * (1 - ry) + h10 * rx * (1 - ry) + h01 * (1 - rx) * ry + h11 * rx * ry;
  return Math.max(-450, h) * UNITS_PER_METER;
}

const MANIFEST = await (await fetch("assets/tiles/manifest.json")).json();
const { corridor } = MANIFEST;
const TX0 = Math.floor(lngToX(corridor.west, TILE) / PX);
const TX1 = Math.floor(lngToX(corridor.east, TILE) / PX);
const TY0 = Math.floor(latToY(corridor.north, TILE) / PX);
const TY1 = Math.floor(latToY(corridor.south, TILE) / PX);

const promises = [];
for (let x = TX0; x <= TX1; x++)
  for (let y = TY0; y <= TY1; y++) promises.push(loadDem(x, y));
await Promise.all(promises);

const CX = (lngToX(corridor.west, TILE) + lngToX(corridor.east, TILE)) / 2;
const CY = (latToY(corridor.north, TILE) + latToY(corridor.south, TILE)) / 2;

const w2s = (lng, lat) => {
  const wx = lngToX(lng, TILE) - CX;
  const wy = latToY(lat, TILE) - CY;
  return new THREE.Vector3(wx, 0, wy);
};
const lngToWorldX = (lng) => lngToX(lng, TILE);
const latToWorldY = (lat) => latToY(lat, TILE);

// ---------- 贴图（z8 四合一，缺失回退 z7，再缺失用深色材质） ----------
function loadImg(src) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}
const texCache = new Map();
async function awaitTileTexture(x, y) {
  const key = `${x},${y}`;
  if (texCache.has(key)) return texCache.get(key);
  const imgs = await Promise.all([
    loadImg(`assets/tiles/sat/8/${2 * x}/${2 * y}.jpg`),
    loadImg(`assets/tiles/sat/8/${2 * x + 1}/${2 * y}.jpg`),
    loadImg(`assets/tiles/sat/8/${2 * x}/${2 * y + 1}.jpg`),
    loadImg(`assets/tiles/sat/8/${2 * x + 1}/${2 * y + 1}.jpg`),
  ]);
  let tex = null;
  if (imgs.every(Boolean)) {
    const c = document.createElement("canvas");
    c.width = c.height = 512;
    const g = c.getContext("2d");
    g.drawImage(imgs[0], 0, 0, 256, 256);
    g.drawImage(imgs[1], 256, 0, 256, 256);
    g.drawImage(imgs[2], 0, 256, 256, 256);
    g.drawImage(imgs[3], 256, 256, 256, 256);
    tex = new THREE.CanvasTexture(c);
  } else {
    const z7 = await loadImg(`assets/tiles/sat/${TILE}/${x}/${y}.jpg`);
    if (z7) tex = new THREE.CanvasTexture(z7);
  }
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
  }
  texCache.set(key, tex);
  return tex;
}

const terrainMats = [];
const texJobs = []; // 贴图请求全部先发出（浏览器自行限并发），几何体构建不再被逐瓦片 await 阻塞
const texCells = [];
const SEGS = 32;
// 互动模式首屏只取 z7（瓦片量 ~1/5，场景尽快可玩），z8 在模块就绪后后台逐格升级
// 视频渲染（TOP=false）仍等待完整 z8，确定性逐帧输出不受影响
const z7Texture = async (x, y) => {
  const img = await loadImg(`assets/tiles/sat/${TILE}/${x}/${y}.jpg`);
  if (!img) return null;
  const t = new THREE.CanvasTexture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
for (let x = TX0; x <= TX1; x++) {
  for (let y = TY0; y <= TY1; y++) {
    const geo = new THREE.BufferGeometry();
    const verts = [], uvs = [], idx = [];
    for (let iy = 0; iy <= SEGS; iy++) {
      for (let ix = 0; ix <= SEGS; ix++) {
        const wx = x * PX + (ix / SEGS) * PX, wy = y * PX + (iy / SEGS) * PX;
        verts.push(wx - CX, heightAt(wx, wy), wy - CY);
        uvs.push(ix / SEGS, 1 - iy / SEGS);
      }
    }
    for (let iy = 0; iy < SEGS; iy++) {
      for (let ix = 0; ix < SEGS; ix++) {
        const a = iy * (SEGS + 1) + ix, b = a + 1, c = a + SEGS + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    texJobs.push(TOP ? z7Texture(x, y) : awaitTileTexture(x, y));
    texCells.push({ x, y });
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.96, metalness: 0, color: 0x1a150e,
      // 海路题材：深海贴图极暗，用同贴图低强度自发光保持海底纹理可见
      emissive: 0x8a8fa6, emissiveIntensity: 0,
    });
    terrainMats.push(mat);
    scene.add(new THREE.Mesh(geo, mat));
  }
}
// 等全部贴图就绪后回填材质：保持「模块求值完成 = 场景完整」的确定性语义（逐帧渲染依赖）
(await Promise.all(texJobs)).forEach((tex, i) => {
  if (!tex) return;
  const mat = terrainMats[i];
  mat.map = tex;
  mat.emissiveMap = tex;
  mat.emissiveIntensity = 0.8; // 海路题材：保持海底纹理可见
  mat.color.set(0xffffff);
  mat.needsUpdate = true;
});

// 互动模式：z8 近景贴图后台逐格升级（不阻塞交互）
if (TOP) {
  (async () => {
    for (let i = 0; i < texCells.length; i++) {
      try {
        const tex = await awaitTileTexture(texCells[i].x, texCells[i].y);
        if (!tex) continue;
        const mat = terrainMats[i];
        if (mat.map && mat.map !== tex) mat.map.dispose();
        mat.map = tex;
        mat.emissiveMap = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      } catch { /* 单格失败无妨，保留 z7 */ }
    }
  })();
}

// ---------- 路线 ----------
function routePoints(list) {
  return list.map(([lng, lat]) => {
    const p = w2s(lng, lat);
    p.y = heightAt(lngToWorldX(lng), latToWorldY(lat)) + 2.2;
    return p;
  });
}
const allPts = routePoints(DATA.routes.outbound).concat(
  routePoints(DATA.routes.return).slice(1)
);
const curve = new THREE.CatmullRomCurve3(allPts, false, "centripetal", 0.5);
// 关键：显式构建高分辨率弧长查找表，否则 u→位置 映射失真（默认仅 200 档）
curve.arcLengthDivisions = 6000;
curve.getLengths(6000);

function makeRouteTube(radius, opacity, tailRate) {
  const geo = new THREE.TubeGeometry(curve, 2400, radius, 8, false);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uProg: { value: 0 },
      uOpacity: { value: opacity },
      uTail: { value: tailRate },
      uColor: { value: new THREE.Color(0xffca6a) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uProg; uniform float uOpacity; uniform float uTail; uniform vec3 uColor;
      varying vec2 vUv;
      void main(){
        float d = uProg - vUv.x;
        if (d < 0.0) discard;
        float a = 0.42 + 0.58 * exp(-d * uTail);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  scene.add(mesh);
  return mat;
}
const tubeCore = makeRouteTube(0.55, 1.0, 0.045);
const tubeGlow = makeRouteTube(1.9, 0.40, 0.012);

// 路线包围盒 → 总览相机参数（自适应题材）
const routeBBox = new THREE.Box3().setFromPoints(allPts);
const bboxCenter = routeBBox.getCenter(new THREE.Vector3());
const bboxSize = routeBBox.getSize(new THREE.Vector3());
const HFIZ = 2 * Math.atan(Math.tan((40 * Math.PI) / 360) * (W / H));
const OV_DIST = Math.max(
  bboxSize.x / (2 * Math.tan(HFIZ / 2)),
  bboxSize.z / (2 * Math.tan((40 * Math.PI) / 360))
) * 1.42;

function glowTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, inner);
  rg.addColorStop(0.35, outer);
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const headTex = glowTexture("rgba(255,252,238,1)", "rgba(255,190,90,0.55)");
const dotTex = glowTexture("rgba(255,240,210,1)", "rgba(255,180,80,0.4)");

const headGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
headGlow.scale.setScalar(15);
headGlow.renderOrder = 8;
scene.add(headGlow);

const stationPos = DATA.stations.map((st) => {
  const p = w2s(st.lng, st.lat);
  p.y = heightAt(lngToWorldX(st.lng), latToWorldY(st.lat)) + 4;
  return p;
});
const stationSprites = DATA.stations.map((st, i) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  s.scale.setScalar(5.5);
  s.renderOrder = 7;
  s.position.copy(stationPos[i]);
  scene.add(s);
  return s;
});

// ---------- 站点在曲线上的参数 u（按 leg 分段最近点搜索，保证单调） ----------
const SAMPLES = 4000;
const uOf = new Float32Array(SAMPLES + 1);
for (let i = 0; i <= SAMPLES; i++) uOf[i] = i / SAMPLES;
function nearestU(pos, lo = 0, hi = 1) {
  let best = lo, bd = Infinity;
  const i0 = Math.floor(lo * SAMPLES), i1 = Math.ceil(hi * SAMPLES);
  for (let i = i0; i <= i1; i++) {
    const u = uOf[i];
    const p = curve.getPointAt(u);
    const dd = p.distanceToSquared(pos);
    if (dd < bd) { bd = dd; best = u; }
  }
  return best;
}
// 分界 u：去程终点（=归程起点）
const outboundEndPos = w2s(
  DATA.routes.outbound[DATA.routes.outbound.length - 1][0],
  DATA.routes.outbound[DATA.routes.outbound.length - 1][1]
);
const uDivider = nearestU(outboundEndPos);
const stationU = [];
{
  let prev = 0;
  DATA.stations.forEach((st, i) => {
    const lo = legOf(st) === "out" ? prev : Math.max(prev, uDivider - 1e-4);
    const hi = legOf(st) === "out" ? Math.min(1, uDivider + 1e-4) : 1;
    const u = nearestU(stationPos[i], lo, hi);
    stationU.push(u);
    prev = u;
  });
}

// 里程（haversine × 蜿蜒系数）
function kmBetween(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const kmTrack = [];
{
  let acc = 0;
  const all = DATA.routes.outbound.concat(DATA.routes.return.slice(1));
  kmTrack.push(0);
  for (let i = 1; i < all.length; i++) { acc += kmBetween(all[i - 1], all[i]); kmTrack.push(acc); }
}
const TOTAL_KM = Math.round(kmTrack[kmTrack.length - 1] * KM_SCALE);
const outLen = DATA.routes.outbound.length;
const stationKm = DATA.stations.map((st) => {
  const arr = legOf(st) === "out" ? DATA.routes.outbound : DATA.routes.return;
  let bi = 0, bd = Infinity;
  arr.forEach(([lng, lat], i) => {
    const dd = (lng - st.lng) ** 2 + (lat - st.lat) ** 2;
    if (dd < bd) { bd = dd; bi = i; }
  });
  const off = st.leg === "out" ? bi : outLen - 1 + bi;
  return Math.round(kmTrack[off] * KM_SCALE);
});

// ---------- 站点到达时间表 ----------
const dwells = DATA.stations.map((st) => (st.major ? DWELL_MAJOR : DWELL_MINOR));
const TK = (() => {
  const span = T_J1 - T_J0 - dwells.reduce((a, b) => a + b, 0);
  const du = [0];
  for (let k = 1; k < stationU.length; k++) du.push(stationU[k] - stationU[k - 1]);
  const duSum = du.reduce((a, b) => a + b, 0) || 1;
  const tk = [T_J0];
  for (let k = 1; k < stationU.length; k++) {
    tk.push(tk[k - 1] + (du[k] / duSum) * span + dwells[k - 1]);
  }
  return tk;
})();

// ---------- 路线高程剖面（DEM 采样） ----------
const ELEV_N = 160;
const elevData = [];
let elevMin = Infinity, elevMax = -Infinity;
for (let i = 0; i < ELEV_N; i++) {
  const p3 = curve.getPointAt(i / (ELEV_N - 1));
  const em = Math.max(0, Math.round(heightAt(p3.x + CX, p3.z + CY) / UNITS_PER_METER));
  elevData.push(em);
  elevMin = Math.min(elevMin, em);
  elevMax = Math.max(elevMax, em);
}
if (elevMax - elevMin < 50) elevMax = elevMin + 50; // 全程平直（海路）时避免除零

function drawElev(u) {
  const c = el.hudElev;
  if (!c) return;
  const g = c.getContext("2d");
  const CW = c.width, CH = c.height;
  g.clearRect(0, 0, CW, CH);
  const n = elevData.length;
  const yOf = (v) => CH - 5 - ((v - elevMin) / (elevMax - elevMin)) * (CH - 13);
  // 剖面填充
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * CW;
    i === 0 ? g.moveTo(x, yOf(elevData[i])) : g.lineTo(x, yOf(elevData[i]));
  }
  g.lineTo(CW, CH); g.lineTo(0, CH); g.closePath();
  const grd = g.createLinearGradient(0, 0, 0, CH);
  grd.addColorStop(0, "rgba(240,205,126,0.34)");
  grd.addColorStop(1, "rgba(240,205,126,0.04)");
  g.fillStyle = grd;
  g.fill();
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * CW;
    i === 0 ? g.moveTo(x, yOf(elevData[i])) : g.lineTo(x, yOf(elevData[i]));
  }
  g.strokeStyle = "#f0cd7e";
  g.lineWidth = 1.4;
  g.stroke();
  // 当前位置
  const mx = u * CW, mi = Math.round(u * (n - 1)), my = yOf(elevData[mi]);
  g.strokeStyle = "rgba(255,243,208,0.45)";
  g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, CH); g.stroke();
  g.fillStyle = "#fff3d0";
  g.beginPath(); g.arc(mx, my, 3.5, 0, Math.PI * 2); g.fill();
  g.font = "12px Georgia";
  g.fillStyle = "#e8d9a0";
  g.fillText(`${Math.round(elevData[mi])}m`, Math.min(CW - 38, mx + 6), Math.max(12, my - 7));
}

// ---------- DOM 注入（题材文案全部来自 data） ----------
const $ = (id) => document.getElementById(id);
const el = {
  title: $("titlecard"), titleMain: $("title-main"), titleSub: $("title-sub"),
  titleSubEn: $("title-sub-en"), titleEra: $("title-era"), titleFoot: $("title-foot"),
  card: $("stationcard"), cardNo: $("card-no"), cardCoord: $("card-coord"),
  cardArt: $("card-art"), cardTitle: $("card-title"), cardName: $("card-name"),
  cardModern: $("card-modern"), cardText: $("card-text"),
  hud: $("hud"), hudCoord: $("hud-coord"), hudKm: $("hud-km"), hudBar: $("hud-bar"), hudElev: $("hud-elev"),
  topright: $("topright"), trNum: $("tr-num"), trRegion: $("tr-region"),
  topleft: $("topleft"), tlEra: $("tl-era"), tlMark: $("tl-mark"), tlWm: $("tl-wm"),
  labels: $("labels"), overview: $("overview"), ovH1: $("ov-h1"), ovEra: $("ov-era"),
  stats: $("stats"), credits: $("credits"), fade: $("fade"),
};

el.titleMain.textContent = META.title;
el.titleSub.textContent = META.subtitle;
el.titleSubEn.textContent = META.subtitleEn;
el.titleEra.textContent = META.era;
el.titleFoot.textContent = META.foot;
el.tlMark.textContent = META.mark;
el.tlWm.textContent = META.watermark;
el.ovH1.innerHTML = `${META.ending.headline1}<br />${META.ending.headline2}`;
el.ovEra.textContent = META.ending.eraLine;

const labelEls = DATA.stations.map((st) => {
  const d = document.createElement("div");
  d.className = "lbl" + (st.id % 2 === 0 ? " flip" : "");
  d.innerHTML = `<div class="nm">${st.name}</div><div class="sub">${st.modern}</div>`;
  el.labels.appendChild(d);
  return d;
});
// 地理参照图层（第 3 层）：山/河/沙漠/海按类型着色加符号（与共享引擎同款实现）
const GEO_KIND = {
  mountain: { g: "▲ ", color: "#e8d9ae" },
  river:    { g: "≈ ", color: "#8fc6de" },
  sea:      { g: "≈ ", color: "#79b9d9" },
  lake:     { g: "◉ ", color: "#8fc6de" },
  desert:   { g: "▦ ", color: "#e2c491" },
  island:   { g: "◇ ", color: "#cfe0d8" },
};
const wpEls = DATA.waypointLabels.map((wp) => {
  const d = document.createElement("div");
  d.className = "lbl wp";
  const k = GEO_KIND[wp.kind];
  if (k) {
    d.style.color = k.color;
    d.innerHTML = `<div class="nm">${k.g}${wp.name}</div>`;
  } else {
    d.innerHTML = `<div class="nm">${wp.name}</div>`;
  }
  el.labels.appendChild(d);
  return d;
});
const tagEls = DATA.tags.map((tg) => {
  const d = document.createElement("div");
  d.className = "tag";
  d.textContent = tg.label;
  el.labels.appendChild(d);
  return d;
});
const wpPos = DATA.waypointLabels.map((wp) => {
  const p = w2s(wp.lng, wp.lat);
  p.y = heightAt(lngToWorldX(wp.lng), latToWorldY(wp.lat)) + 5;
  return p;
});

// 知识卡扩展容器（仅互动模式；第 1 层）
const cardExtra = document.createElement("div");
cardExtra.style.cssText =
  "margin-top:10px;padding-top:8px;border-top:1px solid rgba(206,166,92,0.25);font-size:15px;line-height:1.7;color:#c7b993;display:flex;flex-direction:column;gap:4px;max-height:168px;overflow-y:auto;scrollbar-width:thin";
if (TOP && el.card) el.card.appendChild(cardExtra);
const tagPos = DATA.tags.map((tg) => {
  const p = w2s(tg.lng, tg.lat);
  p.y = heightAt(lngToWorldX(tg.lng), latToWorldY(tg.lat)) + 6;
  return p;
});

el.stats.innerHTML = META.ending.stats
  .map(
    (s, i) => `
  <div class="stat">
    <div class="stat-num"><span id="stat-n${i}">0</span>${s.unit}</div>
    <div class="stat-desc">${s.desc}</div>
  </div>`
  )
  .join("");
const statNums = META.ending.stats.map((_, i) => $("stat-n" + i));

el.credits.innerHTML = `
  <h1>${META.title}</h1>
  <div class="cols">
    <div class="col">
      <h3>地图数据</h3>
      ${META.credits.map.map((x) => `<p>${x}</p>`).join("")}
    </div>
    <div class="col">
      <h3>图像</h3>
      ${META.credits.images.map((x) => `<p>${x}</p>`).join("")}
    </div>
    <div class="col">
      <h3>音乐与字体</h3>
      ${META.credits.musicFonts.map((x) => `<p>${x}</p>`).join("")}
      <h3>文献</h3>
      ${META.credits.texts.map((x) => `<p>${x}</p>`).join("")}
    </div>
  </div>
  <p class="rend">${META.credits.render}</p>`;

// ---------- 工具 ----------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const eraText = (st) => {
  const y = st.year;
  const leg = META.eraLegLabels[legOf(st) === "out" ? 0 : 1] || "";
  return y < 0 ? `公元前 ${-y} 年 · ${leg}` : `公元 ${y} 年 · ${leg}`;
};

function uAt(t) {
  if (t <= TK[0]) return stationU[0];
  if (t >= TK[TK.length - 1]) return stationU[stationU.length - 1];
  let k = 1;
  while (k < TK.length && TK[k] < t) k++;
  const t0 = TK[k - 1], t1 = TK[k];
  const s = clamp01((t - t0) / (t1 - t0));
  const e = s * s * (3 - 2 * s);
  return lerp(stationU[k - 1], stationU[k], e);
}
function segAt(t) {
  let k = 0;
  while (k < TK.length - 1 && t >= TK[k + 1]) k++;
  return k;
}

// ---------- 相机 ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const vTmp = new THREE.Vector3(), vTmp2 = new THREE.Vector3();

// 教学模式：地形网格的正俯视（上帝视角）取景参数——整个网格铺满画面，永不出现网格外的黑色
const MESH_MINX = TX0 * PX - CX, MESH_MAXX = (TX1 + 1) * PX - CX;
const MESH_MINZ = TY0 * PX - CY, MESH_MAXZ = (TY1 + 1) * PX - CY;
const MESH_CX = (MESH_MINX + MESH_MAXX) / 2, MESH_CZ = (MESH_MINZ + MESH_MAXZ) / 2;
const MESH_DIST = Math.min(
  (MESH_MAXX - MESH_MINX) / (2 * Math.tan(HFIZ / 2)),
  (MESH_MAXZ - MESH_MINZ) / (2 * Math.tan((40 * Math.PI) / 360))
) * 1.01; // 短边适配：地图恰好铺满屏幕

function updateCamera(t, u) {
  const head = curve.getPointAt(clamp01(u));
  const ahead = curve.getPointAt(clamp01(Math.min(u + 0.006, 1)));
  const pulse = Math.max(
    0,
    ...DATA.stations.map((st, i) =>
      st.major ? Math.exp(-Math.pow((t - TK[i]) / 2.6, 2)) * (i === 0 ? 0 : 1) : 0
    )
  );

  // 教学模式：全程北向正俯视（上帝视角）。开场/总览=全图概览，旅程=跟随点正上方；
  // 三段均为正俯视 + up=(0,0,-1)，切换只是平滑变焦——永无倾斜，永不出画。
  if (TOP) {
    const m1 = sstep(T_OPEN_END - 2.2, T_OPEN_END + 1.5, t);
    const m2 = window.__FORCE_OVERVIEW ? 1 : sstep(T_OV - 1.5, T_OV + 7.5, t);
    const ground = heightAt(head.x + CX, head.z + CY);
    const Rj = Math.max(220 * CAMS, (340 + 40 * Math.sin(u * 12.3) - pulse * 40) * CAMS);
    const jPos = new THREE.Vector3(head.x, Math.max(ground + 60 * CAMS, head.y + Rj), head.z);
    const jLook = vTmp.copy(head).lerp(ahead, 0.3);
    const oPos = new THREE.Vector3(MESH_CX, MESH_DIST, MESH_CZ);
    const oLook = new THREE.Vector3(MESH_CX, 0, MESH_CZ);
    camPos.copy(oPos).lerp(jPos, m1);
    camLook.copy(oLook).lerp(jLook, m1);
    camPos.lerp(oPos, m2);
    camLook.lerp(oLook, m2);
    // 用户视口：正俯视下的平移（刚体偏移）与缩放（高度缩放），并把观察目标夹回地形范围
    camPos.x += VP.panX; camPos.z += VP.panZ;
    camLook.x += VP.panX; camLook.z += VP.panZ;
    {
      const mgnX = (MESH_MAXX - MESH_MINX) * 0.2, mgnZ = (MESH_MAXZ - MESH_MINZ) * 0.2;
      const clx = Math.max(MESH_MINX - mgnX, Math.min(MESH_MAXX + mgnX, camLook.x));
      const clz = Math.max(MESH_MINZ - mgnZ, Math.min(MESH_MAXZ + mgnZ, camLook.z));
      VP.panX += clx - camLook.x; VP.panZ += clz - camLook.z;
      camPos.x += clx - camLook.x; camPos.z += clz - camLook.z;
      camLook.x = clx; camLook.z = clz;
    }
    camPos.y = camLook.y + Math.max(90, (camPos.y - camLook.y) / VP.zoom);
    camera.position.copy(camPos);
    camera.up.set(0, 0, -1); // 正俯视下 up=-Z：画面上方恒为北
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
    scene.fog.near = lerp(900, 5200, m2);
    scene.fog.far = lerp(2600, 14000, m2);
    return;
  }

  // 开场：高空缓移（中心与参数来自 data.meta.openCamera）
  const oc = META.openCamera;
  const oTarget = w2s(oc.lng, oc.lat);
  oTarget.y = heightAt(lngToWorldX(oc.lng), latToWorldY(oc.lat));
  const tOpen = Math.min(t, T_OPEN_END);
  const oR = TOP ? 1500 : Math.max(420, 620 - tOpen * 8);
  const oAz = TOP ? 0 : -2.2 + tOpen * 0.012;
  const oPos = TOP
    ? new THREE.Vector3(oTarget.x, oTarget.y + oR * Math.sin(0.98), oTarget.z + oR * Math.cos(0.98))
    : new THREE.Vector3(
        oTarget.x + Math.cos(oAz) * oR * 0.55,
        oTarget.y + oR * 0.75,
        oTarget.z + Math.sin(oAz) * oR * 0.55
      );

  // 旅程跟拍（影片模式：电影运镜；教学模式已在上方分支处理）
  const az = TOP ? 0 : -1.1 + u * 2.6 + 0.14 * Math.sin(t * 0.05);
  const el2 = TOP ? 0.96 : 0.98 + 0.16 * Math.sin(u * 8.2);
  let R = TOP
    ? 255 + 25 * Math.sin(u * 12.3) - pulse * 45
    : 215 + 55 * Math.sin(u * 15.7 + 2.1) - pulse * 58;
  R = Math.max(TOP ? 150 : 110, R);
  const jPos = new THREE.Vector3(
    head.x + Math.cos(az) * R * Math.cos(el2),
    head.y + R * Math.sin(el2),
    head.z + Math.sin(az) * R * Math.cos(el2)
  );
  const ground = heightAt(head.x + CX, head.z + CY);
  if (jPos.y < ground + 55) jPos.y = ground + 55;
  const jLook = vTmp.copy(head).lerp(ahead, 0.45); jLook.y += 3;

  // 总览：包围盒自适应的近正俯视地图视角
  const cTarget = bboxCenter.clone();
  cTarget.x -= bboxSize.x * 0.09;
  const oR2 = OV_DIST;
  const ovAz = 0.05 * Math.sin(t * 0.04);
  const ovPos = new THREE.Vector3(
    cTarget.x + oR2 * (0.16 * Math.cos(ovAz) - 0.10 * Math.sin(ovAz)),
    oR2 * 0.985,
    cTarget.z + oR2 * (0.16 * Math.sin(ovAz) + 0.10 * Math.cos(ovAz))
  );
  const ovLook = cTarget;

  const m1 = sstep(T_OPEN_END - 2.2, T_OPEN_END + 1.5, t); // 开场→跟拍
  const m2 = window.__FORCE_OVERVIEW ? 1 : sstep(T_OV - 1.5, T_OV + 7.5, t); // 跟拍→总览（互动可强制）
  const a = vTmp2.copy(oPos).lerp(jPos, m1);
  const la = new THREE.Vector3().copy(oTarget).lerp(jLook, m1);
  camPos.copy(a).lerp(ovPos, m2);
  camLook.copy(la).lerp(ovLook, m2);
  if (t > T_CR + 3) camPos.lerp(vTmp.copy(camLook).add(new THREE.Vector3(0, 60, -40)), sstep(T_CR + 3, DUR, t));

  camera.position.copy(camPos);
  // 俯视时 up 向量从 (0,1,0) 转到 (0,0,-1)，保证地图北向朝上不滚转
  camera.up.set(0, 1 - m2, -m2).normalize();
  camera.lookAt(camLook);
  camera.updateMatrixWorld(); // 立即同步矩阵：标签投影不能等 renderer 帧末更新
  // 总览时雾淡出，避免远景被吞
  scene.fog.near = lerp(900, 5200, m2);
  scene.fog.far = lerp(2600, 14000, m2);
}

// ---------- 画面更新 ----------
let lastCardStation = -1;

function projectToScreen(pos) {
  const v = pos.clone().project(camera);
  if (v.z > 1) return null;
  return { x: (v.x * 0.5 + 0.5) * W, y: (1 - (v.y * 0.5 + 0.5)) * H };
}

// 标签防重叠：按帧收集屏幕包围盒，碰撞的标签依次尝试四角偏移，放不下则隐藏
const labelBoxes = [];
const labelReserved = []; // UI 保留区：顶栏 / 总览统计面板 / 跟随模式卡片
function labelFits(x, y, w, h) {
  for (const b of labelBoxes) {
    if (x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y) return false;
  }
  for (const r of labelReserved) {
    if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false;
  }
  return true;
}

function setLabel(d, pos, opacity, hide = false, dx = 0, dy = 0) {
  if (hide || opacity <= 0.01) { d.style.opacity = "0"; return; }
  const s = projectToScreen(pos);
  if (!s) { d.style.opacity = "0"; return; }
  // 防重叠：测量标签实际尺寸，碰撞时尝试四角偏移，放不下则隐藏
  const bw = (d.offsetWidth || 120) + 8, bh = (d.offsetHeight || 40) + 4;
  let placed = false;
  const cands = [
    [s.x + dx + 12, s.y + dy - bh],   // 默认：右上
    [s.x + dx - bw, s.y + dy - bh],   // 左上
    [s.x + dx + 12, s.y + dy + 10],   // 右下
    [s.x + dx - bw, s.y + dy + 10],   // 左下
  ];
  for (const [cx, cy] of cands) {
    if (cx < 0 || cy < 0 || cx + bw > W || cy + bh > H) continue;
    if (labelFits(cx, cy, bw, bh)) {
      labelBoxes.push({ x: cx, y: cy, w: bw, h: bh });
      d.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
      d.style.opacity = opacity.toFixed(3);
      placed = true;
      break;
    }
  }
  if (!placed) { d.style.opacity = "0"; }
}

let __lastErr = null;
function update(t) {
  try {
    updateInner(t);
  } catch (e) {
    if (String(e) !== String(__lastErr)) {
      __lastErr = e;
      console.error("[update]", e);
    }
  }
  window.__LASTERR = __lastErr ? String(__lastErr) : null;
}

function updateInner(t) {
  labelBoxes.length = 0;
  labelReserved.length = 0;
  // UI 保留区：标签不得进入这些矩形（与站名/统计/标题互不遮挡）
  labelReserved.push({ x: 0, y: 0, w: W, h: 148 });                              // 顶栏带
  if (t >= T_OV - 4) labelReserved.push({ x: W - 640, y: 60, w: 640, h: 800 });    // 总览：右侧标题+统计
  else labelReserved.push({ x: W - 560, y: 140, w: 560, h: 740 });                 // 跟随：右侧知识卡
  const u = t < T_J0 ? 0 : t > T_J1 ? 1 : uAt(t);

  tubeCore.uniforms.uProg.value = u;
  tubeGlow.uniforms.uProg.value = u;
  const head = curve.getPointAt(clamp01(u));
  headGlow.position.copy(head);
  const routeMatOpacity = t < 2 ? 0 : sstep(2, 5, t);
  tubeCore.uniforms.uOpacity.value = 1.0 * routeMatOpacity;
  tubeGlow.uniforms.uOpacity.value = 0.40 * routeMatOpacity;
  headGlow.material.opacity = routeMatOpacity;

  updateCamera(t, u);

  const inOverview = t >= T_OV - 4;
  const dim = t > T_CR + 1 ? 1 - sstep(T_CR + 1, T_CR + 3, t) : 1;
  DATA.stations.forEach((st, i) => {
    const passed = u >= stationU[i] - 0.0005;
    const fade = sstep(stationU[i] - 0.008, stationU[i] - 0.001, u);
    stationSprites[i].material.opacity = (passed ? 0.95 : fade * 0.9) * routeMatOpacity * dim;
    const op = inOverview
      ? sstep(T_OV - 4 + i * 0.06, T_OV - 2 + i * 0.06, t) * dim
      : fade * dim * routeMatOpacity;
    setLabel(labelEls[i], stationPos[i], t < T_J0 ? 0 : op,
      st.labelOnMap === false, st.labelDx || 0, st.labelDy || 0);
  });
  wpEls.forEach((d, i) => {
    const op = inOverview ? dim * 0.85 : 0;
    setLabel(d, wpPos[i], op);
  });
  tagEls.forEach((d, i) => {
    const op = inOverview ? dim : 0;
    setLabel(d, tagPos[i], op);
  });

  // HUD
  const showHud = sstep(T_J0 - 2, T_J0 + 2, t) * (1 - sstep(T_OV - 1.2, T_OV + 0.5, t));
  el.hud.style.opacity = showHud.toFixed(3);
  if (showHud > 0.01) {
    const lat = yToLat(head.z + CY, TILE), lng = xToLng(head.x + CX, TILE);
    el.hudCoord.textContent = `N ${lat.toFixed(2)}°  ·  E ${lng.toFixed(2)}°`;
    const km = Math.round(u * TOTAL_KM);
    el.hudKm.textContent = km.toLocaleString("en-US");
    el.hudBar.style.width = `${(u * 100).toFixed(2)}%`;
    drawElev(u);
  }

  // 右上 STATION
  const showTr = sstep(T_J0 - 2, T_J0 + 2, t) * (1 - sstep(T_OV - 1.2, T_OV + 0.5, t));
  el.topright.style.opacity = showTr.toFixed(3);
  if (showTr > 0.01) {
    const idx = Math.min(DATA.stations.length, segAt(t) + 1);
    const st = DATA.stations[idx - 1];
    el.trNum.innerHTML = `${String(idx).padStart(2, "0")}<span class="of">/${DATA.stations.length}</span>`;
    el.trRegion.textContent = st.region;
  }

  // 左上 年代
  const showTl = sstep(T_J0 - 2, T_J0 + 2, t) * (1 - sstep(T_CR, T_CR + 1, t));
  el.topleft.style.opacity = showTl.toFixed(3);
  if (showTl > 0.01) {
    const st = DATA.stations[segAt(t)];
    el.tlEra.textContent = eraText(st);
  }

  // 站点卡片
  let active = -1, cardOp = 0;
  if (TOP) {
    // 互动模式：当前站点卡片常驻，所有站点均可触发
    active = segAt(t);
    cardOp = 1;
  } else {
    const CARD_HOLD = DWELL_MAJOR + 1.2;
    for (let i = 0; i < DATA.stations.length; i++) {
      const st = DATA.stations[i];
      if (!st.major) continue;
      const t0 = TK[i], t1 = TK[i] + CARD_HOLD;
      if (t >= t0 && t <= t1) {
        active = i;
        cardOp = sstep(t0, t0 + 0.7, t) * (1 - sstep(t1 - 0.6, t1, t));
        break;
      }
    }
  }
  if (active >= 0) {
    if (lastCardStation !== active) {
      lastCardStation = active;
      const st = DATA.stations[active];
      el.cardNo.textContent = `第 ${String(st.id).padStart(2, "0")} 站`;
      const bc = st.year < 0 ? `${-st.year} BC` : `${st.year} AD`;
      el.cardCoord.textContent = `${st.lat.toFixed(2)}°N · ${st.lng.toFixed(2)}°E`;
      el.cardTitle.textContent = st.title;
      el.cardName.textContent = st.name;
      el.cardModern.textContent = `${st.modern} · ${bc}`;
      el.cardText.textContent = st.text;
      if (TOP) {
        const lines = [];
        if (st.note) lines.push(`<div>❖ ${st.note}</div>`);
        if (st.elev != null) lines.push(`<div>⛰ ${st.elev >= 0 ? "海拔约 " + st.elev + " 米" : "海拔约海平面下 " + (-st.elev) + " 米"}</div>`);
        if (st.geo) lines.push(`<div>🧭 ${st.geo}</div>`);
        if (st.quote) lines.push(`<div style="color:#d8c79c">❝${st.quote.t}❞ <span style="color:#8f8266">—— ${st.quote.src}</span></div>`);
        if (st.world) lines.push(`<div>🌍 同期 · ${st.world}</div>`);
        if (st.today) lines.push(`<div>🏛 今日 · ${st.today}</div>`);
        cardExtra.innerHTML = lines.join("");
      }
      if (st.art) {
        el.cardArt.src = st.art;
        el.cardArt.style.display = "block";
      } else {
        el.cardArt.style.display = "none";
      }
    }
    el.card.style.opacity = cardOp.toFixed(3);
    el.card.style.transform = `translateX(${(1 - cardOp) * 40}px)`;
  } else {
    el.card.style.opacity = "0";
  }

  // 开场题卡
  const tOp = sstep(1.2, 3.4, t) * (1 - sstep(T_OPEN_END - 2.4, T_OPEN_END - 0.4, t));
  el.title.style.opacity = tOp.toFixed(3);
  el.titleMain.style.letterSpacing = `${(0.32 + (1 - sstep(1.2, 4.5, t)) * 0.25).toFixed(3)}em`;
  el.title.style.transform = `translateY(${(1 - tOp) * 14}px)`;

  // 总览 + 统计
  const ovOp = sstep(T_OV - 0.8, T_OV + 3.2, t);
  el.overview.style.opacity = ovOp.toFixed(3);
  const statsOp = sstep(T_OV + 2, T_OV + 4, t);
  el.stats.style.opacity = statsOp.toFixed(3);
  el.stats.style.transform = `translateX(${(1 - statsOp) * 50}px)`;
  const cnt = sstep(T_OV + 2.6, T_OV + 8, t);
  META.ending.stats.forEach((s, i) => {
    statNums[i].textContent = Math.round(s.num * cnt).toLocaleString("en-US");
  });

  // credits
  const crOp = sstep(T_CR + 0.8, T_CR + 2.5, t);
  el.credits.style.opacity = crOp.toFixed(3);
  el.fade.style.opacity = sstep(DUR - 1.8, DUR - 0.2, t).toFixed(3);

  renderer.render(scene, camera);
}

// ---------- GSAP 主时间轴 ----------
const state = { t: 0 };
function render() { update(state.t); }

const tl = gsap.timeline({ paused: true });
tl.to(state, { t: DUR, duration: DUR, ease: "none", onUpdate: render }, 0);

window.__timelines = window.__timelines || {};
window.__timelines["main"] = tl;
window.__DBG = { camera, scene, renderer, curve, stationU, TK, CX, CY, stationPos, nearestU, state, update, head: () => curve.getPointAt(clamp01(state.t < T_J0 ? 0 : uAt(state.t))) };

// ---------- 交互控制接口（interactive.js 使用；视频渲染不触碰） ----------
window.APP = {
  DUR, T_OPEN_END, T_OV, T_CR,
  TK,
  stations: DATA.stations.map((s) => ({ id: s.id, name: s.name, modern: s.modern, year: s.year, major: !!s.major })),
  segments: (DATA.routeSegments || []).map((s) => ({ from: s.from, to: s.to, type: s.type, name: s.name, note: s.note })),
  title: META.title,
  get t() { return state.t; },
  seek(t) {
    gsap.killTweensOf(state);
    state.t = Math.min(DUR, Math.max(0, t));
    update(state.t);
  },
  advance(dt) {
    gsap.killTweensOf(state);
    state.t = Math.min(DUR, state.t + dt);
    update(state.t);
    return state.t >= DUR - 1e-3;
  },
  flyTo(t, dur = 1.8, onUpdate) {
    gsap.killTweensOf(state);
    gsap.to(state, {
      t: Math.min(DUR, Math.max(0, t)), duration: dur, ease: "power2.inOut",
      onUpdate: () => { update(state.t); onUpdate && onUpdate(); },
    });
  },
  setOverview(b) { window.__FORCE_OVERVIEW = !!b; update(state.t); },
  isOverview() { return !!window.__FORCE_OVERVIEW; },
  stationAt(t) {
    const st = DATA.stations[segAt(t)];
    return { id: st.id, name: st.name, modern: st.modern, year: st.year };
  },
};

// ---------- 地图点站 + 悬停预览（仅互动模式） ----------
if (TOP) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const hitMeshes = DATA.stations.map((st, i) => {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(56, 8, 8), // 拾取热区大于视觉标记：总览视角下也好点中
      new THREE.MeshBasicMaterial({ visible: false })
    );
    m.position.copy(stationPos[i]);
    m.userData.idx = i;
    scene.add(m);
    return m;
  });
  let tip = null;
  function ensureTip() {
    if (tip) return tip;
    tip = document.createElement("div");
    tip.style.cssText = "position:absolute;z-index:26;pointer-events:none;display:none;background:rgba(12,9,6,0.92);border:1px solid rgba(206,166,92,0.4);color:#f3e2b3;padding:6px 14px;font-size:16px;letter-spacing:0.1em;white-space:nowrap;box-shadow:0 4px 18px rgba(0,0,0,0.5)";
    document.getElementById("root").appendChild(tip);
    return tip;
  }
  function pick(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(hitMeshes);
    return hits.length ? hits[0].object.userData.idx : -1;
  }
  canvas.addEventListener("pointermove", (ev) => {
    const idx = pick(ev);
    if (idx >= 0) {
      canvas.style.cursor = "pointer";
      const t2 = ensureTip();
      t2.textContent = `${String(idx + 1).padStart(2, "0")} ${DATA.stations[idx].name}`;
      const rootRect = document.getElementById("root").getBoundingClientRect();
      const sx = (ev.clientX - rootRect.left) / (rootRect.width / W);
      const sy = (ev.clientY - rootRect.top) / (rootRect.height / H);
      t2.style.left = `${sx + 16}px`;
      t2.style.top = `${sy - 36}px`;
      t2.style.display = "block";
    } else {
      canvas.style.cursor = "grab";
      if (tip) tip.style.display = "none";
    }
  });
  canvas.addEventListener("click", (ev) => {
    if (dragMoved > 6) return; // 拖拽后松手不触发跳站
    const idx = pick(ev);
    if (idx >= 0 && window.APP) {
      window.APP.flyTo(Math.min(DUR - 1, TK[idx] + 0.05), 1.6);
    }
  });

  // ---------- 视口控制：拖拽平移 / 滚轮缩放（不动时间轴；视频渲染不受影响） ----------
  canvas.style.touchAction = "none";
  const worldPerCssPx = () => {
    const h = Math.max(1, camera.position.y - camLook.y);
    return (2 * h * Math.tan((camera.fov * Math.PI) / 360)) / canvas.getBoundingClientRect().height;
  };
  const applyViewport = () => update(state.t);
  const clampZoom = () => { VP.zoom = Math.max(0.35, Math.min(12, VP.zoom)); };

  let dragId = -1, dragMoved = 0, lastPX = 0, lastPY = 0;
  canvas.addEventListener("pointerdown", (ev) => {
    dragId = ev.pointerId; dragMoved = 0; lastPX = ev.clientX; lastPY = ev.clientY;
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (dragId !== ev.pointerId) return;
    const dx = ev.clientX - lastPX, dy = ev.clientY - lastPY;
    lastPX = ev.clientX; lastPY = ev.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);
    if (dragMoved < 4) return;
    canvas.style.cursor = "grabbing";
    if (tip) tip.style.display = "none";
    const s = worldPerCssPx();
    VP.panX -= dx * s;
    VP.panZ -= dy * s;
    applyViewport();
  });
  const endDrag = (ev) => {
    if (dragId === ev.pointerId) { dragId = -1; canvas.style.cursor = "default"; }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("wheel", (ev) => {
    ev.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W - W / 2;
    const py = ((ev.clientY - rect.top) / rect.height) * H - H / 2;
    const before = worldPerCssPx();
    VP.zoom *= Math.exp(-ev.deltaY * 0.0014);
    clampZoom();
    applyViewport();
    const after = worldPerCssPx();
    VP.panX += px * (before - after);
    VP.panZ += py * (before - after);
    applyViewport();
  }, { passive: false });

  function resetViewport() { VP.panX = 0; VP.panZ = 0; VP.zoom = 1; applyViewport(); }
  function zoomStep(k) { VP.zoom *= k; clampZoom(); applyViewport(); }
  if (window.APP) {
    window.APP.resetViewport = resetViewport;
    window.APP.zoomStep = zoomStep;
  }

  const vb = document.createElement("div");
  vb.style.cssText = "position:absolute;right:16px;bottom:170px;z-index:24;display:flex;flex-direction:column;gap:8px";
  const mkVBtn = (label, fn, title) => {
    const b = document.createElement("button");
    b.textContent = label; b.title = title;
    b.style.cssText = "width:42px;height:42px;font-size:21px;color:#e8d9ae;background:rgba(12,9,6,0.82);border:1px solid rgba(206,166,92,0.45);border-radius:6px;cursor:pointer;line-height:1";
    b.onpointerdown = (e) => e.stopPropagation();
    b.onclick = (e) => { e.stopPropagation(); fn(); };
    vb.appendChild(b);
  };
  mkVBtn("＋", () => zoomStep(1.35), "放大");
  mkVBtn("－", () => zoomStep(1 / 1.35), "缩小");
  mkVBtn("⟲", resetViewport, "复位视图（R）");
  const uiRoot = document.getElementById("ui");
  if (uiRoot) uiRoot.appendChild(vb);
}

tl.seek(0);
render();
