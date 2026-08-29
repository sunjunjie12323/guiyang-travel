/* 真 3D 手账本 v3（Three.js）对开跨页版：
   合上(绑带封面) → 掀封面 → 相机转俯视 → 左右跨页（draft09）
   顶点级弯页翻页（无 DOM 跳转），贴纸/涂鸦画在页纹理上 */
"use strict";

const Book3D = (() => {
  let renderer, scene, camera, clock, raycaster, pointer;
  let bookGroup, bookInner, closedGroup, openGroup, coverPivot, frontCover;
  let pagePivot, flipMesh, flipBack, underPage;
  let textures = [];      // 内容页纹理：0=L0,1=R0,2=L1,3=R1 …
  let blankTex = null, coverInfo = "";
  let pageIndex = 0;      // 跨页序号 k：左页=2k 右页=2k+1
  let phase = "idle";     // idle | opening | ready | flipping
  let openT = 0, flipF = 0, flipDir = 0, flipAnim = null;
  let onPageTap = null, onOpened = null, onFlipDone = null, onNewPage = null, onBookTap = null, onPageDown = null;
  let growing = false;
  let swipe = null;
  let pendingSwitch = null; // 切换手账本：翻页完成后换上的新纹理组
  const PAGE_W = 1.55, PAGE_H = 2.2; // A5 手账比例（真实尺度锚点）

  /* ---------- 小工具 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const imgCache = {};
  function loadImg(src) {
    if (imgCache[src]) return Promise.resolve(imgCache[src]);
    return new Promise(res => {
      const img = new Image();
      img.onload = () => { imgCache[src] = img; res(img); };
      img.onerror = () => res(null);
      img.src = src;
    });
  }

  /* ---------- 涂鸦（手绘笔触） ---------- */
  function doodle(x, kind, cx, cy, s, color) {
    x.save();
    x.translate(cx, cy); x.scale(s, s);
    x.strokeStyle = color; x.fillStyle = color;
    x.lineWidth = 3.2; x.lineCap = "round"; x.lineJoin = "round";
    if (kind === "tree") {
      x.beginPath(); x.moveTo(0, -14); x.lineTo(-9, 2); x.lineTo(9, 2); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(0, -18); x.lineTo(-7, -6); x.lineTo(7, -6); x.closePath(); x.stroke();
      x.beginPath(); x.moveTo(0, 2); x.lineTo(0, 9); x.stroke();
    } else if (kind === "camera") {
      x.strokeRect(-14, -8, 28, 19);
      x.beginPath(); x.moveTo(-6, -8); x.lineTo(-3, -13); x.lineTo(5, -13); x.lineTo(8, -8); x.stroke();
      x.beginPath(); x.arc(0, 1.5, 6, 0, Math.PI * 2); x.stroke();
    } else if (kind === "sparkle") {
      x.beginPath(); x.moveTo(0, -12); x.quadraticCurveTo(2, -2, 12, 0); x.quadraticCurveTo(2, 2, 0, 12);
      x.quadraticCurveTo(-2, 2, -12, 0); x.quadraticCurveTo(-2, -2, 0, -12); x.stroke();
    } else if (kind === "sun") {
      x.beginPath(); x.arc(0, 0, 7, 0, Math.PI * 2); x.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        x.beginPath(); x.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); x.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); x.stroke();
      }
    } else if (kind === "arrow") {
      x.beginPath(); x.moveTo(-12, 6); x.quadraticCurveTo(0, -10, 10, -2); x.stroke();
      x.beginPath(); x.moveTo(4, -7); x.lineTo(11, -2); x.lineTo(4, 3); x.stroke();
    } else if (kind === "mountain") {
      x.beginPath(); x.moveTo(-14, 8); x.lineTo(-5, -8); x.lineTo(1, 1); x.lineTo(6, -6); x.lineTo(14, 8); x.stroke();
    } else if (kind === "heart") {
      x.beginPath(); x.moveTo(0, 8);
      x.bezierCurveTo(-13, -2, -7, -11, 0, -4);
      x.bezierCurveTo(7, -11, 13, -2, 0, 8); x.stroke();
    }
    x.restore();
  }
  const DOODLE_KINDS = ["tree", "camera", "sparkle", "arrow", "mountain", "heart"];
  const DOODLE_COLORS = ["#8FB9A8", "#E8A33D", "#7FB3E8", "#E8956B"];

  /* 和纸胶带 */
  function tape(x, cx, cy, w, ang, color) {
    x.save();
    x.translate(cx, cy); x.rotate(ang);
    x.fillStyle = color || "rgba(247,227,184,.78)";
    x.fillRect(-w / 2, -10, w, 20);
    x.fillStyle = "rgba(255,255,255,.25)";
    for (let i = -w / 2 + 5; i < w / 2; i += 9) x.fillRect(i, -10, 2, 20);
    x.restore();
  }

  /* ---------- 封面纹理（draft11：布面 + 压印 + 绑带 + 动态 chip） ---------- */
  function makeCoverTexture(info) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 700;
    const x = c.getContext("2d");
    x.fillStyle = "#8FB9A8"; x.fillRect(0, 0, 512, 700);
    // 布纹
    x.strokeStyle = "rgba(255,255,255,.05)"; x.lineWidth = 1;
    for (let i = -700; i < 512; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 700, 700); x.stroke(); }
    // 光泽
    const g = x.createLinearGradient(0, 0, 512, 700);
    g.addColorStop(0, "rgba(255,255,255,.12)"); g.addColorStop(.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,.10)");
    x.fillStyle = g; x.fillRect(0, 0, 512, 700);
    // 缝线框
    x.strokeStyle = "rgba(255,255,255,.4)"; x.lineWidth = 2.5; x.setLineDash([9, 7]);
    x.strokeRect(26, 26, 460, 648); x.setLineDash([]);
    // 压印：松树 + 山
    x.fillStyle = "rgba(79,122,102,.55)";
    x.beginPath(); x.moveTo(150, 300); x.lineTo(230, 170); x.lineTo(310, 300); x.closePath(); x.fill();
    x.fillStyle = "rgba(79,122,102,.7)";
    x.beginPath(); x.moveTo(240, 300); x.lineTo(320, 190); x.lineTo(400, 300); x.closePath(); x.fill();
    x.fillStyle = "rgba(79,122,102,.8)";
    x.fillRect(96, 236, 16, 64);
    x.beginPath(); x.moveTo(104, 150); x.lineTo(66, 240); x.lineTo(142, 240); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(104, 126); x.lineTo(74, 200); x.lineTo(134, 200); x.closePath(); x.fill();
    // 标题
    x.fillStyle = "#F7F3E6"; x.textAlign = "center";
    x.font = "76px 'LXGW WenKai', serif";
    x.fillText("我的", 256, 420);
    x.fillText("旅行绘本", 256, 516);
    // 动态 chip
    x.fillStyle = "rgba(0,0,0,.16)";
    const tw = x.measureText(info).width;
    x.font = "28px 'LXGW WenKai', serif";
    const w = Math.max(220, x.measureText(info).width + 56);
    x.beginPath(); x.roundRect(256 - w / 2, 556, w, 52, 26); x.fill();
    x.fillStyle = "#F7F3E6";
    x.fillText(info, 256, 592);
    // 绑带 + 铜扣
    x.fillStyle = "rgba(0,0,0,.14)"; x.fillRect(416, 0, 56, 700);
    x.fillStyle = "rgba(255,255,255,.12)"; x.fillRect(416, 0, 8, 700);
    x.fillStyle = "#D8A24A";
    x.beginPath(); x.arc(444, 350, 26, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#B9842F";
    x.beginPath(); x.arc(444, 350, 15, 0, Math.PI * 2); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function makePagesTexture() {
    // 纯米色纸块（无横线）
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#F3ECD9"; x.fillRect(0, 0, 256, 256);
    const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "rgba(255,255,255,.25)");
    g.addColorStop(1, "rgba(120,100,70,.10)");
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function makeBlankTexture() {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const x = c.getContext("2d");
    x.fillStyle = "#F6EFDC"; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  /* 富文本 HTML → 行×run（{t,c,s}），只认本编辑器产出的 span/font/br/div */
  function parseRich(html) {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
    const lines = [[]];
    const walk = (node, st) => {
      if (node.nodeType === 3) {
        if (node.textContent) lines[lines.length - 1].push({ t: node.textContent, c: st.c, s: st.s });
        return;
      }
      const tag = node.tagName;
      if (tag === "BR") { lines.push([]); return; }
      const ns = { ...st };
      const style = node.getAttribute && node.getAttribute("style") || "";
      const col = style.match(/(?:^|;)\s*color:\s*([^;]+)/);
      if (col) ns.c = col[1].trim();
      const fs = style.match(/font-size:\s*([\d.]+)(px|em|rem)/);
      if (fs) ns.s = fs[2] === "px" ? parseFloat(fs[1]) / 30 : parseFloat(fs[1]);
      if (tag === "FONT" && node.getAttribute("color")) ns.c = node.getAttribute("color");
      if ((tag === "DIV" || tag === "P") && lines[lines.length - 1].length) lines.push([]);
      [...node.childNodes].forEach(ch => walk(ch, ns));
    };
    [...doc.body.firstChild.childNodes].forEach(n => walk(n, { c: null, s: 1 }));
    return lines.filter(l => l.some(r => r.t.trim()));
  }

  /* ---------- 页纹理（标题 + 贴纸白卡 + 手写说明 + 涂鸦 + 页码；空白页=纯纸） ---------- */
  async function makePageTexture(def) {
    const side = def.side || "L";
    const rnd = mulberry32(def.seed || 1);
    const c = document.createElement("canvas");
    c.width = 512; c.height = 724;
    const x = c.getContext("2d");
    x.fillStyle = "#FCF8EC"; x.fillRect(0, 0, 512, 724);
    // 书脊侧内阴影
    const sg = x.createLinearGradient(side === "L" ? 512 : 0, 0, side === "L" ? 452 : 60, 0);
    sg.addColorStop(0, "rgba(90,70,40,.14)"); sg.addColorStop(1, "rgba(90,70,40,0)");
    x.fillStyle = sg; x.fillRect(side === "L" ? 452 : 0, 0, 60, 724);

    // 页面不放任何标题/涂鸦/装饰：纯纸 + 贴纸

    // 用户涂鸦笔迹
    (def.strokes || []).forEach(path => {
      if (path.length < 2) return;
      x.strokeStyle = "rgba(74,70,64,.75)"; x.lineWidth = 5; x.lineCap = "round";
      x.beginPath();
      path.forEach((p, i) => { i ? x.lineTo(p.x * 512, p.y * 724) : x.moveTo(p.x * 512, p.y * 724); });
      x.stroke();
    });
    // 表情/文字
    (def.decors || []).forEach(d => {
      x.font = d.kind === "emoji" ? "44px serif" : "italic 30px 'LXGW WenKai', serif";
      x.fillStyle = "#4A443C"; x.textAlign = "center";
      x.fillText(d.content, d.x * 512, d.y * 724);
    });

    // 贴纸（拍摄=白卡相纸风；图案贴纸=异形模切，白边跟轮廓，无卡无胶带；文字=手写体）
    for (const s of def.stickers || []) {
      const cx = s.x * 512, cy = s.y * 724;
      if (s.text) {
        x.save();
        x.translate(cx, cy);
        x.rotate((s.rot || 0) * Math.PI / 180);
        const fs = 30 * (s.scale || 1);
        if (s.html) {
          // 富文本：逐 run 绘制（各自颜色/字号，行内基线对齐）
          const lines = parseRich(s.html);
          x.textAlign = "left";
          x.textBaseline = "alphabetic";
          const met = lines.map(line => {
            let w = 0, h = 0;
            line.forEach(r => {
              const f = fs * (r.s || 1);
              x.font = `${f}px 'QingChun', 'LXGW WenKai', serif`;
              r._w = x.measureText(r.t).width;
              r._f = f;
              w += r._w;
              h = Math.max(h, f);
            });
            return { w, h };
          });
          const totalH = met.reduce((a, m) => a + m.h * 1.55, 0);
          let ly = -totalH / 2;
          lines.forEach((line, li) => {
            const m = met[li];
            let lx = -m.w / 2;
            const baseline = ly + m.h * 1.15;
            line.forEach(r => {
              x.font = `${r._f}px 'QingChun', 'LXGW WenKai', serif`;
              x.fillStyle = r.c || s.color || "#4A443C";
              x.fillText(r.t, lx, baseline);
              lx += r._w;
            });
            ly += m.h * 1.55;
          });
        } else {
          x.fillStyle = s.color || "#4A443C";
          x.textAlign = "center";
          x.font = `${fs}px 'QingChun', 'LXGW WenKai', serif`;
          const lines = [];
          String(s.text).split("\n").forEach(seg => {
            while (seg.length > 12) { lines.push(seg.slice(0, 12)); seg = seg.slice(12); }
            lines.push(seg);
          });
          lines.forEach((ln, i) => x.fillText(ln, 0, (i - (lines.length - 1) / 2) * fs * 1.55));
        }
        x.restore();
        continue;
      }
      const img = await loadImg(s.frame);
      if (!img) continue;
      if (s.builtin || s.cutout) {
        const w = 175 * (s.scale || 1), h = w * (img.height / img.width);
        x.save();
        x.translate(cx, cy);
        x.rotate((s.rot || 0) * Math.PI / 180);
        x.shadowColor = "rgba(60,45,25,.30)"; x.shadowBlur = 10; x.shadowOffsetY = 5;
        x.drawImage(img, -w / 2, -h / 2, w, h);
        x.restore();
        continue;
      }
      const w = 205 * (s.scale || 1), h = w * (img.height / img.width);
      const pad = 12, cw = w + pad * 2, ch = h + pad * 2;
      x.save();
      x.translate(cx, cy);
      x.rotate((s.rot || 0) * Math.PI / 180);
      // 远层环境影 + 近层接触影
      x.shadowColor = "rgba(60,45,25,.20)"; x.shadowBlur = 22; x.shadowOffsetY = 10;
      x.fillStyle = "#fff";
      x.beginPath(); x.roundRect(-cw / 2, -ch / 2, cw, ch, 10); x.fill();
      x.shadowColor = "rgba(60,45,25,.30)"; x.shadowBlur = 7; x.shadowOffsetY = 3;
      x.beginPath(); x.roundRect(-cw / 2, -ch / 2, cw, ch, 10); x.fill();
      x.shadowColor = "transparent"; x.shadowBlur = 0; x.shadowOffsetY = 0;
      // 卡面受光：顶部亮、底部暗边（纸卡厚度）
      const cg = x.createLinearGradient(0, -ch / 2, 0, ch / 2);
      cg.addColorStop(0, "rgba(255,255,255,.95)");
      cg.addColorStop(0.18, "rgba(255,255,255,0)");
      cg.addColorStop(0.85, "rgba(0,0,0,.03)");
      cg.addColorStop(1, "rgba(0,0,0,.10)");
      x.fillStyle = cg;
      x.beginPath(); x.roundRect(-cw / 2, -ch / 2, cw, ch, 10); x.fill();
      x.fillStyle = "rgba(0,0,0,.07)";
      x.fillRect(-cw / 2 + 3, ch / 2 - 4, cw - 6, 3);
      x.drawImage(img, -w / 2, -h / 2, w, h);
      x.restore();
      // 胶带（带投影更立体）
      x.save();
      x.shadowColor = "rgba(60,45,25,.18)"; x.shadowBlur = 4; x.shadowOffsetY = 2;
      tape(x, cx - w * 0.28, cy - h / 2 - 14, 66, -0.5);
      x.restore();
      // 说明文字：仅用户手写备注（自动标题不显示）
      if (s.note) {
        x.save();
        x.translate(cx, cy + h / 2 + 34); x.rotate((s.rot || 0) * Math.PI / 180 * 0.4);
        x.textAlign = "center";
        x.fillStyle = "#8A8274"; x.font = "italic 21px 'LXGW WenKai', serif";
        const note = s.note.length > 15 ? s.note.slice(0, 15) + "…" : s.note;
        x.fillText(note, 0, 0);
        x.restore();
      }
    }

    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  /* ---------- 弯页（顶点级） ---------- */
  const SEG = 26;
  function makeFlipMesh() {
    const geo = new THREE.PlaneGeometry(PAGE_W, PAGE_H, SEG, 1);
    geo.translate(PAGE_W / 2, 0, 0); // 左缘为旋转轴（书脊）
    const mat = new THREE.MeshStandardMaterial({ side: THREE.FrontSide, roughness: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }
  function curl(f) {
    const bend = Math.sin(f * Math.PI) * 0.9;
    for (const mesh of [flipMesh, flipBack]) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x0 = (i % (SEG + 1)) / SEG * PAGE_W;
        const lag = (x0 / PAGE_W) * bend;
        const ang = f * Math.PI - lag;
        pos.setX(i, Math.cos(ang) * x0);
        pos.setZ(i, Math.sin(ang) * x0);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
  function setFlipTextures(front, back) {
    flipMesh.material.map = front; flipMesh.material.needsUpdate = true;
    flipBack.material.map = back; flipBack.material.needsUpdate = true;
  }
  function setUnderTexture(tex) {
    underPage.material.map = tex; underPage.material.needsUpdate = true;
  }

  /* ---------- 程序化房间（img2threejs 方法：纯几何，分区明确） ----------
     石砖墙 / 橡木桌(带腿) / 地板 / 桌前椅子 / 窗台 / 书架 */
  function buildDesk(scene, THREE) {
    const M = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
    const desk = new THREE.Group();
    scene.add(desk);

    /* ===== 石砖墙（错缝砖 + 深色灰缝，InstancedMesh） ===== */
    const mortar = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), M(0x6E6257, 1));
    mortar.position.set(0, 4.4, -8.12);
    desk.add(mortar);
    const brickGeo = new THREE.BoxGeometry(0.84, 0.36, 0.2);
    const brickMat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const rows = 26, perRow = 16;
    const bricks = new THREE.InstancedMesh(brickGeo, brickMat, rows * perRow);
    const bm = new THREE.Matrix4();
    const stoneCols = [0xC9BCA8, 0xBFAF98, 0xD2C4B0, 0xB5A48C, 0xC4B49E];
    let bi = 0;
    for (let r = 0; r < rows; r++) {
      const y = -2.3 + r * 0.4;
      const off = (r % 2) * 0.42;
      for (let c = 0; c < perRow; c++) {
        const x = -6.6 + c * 0.88 + off;
        bm.makeTranslation(x, y, -8);
        bricks.setMatrixAt(bi, bm);
        bricks.setColorAt(bi, new THREE.Color(stoneCols[(r * 7 + c * 3) % stoneCols.length]));
        bi++;
      }
    }
    bricks.instanceMatrix.needsUpdate = true;
    if (bricks.instanceColor) bricks.instanceColor.needsUpdate = true;
    desk.add(bricks);
    // 踢脚线（墙地分界）
    const baseboard = new THREE.Mesh(new THREE.BoxGeometry(60, 0.26, 0.1), M(0xF5F1E4, 0.6));
    baseboard.position.set(0, -2.37, -7.94);
    desk.add(baseboard);

    /* ===== 地板（椅子站在上面） ===== */
    const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), M(0xD9D0C2, 0.95));
    floor.position.y = -2.62;
    floor.receiveShadow = true;
    desk.add(floor);

    /* ===== 橡木桌（有限尺寸 + 桌腿 + 前围裙，橡木色与墙/地明显区分） ===== */
    const OAK1 = 0xB8895A, OAK2 = 0x9A6B3E, OAKD = 0x7A5A38;
    const table = new THREE.Group();
    const tBase = new THREE.Mesh(new THREE.BoxGeometry(7, 0.26, 11), M(OAKD, 0.9));
    tBase.position.set(0, -0.88, -2.5);
    table.add(tBase);
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(7, 0.3, 1.9), M(i % 2 ? OAK1 : OAK2, 0.72));
      plank.position.set(0, -0.85, -7.2 + i * 2.2);
      plank.receiveShadow = true;
      table.add(plank);
    }
    // 前围裙（桌沿立面）
    const apron = new THREE.Mesh(new THREE.BoxGeometry(7, 0.5, 0.14), M(OAKD, 0.85));
    apron.position.set(0, -1.1, 2.93);
    table.add(apron);
    // 四条桌腿到地板
    for (const [lx, lz] of [[-3.25, -7.3], [3.25, -7.3], [-3.25, 2.5], [3.25, 2.5]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.8, 0.22), M(OAKD, 0.85));
      leg.position.set(lx, -1.78, lz);
      leg.castShadow = true;
      table.add(leg);
    }
    desk.add(table);

    // 墙上挂画：苔绿木框 + 米色卡纸 + 小山
    const pic = new THREE.Group();
    const pFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.78, 0.05), M(0x8FB9A8, 0.6));
    pic.add(pFrame);
    const pMat = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.62, 0.055), M(0xFBF6E9, 0.8));
    pic.add(pMat);
    const m1 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), M(0x9CC3B2, 0.8));
    m1.position.set(-0.12, -0.08, 0.05);
    m1.rotation.y = Math.PI / 4;
    pic.add(m1);
    const m2 = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.22, 4), M(0x6FA287, 0.8));
    m2.position.set(0.12, -0.12, 0.05);
    m2.rotation.y = Math.PI / 4;
    pic.add(m2);
    pic.position.set(1.9, 2.05, -7.95);
    pic.rotation.y = -0.06;
    desk.add(pic);

    // 窗户（嵌进墙里，窗外有纵深风景：天→云/山→树/草 三层视差）
    const win = new THREE.Group();
    const hole = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 0.5), M(0x3A3430, 1));
    hole.position.z = -0.1;
    win.add(hole);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshBasicMaterial({ color: 0xA8D4EC }));
    sky.position.z = -1.4;
    win.add(sky);
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), new THREE.MeshBasicMaterial({ color: 0xF7E3A0 }));
    sunDisc.position.set(1.0, 0.75, -1.35);
    win.add(sunDisc);
    for (const [cx, cy, cz, s2] of [[-0.9, 0.7, -1.25, 0.28], [0.5, 0.9, -1.2, 0.22], [1.3, 0.5, -1.22, 0.18]]) {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(s2, 10, 8), new THREE.MeshBasicMaterial({ color: 0xFFFFFF }));
      cloud.scale.set(1.8, 0.55, 0.6);
      cloud.position.set(cx, cy, cz);
      win.add(cloud);
    }
    const hill1 = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.5, 4), new THREE.MeshBasicMaterial({ color: 0x9CC3B2 }));
    hill1.scale.z = 0.3;
    hill1.position.set(-0.9, -0.85, -1.15);
    hill1.rotation.y = Math.PI / 4;
    win.add(hill1);
    const hill2 = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 4), new THREE.MeshBasicMaterial({ color: 0x6FA287 }));
    hill2.scale.z = 0.3;
    hill2.position.set(0.8, -0.95, -1.1);
    hill2.rotation.y = Math.PI / 4;
    win.add(hill2);
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ color: 0x8FB9A8 }));
    grass.position.set(0, -1.0, -0.9);
    win.add(grass);
    // 近景一棵树（窗洞近处，产生视差）
    const oTreeT = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 8), M(0x8A6B45, 0.8));
    oTreeT.position.set(1.2, -0.85, -0.75);
    win.add(oTreeT);
    const oTreeC = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), M(0x588C6E, 0.8));
    oTreeC.position.set(1.2, -0.5, -0.75);
    win.add(oTreeC);
    // 窗框（凸出墙面）+ 十字格 + 窗台
    const frameM = M(0xFBF8EF, 0.5);
    const fT = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 0.14), frameM);
    fT.position.set(0, 1.28, 0.1); win.add(fT);
    const fB = fT.clone(); fB.position.y = -1.28; win.add(fB);
    const fL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.7, 0.14), frameM);
    fL.position.set(-1.87, 0, 0.1); win.add(fL);
    const fR = fL.clone(); fR.position.x = 1.87; win.add(fR);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.4, 0.12), frameM);
    barV.position.z = 0.08; win.add(barV);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.09, 0.12), frameM);
    barH.position.z = 0.08; win.add(barH);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 0.5), frameM);
    sill.position.set(0, -1.42, 0.2);
    win.add(sill);
    // 窗台物：小书 + 迷你盆栽
    const sillBook = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.45), M(0xF26A4B, 0.6));
    sillBook.position.set(-1.0, -1.28, 0.25);
    win.add(sillBook);
    const sillPot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.18, 10), M(0xC68A5E, 0.7));
    sillPot.position.set(1.1, -1.25, 0.25);
    win.add(sillPot);
    for (let i = 0; i < 3; i++) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), M(0x6FA287, 0.75));
      lf.scale.set(0.5, 1.6, 0.3);
      lf.position.set(1.1 + (i - 1) * 0.06, -1.05, 0.25);
      lf.rotation.z = (i - 1) * 0.5;
      win.add(lf);
    }
    win.position.set(-0.3, 3.0, -8.0);
    desk.add(win);
    // 窗帘：长横杆 + 两片大幕布
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.2, 10), M(0xB4A382, 0.5));
    rod.rotation.z = Math.PI / 2;
    rod.position.set(-0.3, 4.35, -7.85);
    desk.add(rod);
    for (const sx of [-1, 1]) {
      const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.62, 2.6, 0.1), M(0x8FB9A8, 0.85));
      curtain.position.set(-0.3 + sx * 2.1, 2.95, -7.86);
      curtain.castShadow = true;
      desk.add(curtain);
      const tie = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.12), M(0x6FA287, 0.8));
      tie.position.set(-0.3 + sx * 2.1, 2.2, -7.84);
      desk.add(tie);
    }

    // 大书架（左墙，三层，房间尺度）：三块搁板 + 十二本书 + 顶层小盆栽
    const shelf = new THREE.Group();
    for (const sy of [0, 0.85, 1.7]) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 0.5), M(0xC89A6B, 0.6));
      plank.position.y = sy;
      plank.castShadow = true;
      shelf.add(plank);
    }
    const bookCols = [0xF26A4B, 0x8FB9A8, 0xE8A33D, 0x7FB3E8, 0xE8956B, 0x6FA287, 0xE2573B, 0xF3D9A4, 0x8FB9A8, 0xF26A4B, 0x7FB3E8, 0xE8A33D];
    bookCols.forEach((cc, i) => {
      const lv = Math.floor(i / 4);
      const h = 0.62 + (i % 3) * 0.12;
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.24, h, 0.36), M(cc, 0.65));
      bk.position.set(-1.55 + (i % 4) * 0.42, lv * 0.85 + h / 2 + 0.04, 0);
      bk.rotation.z = (i % 4 === 3) ? -0.18 : 0;
      bk.castShadow = true;
      shelf.add(bk);
    });
    // 顶层迷你盆栽
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.2, 12), M(0xC68A5E, 0.7));
    sp.position.set(1.55, 1.85, 0);
    shelf.add(sp);
    for (let i = 0; i < 3; i++) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), M(0x6FA287, 0.75));
      lf.scale.set(0.5, 1.6, 0.3);
      lf.position.set(1.55 + (i - 1) * 0.07, 2.1, 0);
      lf.rotation.z = (i - 1) * 0.5;
      shelf.add(lf);
    }
    shelf.position.set(-1.8, 1.6, -7.88);
    desk.add(shelf);

    // 便利贴一叠（左前，7.6cm，三张微旋转叠放）
    for (let i = 0; i < 3; i++) {
      const note = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012 + i * 0.006, 0.6), M(i === 2 ? 0xF7E38C : 0xF2D96B, 0.7));
      note.position.set(-2.55 + i * 0.03, -0.7 + i * 0.018, 1.1);
      note.rotation.y = i * 0.18 - 0.18;
      note.castShadow = true;
      desk.add(note);
    }

    // 不规则书堆（左后）：五本大小/旋转/错层各异
    const stackCols = [0xE8956B, 0x8FB9A8, 0xE8A33D, 0x7FB3E8, 0xF3D9A4];
    const stackDefs = [
      [1.35, 0.18, 1.0, 0, 0.06],
      [1.2, 0.15, 0.92, 0.04, -0.1],
      [1.28, 0.2, 0.85, -0.03, 0.16],
      [1.05, 0.14, 0.8, 0.06, -0.2],
      [0.9, 0.16, 0.7, -0.05, 0.3],
    ];
    let stackY = -0.71;
    stackDefs.forEach((d, i) => {
      const bk = new THREE.Mesh(new THREE.BoxGeometry(d[0], d[1], d[2]), M(stackCols[i], 0.7));
      stackY += d[1] / 2;
      bk.position.set(-2.55 + d[3], stackY, -1.55);
      stackY += d[1] / 2;
      bk.rotation.y = d[4];
      bk.castShadow = true;
      desk.add(bk);
    });

    // 三角彩旗（沿下垂线挂一串）
    const flagCols = [0xF26A4B, 0xE8A33D, 0x8FB9A8, 0x7FB3E8, 0xE8956B, 0x6FA287, 0xF26A4B, 0xE8A33D];
    const lineGeo = new THREE.BufferGeometry();
    const linePts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      linePts.push(new THREE.Vector3(-2.7 + t * 5.4, 3.35 - Math.sin(t * Math.PI) * 0.4, -7.9));
    }
    lineGeo.setFromPoints(linePts);
    desk.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xB4A382 })));
    flagCols.forEach((cc, i) => {
      const t = (i + 0.5) / flagCols.length;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 3), M(cc, 0.7));
      flag.position.set(-2.7 + t * 5.4, 3.3 - Math.sin(t * Math.PI) * 0.4 - 0.13, -7.9);
      flag.rotation.z = Math.PI;
      desk.add(flag);
    });

    // 咖啡杯（右后，Ø8cm 马克杯 + Ø15cm 碟）
    const cup = new THREE.Group();
    const cupBody = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.42, 24), M(0xF5F1E4, 0.5));
    cupBody.castShadow = true;
    cup.add(cupBody);
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 10, 20), M(0xF5F1E4, 0.5));
    ear.position.set(0.36, 0.02, 0);
    cup.add(ear);
    const coffee = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.02, 24), M(0x6B4A2E, 0.35));
    coffee.position.y = 0.19;
    cup.add(coffee);
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.05, 24), M(0xEFE9DA, 0.5));
    saucer.position.y = -0.21;
    saucer.castShadow = true;
    cup.add(saucer);
    cup.position.set(1.5, -0.5, -1.95);
    desk.add(cup);
    // 勺子（杯旁，14cm）：细柄 + 椭圆勺头
    const spoon = new THREE.Group();
    const spHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 1.0, 4, 8), M(0xC9C4BC, 0.3));
    spHandle.rotation.z = Math.PI / 2;
    spoon.add(spHandle);
    const spBowl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), M(0xD8D3CB, 0.25));
    spBowl.scale.set(1.2, 0.35, 0.85);
    spBowl.position.x = 0.58;
    spoon.add(spBowl);
    spoon.position.set(1.85, -0.705, -1.45);
    spoon.rotation.y = 0.7;
    desk.add(spoon);

    // 盆栽（左后，Ø8cm 盆 + 多肉叶）
    const pot = new THREE.Group();
    const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.36, 20), M(0xC68A5E, 0.7));
    potBody.castShadow = true;
    pot.add(potBody);
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), M(0x5A4230, 0.95));
    soil.position.y = 0.19;
    pot.add(soil);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), M(i % 2 ? 0x6FA287 : 0x588C6E, 0.75));
      leaf.scale.set(0.5, 1.7, 0.28);
      leaf.position.set(Math.cos(a) * 0.12, 0.55 + (i % 3) * 0.08, Math.sin(a) * 0.12);
      leaf.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
      leaf.castShadow = true;
      pot.add(leaf);
    }
    pot.position.set(-2.05, -0.53, -2.5);
    desk.add(pot);

    // 两支铅笔（右前，17cm，躺倒交叉）
    const mkPencil = (color, px, pz, ry) => {
      const p = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.7, 10), M(color, 0.6));
      body.rotation.z = Math.PI / 2;
      body.castShadow = true;
      p.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 10), M(0xE8C9A0, 0.7));
      tip.rotation.z = -Math.PI / 2;
      tip.position.x = 0.95;
      p.add(tip);
      const lead = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), M(0x4A4640, 0.5));
      lead.rotation.z = -Math.PI / 2;
      lead.position.x = 1.03;
      p.add(lead);
      p.position.set(px, -0.68, pz);
      p.rotation.y = ry;
      desk.add(p);
    };
    mkPencil(0xE8A33D, 1.5, 2.55, 0.5);
    mkPencil(0x8FB9A8, 1.85, 2.25, 0.9);

    // 信封（左侧躺平，15×10cm）：纸卡 + 邮票 + 两条地址线
    const env = new THREE.Group();
    const card = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.015, 0.72), M(0xFBF8EF, 0.6));
    card.castShadow = true;
    env.add(card);
    const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.006, 0.18), M(0xE8956B, 0.6));
    stamp.position.set(0.36, 0.012, -0.2);
    env.add(stamp);
    for (let i = 0; i < 2; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.55 - i * 0.14, 0.005, 0.04), M(0xC9BFA9, 0.8));
      line.position.set(-0.14, 0.011, 0.06 + i * 0.15);
      env.add(line);
    }
    env.position.set(-1.65, -0.71, 2.1);
    env.rotation.y = -0.35;
    desk.add(env);

    // 和纸胶带卷（左前，Ø6cm，立着）
    const tapeRoll = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.1, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0xF3D9A4, roughness: 0.55, transparent: true, opacity: 0.9 }));
    roll.rotation.x = Math.PI / 2;
    roll.castShadow = true;
    tapeRoll.add(roll);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.2, 18), M(0xEFE9DA, 0.7));
    core.castShadow = true;
    tapeRoll.add(core);
    tapeRoll.position.set(-1.7, -0.6, 1.6);
    desk.add(tapeRoll);

    // 回形针两枚（左前小点缀）
    for (let i = 0; i < 2; i++) {
      const clip = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.016, 8, 16), M(i ? 0xD8A24A : 0xB4AC99, 0.4));
      clip.scale.set(1, 1.6, 1);
      clip.rotation.x = Math.PI / 2;
      clip.rotation.z = i * 0.9;
      clip.position.set(-1.2 - i * 0.24, -0.71, 2.4 + i * 0.16);
      clip.castShadow = true;
      desk.add(clip);
    }

    // 小闹钟（右后）：圆身 + 双铃 + 白面 + 指针 + 双足
    const alarm = new THREE.Group();
    const aBody = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 24), M(0xE8956B, 0.5));
    aBody.rotation.x = Math.PI / 2;
    aBody.castShadow = true;
    alarm.add(aBody);
    const aFace = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 24), M(0xFBF8EF, 0.5));
    aFace.rotation.x = Math.PI / 2;
    aFace.position.z = 0.09;
    alarm.add(aFace);
    const aHand1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.01), M(0x4A4640, 0.5));
    aHand1.position.set(0.04, 0.06, 0.105);
    aHand1.rotation.z = -0.6;
    alarm.add(aHand1);
    const aHand2 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.01), M(0x4A4640, 0.5));
    aHand2.position.set(-0.05, 0.07, 0.105);
    aHand2.rotation.z = 0.5;
    alarm.add(aHand2);
    for (const sx of [-1, 1]) {
      const bell = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M(0xE2573B, 0.5));
      bell.position.set(sx * 0.18, 0.34, 0);
      alarm.add(bell);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), M(0xB3865A, 0.6));
      foot.position.set(sx * 0.2, -0.36, 0);
      foot.rotation.z = sx * 0.3;
      alarm.add(foot);
    }
    alarm.position.set(2.3, -0.32, -2.7);
    alarm.rotation.y = -0.2;
    desk.add(alarm);

    // 钢笔（前中斜放，13cm，金尖）
    const pen = new THREE.Group();
    const penBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.9, 6, 10), M(0x3E3A34, 0.35));
    penBody.rotation.z = Math.PI / 2;
    penBody.castShadow = true;
    pen.add(penBody);
    const penNib = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.12, 8), M(0xD8A24A, 0.3));
    penNib.rotation.z = -Math.PI / 2;
    penNib.position.x = 0.55;
    pen.add(penNib);
    const penClip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.03), M(0xD8A24A, 0.4));
    penClip.position.set(-0.32, 0.045, 0);
    pen.add(penClip);
    pen.position.set(-0.5, -0.71, 2.55);
    pen.rotation.y = 0.45;
    desk.add(pen);

    // 小台灯（桌角后方）：圆底 + 竖杆 + 弯臂 + 灯罩 + 灯泡
    const lamp = new THREE.Group();
    const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.07, 18), M(0x4F7A66, 0.5));
    lBase.castShadow = true;
    lamp.add(lBase);
    const lPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 10), M(0x4F7A66, 0.5));
    lPole.position.y = 0.48;
    lamp.add(lPole);
    const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 10), M(0x4F7A66, 0.5));
    lArm.position.set(0.22, 0.98, 0);
    lArm.rotation.z = -0.85;
    lamp.add(lArm);
    const lShade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.26, 18, 1, true), M(0x6FA287, 0.6));
    lShade.position.set(0.45, 1.08, 0);
    lShade.rotation.z = 2.4;
    lamp.add(lShade);
    const lBulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xFFE9B0 }));
    lBulb.position.set(0.42, 1.02, 0);
    lamp.add(lBulb);
    lamp.position.set(-3.0, -0.68, -3.4);
    desk.add(lamp);

    // 迷你盆栽 2 号（右后，圆叶）
    const pot2 = new THREE.Group();
    const p2Body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.17, 0.26, 16), M(0xB3865A, 0.7));
    p2Body.castShadow = true;
    pot2.add(p2Body);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const lf = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), M(i % 2 ? 0x8FB9A8 : 0x6FA287, 0.75));
      lf.scale.set(0.9, 0.6, 0.9);
      lf.position.set(Math.cos(a) * 0.1, 0.28 + (i % 2) * 0.08, Math.sin(a) * 0.1);
      lf.castShadow = true;
      pot2.add(lf);
    }
    pot2.position.set(2.85, -0.58, -2.3);
    desk.add(pot2);

    // 剪刀（右前，15cm）：两个指环 + 交叉双刃
    const sc = new THREE.Group();
    for (const sx of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.028, 8, 16), M(0xF26A4B, 0.5));
      ring.position.set(sx * 0.12, 0, -0.26);
      ring.rotation.x = Math.PI / 2;
      sc.add(ring);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.62), M(0xC9C4BC, 0.3));
      blade.position.set(sx * -0.06, 0, 0.16);
      blade.rotation.y = sx * 0.16;
      sc.add(blade);
    }
    sc.position.set(2.5, -0.705, 1.7);
    sc.rotation.y = -0.6;
    desk.add(sc);

    // 尺子（左中）：薄板 + 刻度线
    const ruler = new THREE.Group();
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.015, 0.16), M(0xE8C9A0, 0.6));
    rBody.castShadow = true;
    ruler.add(rBody);
    for (let i = 0; i < 18; i++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, i % 2 ? 0.06 : 0.1), M(0x8A6B45, 0.7));
      tick.position.set(-0.88 + i * 0.1, 0.01, -0.04);
      ruler.add(tick);
    }
    ruler.position.set(-1.7, -0.705, 0.55);
    ruler.rotation.y = 0.35;
    desk.add(ruler);

    // 橡皮（前中，4cm）：双色小方块
    const eraser = new THREE.Group();
    const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.24), M(0xF5F1E4, 0.6));
    e1.castShadow = true;
    eraser.add(e1);
    const e2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, 0.24), M(0x7FB3E8, 0.6));
    e2.position.y = 0.11;
    eraser.add(e2);
    eraser.position.set(1.0, -0.64, 2.5);
    eraser.rotation.y = 0.5;
    desk.add(eraser);

    // 墨水瓶（右后，5cm）：瓶身 + 瓶盖
    const ink = new THREE.Group();
    const iBody = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.36, 14), M(0x3C3640, 0.4));
    iBody.castShadow = true;
    ink.add(iBody);
    const iCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12), M(0xD8A24A, 0.4));
    iCap.position.y = 0.21;
    ink.add(iCap);
    ink.position.set(2.6, -0.53, -0.85);
    desk.add(ink);
  }

  /* ---------- 场景 ---------- */
  function init(canvas, callbacks) {
    onPageTap = callbacks.onPageTap;
    onOpened = callbacks.onOpened;
    onFlipDone = callbacks.onFlipDone;
    onNewPage = callbacks.onNewPage;
    onBookTap = callbacks.onBookTap;
    onPageDown = callbacks.onPageDown;
    blankTex = makeBlankTexture();

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(2.6, 9.4, 10.2); // 45° 俯角拉远：露出地板与桌前椅
    camera.lookAt(0, 1.5, 0);

    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xc9b691, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
    scene.add(sun);

    buildDesk(scene, THREE);

    bookGroup = new THREE.Group();
    bookGroup.position.z = -0.9; // 待机时书本偏上，给底部 UI 让位
    scene.add(bookGroup);
    bookInner = new THREE.Group();
    bookInner.position.x = -0.855; // 合上的书居中
    bookGroup.add(bookInner);

    const sageMat = new THREE.MeshStandardMaterial({ color: 0x8fb9a8, roughness: 0.78 });
    const sageDeep = new THREE.MeshStandardMaterial({ color: 0x6b9a86, roughness: 0.8 });
    const pagesMat = new THREE.MeshStandardMaterial({ color: 0xf3ecd9, roughness: 0.9 });

    /* --- 合上的书 --- */
    closedGroup = new THREE.Group();
    bookInner.add(closedGroup);
    const cPages = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + 0.04, 0.4, PAGE_H + 0.06), pagesMat);
    cPages.position.set((PAGE_W + 0.04) / 2, 0, 0);
    cPages.castShadow = true; cPages.receiveShadow = true;
    closedGroup.add(cPages);
    const cBack = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + 0.16, 0.06, PAGE_H + 0.2), sageMat);
    cBack.position.set((PAGE_W + 0.16) / 2 - 0.04, -0.23, 0);
    cBack.castShadow = true;
    closedGroup.add(cBack);
    const cSpine = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, PAGE_H + 0.2), sageDeep);
    cSpine.position.set(-0.07, 0, 0);
    closedGroup.add(cSpine);

    // 封面（顶面艺术 + 底面纯色，掀开后底面朝上 = 纯色内封）
    coverPivot = new THREE.Group();
    coverPivot.position.set(-0.06, 0.23, 0);
    bookInner.add(coverPivot);
    const coverArt = new THREE.MeshStandardMaterial({ map: makeCoverTexture(coverInfo || "0个省份·0段回忆"), roughness: 0.72 });
    const coverIn = new THREE.MeshStandardMaterial({ color: 0x9fc2b3, roughness: 0.85 });
    frontCover = new THREE.Mesh(
      new THREE.BoxGeometry(PAGE_W + 0.16, 0.06, PAGE_H + 0.2),
      [sageMat, sageMat, coverArt, coverIn, sageMat, sageMat], // +y=封面艺术 −y=内封纯色
    );
    frontCover.position.x = (PAGE_W + 0.16) / 2 + 0.04;
    frontCover.castShadow = true;
    coverPivot.add(frontCover);

    /* --- 摊开的书（单页模式） --- */
    openGroup = new THREE.Group();
    openGroup.visible = false;
    bookInner.add(openGroup);
    const oBack = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + 0.28, 0.06, PAGE_H + 0.24), sageMat);
    oBack.position.set(PAGE_W / 2, -0.31, 0);
    oBack.castShadow = true; oBack.receiveShadow = true;
    openGroup.add(oBack);
    const rStack = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W, 0.28, PAGE_H), pagesMat);
    rStack.position.set(PAGE_W / 2, -0.15, 0);
    rStack.castShadow = true; rStack.receiveShadow = true;
    openGroup.add(rStack);
    // 书签缎带
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.5), new THREE.MeshStandardMaterial({ color: 0x4f7a66, roughness: 0.6 }));
    ribbon.position.set(PAGE_W / 2, -0.32, PAGE_H / 2 + 0.2);
    openGroup.add(ribbon);

    // 页组：下页 + 翻动页（正/反两片）
    pagePivot = new THREE.Group();
    pagePivot.position.set(0, 0.01, 0);
    openGroup.add(pagePivot);
    underPage = new THREE.Mesh(
      new THREE.PlaneGeometry(PAGE_W, PAGE_H),
      new THREE.MeshStandardMaterial({ roughness: 0.9 }),
    );
    underPage.geometry.translate(PAGE_W / 2, 0, 0);
    underPage.rotation.x = -Math.PI / 2;
    underPage.receiveShadow = true;
    pagePivot.add(underPage);
    flipMesh = makeFlipMesh();
    flipMesh.rotation.x = -Math.PI / 2;
    flipMesh.position.y = 0.004;
    pagePivot.add(flipMesh);
    flipBack = makeFlipMesh();
    flipBack.material.side = THREE.BackSide;
    flipBack.material.map = blankTex;
    flipBack.rotation.x = -Math.PI / 2;
    flipBack.position.y = 0.004;
    pagePivot.add(flipBack);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    canvas.addEventListener("pointerdown", e => {
      const r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (phase === "idle") {
        if (raycaster.intersectObject(bookGroup, true).length && onBookTap) onBookTap();
      } else if (phase === "ready" || phase === "flipping") {
        const uv = pageUV(e.clientX, e.clientY);
        if (uv && onPageDown && onPageDown(uv, e)) return; // 按在贴纸上：交给贴纸交互
        swipe = { x0: e.clientX, y0: e.clientY, moved: false };
      }
    });
    canvas.addEventListener("pointermove", e => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x0;
      if (Math.abs(dx) > 14) swipe.moved = true;
      if (swipe.moved && phase === "ready") {
        const w = canvas.clientWidth;
        if (flipDir === 0 && !beginFlip(dx < 0 ? 1 : -1)) return;
        flipF = flipDir > 0 ? -dx / (w * 0.8) : 1 - dx / (w * 0.8);
        flipF = Math.max(0, Math.min(1, flipF));
        curl(flipF);
      }
    });
    canvas.addEventListener("pointerup", e => {
      if (!swipe) return;
      if (!swipe.moved) {
        handleTap(e);
      } else if (flipDir !== 0) {
        settleFlip(flipDir > 0 ? (flipF > 0.42 ? 1 : 0) : (flipF < 0.58 ? 0 : 1));
      }
      swipe = null;
    });

    clock = new THREE.Clock();
    resize(canvas);
    animate();
    window.__b3 = {
      get phase() { return phase; },
      cam: () => camera.position.toArray().map(v => +v.toFixed(2)),
      aspect: () => +camera.aspect.toFixed(3),
      size: () => [canvas.clientWidth, canvas.clientHeight],
      texCount: () => textures.length,
      get spread() { return pageIndex; },
      dbg: () => ({
        scale: +bookGroup.scale.x.toFixed(2),
        posZ: +bookGroup.position.z.toFixed(2),
        innerX: +bookInner.position.x.toFixed(2),
        camY: +camera.position.y.toFixed(2),
        coverY: +coverPivot.position.y.toFixed(2),
      }),
    };
  }

  function resize(canvas) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function handleTap(e) {
    const uv = pageUV(e.clientX, e.clientY);
    if (uv && onPageTap) onPageTap(uv.page, uv.x, uv.y);
  }

  // 屏幕点 → {page: 内容页序号, x, y(页内UV)}；不在页上返回 null
  function pageUV(clientX, clientY) {
    if (phase !== "ready" && phase !== "flipping") return null;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(flipMesh, false)[0] || raycaster.intersectObject(underPage, false)[0];
    if (hit && hit.uv) return { page: pageIndex, x: hit.uv.x, y: 1 - hit.uv.y };
    return null;
  }

  // 页内 UV → 屏幕像素（编辑框定位用；仅 ready 且未翻页时准确）
  function pageToScreen(page, ux, uy) {
    const v = new THREE.Vector3(ux * PAGE_W, (0.5 - uy) * PAGE_H, 0);
    flipMesh.localToWorld(v);
    v.project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }

  function startOpen() {
    if (phase !== "idle") return;
    phase = "opening";
    openT = 0;
  }

  /* --- 单页陈设：翻页=当前页，背面=下一页（翻过即见新页），底下=下一页 --- */
  function setupCurrent() {
    const k = pageIndex;
    setFlipTextures(textures[k] || blankTex, textures[k + 1] || blankTex);
    setUnderTexture(textures[k + 1] || blankTex);
  }

  // 无限翻页：永远备出下一页
  function ensurePages() {
    const need = pageIndex + 2;
    if (textures.length >= need) { setupCurrent(); return; }
    if (growing) return;
    growing = true;
    (async () => {
      while (textures.length < need) {
        const idx = textures.length;
        const def = await Promise.resolve(onNewPage ? onNewPage(idx) : { empty: true, seed: idx });
        textures.push(await makePageTexture(def));
      }
      growing = false;
      if (phase === "ready") setupCurrent();
    })();
  }

  function beginFlip(dir) {
    if (dir > 0) {
      if (textures.length < pageIndex + 2) return false; // 新页生成中
      flipDir = 1; flipF = 0;
      setupCurrent();
    } else {
      if (pageIndex === 0) return false;
      flipDir = -1; flipF = 1;
      const prev = textures[pageIndex - 1] || blankTex;
      setFlipTextures(prev, prev); // 纸页两面都是上一页
      setUnderTexture(textures[pageIndex] || blankTex); // 当前页不动
      curl(1);
    }
    return true;
  }

  function settleFlip(to) {
    if (phase === "flipping") return;
    flipAnim = { from: flipF, to, t: 0 };
    phase = "flipping";
  }

  function completeFlip() {
    if (flipDir > 0) pageIndex++;
    else if (flipDir < 0) pageIndex--;
    flipDir = 0; flipF = 0;
    curl(0);
    if (pendingSwitch) { // 切换手账本：翻页落定时换上新内容
      textures = pendingSwitch.textures;
      pendingSwitch = null;
      pageIndex = 0;
      growing = false;
    }
    phase = "ready";
    ensurePages();
    setupCurrent();
    if (onFlipDone) onFlipDone(pageIndex);
  }

  function cancelFlip() {
    flipDir = 0; flipF = 0;
    curl(0);
    setupCurrent();
    phase = "ready";
  }

  function flipNext() {
    if (phase !== "ready" || flipDir !== 0) return;
    if (!beginFlip(1)) return;
    settleFlip(1);
  }
  function flipPrev() {
    if (phase !== "ready" || flipDir !== 0) return;
    if (!beginFlip(-1)) return;
    settleFlip(0);
  }

  /* 切换手账本：预生成新页组，用翻页动画过渡（dir=1 向前翻 / -1 向后翻） */
  async function switchPages(pageDefs, dir = 1) {
    if (phase !== "ready" || flipDir !== 0) return;
    const nt = [];
    for (const d of pageDefs) nt.push(await makePageTexture(d));
    if (!nt.length) nt.push(await makePageTexture({ side: "L", empty: true, seed: 0, pageNo: 1 }));
    pendingSwitch = { textures: nt };
    if (dir > 0) {
      setFlipTextures(textures[pageIndex] || blankTex, nt[0]);
      setUnderTexture(nt[1] || blankTex);
      flipDir = 1; flipF = 0; curl(0);
      settleFlip(1);
    } else {
      setFlipTextures(nt[0], nt[0]); // 纸页两面都是新本首页
      setUnderTexture(textures[pageIndex] || blankTex);
      flipDir = -1; flipF = 1; curl(1);
      settleFlip(0);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (phase === "idle") {
      bookGroup.rotation.y = Math.sin(t * 0.7) * 0.10;
      bookGroup.rotation.x = 0.06 + Math.cos(t * 0.55) * 0.025;
      bookGroup.position.y = Math.sin(t * 1.1) * 0.05;
    } else if (phase === "opening") {
      bookGroup.rotation.y *= 0.9;
      bookGroup.rotation.x *= 0.9;
      bookGroup.position.y *= 0.9;
      if (openT < 1) {
        openT = Math.min(1, openT + 0.022);
        const e = 1 - Math.pow(1 - openT, 3);
        coverPivot.rotation.z = e * Math.PI;
        camera.position.set(2.6 - e * 1.4, 9.4 - e * 2.9, 10.2 - e * 3.2);
        camera.lookAt(0, 0.1, 0);
        if (openT >= 1) {
          closedGroup.visible = false;
          openGroup.visible = true;
          coverPivot.position.y = -0.42; // 单页模式：封面塞到封底下面藏起来
        }
      } else if (openT < 2) {
        openT = Math.min(2, openT + 0.016);
        const k = openT - 1;
        const e = 1 - Math.pow(1 - k, 3);
        // 相机推近（视角放大），书本本身不缩放
        camera.position.set(1.2 * (1 - e), 6.5 - e * 0.9, 7.0 - e * 6.99);
        camera.lookAt(0, 0, 0);
        bookGroup.position.z = -0.9 + e * 0.45; // 从待机位过渡到 -0.45（避开顶栏与托盘）
        if (openT >= 2) {
          phase = "ready";
          if (onOpened) onOpened();
        }
      }
    } else if (phase === "flipping" && flipAnim) {
      flipAnim.t = Math.min(1, flipAnim.t + 0.045);
      const e = 1 - Math.pow(1 - flipAnim.t, 3);
      flipF = flipAnim.from + (flipAnim.to - flipAnim.from) * e;
      curl(flipF);
      if (flipAnim.t >= 1) {
        flipAnim = null;
        const done = flipDir > 0 ? flipF > 0.5 : flipF < 0.5;
        if (done) completeFlip(); else cancelFlip();
      }
    }
    renderer.render(scene, camera);
  }

  /* ---------- 对外 ---------- */
  async function setPages(pageDefs) {
    textures = [];
    for (const d of pageDefs) textures.push(await makePageTexture(d));
    if (!textures.length) textures.push(await makePageTexture({ side: "L", empty: true, seed: 0, pageNo: 1 }));
    pageIndex = Math.min(pageIndex, textures.length - 1);
    growing = false;
    setupCurrent();
    ensurePages();
  }

  function updateCover(info) {
    coverInfo = info;
    const tex = makeCoverTexture(info);
    frontCover.material[4].map = tex;
    frontCover.material[4].needsUpdate = true;
  }

  function getPageIndex() { return pageIndex; }

  function closeBook() {
    phase = "idle";
    openT = 0; flipF = 0; flipDir = 0; pageIndex = 0;
    coverPivot.rotation.z = 0;
    coverPivot.position.y = 0.23;
    curl(0);
    closedGroup.visible = true;
    openGroup.visible = false;
    bookGroup.scale.set(1, 1, 1);
    bookGroup.rotation.set(0.06, 0, 0);
    bookGroup.position.z = -0.9;
    bookInner.position.x = -0.855;
    camera.position.set(2.6, 9.4, 10.2);
    camera.lookAt(0, 1.5, 0);
  }

  return { init, setPages, getPageIndex, resize: c => resize(c), startOpen, closeBook, flipNext, flipPrev, switchPages, pageUV, pageToScreen, updateCover };
})();
