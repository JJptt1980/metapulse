/* 今日頁：斷食卡片（計時、階段進度條、每小時提示、三種模式）與長期指數提示 */
import { S, L, commit, commitLocal, plan, uid } from '../state.js';
import { h, fold, pills, toast } from './common.js';
import { FASTING } from '../config.js';
import { HOURLY_MESSAGES, OMAD_DONE } from '../messages.js';
import { currentFast, fastEnd, mealShift, stageAt, stageStarts, hourlyMessage, hybridSuggestion, eatingWindow, hm, dur } from '../fasting.js';
import { openAddMeal } from './addMeal.js';
import { longTermIndex, weightTrend, longTermMessage } from '../longterm.js';
import { usage, localDate, roundTo } from '../points.js';
import { onBoard, dn } from '../records.js';

const MODES = [['PURE_DYNAMIC', '自由斷食'], ['HYBRID_GUIDED', '依施打週期'], ['STRICT_MANUAL', '自選固定']];
const PLANS = ['16:8', '18:6', '20:4', '24H'];
const H = 3600000;

/** 長期指數與體重速度（今日頁、圖表頁共用） */
export function longTermStatus() {
  const today = localDate(new Date());
  const b = plan();
  const lt = longTermIndex(S.meals, b.ok ? b.bmr : 0, today);
  const wt = weightTrend(S.entries, today);
  return { lt, wt, msg: longTermMessage(lt, wt) };
}

/** 階段進度條：0～24 小時，階段之間用漸層銜接，不畫硬線 */
function stageBar(hours, shift) {
  const max = FASTING.barHours, st = stageStarts(shift);
  const cols = ['var(--c1)', 'var(--ac)', 'var(--c4)', 'var(--c3)', 'var(--warn)'];
  const pct = x => Math.min(100, x / max * 100);
  const stops = [];
  st.forEach((s, i) => {
    const a = pct(s), b = pct(st[i + 1] ?? max);
    stops.push(cols[i] + ' ' + (i ? a + 3 : 0) + '%', cols[i] + ' ' + Math.max(a, b - 3) + '%');
  });
  const bar = h('div', { style: { position: 'relative', height: '10px', borderRadius: '99px', background: 'linear-gradient(90deg,' + stops.join(',') + ')', opacity: 0.85, marginTop: '14px' } });
  bar.append(h('div', { style: { position: 'absolute', top: '-5px', left: 'calc(' + pct(hours) + '% - 2px)', width: '4px', height: '20px', borderRadius: '2px', background: 'var(--tx)' } }));
  const ticks = h('div', { style: { position: 'relative', height: '16px', marginTop: '4px' } });
  st.forEach(s => ticks.append(h('span.mu.tiny', { style: { position: 'absolute', left: pct(s) + '%', transform: s ? 'translateX(-50%)' : 'none' } }, s + 'h')));
  return [bar, ticks];
}

/** 迷你殘留曲線：過去 14 天到未來 7 天 */
function residualSpark() {
  const ds = S.entries.filter(e => e.dose > 0);
  if (!ds.length) return null;
  const today = dn(localDate(new Date())), hl = +S.profile.halfLife || 120;
  const pts = [];
  for (let d = today - 14; d <= today + 7; d++) pts.push(onBoard(S.entries, d, hl));
  const mx = Math.max(...pts, 0.1), W = 300, Hh = 44;
  const xy = pts.map((v, i) => (i / (pts.length - 1) * W).toFixed(1) + ',' + (Hh - v / mx * (Hh - 4) - 2).toFixed(1));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Hh); svg.style.width = '100%'; svg.style.height = Hh + 'px';
  const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', xy.join(' ')); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', 'var(--warn)'); pl.setAttribute('stroke-width', '2');
  const nowX = 14 / (pts.length - 1) * W;
  const ln = document.createElementNS(ns, 'line'); ln.setAttribute('x1', nowX); ln.setAttribute('x2', nowX); ln.setAttribute('y1', 0); ln.setAttribute('y2', Hh); ln.setAttribute('stroke', 'var(--mu)'); ln.setAttribute('stroke-dasharray', '3 3');
  svg.append(ln, pl);
  return h('div', { style: { marginTop: '10px' } }, h('div.mu.tiny', '預估體內藥量（前 14 天到後 7 天，虛線是今天）'), svg);
}

const toInput = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()); };
const dayLabel = t => { const d = new Date(t), n = new Date(); const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 864e5); return (diff === 0 ? '今天 ' : diff === 1 ? '明天 ' : diff === -1 ? '昨天 ' : (d.getMonth() + 1) + '/' + d.getDate() + ' ') + hm(t); };
const MODE_NAME = Object.fromEntries(MODES);

/** 依模式決定目標時數與預計結束時間 */
function targetOf(mode, f, now) {
  const P = S.prefs;
  if (mode === 'STRICT_MANUAL') {
    const w = eatingWindow(P.strictPlan || '16:8', P.windowStart || '12:00', now);
    return { hours: w.fastHours, label: (P.strictPlan || '16:8') + '，進食窗口 ' + (P.windowStart || '12:00') + ' 開始', end: w.inWindow ? null : w.opensAt, win: w };
  }
  if (mode === 'HYBRID_GUIDED') {
    const { lt, wt } = longTermStatus();
    const sg = hybridSuggestion(S.entries, localDate(new Date()), { fastLoss: wt.fast, lowIntake: lt.ready && lt.level !== 'ok' });
    return { hours: FASTING.plans[sg.plan], label: '建議 ' + sg.plan, sg };
  }
  const t = +P.fastTarget || FASTING.freeTargetDefault;
  return { hours: t, label: '目標 ' + t + ' 小時' };
}

/** 修改開始時間：改的是時間的來源（上一餐、手動開始、或結束斷食的時間） */
function setStart(f, t) {
  const iso = new Date(t).toISOString();
  if (f.source.type === 'meal') S.meals.forEach(m => { if ((m.group || m.id) === f.source.group) m.at = iso; });
  else { const x = S.fasts.find(z => z.id === f.source.id); if (x) { if (f.source.type === 'manual') x.start = iso; else x.end = iso; } }
  if (S.prefs.customEnd && S.prefs.customEnd.start === f.start) S.prefs.customEnd = null;
  commit();
}

export function fastingCard() {
  const now = Date.now();
  const P = S.prefs;
  const mode = P.fastMode || 'PURE_DYNAMIC';
  const f = currentFast(S.meals, S.fasts, now);
  const card = h('div.card');
  if (!f.start) {
    card.append(h('div.row.between', h('div', h('h2', { style: { margin: 0 } }, '斷食'), h('div.mu.small', '記第一餐之後，會從上一餐開始計時')), startBtn(false)));
    return card;
  }
  const shift = mealShift(f.lastMeal);
  const st = stageAt(f.hours, shift);
  const tg = targetOf(mode, f, now);
  const win = tg.win || null;
  const fasting = win ? !win.inWindow : (f.manual || f.hours >= FASTING.fastingFromHours);
  const endInfo = win && win.inWindow ? null : fastEnd(f.start, tg.hours, P.customEnd, now);
  if (win && !win.inWindow && !(P.customEnd && P.customEnd.start === f.start)) { endInfo.end = win.opensAt; endInfo.left = (win.opensAt - now) / H; }
  const leftTxt = !endInfo ? '' : endInfo.left > 0 ? '還有 ' + dur(endInfo.left) : '已到預計時間';
  const label = f.manual ? '已斷食' : '距上一餐';
  const summary = label + ' ' + dur(f.hours) + (endInfo ? '・' + leftTxt : '・進食窗口中');

  const body = h('div', { style: { marginTop: '10px' } });
  // 計時與預計結束
  body.append(h('div.row', { style: { alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' } },
    h('b.num', { style: { fontSize: '34px', lineHeight: 1 } }, Math.floor(f.hours) + ':' + String(Math.floor((f.hours % 1) * 60)).padStart(2, '0')),
    h('span.mu.small', label)));
  const lastNames = f.lastMeal ? f.lastMeal.map(m => m.name).join('、') : '';
  const startTxt = f.source.type === 'meal' ? '上一餐 ' + dayLabel(f.start) + (lastNames ? '・' + lastNames : '') : f.source.type === 'manual' ? '手動開始 ' + dayLabel(f.start) : '結束斷食 ' + dayLabel(f.start);
  const endTxt = endInfo ? '預計結束 ' + dayLabel(endInfo.end) + '（' + leftTxt + '）' : '進食窗口中，到 ' + hm(win.closesAt) + ' 結束';
  body.append(h('div.small', { style: { marginTop: '8px', lineHeight: 1.8 } }, h('div', '開始：' + startTxt), h('div', { style: { fontWeight: 600 } }, endTxt)));

  // 修改開始、結束時間
  const sIn = h('input', { type: 'datetime-local', value: toInput(f.start) });
  const eIn = h('input', { type: 'datetime-local', value: endInfo ? toInput(endInfo.end) : '' });
  const saveT = h('button.pri.full', { type: 'button' }, '儲存時間');
  saveT.onclick = () => {
    const ns = new Date(sIn.value).getTime(), ne = eIn.value ? new Date(eIn.value).getTime() : null;
    if (!Number.isFinite(ns) || ns > Date.now()) { toast('開始時間不能晚於現在', true); return; }
    if (ne !== null && ne <= ns) { toast('結束時間要晚於開始時間', true); return; }
    const startChanged = Math.abs(ns - f.start) >= 60000;
    if (startChanged) setStart(f, ns);
    const realStart = startChanged ? currentFast(S.meals, S.fasts, Date.now()).start : f.start;
    P.customEnd = ne !== null && (!endInfo || Math.abs(ne - endInfo.end) >= 60000 || (P.customEnd && P.customEnd.start === f.start)) ? { start: realStart, end: ne } : P.customEnd;
    L.collapsed['fast-time'] = 0; commit(); toast('已更新斷食時間');
  };
  const resetE = h('button.link.small', { type: 'button', onclick: () => { P.customEnd = null; commit(); } }, '結束時間改回依目標計算');
  body.append(fold('fast-time', h('span.small.mu', '修改開始或結束時間'), [h('div', { style: { marginTop: '8px' } },
    h('label', { style: { marginTop: 0 } }, f.source.type === 'meal' ? '開始時間（＝上一餐的用餐時間，會一起改）' : '開始時間'), sIn,
    h('label', '預計結束時間'), eIn,
    endInfo && endInfo.custom ? resetE : null, saveT)]));

  // 現在進行到哪個階段
  body.append(...stageBar(f.hours, shift));
  const starts = stageStarts(shift);
  const list = h('div', { style: { marginTop: '6px' } });
  FASTING.stages.forEach((sg, i) => {
    const cur = i === st.index, done = i < st.index;
    const range = starts[i] + (starts[i + 1] != null ? '–' + starts[i + 1] : '+') + ' 小時';
    list.append(h('div.small', { style: { display: 'flex', gap: '8px', padding: '3px 0', color: cur ? 'var(--tx)' : 'var(--mu)', fontWeight: cur ? 650 : 400, opacity: done ? 0.6 : 1 } },
      h('span', { style: { width: '14px', color: 'var(--ac)' } }, cur ? '▶' : done ? '✓' : ''), h('span.num', { style: { width: '72px', flexShrink: 0 } }, range), h('span', sg.text)));
  });
  body.append(h('div.small', { style: { marginTop: '6px', fontWeight: 600 } }, '現在：' + st.text,
    st.nextAt != null ? h('span.mu', { style: { fontWeight: 400 } }, '（下一階段還有 ' + dur(st.nextAt - f.hours) + '）') : null), list,
    h('div.mu.tiny', '階段時間因人而異，僅供參考' + (shift ? '。上一餐比較豐盛，階段往後挪約 ' + shift + ' 小時' : '') + '。'));
  body.append(h('div', { style: { margin: '12px 0 4px', color: 'var(--ac)', fontWeight: 600 } }, hourlyMessage(f.hours, f.start, HOURLY_MESSAGES)));

  // 模式：選完就收起來
  const pickMode = v => { P.fastMode = v; L.collapsed['fast-mode'] = 0; commit(); };
  const modeBody = [h('div', { style: { marginTop: '8px' } }, pills(MODES, mode, pickMode))];
  if (mode === 'PURE_DYNAMIC') modeBody.push(h('div', { style: { marginTop: '8px' } }, h('div.mu.tiny', '目標時數'), pills(FASTING.freeTargets.map(t => [t, t + ' 小時']), +P.fastTarget || FASTING.freeTargetDefault, v => { P.fastTarget = v; L.collapsed['fast-mode'] = 0; commit(); })));
  if (mode === 'STRICT_MANUAL') {
    const timeIn = h('input', { type: 'time', value: P.windowStart || '12:00', style: { width: '150px' } });
    timeIn.onchange = () => { P.windowStart = timeIn.value || '12:00'; commit(); };
    modeBody.push(h('div', { style: { marginTop: '8px' } }, pills(PLANS.map(p => [p, p === '24H' ? '24H（一天一餐）' : p]), P.strictPlan || '16:8', v => { P.strictPlan = v; L.collapsed['fast-mode'] = 0; commit(); })),
      h('div.row', { style: { marginTop: '8px' } }, h('span.small.mu', '進食窗口從'), timeIn, h('span.small.mu', '開始，' + win.eatHours + ' 小時')));
  }
  body.append(h('div', { style: { marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--ln)' } },
    fold('fast-mode', h('span.small', h('b', '模式：' + MODE_NAME[mode]), h('span.mu', '・' + tg.label)), modeBody)));

  if (mode === 'HYBRID_GUIDED') {
    const sg = tg.sg;
    body.append(h('div.notice.ok', { style: { marginTop: '10px' } }, sg.reason + '只是建議，可以依身體狀況調整。',
      !sg.hasDose ? h('div.tiny.mu', '有施打記錄後，會依照「施打後第幾天」給建議：第 1～3 天 18:6、第 4～7 天 16:8。') : null));
    const sp = residualSpark(); if (sp) body.append(sp);
  }
  if (mode === 'STRICT_MANUAL' && (P.strictPlan || '16:8') === '24H') {
    const b = plan(), u = usage(S.meals, localDate(new Date()));
    if (b.ok) body.append(h('div.small', { style: { marginTop: '8px', lineHeight: 1.7 } },
      '一天一餐的檢查：蛋白質 ' + Math.round(u.today.protein) + '／' + b.proteinTarget + ' g' + (u.today.protein >= b.proteinTarget ? ' ✓' : '') +
      '・點數 ' + roundTo(u.today.points) + '／保底 ' + b.floorPoints + (u.today.points >= b.floorPoints ? ' ✓' : '')));
    if (f.hours >= FASTING.plans['24H']) body.append(h('div.notice.ok', { style: { marginTop: '8px' } }, OMAD_DONE[0]));
  }
  body.append(h('div.grid2', { style: { marginTop: '12px' } },
    h('button.pri', { type: 'button', onclick: () => openAddMeal() }, '結束斷食，記一餐'),
    startBtn(f.manual)));

  let force = false;
  if (fasting && L.fastForced !== f.start) { force = true; L.fastForced = f.start; commitLocal(); }
  card.append(fold('fast-card', h('div.grow', h('h2', { style: { margin: 0 } }, fasting ? '斷食中' : '斷食'), h('div.small.num', { style: { marginTop: '2px' } }, summary)), [body], { open: false, force }));
  return card;
}

function startBtn(active) {
  return h('button.ghost', {
    type: 'button',
    onclick: () => {
      const now = new Date().toISOString();
      if (active) { const x = S.fasts.find(z => !z.end); if (x) x.end = now; commit(); toast('已結束這次斷食'); }
      else { S.fasts.push({ id: uid('f'), start: now, end: null, mode: S.prefs.fastMode || 'PURE_DYNAMIC' }); commit(); toast('開始計時'); }
    },
  }, active ? '結束斷食（不記餐）' : '從現在開始斷食');
}

/** 長期指數提示：沒觸發時不顯示；觸發時一行，點開看說明 */
export function longTermCard() {
  const { lt, wt, msg } = longTermStatus();
  if (!msg) return null;
  const body = h('div.small.mu', { style: { marginTop: '8px', lineHeight: 1.7 } },
    h('div', '長期攝取指數 ' + lt.index.toFixed(2) + '（1.0＝平均每天吃到基礎代謝的量）。這是把每天「吃進的熱量 ÷ 基礎代謝」慢慢平均起來的數字，只算有好好記錄的日子。'),
    wt.weeklyPct !== null ? h('div', '最近體重平均每週下降約 ' + wt.weeklyPct.toFixed(1) + '%。') : null,
    h('div', '這只是提醒，不是診斷。如果覺得疲倦、怕冷或掉髮，可以和醫師聊聊。'));
  return h('div.card', { style: { borderColor: 'var(--warn)' } }, fold('lt-card', h('div.small', { style: { fontWeight: 600 } }, msg), [body]));
}

/** 圖表頁：長期攝取指數的狀態（資料累積中也顯示） */
export function longTermStatusCard() {
  const { lt, wt, msg } = longTermStatus();
  const sum = !lt.ready
    ? '資料累積中（有效記錄 ' + lt.validDays + '／21 天，最近 28 天 ' + lt.recentValid + ' 天）'
    : '指數 ' + lt.index.toFixed(2) + '・' + (msg ? '有提醒' : '正常範圍');
  const body = h('div.small.mu', { style: { lineHeight: 1.7 } },
    h('div', '每天算一次：當天吃進的熱量 ÷ 基礎代謝，再慢慢平均成長期指數（1.0＝平均每天剛好吃到基礎代謝）。'),
    h('div', '沒有記錄的日子會跳過；當天記錄的熱量不到基礎代謝的 30%，視為「沒記完整」也跳過。今天還沒過完，不列入。'),
    h('div', '至少要 21 個有效記錄日，而且最近 28 天有 70% 以上的日子有記錄，才會開始提醒。'),
    h('div', '低於 1.0：最近熱量偏低；低於 0.8：熱量持續明顯偏低。'),
    wt.weeklyPct !== null ? h('div', '體重（14 天平均）最近每週變化約 ' + (-wt.weeklyPct).toFixed(1) + '%。') : null,
    msg ? h('div', { style: { color: 'var(--warn)', fontWeight: 600 } }, msg) : null);
  return h('div.card', fold('lt-status', h('div.grow', h('h2', { style: { margin: 0 } }, '長期攝取指數'), h('div.mu.small', { style: { marginTop: '2px' } }, sum)), [h('div', { style: { marginTop: '10px' } }, body)]));
}
