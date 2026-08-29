/* 抠图贴纸引擎：主体分割（MediaPipe 人像 → 显著性启发式兜底）→ 异形模切白边 */
"use strict";
const CutoutSticker = (() => {
  let seg = null, segReady = false, segFailed = false;

  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  async function ensureSeg() {
    if (segReady || segFailed) return;
    try {
      await loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/selfie_segmentation.js");
      seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1/${f}` });
      seg.setOptions({ modelSelection: 1 });
      segReady = true;
    } catch (e) { segFailed = true; }
  }

  function personMask(canvas) {
    return new Promise(res => {
      if (!segReady) return res(null);
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; res(null); } }, 4000);
      seg.onResults(r => { if (!done) { done = true; clearTimeout(timer); res(r.segmentationMask); } });
      seg.send({ image: canvas }).catch(() => { if (!done) { done = true; clearTimeout(timer); res(null); } });
    });
  }

  /* 显著性兜底：饱和度 × 亮度梯度 × 中心先验，取最大连通区 */
  function saliencyMask(canvas) {
    const w = canvas.width, h = canvas.height;
    const g = 48;
    const small = document.createElement("canvas");
    small.width = g; small.height = g;
    const sx = small.getContext("2d");
    sx.drawImage(canvas, 0, 0, g, g);
    const d = sx.getImageData(0, 0, g, g).data;
    const score = new Float32Array(g * g);
    const lum = new Float32Array(g * g);
    for (let i = 0; i < g * g; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2];
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      const sat = mx ? (mx - mn) / mx : 0;
      lum[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
      const cx = (i % g - g / 2) / (g / 2), cy = ((i / g | 0) - g / 2) / (g / 2);
      const prior = Math.exp(-(cx * cx + cy * cy) * 1.4);
      score[i] = sat * 0.7 + prior * 0.3;
    }
    for (let y = 1; y < g - 1; y++) for (let x = 1; x < g - 1; x++) {
      const i = y * g + x;
      const grad = Math.abs(lum[i] - lum[i - 1]) + Math.abs(lum[i] - lum[i - g]);
      score[i] += Math.min(0.5, grad / 255);
    }
    let mean = 0; for (const v of score) mean += v;
    mean /= score.length;
    let std = 0; for (const v of score) std += (v - mean) ** 2;
    std = Math.sqrt(std / score.length);
    const th = mean + std * 0.6;
    const mask = new Uint8Array(g * g);
    const seen = new Uint8Array(g * g);
    let bestI = 0, bestV = -1;
    for (let i = 0; i < g * g; i++) if (score[i] > bestV) { bestV = score[i]; bestI = i; }
    const stack = [bestI];
    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue;
      seen[i] = 1;
      if (score[i] < th * 0.75) continue;
      mask[i] = 1;
      const x = i % g, y = (i / g) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < g - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - g);
      if (y < g - 1) stack.push(i + g);
    }
    let cov = 0; for (const v of mask) cov += v;
    if (cov < g * g * 0.04) { // 没找到主体 → 中心椭圆兜底
      for (let y = 0; y < g; y++) for (let x = 0; x < g; x++) {
        const cx = (x - g / 2) / (g * 0.32), cy = (y - g / 2) / (g * 0.32);
        if (cx * cx + cy * cy < 1) mask[y * g + x] = 1;
      }
    }
    const mc = document.createElement("canvas");
    mc.width = g; mc.height = g;
    const mx = mc.getContext("2d");
    const mid = mx.createImageData(g, g);
    for (let i = 0; i < g * g; i++) { mid.data[i * 4] = mid.data[i * 4 + 1] = mid.data[i * 4 + 2] = 255; mid.data[i * 4 + 3] = mask[i] * 255; }
    mx.putImageData(mid, 0, 0);
    const big = document.createElement("canvas");
    big.width = w; big.height = h;
    big.getContext("2d").drawImage(mc, 0, 0, w, h);
    return big;
  }

  /* 源图 + mask(白=主体) → 异形模切 PNG dataURL */
  function dieCut(canvas, maskCanvas) {
    const w = canvas.width, h = canvas.height;
    const sub = document.createElement("canvas");
    sub.width = w; sub.height = h;
    const sx = sub.getContext("2d");
    sx.drawImage(canvas, 0, 0);
    const id = sx.getImageData(0, 0, w, h);
    const md = maskCanvas.getContext("2d").getImageData(0, 0, w, h).data;
    for (let i = 0; i < w * h; i++) id.data[i * 4 + 3] = md[i * 4 + 3] > 110 ? 255 : 0;
    sx.putImageData(id, 0, 0);
    // 白边：mask 偏移叠印 → source-in 涂白
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    const ox = out.getContext("2d");
    const dil = 6;
    ox.filter = "blur(2px)";
    for (let dy = -dil; dy <= dil; dy += dil)
      for (let dx = -dil; dx <= dil; dx += dil) ox.drawImage(maskCanvas, dx, dy);
    ox.globalCompositeOperation = "source-in";
    ox.fillStyle = "#fff";
    ox.fillRect(0, 0, w, h);
    ox.globalCompositeOperation = "source-over";
    ox.filter = "none";
    ox.drawImage(sub, 0, 0);
    // 内容包围盒
    const bd = ox.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (bd[(y * w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 <= x0) return null;
    const pad = 8;
    const crop = document.createElement("canvas");
    crop.width = x1 - x0 + pad * 2; crop.height = y1 - y0 + pad * 2;
    crop.getContext("2d").drawImage(out, x0 - pad, y0 - pad);
    return crop.toDataURL("image/png");
  }

  async function fromCanvas(c) {
    await ensureSeg();
    let mask = segReady ? await personMask(c) : null;
    if (mask) {
      const mc = document.createElement("canvas");
      mc.width = 480; mc.height = 480;
      mc.getContext("2d").drawImage(mask, 0, 0, 480, 480);
      const md = mc.getContext("2d").getImageData(0, 0, 480, 480).data;
      let cov = 0, n = 0;
      for (let i = 3; i < md.length; i += 16) { n++; if (md[i] > 110) cov++; }
      mask = cov > n * 0.03 ? mc : null; // 人像太少视为非人像场景
    }
    if (!mask) mask = saliencyMask(c);
    return dieCut(c, mask);
  }

  async function fromVideo(video, filterCss) {
    const s = Math.min(video.videoWidth, video.videoHeight);
    const c = document.createElement("canvas");
    c.width = 480; c.height = 480;
    const ctx = c.getContext("2d");
    ctx.filter = filterCss || "none";
    ctx.drawImage(video, (video.videoWidth - s) / 2, (video.videoHeight - s) / 2, s, s, 0, 0, 480, 480);
    return fromCanvas(c);
  }

  async function fromDataURL(url, filterCss) {
    const img = await new Promise(res => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(null);
      i.src = url;
    });
    if (!img) return null;
    const s = Math.min(img.width, img.height);
    const c = document.createElement("canvas");
    c.width = 480; c.height = 480;
    const ctx = c.getContext("2d");
    ctx.filter = filterCss || "none";
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 480, 480);
    return fromCanvas(c);
  }

  return { fromVideo, fromDataURL };
})();
