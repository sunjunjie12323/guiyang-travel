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
  const PAGE_W = 2.0, PAGE_H = 2.86;

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
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#F3ECD9"; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "rgba(160,150,120,.4)"; x.lineWidth = 1;
    for (let i = 6; i < 256; i += 7) { x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
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

    // 涂鸦点缀（仅内容页；空白页彻底干净）
    if (!def.empty) {
      const slots = [[.13, .15], [.86, .14], [.10, .52], [.89, .55], [.16, .90], [.82, .90]];
      const nD = 3 + Math.floor(rnd() * 2);
      const used = new Set();
      for (let i = 0; i < nD; i++) {
        let si = Math.floor(rnd() * slots.length);
        while (used.has(si)) si = (si + 1) % slots.length;
        used.add(si);
        const kind = DOODLE_KINDS[Math.floor(rnd() * DOODLE_KINDS.length)];
        const color = DOODLE_COLORS[Math.floor(rnd() * DOODLE_COLORS.length)];
        doodle(x, kind, slots[si][0] * 512, slots[si][1] * 724, 0.9 + rnd() * 0.5, color);
      }
    }

    // 标题
    if (def.title) {
      x.fillStyle = "#4A443C"; x.textAlign = "left";
      x.font = "italic 37px 'LXGW WenKai', serif";
      x.save(); x.translate(46, 88); x.rotate(-0.025);
      x.fillText(def.title, 0, 0); x.restore();
      x.strokeStyle = "#8FB9A8"; x.lineWidth = 4; x.lineCap = "round";
      x.beginPath(); x.moveTo(46, 106); x.quadraticCurveTo(120, 97, 200, 106); x.stroke();
      if (side === "L") doodle(x, "sun", 442, 74, 1.5, "#E8A33D");
      else doodle(x, "heart", 440, 76, 1.4, "#E8956B");
    }

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

    // 贴纸（拍摄=白卡相纸风；图案贴纸=异形模切，白边跟轮廓，无卡无胶带）
    for (const s of def.stickers || []) {
      const img = await loadImg(s.frame);
      if (!img) continue;
      const cx = s.x * 512, cy = s.y * 724;
      if (s.builtin) {
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
      // 说明文字
      if (s.title || s.note) {
        x.save();
        x.translate(cx, cy + h / 2 + 34); x.rotate((s.rot || 0) * Math.PI / 180 * 0.4);
        x.textAlign = "center";
        if (s.title) { x.fillStyle = "#4A443C"; x.font = "italic 25px 'LXGW WenKai', serif"; x.fillText(s.title, 0, 0); }
        if (s.note) {
          x.fillStyle = "#8A8274"; x.font = "italic 21px 'LXGW WenKai', serif";
          const note = s.note.length > 15 ? s.note.slice(0, 15) + "…" : s.note;
          x.fillText(note, 0, 30);
        }
        x.restore();
      }
    }

    // 吉祥物角贴（仅内容页装饰）
    if (!def.empty && (def.seed || 0) % 3 === 1) {
      const m = await loadImg("assets/mascot.png");
      if (m) {
        x.save();
        x.translate(side === "L" ? 62 : 450, 648); x.rotate(side === "L" ? -0.14 : 0.12);
        x.drawImage(m, -34, -34, 68, 68);
        x.restore();
      }
    }

    // 页码（仅内容页，外侧下角）
    if (!def.empty && def.pageNo) {
      x.fillStyle = "#B4AC99"; x.textAlign = "center";
      x.font = "20px 'LXGW WenKai', serif";
      x.fillText("· " + def.pageNo + " ·", side === "L" ? 58 : 454, 700);
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
    camera.position.set(0, 3.2, 6.2);
    camera.lookAt(0, 0.1, 0);

    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xc9b691, 0.55));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -5; sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 5; sun.shadow.camera.bottom = -5;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.ShadowMaterial({ opacity: 0.20 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.72;
    ground.receiveShadow = true;
    scene.add(ground);

    bookGroup = new THREE.Group();
    scene.add(bookGroup);
    bookInner = new THREE.Group();
    bookInner.position.x = -1.08; // 合上的书居中
    bookGroup.add(bookInner);

    const sageMat = new THREE.MeshStandardMaterial({ color: 0x8fb9a8, roughness: 0.78 });
    const sageDeep = new THREE.MeshStandardMaterial({ color: 0x6b9a86, roughness: 0.8 });
    const pagesMat = new THREE.MeshStandardMaterial({ map: makePagesTexture(), roughness: 0.9 });

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
        camera.position.z = 6.2 - e * 0.8;
        camera.position.y = 3.2 - e * 0.3;
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
        camera.position.set(0, 2.9 + e * 6.9, 5.4 - e * 5.39);
        camera.lookAt(0, 0, 0);
        bookGroup.position.z = -0.45 * e; // 上移避开顶栏与托盘
        bookInner.position.x = -1.08 + e * 0.08; // 开书后框中心对准屏幕中心
        const s = 1 + e * 0.42;           // 苔绿框刚好贴边，完整半本书
        bookGroup.scale.set(s, s, s);
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
    bookGroup.position.z = 0;
    bookInner.position.x = -1.08;
    camera.position.set(0, 3.2, 6.2);
    camera.lookAt(0, 0.1, 0);
  }

  return { init, setPages, getPageIndex, resize: c => resize(c), startOpen, closeBook, flipNext, flipPrev, pageUV, pageToScreen, updateCover };
})();
