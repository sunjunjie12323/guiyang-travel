# 景点贴纸

把透明背景的 WebP 文件放在此目录，并以 `src/data/pois.js` 中的 `id` 命名：

```text
huangguoshu.webp
fanjingshan.webp
jiaxiulou.webp
```

页面会自动请求 `/stickers/{poi.id}.webp`，无需修改组件代码。图片不存在或加载失败时，会回退到该景点的 emoji / 首字。

图片允许 1:1 到 16:9 等不同比例，组件会按固定高度、宽度自适应显示。素材必须使用透明背景，并把不规则模切白边直接烘焙在图片内；组件只增加基于透明轮廓的轻微投影与稳定的 ±3° 旋转，不绘制矩形背景、圆角或 CSS 白边。

未点亮态使用图片自身作为 `mask-image` 叠加靛蓝染色，白边会一起变成靛蓝；打卡后染色层在 1.4 秒内淡出。`manifest.json` 记录实际宽高比，可执行 `npm run build-sticker-manifest` 从目录中的 WebP 重新生成。
