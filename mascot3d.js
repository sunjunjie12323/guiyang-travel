/* 程序化 3D 松果吉祥物（img2threejs 方法：纯代码几何，无贴图资产）
   分层构建：blockout(身体环层) → structure(四肢) → form(五官/相机) → material/lights */
"use strict";
const Mascot3D = (() => {

  function createPineconeMascot(THREE) {
    const g = new THREE.Group();
    const BROWN = 0x92603E, BROWN_D = 0x7C5234, CREAM = 0xF7DEBC;
    const BLUE = 0x6EAED8, BLUE_D = 0x5489C4, INK = 0x342C28, PINK = 0xF4A08C;

    const mat = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

    /* --- 松果鳞片：三层环状排列的扁球，层径递减、外倾 --- */
    const rows = [
      { y: 0.98, n: 6, r: 0.50, s: 0.235, tilt: 0.62 },
      { y: 0.72, n: 5, r: 0.44, s: 0.235, tilt: 0.55 },
      { y: 0.47, n: 4, r: 0.34, s: 0.215, tilt: 0.48 },
      { y: 1.20, n: 3, r: 0.26, s: 0.19, tilt: 0.72 },
    ];
    rows.forEach((row, ri) => {
      for (let i = 0; i < row.n; i++) {
        const a = (i / row.n) * Math.PI * 2 + ri * 0.5;
        const sc = new THREE.Mesh(
          new THREE.SphereGeometry(row.s, 18, 14),
          mat((i + ri) % 2 ? BROWN : BROWN_D, 0.82),
        );
        sc.scale.set(1, 0.62, 0.78);
        sc.position.set(Math.cos(a) * row.r, row.y, Math.sin(a) * row.r);
        sc.rotation.set(row.tilt * Math.sin(a), a, -row.tilt * Math.cos(a));
        sc.castShadow = true;
        g.add(sc);
      }
    });
    // 身体核心（鳞片下的填充体）
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.44, 20, 16), mat(BROWN, 0.85));
    core.scale.set(1, 1.15, 0.95);
    core.position.y = 0.72;
    core.castShadow = true;
    g.add(core);

    /* --- 脸：奶油色扁球嵌在正前 --- */
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.40, 22, 18), mat(CREAM, 0.65));
    face.scale.set(1, 0.92, 0.68);
    face.position.set(0, 0.74, 0.22);
    g.add(face);

    /* --- 五官 --- */
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), mat(INK, 0.4));
      eye.position.set(sx * 0.155, 0.80, 0.50);
      g.add(eye);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), mat(0xffffff, 0.3));
      glint.position.set(sx * 0.155 - 0.018, 0.822, 0.545);
      g.add(glint);
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(PINK, 0.9));
      blush.scale.set(1, 0.6, 0.5);
      blush.position.set(sx * 0.27, 0.68, 0.44);
      g.add(blush);
    }
    // 嘴：半圆环微笑
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.012, 8, 16, Math.PI),
      mat(INK, 0.5),
    );
    mouth.position.set(0, 0.665, 0.505);
    mouth.rotation.set(0.15, 0, Math.PI);
    g.add(mouth);

    /* --- 手臂：胶囊 --- */
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 6, 10), mat(BROWN_D, 0.85));
      arm.position.set(sx * 0.47, 0.60, 0.05);
      arm.rotation.z = sx * -1.0;
      arm.castShadow = true;
      g.add(arm);
    }
    /* --- 脚 --- */
    for (const sx of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), mat(BROWN_D, 0.85));
      foot.scale.set(1, 0.55, 1.35);
      foot.position.set(sx * 0.17, 0.05, 0.08);
      foot.castShadow = true;
      g.add(foot);
    }

    /* --- 相机（蓝）：机身 + 顶包 + 白圈镜头 + 背带 --- */
    const cam = new THREE.Group();
    const bodyCam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.14), mat(BLUE, 0.55));
    bodyCam.castShadow = true;
    cam.add(bodyCam);
    const topBox = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.12), mat(BLUE, 0.55));
    topBox.position.set(-0.05, 0.15, 0);
    cam.add(topBox);
    const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.06, 20), mat(0xF0F8FC, 0.4));
    lensRing.rotation.x = Math.PI / 2;
    lensRing.position.set(0.03, 0, 0.09);
    cam.add(lensRing);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), mat(0x3C5064, 0.3));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0.03, 0, 0.11);
    cam.add(lens);
    const lensGlint = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), mat(0xffffff, 0.3));
    lensGlint.position.set(0.0, 0.025, 0.135);
    cam.add(lensGlint);
    cam.position.set(0, 0.30, 0.42);
    g.add(cam);
    // 背带（跨肩斜环）
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 32), mat(BLUE_D, 0.6));
    strap.position.set(0, 0.62, 0.1);
    strap.rotation.set(0.35, 0.25, 0.9);
    g.add(strap);

    g.traverse(m => { m.receiveShadow = false; });
    return g;
  }

  /* 迷你查看器：透明底小场景，待机摇摆 */
  function mount(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(34, canvas.clientWidth / canvas.clientHeight || 1, 0.1, 20);
    cam.position.set(0, 1.05, 2.7);
    cam.lookAt(0, 0.62, 0);
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xc9b691, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(2.5, 4, 3);
    sun.castShadow = true;
    scene.add(sun);
    const model = createPineconeMascot(THREE);
    scene.add(model);

    function resize() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    resize();
    window.addEventListener("resize", resize);

    const clock = new THREE.Clock();
    (function anim() {
      requestAnimationFrame(anim);
      const t = clock.getElapsedTime();
      model.position.y = Math.sin(t * 1.5) * 0.035;
      model.rotation.y = Math.sin(t * 0.6) * 0.3;
      model.rotation.z = Math.sin(t * 0.9) * 0.03;
      renderer.render(scene, cam);
    })();
    return { resize };
  }

  return { createPineconeMascot, mount };
})();
