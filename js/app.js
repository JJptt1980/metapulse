/* 啟動：分頁切換、各畫面串接、版本檢查 */
import { onChange } from './state.js';
import { $, closeSheet, sheetOpen } from './ui/common.js';
import { renderToday } from './ui/today.js';
import { renderSettings, showDisclaimerOnce, applyTheme } from './ui/settings.js';

const APP_VERSION = window.APP_VERSION;
$('ver').textContent = 'v' + APP_VERSION;
applyTheme();

let tab = 'today';
const panes = { today: () => renderToday($('p-today')), set: () => renderSettings($('p-set')) };

function show(t) {
  tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + t));
  panes[t]?.();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav.tabs button').forEach(b => { b.onclick = () => { if (sheetOpen()) closeSheet(); show(b.dataset.t); }; });

/* 資料變動時只重畫「今日」，設定頁不重畫（避免打字時失去焦點） */
onChange(() => { renderToday($('p-today')); });

/* 跨日或從背景切回來時重畫 */
let lastDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  checkUpdate();
  if (new Date().toDateString() !== lastDay) { lastDay = new Date().toDateString(); if (tab === 'today') renderToday($('p-today')); }
});

/* 版本檢查：比對線上 index.html 的 APP_VERSION */
let updShown = false;
async function checkUpdate() {
  if (updShown || !/^https?:/.test(location.protocol)) return;
  try {
    const u = new URL('index.html', location.href); u.search = ''; u.hash = '';
    const r = await fetch(u.href + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const m = (await r.text()).match(/APP_VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
    if (m && m[1] !== APP_VERSION) { updShown = true; $('nv').textContent = m[1]; $('upd').style.display = 'block'; }
  } catch (e) { /* 離線時略過 */ }
}
$('upd').onclick = () => location.replace(location.pathname + '?v=' + Date.now());
window.addEventListener('load', () => setTimeout(checkUpdate, 1500));

show('today');
showDisclaimerOnce();
