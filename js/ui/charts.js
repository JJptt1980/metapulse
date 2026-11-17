/* 圖表分頁：移植同步版的圖表（體重、劑量與殘留、血壓、BMI、體組成、身體年齡／基礎代謝）
 * Chart.js 4.4.1 在第一次開啟圖表頁時才從 cdnjs 載入。圖表卡片可收合，收起來的不畫。 */
import { S, L, commitLocal } from '../state.js';
import { h, fold, pills } from './common.js';
import { localDate } from '../points.js';
import { sortEntries, onBoard, dn, fromDn, md, wdOf } from '../records.js';

const CHART_URL = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
let loading = null;
export function loadChart() {
  if (window.Chart) return Promise.resolve();
  if (!loading) loading = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = CHART_URL; s.onload = res;
    s.onerror = () => { loading = null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return loading;
}

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const palette = () => ({ tx: css('--tx'), mu: css('--mu'), ln: css('--ln'), wc: css('--ac'), dc: css('--c1'), rc: css('--warn'), c3: css('--c3'), c4: css('--c4') });

const fullDate = d => (d ? d + '（週' + wdOf(d) + '）' : '');
const crosshair = color => ({
  id: 'crosshair', afterDatasetsDraw(c) {
    const t = c.tooltip; if (!t || !t.getActiveElements) return;
    const a = t.getActiveElements(); if (!a.length) return;
    const x = a[0].element.x, ar = c.chartArea, g = c.ctx;
    g.save(); g.beginPath(); g.moveTo(x, ar.top); g.lineTo(x, ar.bottom); g.lineWidth = 1; g.strokeStyle = color; g.setLineDash([4, 3]); g.stroke(); g.restore();
  },
});

/**
 * 產生各圖表設定；畫面與（之後的）截圖共用
 * @param range 'all' | '30' | '90'；bpv 'all' | 'day' | 'ampm'
 */
export function chartSpecs(pal, range = 'all', bpv = 'all') {
  const { tx, mu, ln, wc, dc, rc, c3, c4 } = pal;
  const today = localDate(new Date());
  const cut = range === 'all' ? '' : fromDn(dn(today) - +range + 1);
  const all = sortEntries(S.entries), es = all.filter(e => !cut || e.date >= cut);
  const ws = es.filter(e => e.wt > 0), dsAll = all.filter(e => e.dose > 0);
  const bs = es.filter(e => e.sys > 0 && e.dia > 0), bc = es.filter(e => e.fat > 0 || e.mus > 0 || e.vis > 0);
  const bm = es.filter(e => e.bage > 0 || e.bmr > 0);
  const H = +S.profile.height || 0, TW = +S.profile.targetWeight || 0, HL = +S.profile.halfLife || 120;
  const grid = () => ({ color: ln }), tk = () => ({ maxTicksLimit: 7 });
  const leg = () => ({ labels: { color: tx, boxWidth: 12 } });
  const ln3 = (label, data, color, extra) => Object.assign({ label, data, borderColor: color, backgroundColor: color, tension: 0.25, pointRadius: data.length > 80 ? 1.5 : 3, spanGaps: true }, extra || {});
  const sp = [];
  if (ws.length) {
    sp.push({
      id: 'w', title: '體重', dates: ws.map(e => e.date),
      extra: i => { const x = []; if (H) x.push('BMI ' + (ws[i].wt / ((H / 100) ** 2)).toFixed(1)); if (ws[i].time) x.push('時間 ' + ws[i].time); return x; },
      cfg: {
        type: 'line', data: { labels: ws.map(e => md(e.date)), datasets: [ln3('體重 (kg)', ws.map(e => e.wt), wc)].concat(TW ? [{ label: '目標 ' + TW + ' kg', data: ws.map(() => TW), borderColor: mu, backgroundColor: mu, borderDash: [6, 4], borderWidth: 1.5, pointRadius: 0 }] : []) },
        options: { maintainAspectRatio: false, plugins: { legend: { display: TW > 0, labels: leg().labels } }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid() } } },
      },
    });
  }
  if (dsAll.length) {
    const labels = [], doses = [], ob = [], dts = [];
    const a = Math.max(dn(dsAll[0].date), cut ? dn(cut) : -1e9), b = Math.max(dn(today), dn(dsAll[dsAll.length - 1].date)) + 7;
    const dm = {}; dsAll.forEach(e => { dm[e.date] = (dm[e.date] || 0) + e.dose; });
    for (let i = a; i <= b; i++) { const s2 = fromDn(i); labels.push(md(s2)); dts.push(s2); doses.push(dm[s2] || null); ob.push(+onBoard(all, i, HL).toFixed(2)); }
    sp.push({
      id: 'd', title: '注射劑量與預估體內藥量', dates: dts,
      note: '體內藥量是用藥物半衰期粗略算的（假設打完馬上吸收），只用來看變化，不能用來決定劑量。',
      extra: i => dsAll.filter(e => e.date === dts[i]).map(e => '注射 ' + e.dose + ' mg' + (e.site ? '（' + e.site + '）' : '')),
      cfg: {
        data: { labels, datasets: [
          { type: 'bar', label: '注射劑量 (mg)', data: doses, backgroundColor: dc, order: 2 },
          { type: 'line', label: '預估體內藥量 (mg)', data: ob, borderColor: rc, backgroundColor: rc, pointRadius: 0, tension: 0.3, order: 1 }] },
        options: { maintainAspectRatio: false, plugins: { legend: leg() }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid(), beginAtZero: true } } },
      },
    });
  }
  if (bs.length) {
    const days = {}; bs.forEach(e => { (days[e.date] = days[e.date] || []).push(e); });
    const dl = Object.keys(days).sort();
    const av = (a, f) => { const v = a.map(f).filter(x => x > 0); return v.length ? Math.round(v.reduce((p, q) => p + q, 0) / v.length) : null; };
    const rg = (a, f) => { const v = a.map(f).filter(x => x > 0); return v.length ? Math.min(...v) + '–' + Math.max(...v) : ''; };
    const timed = bs.filter(e => e.time).length;
    const mode = bpv === 'ampm' && timed === 0 ? 'day' : bpv;
    const opt = { maintainAspectRatio: false, plugins: { legend: leg() }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid() } } };
    if (mode === 'day') {
      const d3 = [ln3('收縮壓（日均）', dl.map(d => av(days[d], e => e.sys)), c3), ln3('舒張壓（日均）', dl.map(d => av(days[d], e => e.dia)), c4)];
      if (bs.some(e => e.pul > 0)) d3.push(ln3('脈搏（日均）', dl.map(d => av(days[d], e => e.pul)), mu, { borderDash: [4, 3], pointRadius: 2 }));
      sp.push({
        id: 'bp', title: '血壓與脈搏', dates: dl,
        note: bpv === 'ampm' ? '這段範圍內的血壓記錄都沒有量測時間，無法分早晚，已改為每日平均。' : '同一天量好幾次會取平均；手指按在圖上可以看當天量了幾次、最高最低。',
        extra: i => { const a = days[dl[i]], x = [a.length + ' 次量測']; if (a.length > 1) x.push('收縮壓 ' + rg(a, e => e.sys) + '，舒張壓 ' + rg(a, e => e.dia)); return x; },
        cfg: { type: 'line', data: { labels: dl.map(md), datasets: d3 }, options: opt },
      });
    } else if (mode === 'ampm') {
      const part = (d, am) => days[d].filter(e => e.time && ((parseInt(e.time, 10) < 12) === am));
      const mk2 = (lab, am, f, color, dash) => ln3(lab, dl.map(d => av(part(d, am), f)), color, { borderDash: dash || [], pointRadius: 3 });
      const d3 = [mk2('早上 收縮壓', true, e => e.sys, c3), mk2('早上 舒張壓', true, e => e.dia, c4), mk2('晚上 收縮壓', false, e => e.sys, c3, [5, 3]), mk2('晚上 舒張壓', false, e => e.dia, c4, [5, 3])];
      const nt = bs.length - timed;
      sp.push({
        id: 'bp', title: '血壓與脈搏', dates: dl,
        note: '早上＝12:00 前量測，晚上＝12:00 後；實線為早上、虛線為晚上，同時段多次量測取平均。' + (nt ? '有 ' + nt + ' 筆沒有量測時間，未納入此圖。' : ''),
        extra: i => { const x = []; [['早上', true], ['晚上', false]].forEach(([n, am]) => { const a = part(dl[i], am); if (a.length) x.push(n + ' ' + a.length + ' 次'); }); return x; },
        cfg: { type: 'line', data: { labels: dl.map(md), datasets: d3 }, options: opt },
      });
    } else {
      const ds3 = [ln3('收縮壓', bs.map(e => e.sys), c3), ln3('舒張壓', bs.map(e => e.dia), c4)];
      if (bs.some(e => e.pul > 0)) ds3.push(ln3('脈搏', bs.map(e => e.pul > 0 ? e.pul : null), mu, { borderDash: [4, 3], pointRadius: 2 }));
      sp.push({
        id: 'bp', title: '血壓與脈搏', dates: bs.map(e => e.date), note: '',
        extra: i => [bs[i].time ? '時間 ' + bs[i].time : '', (bs[i].note || '').replace(/^\d{1,2}:\d{2}[，,]?/, '')].filter(Boolean),
        cfg: { type: 'line', data: { labels: bs.map(e => md(e.date)), datasets: ds3 }, options: opt },
      });
    }
  }
  if (H && ws.length) {
    const m2 = (H / 100) ** 2;
    sp.push({
      id: 'bmi', title: 'BMI', dates: ws.map(e => e.date), note: '依身高 ' + H + ' cm 計算。BMI＝體重 ÷ 身高²（公尺）。虛線是台灣成人標準：24 以上過重、27 以上肥胖。',
      extra: i => ['體重 ' + ws[i].wt + ' kg'],
      cfg: {
        type: 'line', data: { labels: ws.map(e => md(e.date)), datasets: [
          ln3('BMI', ws.map(e => +(e.wt / m2).toFixed(1)), wc),
          { label: '過重 24', data: ws.map(() => 24), borderColor: mu, backgroundColor: mu, borderDash: [6, 4], borderWidth: 1, pointRadius: 0 },
          { label: '肥胖 27', data: ws.map(() => 27), borderColor: mu, backgroundColor: mu, borderDash: [2, 3], borderWidth: 1, pointRadius: 0 }] },
        options: { maintainAspectRatio: false, plugins: { legend: leg() }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid() } } },
      },
    });
  }
  if (bc.length) {
    const hf = bc.some(e => e.fat > 0), hm = bc.some(e => e.mus > 0), hv = bc.some(e => e.vis > 0);
    const dsb = [];
    if (hf) dsb.push(ln3('體脂率 (%)', bc.map(e => e.fat > 0 ? e.fat : null), c3, { yAxisID: 'y' }));
    if (hm) dsb.push(ln3('骨骼肌率 (%)', bc.map(e => e.mus > 0 ? e.mus : null), c4, { yAxisID: 'y' }));
    if (hv) dsb.push(ln3('內臟脂肪等級', bc.map(e => e.vis > 0 ? e.vis : null), rc, { yAxisID: 'y1' }));
    sp.push({
      id: 'bc', title: '體脂、骨骼肌與內臟脂肪', dates: bc.map(e => e.date),
      cfg: { type: 'line', data: { labels: bc.map(e => md(e.date)), datasets: dsb }, options: { maintainAspectRatio: false, plugins: { legend: leg() }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid(), display: hf || hm, position: 'left' }, y1: { display: hv, position: 'right', grid: { drawOnChartArea: false } } } } },
    });
  }
  if (bm.length) {
    const hg = bm.some(e => e.bage > 0), hr = bm.some(e => e.bmr > 0);
    const d2 = [];
    if (hg) d2.push(ln3('身體年齡（歲）', bm.map(e => e.bage > 0 ? e.bage : null), c3, { yAxisID: 'y' }));
    if (hr) d2.push(ln3('基礎代謝 (大卡)', bm.map(e => e.bmr > 0 ? e.bmr : null), c4, { yAxisID: 'y1' }));
    sp.push({
      id: 'bm', title: '身體年齡與基礎代謝', dates: bm.map(e => e.date),
      cfg: { type: 'line', data: { labels: bm.map(e => md(e.date)), datasets: d2 }, options: { maintainAspectRatio: false, plugins: { legend: leg() }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid(), display: hg, position: 'left' }, y1: { display: hr, position: 'right', grid: { drawOnChartArea: false } } } } },
    });
  }
  return sp;
}

/** 觸控提示框與垂直參考線 */
export function addHover(sp, pal) {
  const o = sp.cfg.options;
  o.interaction = { mode: 'index', intersect: false, axis: 'x' };
  o.plugins = o.plugins || {};
  o.plugins.tooltip = {
    mode: 'index', intersect: false, padding: 10, titleFont: { size: 13 }, bodyFont: { size: 13 }, footerFont: { size: 12, weight: 'normal' },
    filter: it => !/^(過重|肥胖) /.test(it.dataset.label || ''),
    callbacks: { title: it => (it.length && sp.dates ? fullDate(sp.dates[it[0].dataIndex]) : ''), footer: it => (it.length && sp.extra ? sp.extra(it[0].dataIndex) : []) },
  };
  sp.cfg.plugins = [crosshair(pal.mu)];
}

let live = [];
const OPEN_DEFAULT = { w: true };

export async function renderCharts(root) {
  live.forEach(c => c && c.destroy()); live = [];
  root.textContent = '';
  const any = S.entries.some(e => e.wt > 0 || e.dose > 0 || e.sys > 0 || e.fat > 0 || e.mus > 0 || e.vis > 0 || e.bage > 0 || e.bmr > 0);
  if (!any) { root.append(h('div.card', h('div.empty', '還沒有可以畫圖的資料。到「記錄」新增，或到「設定」→「備份與匯入」把同步版的記錄搬過來。'))); return; }
  const range = L.chartRange || 'all', bpv = L.chartBp || 'all';
  root.append(h('div.card', h('div.row.between', h('b.small', '範圍'), pills([['30', '近 30 天'], ['90', '近 90 天'], ['all', '全部']], range, v => { L.chartRange = v; commitLocal(); renderCharts(root); })),
    h('div.mu.tiny', { style: { marginTop: '6px' } }, '只影響圖表，不會刪除任何記錄。手指左右拖曳可查看當天數值。')));
  const wait = h('div.card', h('div.row.small.mu', h('span.spin'), '正在準備圖表…'));
  root.append(wait);
  try { await loadChart(); } catch (e) {
    wait.textContent = ''; wait.append(h('div.notice', '畫圖的程式下載失敗。請確認有連上網路，再重新整理頁面。')); return;
  }
  wait.remove();
  const pal = palette();
  Chart.defaults.color = pal.mu;
  Chart.defaults.font.family = 'system-ui,-apple-system,"Noto Sans TC",sans-serif';
  for (const sp of chartSpecs(pal, range, bpv)) {
    addHover(sp, pal);
    const cv = h('canvas', { style: { touchAction: 'pan-y' } });
    const body = [];
    if (sp.id === 'bp') body.push(h('div', { style: { margin: '10px 0 4px' } }, pills([['all', '全部量測'], ['day', '每日平均'], ['ampm', '早／晚分開']], bpv, v => { L.chartBp = v; commitLocal(); renderCharts(root); })));
    body.push(h('div', { style: { position: 'relative', height: '250px', marginTop: '10px' } }, cv));
    if (sp.note) body.push(h('div.mu.tiny', { style: { marginTop: '6px' } }, sp.note));
    const d = fold('chart-' + sp.id, h('h2', { style: { margin: 0 } }, sp.title), body, { open: !!OPEN_DEFAULT[sp.id] });
    let chart = null;
    const draw = () => {
      if (chart || !d.open) return;
      try { chart = new Chart(cv, sp.cfg); live.push(chart); }
      catch (e) { body[body.length - 1].after?.(h('div.notice', '圖表產生失敗：' + (e.message || e))); }
    };
    d.addEventListener('toggle', draw);
    root.append(h('div.card', d));
    draw();
  }
}
