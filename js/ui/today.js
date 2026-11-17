/* 今日分頁：7 天點數池（環形）、保底與蛋白質進度、拍照按鈕、餐點列表 */
import { S, L, plan, commitLocal } from '../state.js';
import { backupReminder } from '../sync.js';
import { connect, linked } from '../drive.js';
import { h, icon, fold, hm, WD, fmtPts } from './common.js';
import { usage, localDate, addDays, exerciseRefund } from '../points.js';
import { openAddMeal } from './addMeal.js';
import { latestAdviceCard } from './advice.js';
import { doseCard } from './log.js';
import { fastingCard, longTermCard, leanCard } from './fasting.js';

const r1 = x => Math.round(x * 10) / 10;

function ring(frac, over) {
  const R = 50, C = 2 * Math.PI * R, f = Math.max(0, Math.min(1, frac));
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 118 118');
  const mk = (stroke, dash) => {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', 59); c.setAttribute('cy', 59); c.setAttribute('r', R); c.setAttribute('fill', 'none');
    c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', 10); c.setAttribute('stroke-linecap', 'round');
    if (dash != null) c.setAttribute('stroke-dasharray', dash + ' ' + C);
    return c;
  };
  s.append(mk('var(--soft)'));
  if (f > 0) s.append(mk(over ? 'var(--warn)' : 'var(--ac)', f * C));
  return s;
}

function metric(label, cur, target, unit, note, warn) {
  const pct = target > 0 ? Math.min(100, cur / target * 100) : 0;
  return h('div.metric',
    h('div.row.between', h('span', label), h('span.num', h('b', unit === '點' ? fmtPts(cur) : Math.round(cur)), h('span.mu', ' / ' + (unit === '點' ? fmtPts(target) : Math.round(target)) + ' ' + unit))),
    h('div.bar' + (warn ? '.warn' : ''), h('i', { style: { width: pct + '%' } })),
    note ? h('div.mu.tiny', note) : null);
}

/** 依 group 合併成「一餐」 */
function groupMeals(meals) {
  const g = new Map();
  for (const m of meals) {
    const k = m.group || m.id;
    if (!g.has(k)) g.set(k, { group: k, at: m.at, items: [], points: 0, kcal: 0, protein: 0, thumb: null });
    const x = g.get(k); x.items.push(m); x.points += m.points; x.kcal += m.kcal; x.protein += m.protein; if (m.thumb) x.thumb = m.thumb;
  }
  return [...g.values()].sort((a, b) => a.at < b.at ? 1 : -1);
}

function mealRow(m) {
  return h('div.it', { onclick: () => openAddMeal({ group: m.group }) },
    m.thumb ? h('img.thumb', { src: m.thumb, alt: '' }) : null,
    h('div.grow',
      h('div', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, m.items.map(i => i.name).join('、')),
      h('div.mu.tiny.num', hm(m.at) + ' · ' + Math.round(m.kcal) + ' 大卡 · 蛋白質 ' + r1(m.protein) + ' g')),
    h('span.pts.num', fmtPts(m.points), h('span.mu.tiny', ' 點')));
}

const md = d => +d.slice(5, 7) + '/' + +d.slice(8, 10);
const wd = d => { const [y, m, dd] = d.split('-').map(Number); return WD[new Date(y, m - 1, dd).getDay()]; };

let showAllMeals = false;
export function renderToday(root) {
  root.textContent = '';
  const todayStr = localDate(new Date());
  const b = plan();
  const u = usage(S.meals, todayStr);

  /* ---- 太久沒備份的提醒 ---- */
  const br = backupReminder(S, L, Date.now(), todayStr);
  if (br.show) {
    const goSet = () => document.querySelector('nav.tabs button[data-t="set"]').click();
    root.append(h('div.card', { style: { borderColor: 'var(--warn)' } },
      h('div', { style: { fontWeight: 600 } }, br.never ? '還沒有備份過，記錄目前只存在這支手機裡。' : '已經 ' + br.days + ' 天沒有備份，這段時間有新的記錄。'),
      h('div.mu.tiny', { style: { marginTop: '4px' } }, '換手機或清除瀏覽資料時，沒有備份的記錄會不見。'),
      h('div.grid2', { style: { marginTop: '10px' } },
        h('button.pri', { type: 'button', onclick: () => connect(true) }, linked() ? '重新登入 Google Drive' : '連線 Google Drive'),
        h('button.ghost', { type: 'button', onclick: () => { L.bkHide = todayStr; commitLocal(); renderToday(root); } }, '今天不再提醒')),
      h('button.link.small', { type: 'button', onclick: goSet, style: { marginTop: '6px' } }, '或到「設定」→「備份與匯入」產生存檔文字')));
  }

  /* ---- 頂部 ---- */
  const top = h('div.card');
  if (!b.ok) {
    top.append(h('h2', '先填寫個人資料'),
      h('div.mu.small', '需要身高、體重、出生年，才能算出每天大約可以吃多少（7 天點數額度）。'),
      h('button.ghost.full', { type: 'button', onclick: () => document.querySelector('nav.tabs button[data-t="set"]').click() }, '前往設定'));
  } else {
    const ex = exerciseRefund(S.activity, todayStr);
    const pool = b.poolPoints + ex.rolling;
    const left = pool - u.rolling;
    const over = left < 0;
    top.append(h('div.hero',
      h('div.ring', ring(pool ? Math.max(0, left) / pool : 0, over),
        h('div.c', h('span.mu.tiny', over ? '超出' : '7 天還剩'), h('b.num', fmtPts(Math.abs(left))), h('span.mu.tiny.num', '/ ' + fmtPts(pool) + ' 點'))),
      h('div',
        metric('今日點數', u.today.points, b.floorPoints, '點', u.today.points < b.floorPoints ? '保底＝提醒今天別吃太少，不是一定要吃到' : '已達今日保底', false),
        metric('蛋白質', u.today.protein, b.proteinTarget, 'g', null, false))));
    top.append(h('div.mu.tiny.num', { style: { marginTop: '10px' } },
      '近 7 天（' + md(u.from) + '～今天）已用 ' + fmtPts(u.rolling) + ' 點 · 今日 ' + Math.round(u.today.kcal) + ' 大卡'
      + (ex.rolling ? ' · 運動加回 +' + fmtPts(ex.rolling) + ' 點' + (ex.todayKcal ? '（今天 ' + ex.todayKcal + ' 大卡）' : '') : '')));
  }
  top.append(h('button.pri.cta', { type: 'button', onclick: () => openAddMeal() }, icon('camera'), '記一餐'));
  root.append(top);
  const lc = leanCard();
  if (lc) root.append(lc);
  const lt = longTermCard();
  if (lt) root.append(lt);
  const dc = doseCard(true);
  if (dc) root.append(dc);
  root.append(fastingCard());
  const adv = latestAdviceCard();
  if (adv) root.append(adv);

  /* ---- 餐點列表：今天展開；前 6 天每天一行；更早依月份收合 ---- */
  const groups = groupMeals(S.meals);
  const listCard = h('div.card');
  const todays = groups.filter(g => localDate(g.at) === todayStr);
  listCard.append(h('div.row.between', h('h2', { style: { margin: 0 } }, '今日餐點'),
    todays.length ? h('span.mu.small.num', todays.length + ' 餐 · ' + fmtPts(u.today.points) + ' 點') : null));
  const tl = h('div.list', { style: { marginTop: '6px' } });
  const MEAL_LIMIT = 4;
  if (todays.length) {
    todays.slice(0, showAllMeals ? todays.length : MEAL_LIMIT).forEach(g => tl.append(mealRow(g)));
    if (!showAllMeals && todays.length > MEAL_LIMIT) tl.append(h('button.link.small', { type: 'button', onclick: () => { showAllMeals = true; renderToday(root); } }, '顯示今天全部（還有 ' + (todays.length - MEAL_LIMIT) + ' 餐）'));
  }
  else tl.append(h('div.empty', '今天還沒有記錄。按上方「記一餐」開始。'));
  listCard.append(tl);

  const from7 = addDays(todayStr, -6);
  const recent = groups.filter(g => { const d = localDate(g.at); return d < todayStr && d >= from7; });
  const older = groups.filter(g => localDate(g.at) < from7);
  if (recent.length || older.length) {
    const byDay = new Map();
    for (const g of recent) { const d = localDate(g.at); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(g); }
    for (const [d, gs] of byDay) {
      const pts = gs.reduce((a, g) => a + g.points, 0), pro = gs.reduce((a, g) => a + g.protein, 0);
      const l = h('div.list'); gs.forEach(g => l.append(mealRow(g)));
      listCard.append(fold('day-' + d, h('span.small.num', md(d) + '（' + wd(d) + '）・' + gs.length + ' 餐・' + fmtPts(pts) + ' 點・蛋白質 ' + Math.round(pro) + ' g'), l, { cls: 'daygrp' }));
    }
    const byMon = new Map();
    for (const g of older) { const k = localDate(g.at).slice(0, 7); if (!byMon.has(k)) byMon.set(k, []); byMon.get(k).push(g); }
    for (const [k, gs] of byMon) {
      const days = new Set(gs.map(g => localDate(g.at))).size;
      const pts = gs.reduce((a, g) => a + g.points, 0);
      const l = h('div.list'); gs.forEach(g => l.append(h('div.mu.tiny', { style: { marginTop: '6px' } }, md(localDate(g.at)) + '（' + wd(localDate(g.at)) + '）'), mealRow(g)));
      listCard.append(fold('mon-' + k, h('span.small.num', +k.slice(5) + ' 月・' + gs.length + ' 餐・平均每天 ' + fmtPts(pts / days) + ' 點'), l, { cls: 'daygrp' }));
    }
  }
  root.append(listCard);
  showAllMeals = false; // 下次重畫回到只顯示前幾餐
}
