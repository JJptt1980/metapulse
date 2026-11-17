/* 今日頁：斷食卡片（計時、階段進度條、每小時提示、三種模式）與長期指數提示 */
import { S, L, commit, commitLocal, plan, uid } from '../state.js';
import { h, fold, pills, toast } from './common.js';
import { FASTING } from '../config.js';
import { HOURLY_MESSAGES, OMAD_DONE } from '../messages.js';
import { currentFast, mealShift, stageAt, stageStarts, hourlyMessage, hybridSuggestion, eatingWindow, hm, dur } from '../fasting.js';
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
  const win = mode === 'STRICT_MANUAL' ? eatingWindow(P.strictPlan || '16:8', P.windowStart || '12:00', now) : null;
  const fasting = win ? !win.inWindow : (f.manual || f.hours >= FASTING.fastingFromHours);
  const label = f.manual ? '已斷食' : '距上一餐';
  const summary = label + ' ' + dur(f.hours) + '・' + st.text.split('，')[0];

  const body = h('div', { style: { marginTop: '10px' } });
  body.append(h('div.row', { style: { alignItems: 'baseline', gap: '10px' } },
    h('b.num', { style: { fontSize: '34px', lineHeight: 1 } }, Math.floor(f.hours) + ':' + String(Math.floor((f.hours % 1) * 60)).padStart(2, '0')),
    h('span.mu.small', label + '（' + hm(f.start) + ' 起）')));
  body.append(...stageBar(f.hours, shift));
  body.append(h('div', { style: { marginTop: '4px', fontWeight: 600 } }, st.text),
    h('div.mu.tiny', '階段時間因人而異，僅供參考' + (shift ? '。上一餐比較豐盛，階段往後挪約 ' + shift + ' 小時' : '') + '。'));
  body.append(h('div', { style: { margin: '12px 0 4px', color: 'var(--ac)', fontWeight: 600 } }, hourlyMessage(f.hours, f.start, HOURLY_MESSAGES)));

  // 模式膠囊
  body.append(h('div', { style: { marginTop: '12px' } }, pills(MODES, mode, v => { P.fastMode = v; commit(); })));
  if (mode === 'HYBRID_GUIDED') {
    const { lt, wt } = longTermStatus();
    const sg = hybridSuggestion(S.entries, localDate(new Date()), { fastLoss: wt.fast, lowIntake: lt.ready && lt.level !== 'ok' });
    const target = FASTING.plans[sg.plan];
    body.append(h('div.notice.ok', { style: { marginTop: '10px' } },
      h('b', '建議 ' + sg.plan), '　' + sg.reason,
      h('div.small', { style: { marginTop: '4px' } }, '目標約 ' + target + ' 小時，大約到 ' + hm(f.start + target * H) + '。只是建議，可以依身體狀況調整。'),
      !sg.hasDose ? h('div.tiny.mu', '有施打記錄後，會依照「施打後第幾天」給建議：第 1～3 天 18:6、第 4～7 天 16:8。') : null));
    const sp = residualSpark(); if (sp) body.append(sp);
  }
  if (mode === 'STRICT_MANUAL') {
    const timeIn = h('input', { type: 'time', value: P.windowStart || '12:00', style: { width: '150px' } });
    timeIn.onchange = () => { P.windowStart = timeIn.value || '12:00'; commit(); };
    body.append(h('div', { style: { marginTop: '10px' } }, pills(PLANS.map(p => [p, p === '24H' ? '24H（一天一餐）' : p]), P.strictPlan || '16:8', v => { P.strictPlan = v; commit(); })),
      h('div.row', { style: { marginTop: '8px' } }, h('span.small.mu', '進食窗口從'), timeIn, h('span.small.mu', '開始，' + win.eatHours + ' 小時')),
      h('div.notice' + (win.inWindow ? '.ok' : ''), { style: { marginTop: '8px' } },
        win.inWindow ? '進食窗口中，到 ' + hm(win.closesAt) + ' 結束' : '進食窗口 ' + (new Date(win.opensAt).getDate() !== new Date().getDate() ? '明天 ' : '') + hm(win.opensAt) + ' 開始'));
    if ((P.strictPlan || '16:8') === '24H') {
      const b = plan(), u = usage(S.meals, localDate(new Date()));
      if (b.ok) body.append(h('div.small', { style: { marginTop: '8px', lineHeight: 1.7 } },
        '這一餐的檢查：蛋白質 ' + Math.round(u.today.protein) + '／' + b.proteinTarget + ' g' + (u.today.protein >= b.proteinTarget ? ' ✓' : '') +
        '・點數 ' + roundTo(u.today.points) + '／保底 ' + b.floorPoints + (u.today.points >= b.floorPoints ? ' ✓' : '')));
      if (f.hours >= FASTING.plans['24H']) body.append(h('div.notice.ok', { style: { marginTop: '8px' } }, OMAD_DONE[0]));
    }
  }
  body.append(startBtn(f.manual));

  let force = false;
  if (fasting && L.fastForced !== f.start) { force = true; L.fastForced = f.start; commitLocal(); }
  card.append(fold('fast-card', h('div.grow', h('h2', { style: { margin: 0 } }, fasting ? '斷食中' : '斷食'), h('div.small.num', { style: { marginTop: '2px' } }, summary)), [body], { open: false, force }));
  return card;
}

function startBtn(active) {
  return h('button.ghost' + (active ? '' : ''), {
    type: 'button', style: { marginTop: '12px', width: active ? '100%' : 'auto' },
    onclick: () => {
      const now = new Date().toISOString();
      if (active) { const x = S.fasts.find(z => !z.end); if (x) x.end = now; commit(); toast('已結束這次斷食'); }
      else { S.fasts.push({ id: uid('f'), start: now, end: null, mode: S.prefs.fastMode || 'PURE_DYNAMIC' }); commit(); toast('開始計時'); }
    },
  }, active ? '結束斷食' : '從現在開始斷食');
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
