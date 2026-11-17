/* 服藥提醒：設定裡新增藥物與時間；飲食頁顯示今天的服藥狀態，按「已服用」記下來 */
import { S, commit, uid } from '../state.js';
import { h, toast, section, sumLine, tip } from './common.js';
import { localDate } from '../points.js';
import { canNotify, schedule } from '../notify.js';

const minOf = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const hm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

/** 今天每種藥的狀態：taken（已服用記錄）、due（該吃了：時間前 1 小時起，還沒吃）、late（過了 1 小時還沒吃） */
export function medStatus() {
  const today = localDate(new Date()), n = nowMin();
  return (S.prefs.meds || []).filter(m => m && m.name && m.time).map(m => {
    const log = (S.medLog || []).find(x => x.med === m.id && x.date === today);
    const diff = n - minOf(m.time);
    return { med: m, log, due: !log && diff >= -60, late: !log && diff > 60 };
  }).sort((a, b) => (a.med.time < b.med.time ? -1 : 1));
}

/** 飲食頁的服藥卡：沒有設定藥物時不顯示；有該吃的藥時 urgent＝true（排到最上面） */
export function medCard() {
  const list = medStatus();
  if (!list.length) return null;
  const urgent = list.some(x => x.due);
  const card = h('div.card', urgent ? { style: { borderColor: 'var(--warn)', borderWidth: '2px' } } : null);
  card.append(h('h2', { style: { margin: '0 0 6px' } }, urgent ? '該吃藥了' : '今天的藥'));
  for (const x of list) {
    const m = x.med;
    if (x.log) {
      const row = h('div.row.between.small', { style: { padding: '6px 0', color: 'var(--ac)', fontWeight: 600 } }, h('span.one', '✓ ' + m.time + ' ' + m.name + '・' + hm(x.log.at) + ' 已服用'));
      const undo = h('button.link.small', { type: 'button' }, '取消');
      undo.onclick = () => {
        if (!undo.dataset.c) { undo.dataset.c = 1; undo.textContent = '再按一次'; setTimeout(() => { undo.dataset.c = ''; undo.textContent = '取消'; }, 3000); return; }
        S.medLog = S.medLog.filter(y => y.id !== x.log.id); commit(); toast('已取消這次服藥記錄');
      };
      row.append(undo); card.append(row);
    } else {
      const take = h('button' + (x.due ? '.pri' : '.ghost'), { type: 'button', style: { padding: '8px 14px', flex: '0 0 auto', ...(x.late ? { background: 'var(--warn)', color: 'var(--act)' } : {}) } }, '已服用');
      take.onclick = () => {
        S.medLog = S.medLog || [];
        S.medLog.push({ id: uid('k'), med: m.id, date: localDate(new Date()), at: new Date().toISOString() });
        commit(); toast('✓ 已記錄：' + m.name);
      };
      card.append(h('div.row.between', { style: { padding: '4px 0', gap: '10px' } },
        h('span.one', { style: { fontWeight: x.due ? 650 : 400, color: x.late ? 'var(--warn)' : '' } }, m.time + ' ' + m.name + (x.late ? '・還沒吃' : '')), take));
    }
  }
  return { card, urgent };
}

/** 設定頁：藥物清單（名稱＋時間） */
export function medsSettings() {
  const sumEl = sumLine();
  const meds = () => (S.prefs.meds = S.prefs.meds || []);
  const drawSum = () => { const m = meds(); sumEl.textContent = m.length ? m.map(x => x.time + ' ' + x.name).join('・') : '還沒有設定'; };
  const list = h('div');
  const msg = h('div.mu.tiny.one', { style: { marginTop: '6px' } });
  const resched = async () => { drawSum(); if (canNotify()) { const r = await schedule().catch(() => ({ ok: false })); msg.textContent = r.ok ? '已排好手機通知' : r.reason === 'denied' ? '手機沒有允許通知，請到手機設定開啟' : ''; } };
  const draw = () => {
    list.textContent = '';
    meds().forEach((m, i) => {
      const name = h('input', { value: m.name, placeholder: '藥名，例如：降血糖藥' });
      const time = h('input', { type: 'time', value: m.time, style: { width: '120px', flex: '0 0 auto' } });
      name.onchange = () => { m.name = name.value.trim() || '藥'; commit(); resched(); };
      time.onchange = () => { m.time = time.value || '19:00'; commit(); resched(); };
      const del = h('button.ghost', { type: 'button', style: { padding: '8px 12px', flex: '0 0 auto' } }, '刪除');
      del.onclick = () => { meds().splice(i, 1); commit(); draw(); resched(); };
      list.append(h('div.row', { style: { marginTop: '8px', gap: '8px' } }, h('div.grow', name), time, del));
    });
  };
  const add = h('button.ghost.full', { type: 'button' }, '＋ 新增藥物');
  add.onclick = () => { meds().push({ id: uid('rx'), name: '降血糖藥', time: '19:00' }); commit(); draw(); resched(); };
  draw(); drawSum();
  return section('meds', '服藥提醒', sumEl, [list, add, msg,
    tip('到了吃藥時間前後，「飲食」頁最上面會出現服藥卡，吃完按「已服用」。在 Maple app 裡，時間到會跳手機通知（第一次會問你要不要允許通知）；網頁版不會通知，只會顯示卡片。這只是提醒，吃藥的方式請照醫師或藥師的指示。')]);
}
