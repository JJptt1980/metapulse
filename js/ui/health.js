/* 設定頁：Health Connect 同步（只在 APK 中可用；網頁版顯示說明） */
import { S, L, commit, commitLocal, uid } from '../state.js';
import { h, toast, section, sumLine } from './common.js';
import { isNative, healthPlugin, diagnose, readHealth, buildRecords, planHealth, applyHealth } from '../health.js';

const UNDO_KEY = 'metapulse-v1-undo';
const hasUndo = () => { try { return !!localStorage.getItem(UNDO_KEY); } catch (e) { return false; } };

export function healthCard() {
  const sumEl = sumLine();
  const native = isNative() && !!healthPlugin();
  const drawSum = () => {
    const x = L.lastHC;
    sumEl.textContent = !native ? '需要安裝 MetaPulse 的 Android APK'
      : x ? '上次同步：' + new Date(x.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '・新增 ' + x.added + ' 筆' : '還沒同步過';
  };
  drawSum();
  if (!native) {
    return section('hc', 'Health Connect 同步', sumEl, [
      h('div.mu.small', { style: { lineHeight: 1.7 } },
        'Health Connect 只開放給 Android 原生 app，網頁版讀不到。安裝 MetaPulse 的 APK 後，這裡會出現同步按鈕，可以讀取 Omron 寫入的血壓、脈搏、體重、體脂、基礎代謝，以及手錶的運動消耗熱量。'),
      /Android/i.test(navigator.userAgent || '') ? h('div.mu.tiny', { style: { marginTop: '6px' } }, '診斷：' + diagnose()) : null,
    ]);
  }

  const days = h('select', h('option', { value: '30' }, '最近 30 天'), h('option', { value: '90' }, '最近 90 天'), h('option', { value: '365' }, '最近 1 年（需歷史權限）'));
  days.value = L.hcDays || '30';
  days.onchange = () => { L.hcDays = days.value; commitLocal(); };
  const all = h('input', { type: 'checkbox', checked: !!L.hcAll });
  all.onchange = () => { L.hcAll = all.checked; commitLocal(); };
  const out = h('div', { style: { marginTop: '10px' } });
  const undo = h('button.ghost.full', { type: 'button', style: { display: hasUndo() ? '' : 'none' } }, '復原上次同步');
  let last = null; // {raw, ...}

  const show = () => {
    out.textContent = '';
    const b = buildRecords(last.raw, { allSources: all.checked, calSource: L.hcCalSource });
    const p = planHealth(b, S);
    const line = t => h('div.small', t);
    const box = h('div', { style: { background: 'var(--soft)', borderRadius: '12px', padding: '10px 12px', lineHeight: 1.8 } },
      line('量測記錄：新增 ' + p.add.length + ' 筆・補上體組成 ' + p.merge.length + ' 筆・已存在 ' + p.dup + ' 筆' + (p.from ? '（' + p.from + ' ～ ' + p.to + '）' : '')),
      line('運動消耗：新增 ' + p.act.add.length + ' 天・更新 ' + p.act.update.length + ' 天' + (b.calSource ? '（來源：' + b.calSource + '）' : '（沒有資料）')));
    out.append(box);
    if (b.calSources.length > 1) {
      const sel = h('select', ...b.calSources.map(s => h('option', { value: s }, s)));
      sel.value = b.calSource;
      sel.onchange = () => { L.hcCalSource = sel.value; commitLocal(); show(); };
      out.append(h('label', '運動消耗要用哪個來源（避免手機與手錶重複計算）'), sel);
    }
    const names = Object.keys(b.sources).map(k => k + ' ' + b.sources[k] + ' 筆').join('、');
    out.append(h('div.mu.tiny', { style: { marginTop: '6px', lineHeight: 1.6 } },
      'Health Connect 內的來源：' + (names || '無') + '。' + (all.checked ? '' : '量測記錄只取來源名稱含 Omron 的資料。'),
      last.denied.length ? h('div', '未授權的項目：' + last.denied.join('、')) : null,
      last.historyDenied ? h('div', '沒有取得歷史資料權限，只會提供大約 30 天內的資料。') : null,
      ...last.errs.map(e => h('div', '讀取失敗：' + e)),
      h('div', '骨骼肌、內臟脂肪、身體年齡不在 Health Connect 中，之後請用 Omron CSV 匯入。')));
    if (!p.add.length && !p.merge.length && !p.act.add.length && !p.act.update.length) { out.append(h('div.notice.ok', '沒有新的資料。')); return; }
    const go = h('button.pri.full', { type: 'button' }, '確認匯入');
    go.onclick = () => {
      try { localStorage.setItem(UNDO_KEY, JSON.stringify({ entries: S.entries, activity: S.activity || [] })); } catch (e) { /* 空間不足時不保留復原 */ }
      applyHealth(S, p, uid);
      L.lastHC = { at: Date.now(), added: p.add.length + p.merge.length }; commitLocal();
      commit(); drawSum();
      out.textContent = ''; out.append(h('div.notice.ok', '✓ 已匯入 ' + p.add.length + ' 筆、補上 ' + p.merge.length + ' 筆體組成、運動消耗 ' + (p.act.add.length + p.act.update.length) + ' 天。'));
      undo.style.display = hasUndo() ? '' : 'none';
      toast('Health Connect 匯入完成');
    };
    out.append(go);
  };

  const btn = h('button.pri.full', { type: 'button' }, '授權並讀取 Health Connect');
  btn.onclick = async () => {
    btn.disabled = true; out.textContent = ''; out.append(h('div.row.small.mu', h('span.spin'), '正在讀取 Health Connect…'));
    try { last = await readHealth(+days.value || 30); show(); }
    catch (e) { out.textContent = ''; out.append(h('div.notice', 'Health Connect 同步失敗：' + (e && e.message ? e.message : e))); }
    btn.disabled = false;
  };
  undo.onclick = () => {
    if (!undo.dataset.c) { undo.dataset.c = 1; undo.textContent = '再按一次確認復原'; setTimeout(() => { undo.dataset.c = ''; undo.textContent = '復原上次同步'; }, 3000); return; }
    try {
      const p = JSON.parse(localStorage.getItem(UNDO_KEY));
      S.entries = p.entries; S.activity = p.activity; localStorage.removeItem(UNDO_KEY);
      commit(); undo.style.display = 'none'; out.textContent = ''; out.append(h('div.notice.ok', '已復原到上次同步之前。')); toast('已復原');
    } catch (e) { toast('復原失敗', true); }
  };
  return section('hc', 'Health Connect 同步', sumEl, [
    h('div.grid2', h('div', h('label', { style: { marginTop: 0 } }, '期間'), days), h('div')),
    h('label.row', { style: { color: 'var(--tx)', marginTop: '10px', fontSize: '15px' } }, all, '包含所有來源（預設只取 Omron）'),
    btn, out, undo,
  ], !L.lastHC);
}
