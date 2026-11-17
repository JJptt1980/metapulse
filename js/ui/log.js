/* 記錄分頁：體重計／血壓計／注射三張儀器卡（輸入與顯示一致）＋記錄列表 */
import { S, L, commit, commitLocal, uid } from '../state.js';
import { h, icon, toast, fold, pills, openSheet, closeSheet, val } from './common.js';
import { localDate, addDays } from '../points.js';
import { SITES, sortEntries, onBoard, nextDose, bmi, leanMass, dn, md, wdOf, TYPES, hasValue } from '../records.js';

const r1 = x => Math.round(x * 10) / 10;
const nowHM = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const lastOf = (es, f) => { for (let i = es.length - 1; i >= 0; i--) if (f(es[i])) return es[i]; return null; };
const when = e => md(e.date) + '（' + wdOf(e.date) + '）' + (e.time ? ' ' + e.time : '');

function stat(label, value, unit) {
  return h('div', h('div.mu.tiny', label), h('div.num', h('b', value), unit ? h('span.mu.small', ' ' + unit) : null));
}

/* ---------- 輸入面板 ---------- */
const GROUPS = {
  wt: { title: '體重計／體脂機', fields: [['wt', '體重', 'kg', 0.1], ['fat', '體脂率', '%', 0.1], ['mus', '骨骼肌率', '%', 0.1], ['vis', '內臟脂肪等級', '', 0.5], ['bage', '身體年齡', '歲', 1], ['bmr', '基礎代謝', 'kcal', 1]] },
  bp: { title: '血壓計', fields: [['sys', '收縮壓', 'mmHg', 1], ['dia', '舒張壓', 'mmHg', 1], ['pul', '脈搏', '次/分', 1]] },
  dose: { title: '注射', fields: [['dose', '劑量', 'mg', 0.1]] },
};

/**
 * @param {{type?:'wt'|'bp'|'dose', entry?:object}} o  entry 有值時為編輯
 */
export function openEntry(o = {}) {
  const ed = o.entry || null;
  const e = ed ? { ...ed } : { date: localDate(new Date()), time: o.type === 'dose' ? '' : nowHM(), note: '', site: '' };
  const types = ed ? ['wt', 'bp', 'dose'] : [o.type || 'wt'];
  openSheet(sh => {
    sh.append(h('div.sheet-h', h('b', ed ? '編輯記錄' : '記錄' + GROUPS[types[0]].title), h('button.link', { type: 'button', onclick: () => closeSheet() }, '關閉')));
    const dateIn = h('input', { type: 'date', value: e.date });
    const timeIn = h('input', { type: 'time', value: e.time || '' });
    sh.append(h('div.grid2', h('div', h('label', '日期'), dateIn), h('div', h('label', '量測時間（選填）'), timeIn)));
    const ins = {};
    let siteSel = null;
    for (const t of types) {
      const g = GROUPS[t];
      const grid = h('div.grid2');
      for (const [k, label, unit, step] of g.fields) {
        ins[k] = h('input.num', { type: 'number', inputmode: step < 1 ? 'decimal' : 'numeric', step: String(step), min: '0', value: e[k] > 0 ? e[k] : '' });
        grid.append(h('div', h('label', label + (unit ? '（' + unit + '）' : '')), ins[k]));
      }
      const parts = [grid];
      if (t === 'dose') {
        const nd = nextDose(S.entries.filter(x => !ed || x.id !== ed.id), localDate(new Date()));
        siteSel = h('select', h('option', { value: '' }, '（未指定）'), ...SITES.map(s => h('option', { value: s }, s)));
        siteSel.value = ed ? (e.site || '') : (nd ? nd.site : SITES[0]);
        parts.push(h('label', '注射部位'), siteSel);
      }
      if (ed) {
        const has = g.fields.some(([k]) => e[k] > 0);
        sh.append(h('div.card', { style: { marginTop: '12px' } }, fold('edit-' + t, h('b.small', g.title), [h('div', ...parts)], { open: has, force: has })));
      } else sh.append(h('div', { style: { marginTop: '4px' } }, ...parts));
    }
    if (!ed && types[0] === 'dose') timeIn.parentNode.querySelector('label').textContent = '時間（選填）';
    const noteIn = h('input', { type: 'text', value: e.note || '', placeholder: '例如：輕微噁心、飯後' });
    const msg = h('div.small', { style: { color: 'var(--bad)', marginTop: '8px' } });
    sh.append(h('label', '備註'), noteIn, msg);

    const save = h('button.pri.full', { type: 'button' }, ed ? '更新記錄' : '儲存');
    save.onclick = () => {
      const rec = { date: dateIn.value, time: timeIn.value || '', note: noteIn.value.trim() };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) { msg.textContent = '請選擇日期。'; return; }
      for (const k of ['dose', 'wt', 'sys', 'dia', 'pul', 'fat', 'mus', 'vis', 'bage', 'bmr']) rec[k] = ins[k] ? Math.max(0, val(ins[k])) : (ed ? +ed[k] || 0 : 0);
      if ((rec.sys > 0) !== (rec.dia > 0)) { msg.textContent = '血壓請同時輸入收縮壓和舒張壓。'; return; }
      if (!hasValue(rec)) { msg.textContent = '請至少輸入一項數值。'; return; }
      rec.site = rec.dose > 0 ? (siteSel ? siteSel.value : e.site || '') : '';
      if (ed) { const t = S.entries.find(x => x.id === ed.id); Object.assign(t, rec); }
      else S.entries.push({ id: uid('e'), src: 'manual', sid: '', ...rec });
      commit(); closeSheet(); toast(ed ? '已更新' : '已儲存');
    };
    sh.append(save);
    if (ed) {
      const del = h('button.danger.full', { type: 'button' }, icon('trash'), ' 刪除這筆記錄');
      del.onclick = () => {
        if (!del.dataset.c) { del.dataset.c = 1; del.textContent = '再按一次確認刪除'; setTimeout(() => { del.dataset.c = ''; del.textContent = '刪除這筆記錄'; }, 3000); return; }
        S.entries = S.entries.filter(x => x.id !== ed.id); commit(); closeSheet(); toast('已刪除');
      };
      sh.append(del);
    }
  });
}

/* ---------- 儀器卡 ---------- */
function scaleCard(es) {
  const w = lastOf(es, x => x.wt > 0);
  const card = h('div.card');
  card.append(h('div.row.between', h('h2', { style: { margin: 0 } }, '體重計'), h('button.link.small', { type: 'button', onclick: () => openEntry({ type: 'wt' }) }, icon('plus'), ' 記錄')));
  if (!w && !lastOf(es, TYPES.bc)) { card.append(h('div.empty', '還沒有體重記錄')); return card; }
  const b = w ? bmi(w.wt, S.profile.height) : null;
  const tw = +S.profile.targetWeight;
  card.append(h('div.grid3', { style: { marginTop: '10px' } },
    stat('體重' + (w ? ' · ' + md(w.date) : ''), w ? w.wt : '–', 'kg'),
    stat('BMI' + (b ? '（' + b.label + '）' : ''), b ? r1(b.value) : '–'),
    stat(tw ? '距目標 ' + tw : '距目標', w && tw ? (w.wt - tw > 0 ? r1(w.wt - tw) : '已達成') : '–', w && tw && w.wt > tw ? 'kg' : '')));
  if (!S.profile.height) card.append(h('div.mu.tiny', { style: { marginTop: '6px' } }, '在設定填身高後可顯示 BMI。'));
  const more = [];
  for (const [k, label, unit] of [['fat', '體脂率', '%'], ['mus', '骨骼肌率', '%'], ['vis', '內臟脂肪', ''], ['bage', '身體年齡', '歲'], ['bmr', '基礎代謝', 'kcal']]) {
    const x = lastOf(es, y => y[k] > 0);
    if (x) more.push(stat(label + ' · ' + md(x.date), x[k], unit));
  }
  const lm = lastOf(es, y => y.wt > 0 && y.fat > 0);
  if (lm) more.push(stat('淨體重 · ' + md(lm.date), r1(leanMass(lm)), 'kg'));
  if (more.length) card.append(fold('scale-more', h('span.small.mu', '更多（體組成）'), [h('div.grid3', { style: { marginTop: '8px', rowGap: '12px' } }, ...more)]));
  return card;
}

function bpCard(es) {
  const x = lastOf(es, y => y.sys > 0 && y.dia > 0) || lastOf(es, y => y.pul > 0);
  const card = h('div.card');
  card.append(h('div.row.between', h('h2', { style: { margin: 0 } }, '血壓計'), h('button.link.small', { type: 'button', onclick: () => openEntry({ type: 'bp' }) }, icon('plus'), ' 記錄')));
  if (!x) { card.append(h('div.empty', '還沒有血壓記錄')); return card; }
  card.append(h('div.grid3', { style: { marginTop: '10px' } },
    stat('血壓 · ' + when(x), x.sys > 0 ? x.sys + '/' + x.dia : '–', 'mmHg'),
    stat('脈搏', x.pul > 0 ? x.pul : '–', x.pul > 0 ? '次/分' : ''), h('div')));
  return card;
}

/** 注射卡：compact=true（今日頁）時平常收成一行，接近注射日自動展開 */
export function doseCard(compact) {
  const es = sortEntries(S.entries);
  const ds = es.filter(TYPES.dose);
  const today = localDate(new Date());
  const nd = nextDose(es, today);
  if (compact && !nd) return null;
  const due = nd && nd.left <= 1;
  const card = h('div.card', due ? { style: { borderColor: 'var(--ac)' } } : null);
  const leftTxt = nd ? (nd.left > 0 ? '還有 ' + nd.left + ' 天' : nd.left === 0 ? '就是今天' : '已逾期 ' + (-nd.left) + ' 天') : '';
  const line = nd ? '下次注射：' + md(nd.due) + '（週' + wdOf(nd.due) + '，' + leftTxt + '）' : '尚無注射記錄';
  const ob = ds.length ? onBoard(es, dn(today), +S.profile.halfLife || 120) : 0;
  const body = h('div', { style: { marginTop: '10px' } },
    h('div.grid3',
      stat('建議部位', nd ? nd.site : SITES[0]),
      stat('最近一次' + (nd ? ' · ' + md(nd.last.date) : ''), nd ? nd.last.dose : '–', 'mg'),
      stat('預估體內殘留', ds.length ? r1(ob) : '–', 'mg')),
    h('button' + (due ? '.pri' : '.ghost') + '.full', { type: 'button', onclick: () => openEntry({ type: 'dose' }) }, '記錄這次注射'),
    h('div.mu.tiny', { style: { marginTop: '6px' } }, '殘留量依半衰期簡化估算，只看趨勢，不能用來決定劑量。'));
  const title = h('span', { style: due ? { color: 'var(--ac)', fontWeight: 650 } : { fontWeight: 600 } }, line);
  if (!compact) { card.append(h('div.row.between', h('h2', { style: { margin: 0 } }, '注射'), null), h('div.small', { style: { marginTop: '4px' } }, title), body); return card; }
  let force = false;
  if (due && L.doseForced !== nd.due) { force = true; L.doseForced = nd.due; commitLocal(); }
  card.append(fold('dose-card', title, [body], { open: false, force }));
  return card;
}

/* ---------- 記錄列表 ---------- */
function chips(e) {
  const c = [];
  if (e.dose > 0) c.push(['注射 ' + e.dose + ' mg' + (e.site ? '（' + e.site + '）' : ''), 'var(--c1)']);
  if (e.wt > 0) c.push(['體重 ' + e.wt + ' kg', 'var(--ac)']);
  if (e.sys > 0 && e.dia > 0) c.push(['血壓 ' + e.sys + '/' + e.dia + (e.pul > 0 ? '，脈搏 ' + e.pul : ''), 'var(--c3)']);
  else if (e.pul > 0) c.push(['脈搏 ' + e.pul, 'var(--c3)']);
  const bc = [];
  if (e.fat > 0) bc.push('體脂 ' + e.fat + '%');
  if (e.mus > 0) bc.push('骨骼肌 ' + e.mus + '%');
  if (e.vis > 0) bc.push('內臟脂肪 ' + e.vis);
  if (e.bage > 0) bc.push('身體年齡 ' + e.bage);
  if (e.bmr > 0) bc.push('基礎代謝 ' + e.bmr);
  if (bc.length) c.push([bc.join('　'), 'var(--c4)']);
  return c;
}
/** 同步版把量測時間寫在備註開頭；已拆到 time，顯示時去掉重複的部分 */
const noteText = e => (e.time ? (e.note || '').replace(/^\d{1,2}:\d{2}[，,、 ]?/, '') : e.note || '').trim();
function row(e) {
  return h('div.it', { onclick: () => openEntry({ entry: e }) },
    h('div.grow',
      h('div.mu.tiny', when(e)),
      ...chips(e).map(([t, col]) => h('div.small', { style: { color: col, fontWeight: 600 } }, t)),
      noteText(e) ? h('div.mu.tiny', noteText(e)) : null));
}

function listCard(all) {
  const card = h('div.card');
  const sort = L.logSort || 'desc', type = L.logType || 'all';
  const rows = all.filter(e => type === 'all' || TYPES[type](e));
  card.append(h('h2', '記錄列表'),
    pills([['desc', '新到舊'], ['asc', '舊到新']], sort, v => { L.logSort = v; commitLocal(); rerender(); }),
    h('div', { style: { marginTop: '6px' } }, pills([['all', '全部'], ['dose', '注射'], ['wt', '體重'], ['bp', '血壓'], ['bc', '體組成']], type, v => { L.logType = v; commitLocal(); rerender(); })));
  const from7 = addDays(localDate(new Date()), -6);
  const recent = rows.filter(e => e.date >= from7);
  const byMon = new Map();
  for (const e of rows.filter(e => e.date < from7)) { const k = e.date.slice(0, 7); if (!byMon.has(k)) byMon.set(k, []); byMon.get(k).push(e); }
  const months = [...byMon.keys()].sort().reverse();
  const jump = h('select', { 'aria-label': '跳到月份' }, h('option', { value: '' }, '跳到月份…'), ...months.map(k => h('option', { value: k }, k.slice(0, 4) + ' 年 ' + +k.slice(5) + ' 月')));
  card.append(h('div.row', { style: { marginTop: '10px' } }, h('div.mu.small.grow', '符合 ' + rows.length + ' 筆，共 ' + all.length + ' 筆'), months.length ? h('div', { style: { width: '150px' } }, jump) : null));
  if (!all.length) { card.append(h('div.empty', '還沒有記錄。可以從上面的卡片新增，或到設定「從同步版匯入」。')); return card; }
  if (!rows.length) { card.append(h('div.empty', '沒有符合條件的記錄。')); return card; }
  const blocks = [];
  if (recent.length) {
    const l = h('div.list'); (sort === 'desc' ? recent.slice().reverse() : recent).forEach(e => l.append(row(e)));
    blocks.push(h('div', { style: { marginTop: '8px' } }, h('div.mu.tiny', '最近 7 天'), l));
  }
  const monEls = {};
  for (const k of months) {
    const es = byMon.get(k), ws = es.filter(e => e.wt > 0);
    const sum = +k.slice(5) + ' 月' + (k.slice(0, 4) !== localDate(new Date()).slice(0, 4) ? '（' + k.slice(0, 4) + '）' : '') + '・' + es.length + ' 筆' + (ws.length ? '・平均 ' + r1(ws.reduce((a, e) => a + e.wt, 0) / ws.length) + ' kg' : '');
    const l = h('div.list');
    const d = fold('log-' + k, h('span.small.num', sum), [l], { cls: 'daygrp' });
    const fill = () => { if (!l.childNodes.length) (sort === 'desc' ? es.slice().reverse() : es).forEach(e => l.append(row(e))); };
    if (d.open) fill();
    d.addEventListener('toggle', () => { if (d.open) fill(); });
    monEls[k] = d;
    blocks.push(d);
  }
  if (sort === 'asc') blocks.reverse();
  card.append(...blocks);
  jump.onchange = () => { const d = monEls[jump.value]; if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } jump.value = ''; };
  return card;
}

let root = null;
const rerender = () => root && renderLog(root);
export function renderLog(el) {
  root = el;
  el.textContent = '';
  const all = sortEntries(S.entries);
  el.append(scaleCard(all), bpCard(all), doseCard(false), listCard(all));
}
