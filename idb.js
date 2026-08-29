/* 大媒体存储（IndexedDB）：frame/photo/video/frames 存这里，容量按 GB 计
   localStorage 只存贴纸元数据，彻底绕开 5MB 配额 */
"use strict";
const MediaDB = (() => {
  let db = null;
  function open() {
    return new Promise((res, rej) => {
      if (db) return res();
      const r = indexedDB.open("suoxingji", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("media", { keyPath: "id" });
      r.onsuccess = () => { db = r.result; res(); };
      r.onerror = rej;
    });
  }
  function tx(mode) { return db.transaction("media", mode).objectStore("media"); }

  function put(sticker) {
    if (!db) return;
    const rec = { id: sticker.id };
    ["frame", "photo", "video", "frames"].forEach(k => { if (sticker[k]) rec[k] = sticker[k]; });
    try { tx("readwrite").put(rec); } catch (e) {}
  }
  function getAll() {
    if (!db) return Promise.resolve({});
    return new Promise(res => {
      const out = {};
      const rq = tx("readonly").getAll();
      rq.onsuccess = () => { (rq.result || []).forEach(r => { out[r.id] = r; }); res(out); };
      rq.onerror = () => res(out);
    });
  }
  function del(id) {
    if (!db) return;
    try { tx("readwrite").delete(id); } catch (e) {}
  }
  return { open, put, getAll, del };
})();
