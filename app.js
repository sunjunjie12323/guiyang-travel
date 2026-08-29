/* 贵客松 Web · Live 贴纸手账（设计稿对应版） */
"use strict";

/* ================= 状态 ================= */
const Store = {
  key: "guikesong_web_v2",
  data: null,
  load() {
    try { this.data = JSON.parse(localStorage.getItem(this.key)) || null; } catch (e) { this.data = null; }
    if (!this.data) {
      this.data = { stickers: [], settings: { onboarded: false, name: "", bio: "", visibility: "private", chapterVis: {}, lastCity: "黔东南", seedPurged: true } };
    } else if (!this.data.settings.seedPurged) {
      // 迁移：清除早期演示假数据
      this.data.stickers = (this.data.stickers || []).filter(s => !/^sd\d/.test(s.id));
      this.data.settings.seedPurged = true;
      this.save();
    }
    return this.data;
  },
  save() { localStorage.setItem(this.key, JSON.stringify(this.data)); },
};
Store.load();

const STYLES = [
  { id: "cartoon", name: "卡通", thumb: "assets/sc_miao_day.jpg", filter: "saturate(1.8) contrast(1.25) brightness(1.06)" },
  { id: "album", name: "相册", thumb: "assets/sc_bridge.jpg", filter: "none" },
  { id: "oil", name: "油画", thumb: "assets/sc_terrace.jpg", filter: "saturate(1.7) contrast(1.3) brightness(.96)" },
  { id: "abstract", name: "抽象风", thumb: "assets/sc_falls.jpg", filter: "hue-rotate(24deg) saturate(1.4) contrast(1.2)" },
];
function styleFilter(id) { const s = STYLES.find(x => x.id === id); return s ? s.filter : "none"; }
function hashRot(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return (h % 7) - 3; }

const OB_PAGES = [
  { img: "assets/env_ob1.png", title: "拍下每一段旅途", body: "美食、风景、饮品和同行的人，\n都能被记录成 3 秒 Live。", chips: [["image", "画面"], ["sparkles", "声音"], ["map-pin", "地点"]] },
  { img: "assets/env_ob2.png", title: "让 AI 把照片变成贴纸", body: "选择喜欢的画风，\n拍摄后会在后台自动生成。", chips: [["clock", "生成时可以继续拍摄"]] },
  { img: "assets/env_ob3.png", title: "把回忆贴进自己的绘本", body: "按国家、省份和城市整理，\n随时翻页、写字、收藏和回看。", chips: [["shapes", "自由排版"], ["pen-tool", "手写涂鸦"], ["play", "Live回看"], ["users", "好友分享"]] },
];

function modeOf(arr) {
  const cnt = {};
  let best = null, n = 0;
  arr.forEach(v => { if (v) { cnt[v] = (cnt[v] || 0) + 1; if (cnt[v] > n) { n = cnt[v]; best = v; } } });
  return best;
}

/* 内置装饰贴纸库（可反复选用） */
const BUILTINS = [
  { id: "tree", frame: "assets/stk_tree.png" },
  { id: "mountain", frame: "assets/stk_mountain.png" },
  { id: "sun", frame: "assets/stk_sun.png" },
  { id: "cloud", frame: "assets/stk_cloud.png" },
  { id: "camera", frame: "assets/stk_camera.png" },
  { id: "heart", frame: "assets/stk_heart.png" },
  { id: "star", frame: "assets/stk_star.png" },
  { id: "bowl", frame: "assets/stk_bowl.png" },
  { id: "ticket", frame: "assets/stk_ticket.png" },
  { id: "flag", frame: "assets/stk_flag.png" },
  { id: "mascot", frame: "assets/stk_mascot.png" },
];

/* ================= 应用骨架 ================= */
const NO_TAB = ["camera", "gen", "onboarding", "map", "privacy", "print"];
const App = {
  current: "home",
  go(tab) {
    if (Store.data.settings.onboarded !== true && tab !== "home") tab = "home";
    this.current = tab;
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-" + tab).classList.add("active");
    document.querySelectorAll(".tabbar .tab").forEach(t => t.classList.toggle("on", t.dataset.tab === tab));
    document.getElementById("tabbar").style.display = NO_TAB.includes(tab) ? "none" : "flex";
    if (tab === "home") Home.render();
    if (tab === "square") Square.render();
    if (tab === "profile") Profile.render();
    if (tab === "map") MapView.render();
    if (tab === "privacy") Privacy.render();
    Iconify.apply();
  },
  boot() {
    if (!Store.data.settings.onboarded) OB.start();
    else this.go("home");
    Iconify.apply();
  },
};

/* ================= 引导页 ================= */
const OB = {
  idx: 0,
  start() {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-onboarding").classList.add("active");
    document.getElementById("tabbar").style.display = "none";
    this.idx = 0;
    this.render();
  },
  render() {
    const p = OB_PAGES[this.idx];
    document.getElementById("ob-stage").innerHTML =
      `<img src="${p.img}"><h1>${p.title}</h1><p>${p.body.replace(/\n/g, "<br>")}</p>
       <div class="ob-chips">${p.chips.map(c => `<span><i data-icon="${c[0]}" data-size="15"></i>${c[1]}</span>`).join("")}</div>`;
    document.getElementById("ob-dots").innerHTML =
      OB_PAGES.map((_, i) => `<i class="${i === this.idx ? "on" : ""}"></i>`).join("");
    document.getElementById("ob-next").textContent = this.idx === OB_PAGES.length - 1 ? "开始使用" : "下一步";
    Iconify.apply(document.getElementById("ob-stage"));
  },
  next() {
    if (this.idx < OB_PAGES.length - 1) { this.idx++; this.render(); }
    else this.skip();
  },
  skip() {
    Store.data.settings.onboarded = true;
    Store.save();
    App.go("home");
  },
};
document.getElementById("ob-next").onclick = () => OB.next();

/* ================= 首页 ================= */
let __book3dReady = false;
function ensureBook3D() {
  if (__book3dReady) return;
  const canvas = document.getElementById("book3d-canvas");
  if (!canvas || typeof THREE === "undefined") return;
  if (canvas.clientWidth === 0) return;
  Book3D.init(canvas, {
    onBookTap: () => Book.open(),
    onPageTap: (page, x, y) => Book.tapPage(page, x, y),
    onPageDown: (uv, e) => Book.pageDown(uv, e),
    onOpened: () => Book.updateStatus(),
    onFlipDone: () => Book.updateStatus(),
    onNewPage: idx => Book.blankDef(idx),
  });
  window.addEventListener("resize", () => Book3D.resize(canvas));
  __book3dReady = true;
  Home.updateCover();
}

const Home = {
  render() {
    requestAnimationFrame(ensureBook3D);
    this.updateCover();
    const desk = Store.data.stickers.filter(s => !s.placed);
    document.getElementById("open-hint").textContent =
      desk.length ? `👆 点击打开绘本 ✨（${desk.length} 张新贴纸待整理）` : "👆 点击打开绘本 ✨";
    const badge = document.getElementById("bell-badge");
    badge.textContent = desk.length || "";
    badge.style.display = desk.length ? "flex" : "none";
    const recent = Store.data.stickers.slice(-8).reverse();
    document.getElementById("recent-row").innerHTML = recent.length
      ? recent.map(s => `
        <div class="sticker-card" onclick="Card.open('${s.id}')">
          <img src="${s.frame}" style="filter:${styleFilter(s.style)}">
        </div>`).join("")
      : `<span class="empty">还没有贴纸，去拍一张吧</span>`;
  },
  openDesk() { Book.open(); },
  updateCover() {
    if (!__book3dReady) return;
    const placed = Store.data.stickers.filter(s => s.placed);
    const provinces = new Set(placed.map(s => s.province)).size;
    Book3D.updateCover(`${provinces}个省份·${placed.length}段回忆`);
  },
};

/* ================= 书本（3D 跨页，全程不跳页） ================= */
const Book = {
  level: 1,
  province: "贵州",
  city: "黔东南",
  drawMode: false,
  emoji: null,
  strokes: {},

  open(pendingId) {
    ensureBook3D();
    document.body.classList.add("book-mode");
    document.getElementById("tabbar").style.display = "none";
    const canvas = document.getElementById("book3d-canvas");
    requestAnimationFrame(() => Book3D.resize(canvas));
    document.getElementById("book-hint").style.display = Store.data.settings.hintSeen ? "none" : "flex";
    this.refreshPages();
    this.renderTray();
    Book3D.startOpen();
    if (pendingId) Place.start(pendingId);
  },

  close() {
    PageEdit.close();
    Book3D.closeBook();
    document.body.classList.remove("book-mode");
    document.getElementById("tabbar").style.display = "flex";
    const canvas = document.getElementById("book3d-canvas");
    requestAnimationFrame(() => Book3D.resize(canvas));
    App.go("home");
  },

  /* 每张贴纸占一页内容页槽位，最多 2 张/页（数据驱动） */
  refreshPages() {
    const vol = Store.data.stickers.filter(s => s.placed);
    let maxPage = 0;
    vol.forEach(s => { maxPage = Math.max(maxPage, s.page || 0); });
    Object.keys(this.strokes).forEach(k => { maxPage = Math.max(maxPage, +k); });
    Object.keys(Store.data.decors || {}).forEach(k => { maxPage = Math.max(maxPage, +k); });
    maxPage = Math.max(maxPage, Book3D.getPageIndex());
    const defs = [];
    for (let p = 0; p <= maxPage; p++) defs.push(this.pageDef(p, vol.filter(s => (s.page || 0) === p)));
    const prov = modeOf(vol.map(s => s.province)) || "贵州";
    const city = modeOf(vol.map(s => s.city));
    document.getElementById("ov-vol").textContent = `中国 / ${prov} / ${city || "全部"}`;
    Book3D.setPages(defs).then(() => this.updateStatus());
  },

  pageDef(p, stickers) {
    const first = stickers[0];
    let title = null;
    if (first) title = p === 0 ? (first.city || first.province) + "之旅" : "遇见" + first.title;
    return {
      side: p % 2 ? "R" : "L",
      title,
      stickers,
      strokes: this.strokes[p] || [],
      decors: (Store.data.decors || {})[p] || [],
      pageNo: p + 1,
      seed: p * 13 + 5,
      empty: !stickers.length,
    };
  },

  blankDef(idx) {
    return { side: idx % 2 ? "R" : "L", title: null, stickers: [], strokes: [], decors: [], pageNo: idx + 1, seed: idx * 13 + 5, empty: true };
  },

  updateStatus() {
    const k = Book3D.getPageIndex();
    document.getElementById("pg-status").textContent = k + 1;
    document.getElementById("btn-prev").classList.toggle("disabled", k === 0);
  },

  flipNext() { PageEdit.close(); Book3D.flipNext(); },
  flipPrev() { PageEdit.close(); Book3D.flipPrev(); },

  hitSticker(page, nx, ny) {
    return Store.data.stickers.find(s => s.placed && (s.page || 0) === page &&
      Math.abs(nx - s.x) < 0.2 * (s.scale || 1) && Math.abs(ny - s.y) < 0.16 * (s.scale || 1));
  },

  /* 按下在贴纸上：短点=详情悬浮卡，长按=虚线框编辑（移动/缩放/旋转/删除） */
  pageDown(uv, e) {
    const hit = this.hitSticker(uv.page, uv.x, uv.y);
    if (!hit) return false;
    const sx = e.clientX, sy = e.clientY;
    let long = false;
    const timer = setTimeout(() => { long = true; PageEdit.begin(hit, uv, { clientX: sx, clientY: sy }); }, 420);
    const mv = ev => {
      if (!long && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) clearTimeout(timer);
    };
    const up = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      if (!long) Card.open(hit.id);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return true;
  },

  tapPage(page, nx, ny) {
    if (this.hitSticker(page, nx, ny)) return; // 贴纸的点击已由 pageDown 处理
    if (this.emoji) this.stampEmoji(page, nx, ny);
  },

  stampEmoji(page, nx, ny) {
    Store.data.decors = Store.data.decors || {};
    (Store.data.decors[page] = Store.data.decors[page] || []).push({ kind: "emoji", content: this.emoji, x: nx, y: ny });
    Store.save();
    this.refreshPages();
  },

  addText() {
    const t = prompt("这页想记点什么？");
    if (!t) return;
    Store.data.decors = Store.data.decors || {};
    const p = Book3D.getPageIndex();
    (Store.data.decors[p] = Store.data.decors[p] || []).push({ kind: "text", content: t, x: 0.5, y: 0.55 });
    Store.save();
    this.refreshPages();
  },

  toggleDraw() {
    this.drawMode = !this.drawMode;
    document.getElementById("tool-draw").classList.toggle("on", this.drawMode);
    const layer = document.getElementById("draw-layer");
    layer.style.display = this.drawMode ? "block" : "none";
    if (this.drawMode) Draw.attach(layer);
  },

  toggleEmojiBar() {
    const row = document.getElementById("emoji-row");
    const show = row.style.display === "none";
    row.style.display = show ? "flex" : "none";
    document.getElementById("tool-emoji").classList.toggle("on", show);
    if (show && !row.dataset.built) {
      row.dataset.built = "1";
      const choices = ["❤️", "⭐", "🌲", "📷", "😄", "🍜", "✨", "🎈"];
      row.innerHTML = choices.map(e => `<span data-e="${e}">${e}</span>`).join("");
      row.querySelectorAll("span").forEach(sp => {
        sp.onclick = () => {
          row.querySelectorAll("span").forEach(x => x.classList.remove("on"));
          sp.classList.add("on");
          this.emoji = sp.dataset.e;
        };
      });
      row.firstChild.classList.add("on");
      this.emoji = choices[0];
    }
  },

  renderTray() {
    const desk = Store.data.stickers.filter(s => !s.placed).slice().reverse();
    document.getElementById("tray-row").innerHTML = desk.length
      ? desk.map(s => `
        <div class="sticker-card" style="transform:rotate(${hashRot(s.id)}deg)" onpointerdown="Book.startDrag('${s.id}', event)">
          <img src="${s.frame}" style="filter:${styleFilter(s.style)}">
        </div>`).join("")
      : `<div class="tray-empty">拍出来的贴纸会先落在这里</div>`;
    document.getElementById("tray-patterns").innerHTML = BUILTINS.map(b => `
      <div class="pattern-card" style="transform:rotate(${hashRot(b.id)}deg)" onpointerdown="Book.startDrag('${b.id}', event, true)">
        <img src="${b.frame}">
      </div>`).join("");
  },

  /* 真拖拽：托盘 → 页面（松手落点即页内 UV）；未拖动视为点击 */
  startDrag(id, e, builtin) {
    e.preventDefault();
    const src = builtin ? BUILTINS.find(b => b.id === id).frame
      : Store.data.stickers.find(v => v.id === id).frame;
    const ghost = document.getElementById("drag-ghost");
    ghost.src = src;
    ghost.style.display = "block";
    let moved = false;
    const move = ev => {
      if (Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 8) moved = true;
      ghost.style.left = (ev.clientX - 45) + "px";
      ghost.style.top = (ev.clientY - 45) + "px";
    };
    move(e);
    const mv = ev => move(ev);
    const up = ev => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      ghost.style.display = "none";
      if (!moved) { // 点击：拍摄的进微调放置，内置的直接落到当前页中心
        if (!builtin) Place.start(id);
        else this.placeAt(id, null, true);
        return;
      }
      const uv = Book3D.pageUV(ev.clientX, ev.clientY);
      if (!uv) return; // 没松在页面上
      this.placeAt(id, uv, builtin);
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  },

  placeAt(id, uv, builtin) {
    if (builtin) {
      const b = BUILTINS.find(v => v.id === id);
      Store.data.stickers.push({
        id: "b" + Date.now(), frame: b.frame, builtin: id, video: null, style: "album",
        title: "", note: "", message: "", persons: [],
        province: "贵州", city: Store.data.settings.lastCity || "黔东南",
        placed: true, page: uv ? uv.page : Book3D.getPageIndex(),
        x: uv ? uv.x : .5, y: uv ? uv.y : .45,
        rot: hashRot(id), scale: .62,
        favorite: false, takenAt: Date.now(),
        date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
      });
    } else {
      const s = Store.data.stickers.find(v => v.id === id);
      if (!s || !uv) return;
      Object.assign(s, { placed: true, page: uv.page, x: uv.x, y: uv.y });
    }
    Store.save();
    this.markHintSeen();
    this.renderTray();
    this.refreshPages();
    Home.render();
  },

  markHintSeen() {
    if (Store.data.settings.hintSeen) return;
    Store.data.settings.hintSeen = true;
    Store.save();
    document.getElementById("book-hint").style.display = "none";
  },
};

/* ================= 页上贴纸编辑（虚线框：移动/缩放/旋转/删除） ================= */
const PageEdit = {
  s: null, _gesture: null,

  begin(sticker, uv, e) {
    this.close();
    this.s = sticker;
    this._off = { dx: sticker.x - uv.x, dy: sticker.y - uv.y };
    const bd = document.createElement("div");
    bd.className = "pe-backdrop";
    bd.id = "pe-backdrop";
    bd.innerHTML = `
      <div class="page-edit" id="page-edit">
        <span class="pe-h pe-rot" id="pe-rot"><i data-icon="refresh-cw" data-size="13"></i></span>
        <span class="pe-h pe-del" id="pe-del"><i data-icon="trash-2" data-size="14"></i></span>
        <span class="pe-h pe-scale" id="pe-scale"><i data-icon="scaling" data-size="13"></i></span>
      </div>`;
    bd.onpointerdown = e => { if (e.target === bd) this.close(); };
    document.body.appendChild(bd);
    Iconify.apply(bd);
    this.layout();

    document.getElementById("page-edit").onpointerdown = e => this.gestureStart(e, "move");
    document.getElementById("pe-rot").onpointerdown = e => this.gestureStart(e, "rotate");
    document.getElementById("pe-scale").onpointerdown = e => this.gestureStart(e, "scale");
    document.getElementById("pe-del").onpointerdown = e => { e.stopPropagation(); this.remove(); };
    // 长按触发的，手指还按着：直接进入移动手势，拖到哪里跟到哪里
    if (e) this.gestureStart({ clientX: e.clientX, clientY: e.clientY, stopPropagation() {}, preventDefault() {} }, "move");
  },

  /* 屏幕坐标定位虚线框（与 3D 页面对齐） */
  layout() {
    const el = document.getElementById("page-edit");
    if (!el || !this.s) return;
    const c = Book3D.pageToScreen(this.s.page, this.s.x, this.s.y);
    const hw = 0.21 * (this.s.scale || 1);
    const rx = Book3D.pageToScreen(this.s.page, this.s.x + hw, this.s.y);
    const w = Math.max(56, Math.hypot(rx.x - c.x, rx.y - c.y) * 2 + 18);
    el.style.left = (c.x - w / 2) + "px";
    el.style.top = (c.y - w * 0.6) + "px";
    el.style.width = w + "px";
    el.style.height = w * 1.2 + "px";
    el.style.transform = `rotate(${this.s.rot || 0}deg)`;
  },

  gestureStart(e, mode) {
    e.stopPropagation();
    e.preventDefault();
    const c = Book3D.pageToScreen(this.s.page, this.s.x, this.s.y);
    const d0 = Math.hypot(e.clientX - c.x, e.clientY - c.y) || 1;
    const a0 = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
    this._gesture = {
      mode,
      scale0: this.s.scale || 1, rot0: this.s.rot || 0,
      d0, a0,
      uv0: Book3D.pageUV(e.clientX, e.clientY),
      sx0: this.s.x, sy0: this.s.y,
    };
    const mv = ev => this.gestureMove(ev);
    const up = () => {
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("pointerup", up);
      this._gesture = null;
      Store.save();
      Book.refreshPages(); // 重建纹理（框保持对齐）
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
  },

  gestureMove(e) {
    const g = this._gesture;
    if (!g || !this.s) return;
    if (g.mode === "move") {
      const uv = Book3D.pageUV(e.clientX, e.clientY);
      if (uv && g.uv0) {
        this.s.x = Math.min(.95, Math.max(.05, g.sx0 + (uv.x - g.uv0.x)));
        this.s.y = Math.min(.95, Math.max(.05, g.sy0 + (uv.y - g.uv0.y)));
      }
    } else if (g.mode === "scale") {
      const c = Book3D.pageToScreen(this.s.page, this.s.x, this.s.y);
      const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
      this.s.scale = Math.min(2.2, Math.max(.35, g.scale0 * d / g.d0));
    } else if (g.mode === "rotate") {
      const c = Book3D.pageToScreen(this.s.page, this.s.x, this.s.y);
      const a = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI;
      this.s.rot = ((g.rot0 + a - g.a0 + 540) % 360) - 180;
    }
    this.layout();
  },

  remove() {
    const s = this.s;
    if (!s) return this.close();
    if (s.builtin) {
      Store.data.stickers = Store.data.stickers.filter(v => v.id !== s.id);
    } else {
      s.placed = false; // 拍摄的贴纸撤回收纳盘
    }
    Store.save();
    this.close();
    Book.renderTray();
    Book.refreshPages();
    Home.render();
  },

  close() {
    this.s = null;
    document.getElementById("pe-backdrop")?.remove();
  },
};

/* ================= 涂鸦 ================= */
const Draw = {
  path: null, page: 0,
  attach(layer) {
    const rect = layer.getBoundingClientRect();
    layer.width = rect.width;
    layer.height = rect.height;
    const ctx = layer.getContext("2d");
    ctx.strokeStyle = "#4A4640";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    layer.onpointerdown = e => {
      const pt = Book3D.pageUV(e.clientX, e.clientY);
      if (!pt) return;
      this.path = [{ x: pt.x, y: pt.y }];
      this.page = pt.page;
      layer.setPointerCapture(e.pointerId);
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    };
    layer.onpointermove = e => {
      if (!this.path) return;
      const pt = Book3D.pageUV(e.clientX, e.clientY);
      if (pt && pt.page === this.page) this.path.push({ x: pt.x, y: pt.y });
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
    };
    layer.onpointerup = () => {
      if (this.path && this.path.length > 1) {
        (Book.strokes[this.page] = Book.strokes[this.page] || []).push(this.path);
        Book.refreshPages();
      }
      this.path = null;
    };
  },
};

/* ================= 放置（draft02：拖动 · 缩放 · 旋转 → 确认） ================= */
const Place = {
  id: null, x: .5, y: .45, scale: 1, rot: 0, _pts: new Map(),
  start(id) {
    const s = Store.data.stickers.find(v => v.id === id);
    if (!s) return;
    this.id = id;
    this.x = .5; this.y = .45; this.scale = s.scale || 1; this.rot = s.rot || 0;
    const ov = document.getElementById("place-overlay");
    const box = document.getElementById("place-box");
    box.innerHTML = `<div class="sticker-card" style="width:100%;height:100%"><img src="${s.frame}" style="filter:${styleFilter(s.style)}"></div>`;
    ov.style.display = "block";
    document.getElementById("place-bar").style.display = "block";
    this.layout();
    box.onpointerdown = e => { this._pts.set(e.pointerId, e); box.setPointerCapture(e.pointerId); };
    box.onpointermove = e => {
      if (!this._pts.has(e.pointerId)) return;
      const prev = this._pts.get(e.pointerId);
      this._pts.set(e.pointerId, e);
      const pts = [...this._pts.values()];
      if (pts.length === 1) {
        this.x += (e.clientX - prev.clientX) / window.innerWidth;
        this.y += (e.clientY - prev.clientY) / window.innerHeight;
      } else if (pts.length === 2) {
        const [a, b] = pts;
        const d0 = Math.hypot(a.clientX - (prev.clientX), a.clientY - (prev.clientY));
        const d1 = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        if (d0 > 0 && d1 > 0) this.scale = Math.max(.5, Math.min(2.2, this.scale * (d1 / d0)));
        this.rot += 0.4;
      }
      this.layout();
    };
    box.onpointerup = box.onpointercancel = e => { this._pts.delete(e.pointerId); };
  },
  layout() {
    const box = document.getElementById("place-box");
    const w = 150 * this.scale;
    box.style.cssText = `left:${this.x * 100}%;top:${this.y * 100}%;width:${w}px;height:${w * 1.12}px;transform:translate(-50%,-50%) rotate(${this.rot}deg);`;
  },
  confirm() {
    const s = Store.data.stickers.find(v => v.id === this.id);
    if (s) {
      // 屏幕点 → 当前跨页的页内 UV
      const r = document.getElementById("place-box").getBoundingClientRect();
      const uv = Book3D.pageUV(r.left + r.width / 2, r.top + r.height / 2);
      s.placed = true;
      s.page = uv ? uv.page : Book3D.getPageIndex();
      s.x = uv ? uv.x : .5; s.y = uv ? uv.y : .45;
      s.rot = this.rot; s.scale = this.scale;
      Store.save();
    }
    this.cancel();
    Book.renderTray();
    Book.refreshPages();
    Home.render();
  },
  cancel() {
    this.id = null;
    this._pts.clear();
    document.getElementById("place-overlay").style.display = "none";
    document.getElementById("place-bar").style.display = "none";
  },
};

/* ================= 拍摄（draft13） ================= */
const Camera = {
  stream: null, recorder: null, style: "cartoon", mode: "live", facing: "environment",
  async open() {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-camera").classList.add("active");
    document.getElementById("tabbar").style.display = "none";
    this.renderStyles();
    this.renderRecent();
    this.refreshLoc();
    if (!this.stream) await this.initStream();
    Iconify.apply(document.getElementById("view-camera"));
  },
  async initStream() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing }, audio: true });
    } catch (e) {
      alert("相机不可用：" + e.message);
      App.go("home");
      return;
    }
    document.getElementById("cam-video").srcObject = this.stream;
  },
  close() { App.go("home"); },
  async flip() {
    this.facing = this.facing === "environment" ? "user" : "environment";
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    await this.initStream();
  },
  toggleTorch() {
    const el = document.getElementById("cam-flash");
    el.classList.toggle("on");
    try {
      const track = this.stream && this.stream.getVideoTracks()[0];
      if (track) track.applyConstraints({ advanced: [{ torch: el.classList.contains("on") }] });
    } catch (e) { /* 设备不支持手电筒时仅作状态指示 */ }
  },
  pickLoc() {
    const cities = ["黔东南", "贵阳", "安顺", "遵义", "黔南", "黔西南", "毕节", "铜仁", "六盘水"];
    const cur = Store.data.settings.lastCity || "黔东南";
    const next = cities[(cities.indexOf(cur) + 1) % cities.length];
    Store.data.settings.lastCity = next;
    Store.save();
    this.refreshLoc();
  },
  refreshLoc() {
    document.querySelector(".cam-loc").innerHTML =
      `<i data-icon="map-pin" data-size="14"></i> 中国 · 贵州 · ${Store.data.settings.lastCity || "黔东南"} <em>⌄</em>`;
    Iconify.apply(document.getElementById("view-camera"));
  },
  setMode(m) {
    this.mode = m;
    document.querySelectorAll(".cam-mode b").forEach(b => b.classList.toggle("on", b.dataset.m === m));
  },
  renderStyles() {
    document.getElementById("cam-styles").innerHTML = STYLES.map(s => `
      <div class="cam-style ${s.id === this.style ? "on" : ""}" data-id="${s.id}">
        <img src="${s.thumb}" style="filter:${s.filter}"><span>${s.name}</span>
      </div>`).join("");
    document.querySelectorAll(".cam-style").forEach(el => {
      el.onclick = () => { this.style = el.dataset.id; this.renderStyles(); };
    });
  },
  renderRecent() {
    const last = Store.data.stickers[Store.data.stickers.length - 1];
    document.getElementById("cam-recent").innerHTML = last
      ? `<img src="${last.frame}"><span>最近贴纸</span>`
      : `<div class="ph"></div><span>最近贴纸</span>`;
  },
  openRecent() {
    const last = Store.data.stickers[Store.data.stickers.length - 1];
    if (last) Card.open(last.id);
  },
  shoot() {
    if (!this.stream) return;
    const shutter = document.getElementById("shutter");
    if (shutter.classList.contains("rec")) return;
    if (this.mode === "photo") {
      const v = document.getElementById("cam-video");
      frameFromVideo(v, this.style).then(frame => { this.saveSticker(frame, null); });
      return;
    }
    shutter.classList.add("rec");
    const chunks = [];
    this.recorder = new MediaRecorder(this.stream, { mimeType: "video/webm" });
    this.recorder.ondataavailable = e => chunks.push(e.data);
    this.recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const videoUrl = await blobToDataUrl(blob);
      const frame = await captureFrame(videoUrl, this.style);
      this.saveSticker(frame, videoUrl);
    };
    this.recorder.start();
    setTimeout(() => { try { this.recorder.stop(); } catch (e) {} shutter.classList.remove("rec"); }, 3000);
  },
  saveSticker(frame, videoUrl) {
    Store.data.stickers.push({
      id: "s" + Date.now(),
      video: videoUrl, frame, style: this.style,
      title: "随手拍", note: "", message: "", persons: [],
      province: "贵州", city: Store.data.settings.lastCity || "黔东南",
      placed: false, page: 0, x: .5, y: .45, rot: (Math.random() * 6 - 3), scale: 1,
      favorite: false, takenAt: Date.now(),
      date: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
    });
    Store.save();
    Gen.run();
  },
};

function blobToDataUrl(blob) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.readAsDataURL(blob);
  });
}
function frameFromVideo(v, styleId) {
  const c = document.createElement("canvas");
  const s = Math.min(v.videoWidth, v.videoHeight);
  c.width = 480; c.height = 480;
  const ctx = c.getContext("2d");
  ctx.filter = styleFilter(styleId);
  ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 480, 480);
  return Promise.resolve(wrapCard(c));
}
function captureFrame(videoUrl, styleId) {
  return new Promise(res => {
    const v = document.createElement("video");
    v.muted = true;
    v.src = videoUrl;
    v.currentTime = 1.4;
    v.onseeked = () => { frameFromVideo(v, styleId).then(res); };
  });
}
function wrapCard(c) {
  const out = document.createElement("canvas");
  out.width = 520; out.height = 560;
  const octx = out.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, 520, 560);
  octx.drawImage(c, 20, 20, 480, 480);
  return out.toDataURL("image/jpeg", .88);
}

/* ================= 生成页（draft05） ================= */
const Gen = {
  steps: ["识别主体", "匹配画风", "生成白边贴纸"],
  run() {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-gen").classList.add("active");
    document.getElementById("tabbar").style.display = "none";
    document.getElementById("gen-later").disabled = true;
    document.getElementById("gen-bubble").textContent = "图片生成中…";
    const st = STYLES.find(s => s.id === Camera.style) || STYLES[0];
    document.getElementById("gen-style-card").innerHTML =
      `<img src="${st.thumb}" style="filter:${st.filter}"><div><b>${st.name}风</b><div style="font-size:12px;color:var(--caption)">按这个画风生成</div></div>`;
    document.getElementById("gen-steps").innerHTML = this.steps.map(s =>
      `<div class="gen-step"><div class="dot">·</div>${s}<div class="st">等待中</div></div>`).join("");
    Iconify.apply(document.getElementById("view-gen"));

    let p = 0;
    const arc = document.getElementById("gen-arc");
    const timer = setInterval(() => {
      p = Math.min(1, p + 0.02 + Math.random() * 0.02);
      arc.style.strokeDashoffset = 515 * (1 - p);
      document.getElementById("gen-pct").innerHTML = Math.round(p * 100) + "<small>%</small>";
      const stage = Math.min(2, Math.floor(p * 3));
      document.querySelectorAll(".gen-step").forEach((el, i) => {
        el.classList.toggle("done", i < stage || p >= 1);
        el.classList.toggle("doing", i === stage && p < 1);
        el.querySelector(".st").textContent = i < stage || p >= 1 ? "已完成" : i === stage ? "处理中" : "等待中";
        el.querySelector(".dot").textContent = i < stage || p >= 1 ? "✓" : i + 1;
      });
      if (p >= 1) {
        clearInterval(timer);
        document.getElementById("gen-bubble").textContent = "贴好了！";
        document.getElementById("gen-later").disabled = false;
      }
    }, 60);
  },
  continueShooting() { Camera.open(); },
  goHome() { App.go("home"); },
};

/* ================= 贴纸详情（draft10/12） ================= */
const Card = {
  open(id) {
    const s = Store.data.stickers.find(v => v.id === id);
    if (!s) return;
    const dlg = document.getElementById("card-dialog");
    const media = s.video
      ? `<video src="${s.video}" autoplay loop muted playsinline></video><span class="live-tag">LIVE 3s</span><span class="play"><i data-icon="play" data-size="44"></i></span>`
      : `<img src="${s.frame}">`;
    const wave = Array.from({ length: 34 }, () => `<i style="height:${4 + Math.random() * 18}px"></i>`).join("");
    dlg.innerHTML = `
      <div class="sd-video">${media}${s.video ? `<div class="wave">${wave}</div>` : ""}</div>
      <div class="sd-title"><img src="assets/mascot.png"><b>${s.title || "随手拍"}</b></div>
      <div class="sd-info">
        <div class="line"><i data-icon="map-pin" data-size="15"></i> 中国 · ${s.province}${s.city ? " · " + s.city : ""}</div>
        <div class="line"><i data-icon="clock" data-size="15"></i> ${new Date(s.takenAt).toLocaleString("zh-CN")}</div>
        <div class="line"><i data-icon="sparkles" data-size="15"></i> ${STYLES.find(v => v.id === s.style)?.name || "相册"}风 · ${s.favorite ? "已收藏" : "未收藏"}</div>
        <div class="sd-note-label">我的说明</div>
        <textarea class="sd-note" id="card-note" placeholder="写点此刻想说的话…">${s.message || s.note || ""}</textarea>
      </div>
      <div class="sd-actions">
        <span class="sd-fav ${s.favorite ? "on" : ""}" id="card-fav"><i data-icon="heart" data-size="26"></i>${s.favorite ? "已收藏" : "收藏"}</span>
        <span class="sd-fav" onclick="Card.delete('${s.id}')"><i data-icon="more-horizontal" data-size="26"></i>更多</span>
      </div>
      <div class="sd-btns">
        <button class="btn btn-ghost" onclick="Card.editNote()"><i data-icon="pencil" data-size="15"></i> 编辑备注</button>
        <button class="btn btn-orange" onclick="Card.close()">关闭</button>
      </div>`;
    document.getElementById("card-mask").style.display = "flex";
    Iconify.apply(dlg);
    document.getElementById("card-fav").onclick = () => {
      s.favorite = !s.favorite;
      Store.save();
      this.open(id); // 重渲染（展物柜联动）
    };
    document.getElementById("card-note").oninput = e => { s.message = e.target.value; s.note = e.target.value; Store.save(); };
  },
  editNote() { document.getElementById("card-note").focus(); },
  delete(id) {
    if (!confirm("这张贴纸要撕掉吗？")) return;
    Store.data.stickers = Store.data.stickers.filter(v => v.id !== id);
    Store.save();
    this.close();
    Home.render();
    if (document.body.classList.contains("book-mode")) { Book.renderTray(); Book.refreshPages(); }
  },
  close() { document.getElementById("card-mask").style.display = "none"; },
};

/* ================= 广场（真实名片 + 公开范围） ================= */
const Square = {
  render() {
    const s = Store.data.settings;
    const visLabel = { private: "完全私密", friends: "仅好友", public: "公开到广场" }[s.visibility || "private"];
    const placed = Store.data.stickers.filter(v => v.placed).length;
    document.getElementById("square-body").innerHTML = `
      <div class="sq-head">
        <img class="logo" src="assets/mascot.png">
        <div class="brand"><b>贵客松</b><span>Live旅行贴纸绘本</span></div>
      </div>
      <h1 class="sq-title">旅行广场</h1>
      <div class="sq-sub">打理你的名片，好友互访在后端接入后开放</div>
      <div class="friend-card">
        <b>我的名片</b>
        <input class="fd-input" id="sq-name" placeholder="你的名字…" value="${s.name || ""}">
        <input class="fd-input" id="sq-bio" placeholder="一句话介绍自己…" value="${s.bio || ""}">
        <div style="font-size:13px;color:var(--caption);margin-top:10px">已贴入绘本 ${placed} 张贴纸 · 收藏 ${Store.data.stickers.filter(v => v.favorite).length} 张</div>
      </div>
      <div class="friend-card" style="cursor:pointer" onclick="App.go('privacy')">
        <b>公开范围</b>
        <div style="font-size:14px;color:var(--caption);margin-top:6px">当前：${visLabel} · 点击修改</div>
      </div>`;
    document.getElementById("sq-name").oninput = e => { s.name = e.target.value.trim(); Store.save(); };
    document.getElementById("sq-bio").oninput = e => { s.bio = e.target.value.trim(); Store.save(); };
    Iconify.apply(document.getElementById("square-body"));
  },
};

/* ================= 我的（draft16） ================= */
const Profile = {
  render() {
    const all = Store.data.stickers;
    const favs = all.filter(s => s.favorite);
    const desk = all.filter(s => !s.placed);
    const provinces = new Set(all.map(s => s.province)).size;
    const s = Store.data.settings;
    const slot = v => v ? `<div class="slot"><img src="${v.frame}"></div>` : `<div class="slot"></div>`;
    const rows = [0, 1].map(r => `<div class="row">${[0, 1].map(c => slot(favs[r * 2 + c])).join("")}</div>`).join("");
    document.getElementById("profile-body").innerHTML = `
      <div class="pf-head">
        <img class="avatar" src="assets/mascot.png">
        <div onclick="Profile.edit()" style="cursor:pointer"><b>${s.name || "小禾"}</b><div class="bio">${s.bio || "记录路上的风和味道"} ✎</div></div>
        <span class="settings" onclick="App.go('privacy')"><i data-icon="settings" data-size="19"></i></span>
      </div>
      <div class="stat-row">
        <div class="stat-cell"><span class="ico" style="color:var(--sage-deep)"><i data-icon="map-pin" data-size="19"></i></span><b>${provinces}</b><span>个省份</span></div>
        <div class="stat-cell"><span class="ico" style="color:var(--orange)"><i data-icon="camera" data-size="19"></i></span><b>${all.length}</b><span>段 Live</span></div>
        <div class="stat-cell"><span class="ico" style="color:var(--amber)"><i data-icon="heart" data-size="19"></i></span><b>${favs.length}</b><span>张收藏</span></div>
      </div>
      <div class="two-cards">
        <div class="mini-card">
          <div class="mc-title">我的收藏柜 <i data-icon="lock" data-size="14"></i></div>
          <div class="shelf">${rows}${favs.length ? "" : `<div class="shelf-empty">收藏贴纸后会摆在这里</div>`}</div>
          <div class="mc-foot"><b>${favs.length}</b> <span>张贴纸</span></div>
        </div>
        <div class="mini-card" onclick="App.go('map')">
          <div class="mc-title">旅行地图</div>
          <img class="foldmap" src="assets/env_foldmap.png">
          <div class="mc-foot" style="color:var(--sage-dark)"><i data-icon="map-pin" data-size="13"></i> 已点亮 ${provinces} 个省份</div>
        </div>
      </div>
      <div class="list-card">
        <div class="list-row" onclick="App.go('square')"><i data-icon="users" data-size="20"></i><span class="t">我的好友</span><i data-icon="chevron-right" data-size="18"></i></div>
        <div class="list-row" onclick="App.go('privacy')"><i data-icon="globe" data-size="20"></i><span class="t">公开范围</span><i data-icon="chevron-right" data-size="18"></i></div>
        <div class="list-row" onclick="Book.open()"><i data-icon="folder-open" data-size="20"></i><span class="t">待整理贴纸</span><span class="v">${desk.length ? desk.length + " 张" : ""}</span><i data-icon="chevron-right" data-size="18"></i></div>
        <div class="list-row" onclick="Print.open()"><i data-icon="download" data-size="20"></i><span class="t">存储与备份</span><i data-icon="chevron-right" data-size="18"></i></div>
      </div>`;
    Iconify.apply(document.getElementById("profile-body"));
  },
  edit() {
    const s = Store.data.settings;
    const name = prompt("你的名字：", s.name || "");
    if (name === null) return;
    const bio = prompt("一句话介绍自己：", s.bio || "");
    if (bio === null) return;
    s.name = name.trim();
    s.bio = bio.trim();
    Store.save();
    this.render();
  },
};

/* ================= 旅行地图（draft08） ================= */
const MapView = {
  render() {
    const all = Store.data.stickers;
    const provinces = new Set(all.map(s => s.province)).size;
    const byCity = {};
    all.forEach(s => {
      const k = s.city || s.province;
      (byCity[k] = byCity[k] || []).push(s);
    });
    document.getElementById("map-body").innerHTML = `
      <div class="map-title"><span class="back" onclick="App.go('profile')"><i data-icon="chevron-left" data-size="24"></i></span>我的旅行地图 2026</div>
      <div class="map-card">
        <img src="assets/env_chinamap.png">
        <div class="map-stats">已点亮 <b>${provinces}</b> 个省份　<b>${all.length}</b> 段Live</div>
      </div>
      ${Object.entries(byCity).map(([city, list]) => `
        <div class="map-city">
          <div style="position:relative"><img class="thumb" src="${list[0].frame}"><span class="live">LIVE 3s</span></div>
          <div class="info"><b>${city}</b><span>${list[list.length - 1].date || ""}｜${list.length} 张</span></div>
          <button class="btn btn-blue" onclick="Book.open()">进入手账</button>
        </div>`).join("")}
      <button class="btn btn-orange map-poster-btn" onclick="MapView.poster()">生成旅行地图海报</button>`;
    Iconify.apply(document.getElementById("map-body"));
  },
  async poster() {
    const all = Store.data.stickers;
    const provinces = new Set(all.map(s => s.province)).size;
    const c = document.createElement("canvas");
    c.width = 800; c.height = 1180;
    const x = c.getContext("2d");
    x.fillStyle = "#F6F0E1"; x.fillRect(0, 0, 800, 1180);
    x.fillStyle = "#3E3A34"; x.font = "bold 44px 'LXGW WenKai', serif";
    x.fillText("我的旅行地图 2026", 60, 90);
    const map = await loadImg("assets/env_chinamap.png");
    if (map) x.drawImage(map, 60, 130, 680, 680 * map.height / map.width);
    x.font = "30px 'LXGW WenKai', serif";
    x.fillText(`已点亮 ${provinces} 个省份 · ${all.length} 段Live`, 60, 880);
    x.fillStyle = "#9B937F"; x.font = "24px 'LXGW WenKai', serif";
    const cities = [...new Set(all.map(s => s.city || s.province))];
    x.fillText(cities.join(" · ") + " —— 贵客松", 60, 930);
    const a = document.createElement("a");
    a.download = "guikesong-map.png";
    a.href = c.toDataURL("image/png");
    a.click();
  },
};

/* ================= 公开范围（draft14） ================= */
const Privacy = {
  OPTS: [
    { id: "private", name: "完全私密", sub: "只有自己", icon: "lock" },
    { id: "friends", name: "仅好友", sub: "好友可以翻阅公开章节", icon: "users" },
    { id: "public", name: "公开到广场", sub: "所有人可看到公开章节", icon: "globe" },
  ],
  render() {
    const s = Store.data.settings;
    const chapters = [...new Set(Store.data.stickers.map(v => v.province))];
    document.getElementById("privacy-body").innerHTML = `
      <div class="map-title"><span class="back" onclick="App.go('profile')"><i data-icon="chevron-left" data-size="24"></i></span>谁可以看我的绘本</div>
      <div class="pv-cards">
        ${this.OPTS.map(o => `
          <div class="pv-card ${s.visibility === o.id ? "on" : ""}" onclick="Privacy.pick('${o.id}')">
            <span class="pv-check"><i data-icon="check" data-size="14"></i></span>
            <b>${o.name}</b><span>（${o.sub}）</span>
            <div class="pv-ico"><i data-icon="${o.icon}" data-size="30"></i></div>
          </div>`).join("")}
      </div>
      <h3 style="margin-top:20px">章节单独设置</h3>
      ${chapters.map(p => {
        const v = (s.chapterVis || {})[p] || s.visibility;
        const label = v === "public" ? "公开到广场" : v === "friends" ? "仅好友" : "仅自己";
        return `<div class="pv-chapter"><b>${p}</b><span class="tag ${v === "private" ? "priv" : ""}">${label}</span>
          <button class="btn btn-blue" onclick="Privacy.cycle('${p}')">修改</button></div>`;
      }).join("")}
      <p class="pv-hint">提示：标记为仅自己的贴纸永远不会上传。</p>
      <button class="btn btn-blue" onclick="App.go('profile')">保存设置</button>`;
    Iconify.apply(document.getElementById("privacy-body"));
  },
  pick(id) { Store.data.settings.visibility = id; Store.save(); this.render(); },
  cycle(p) {
    const s = Store.data.settings;
    s.chapterVis = s.chapterVis || {};
    const cur = s.chapterVis[p] || s.visibility;
    s.chapterVis[p] = cur === "private" ? "friends" : cur === "friends" ? "public" : "private";
    Store.save();
    this.render();
  },
};

/* ================= 打印 ================= */
const Print = {
  open() {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.getElementById("view-print").classList.add("active");
    document.getElementById("tabbar").style.display = "none";
    const all = Store.data.stickers;
    document.getElementById("print-body").innerHTML = `
      <p style="color:var(--caption)">生成手账画册长图，或贴纸打印页</p>
      <div style="display:flex;gap:10px;margin:14px 0">
        <button class="btn btn-orange" onclick="Print.longImage()">画册长图</button>
        <button class="btn btn-blue" onclick="Print.stickerSheet()">贴纸打印</button>
      </div>
      <div id="print-out">${all.length ? "" : "<p>还没有贴纸可打印</p>"}</div>`;
  },
  close() { App.go("profile"); },
  download(canvas, name) {
    const a = document.createElement("a");
    a.download = name;
    a.href = canvas.toDataURL("image/png");
    a.click();
  },
  async longImage() {
    const all = Store.data.stickers;
    if (!all.length) return;
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 260 + all.length * 460 + 120;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#F6F0E1";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#3E3A34";
    ctx.font = "bold 44px 'LXGW WenKai', serif";
    ctx.fillText("我的旅行手账", 60, 90);
    ctx.fillStyle = "#9B937F";
    ctx.font = "24px 'LXGW WenKai', serif";
    ctx.fillText(new Date().toLocaleDateString("zh-CN") + " · 贵客松", 60, 130);
    let y = 190;
    for (const s of all) {
      const img = await loadImg(s.frame);
      ctx.save();
      ctx.translate(400, y + 200);
      ctx.rotate((s.rot || 0) * Math.PI / 180);
      ctx.shadowColor = "rgba(0,0,0,.2)";
      ctx.shadowBlur = 12;
      ctx.drawImage(img, -190, -200, 380, 400);
      ctx.restore();
      ctx.fillStyle = "#9B937F";
      ctx.font = "italic 22px 'LXGW WenKai', serif";
      ctx.textAlign = "center";
      ctx.fillText(`${s.date || ""} · ${s.province}${s.note ? " · " + s.note.slice(0, 20) : ""}`, 400, y + 430);
      ctx.textAlign = "left";
      y += 460;
    }
    ctx.fillStyle = "#9B937F";
    ctx.font = "22px 'LXGW WenKai', serif";
    ctx.fillText("封面是画，点开是人间", 60, y + 40);
    this.download(c, "guikesong-journal.png");
  },
  async stickerSheet() {
    const all = Store.data.stickers;
    if (!all.length) return;
    const cols = 3, cell = 340;
    const rows = Math.ceil(all.length / cols);
    const c = document.createElement("canvas");
    c.width = cols * cell + 40;
    c.height = rows * (cell + 60) + 40;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < all.length; i++) {
      const img = await loadImg(all[i].frame);
      const col = i % cols, row = Math.floor(i / cols);
      const x = 20 + col * cell + 10, y = 20 + row * (cell + 60) + 10;
      ctx.save();
      ctx.translate(x + 150, y + 150);
      ctx.rotate((all[i].rot || 0) * Math.PI / 180);
      ctx.drawImage(img, -150, -160, 300, 320);
      ctx.restore();
      ctx.strokeStyle = "#ddd";
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(x - 4, y - 4, 308, 368);
      ctx.setLineDash([]);
    }
    this.download(c, "guikesong-stickers.png");
  },
};

function loadImg(src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = src;
  });
}

/* ================= 启动 ================= */
App.boot();
