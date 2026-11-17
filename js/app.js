/* 啟動：分頁切換、各畫面串接、版本檢查 */
import { onChange } from './state.js';
import { $, closeSheet, sheetOpen } from './ui/common.js';
import { renderToday } from './ui/today.js';
import { onAdviceState } from './ui/advice.js';
import { renderSettings, showDisclaimerOnce, applyTheme } from './ui/settings.js';
import { renderLog } from './ui/log.js';
import { renderCharts } from './ui/charts.js';
import { L, S } from './state.js';
import { h, toast } from './ui/common.js';
import { initDrive, onDrive, driveStatus, driveEmail, connect, linked, ready } from './drive.js';

const APP_VERSION = window.APP_VERSION;
$('ver').textContent = 'v' + APP_VERSION;
applyTheme();

let tab = 'today';
const panes = {
  today: () => renderToday($('p-today')),
  log: () => renderLog($('p-log')),
  chart: () => renderCharts($('p-chart')),
  set: () => renderSettings($('p-set')),
};

function show(t) {
  tab = t;
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'p-' + t));
  panes[t]?.();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav.tabs button').forEach(b => { b.onclick = () => { if (sheetOpen()) closeSheet(); show(b.dataset.t); }; });

/* 資料變動時只重畫「今日」，設定頁不重畫（避免打字時失去焦點） */
onChange(ev => {
  renderToday($('p-today'));
  if (tab === 'log') renderLog($('p-log'));
  if (tab === 'chart') renderCharts($('p-chart'));
  if (tab === 'set' && ev && ev.replaced) renderSettings($('p-set'));
  if (!ev || !ev.remote) askBackupSoon();
});

/* ---------- Google Drive 狀態列、提示 ---------- */
const syncEl = $('sync');
const drawSync = t => { syncEl.textContent = t + (linked() && driveEmail() ? '・' + driveEmail() : ''); };
drawSync(driveStatus());
syncEl.onclick = () => { if (linked() && !ready()) connect(true); };
onDrive((t, ev) => {
  drawSync(t);
  if (ev === 'pushed') toast('✓ 已存到 Google Drive');
  if (ev === 'push-failed') toast('✗ 存到雲端失敗，資料還在手機裡', true);
  if (ev === 'pulled') toast('已從 Google Drive 載入');
  if ((ev === 'pushed' || ev === 'synced') && tab === 'today' && !sheetOpen()) renderToday($('p-today')); // 備份提醒消失
});

/* 修改後：尚未連線或登入過期時，詢問是否備份（可在設定關閉） */
let askTmr = null;
function askBackupSoon() { clearTimeout(askTmr); askTmr = setTimeout(askBackup, 700); }
function askBackup() {
  if (L.askBackup === false || (linked() && ready())) return;
  if (!S.entries.length && !S.meals.length) return;
  const el = $('bk-ask');
  el.textContent = '';
  el.append(h('div', { style: { fontWeight: 600 } }, linked() ? '記錄改好了，但 Google Drive 要重新登入才能存檔。要現在登入嗎？' : '記錄改好了。要存一份到 Google Drive（雲端硬碟）嗎？'),
    h('div.grid2', { style: { marginTop: '10px' } },
      h('button.pri', { type: 'button', onclick: () => { el.style.display = 'none'; connect(true); } }, linked() ? '重新登入並存檔' : '連線並存檔'),
      h('button.ghost', { type: 'button', onclick: () => { el.style.display = 'none'; } }, '先不要')));
  el.style.display = 'block';
}
onAdviceState(() => { renderToday($('p-today')); });

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
initDrive();

/* 斷食計時：今日頁每分鐘更新一次 */
setInterval(() => { if (tab === 'today' && !sheetOpen() && !document.hidden) renderToday($('p-today')); }, 60000);
showDisclaimerOnce();
