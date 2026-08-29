/* Lucide 图标内联器：<i data-icon="name"> → 内联 SVG（currentColor，随 CSS 着色） */
const Iconify = (() => {
  const cache = {};
  async function load(name) {
    if (!cache[name]) {
      const res = await fetch("icons/" + name + ".svg");
      cache[name] = await res.text();
    }
    return cache[name];
  }
  async function apply(root = document) {
    const jobs = [];
    root.querySelectorAll("[data-icon]").forEach(el => {
      jobs.push((async () => {
        const name = el.dataset.icon;
        try {
          const svgText = await load(name);
          const span = document.createElement("span");
          span.className = "ico";
          span.innerHTML = svgText;
          const svg = span.querySelector("svg");
          if (svg) {
            svg.setAttribute("width", el.dataset.size || 20);
            svg.setAttribute("height", el.dataset.size || 20);
          }
          el.replaceWith(span);
        } catch (e) { /* 图标缺失时静默 */ }
      })());
    });
    await Promise.all(jobs);
  }
  return { apply };
})();
