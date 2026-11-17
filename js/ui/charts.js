/* 圖表分頁：移植同步版的圖表（體重、劑量與殘留、血壓、BMI、體組成、身體年齡／基礎代謝）
 * Chart.js 4.4.1 在第一次開啟圖表頁時才從 cdnjs 載入。圖表卡片可收合，收起來的不畫。 */
import { S, L, commitLocal, plan } from '../state.js';
import { h, fold, pills, toast, tip } from './common.js';
import { buildSummary } from '../summary.js';
import { capPlugin } from '../health.js';
import { localDate } from '../points.js';
import { sortEntries, onBoard, dn, fromDn, md, wdOf } from '../records.js';
import { longTermStatusCard, leanParts } from './fasting.js';

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
  // 淨體重：每天平均（體重 ×（1 − 體脂率））＋ 28 天移動平均（往前 28 天至少 6 天有量才畫）
  const lday = {};
  all.filter(e => e.wt > 0 && e.fat > 0).forEach(e => { (lday[e.date] = lday[e.date] || []).push(e.wt * (1 - e.fat / 100)); });
  const lds = Object.keys(lday).sort(), lv = d => lday[d].reduce((x, y) => x + y, 0) / lday[d].length;
  const lshow = lds.filter(d => !cut || d >= cut);
  if (lshow.length) {
    const ma = lshow.map(d => { const from = fromDn(dn(d) - 27), w = lds.filter(x => x >= from && x <= d); return w.length >= 6 ? +(w.reduce((a, x) => a + lv(x), 0) / w.length).toFixed(2) : null; });
    sp.push({
      id: 'lean', title: '淨體重', dates: lshow, note: '淨體重＝體重 ×（1 − 體脂率）。點是每天的數值（會跳動），實線是 28 天平均，看趨勢請看實線。',
      cfg: {
        type: 'line', data: { labels: lshow.map(md), datasets: [
          ln3('每天 (kg)', lshow.map(d => +lv(d).toFixed(1)), c4, { showLine: false, pointRadius: lshow.length > 80 ? 1.5 : 2.5 }),
          ln3('28 天平均', ma, wc, { pointRadius: 0, borderWidth: 2.5 })] },
        options: { maintainAspectRatio: false, plugins: { legend: { labels: leg().labels } }, scales: { x: { grid: grid(), ticks: tk() }, y: { grid: grid() } } },
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

/* ---------- 給 AI 分析：圖表截圖、數據摘要 ---------- */
let expBlob = null, expUrl = '';
const LIGHT = { tx: '#14212b', mu: '#5d6b78', ln: '#d5dde4', wc: '#0f766e', dc: '#0e7490', rc: '#c2410c', c3: '#7c3aed', c4: '#15803d' };

/** 所有圖表合成一張高解析度圖片（淺色底，不受深色模式影響） */
async function exportCharts(range, bpv) {
  await loadChart();
  const specs = chartSpecs(LIGHT, range, bpv);
  if (!specs.length) throw new Error('目前沒有可以畫的圖表。');
  const font = '"Noto Sans TC",system-ui,sans-serif';
  const cols = Math.min(2, specs.length), rows = Math.ceil(specs.length / cols);
  const CW = 1100, CH = 520, PAD = 40, HEAD = 170, TIT = 64;
  const W = cols * CW + (cols + 1) * PAD, H = HEAD + rows * (TIT + CH + PAD);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const es = sortEntries(S.entries), dates = es.map(e => e.date), pf = S.profile;
  g.fillStyle = LIGHT.tx; g.font = 'bold 46px ' + font; g.fillText('MetaPulse 記錄：圖表總覽', PAD, 72);
  g.fillStyle = LIGHT.mu; g.font = '28px ' + font;
  g.fillText('資料期間 ' + (dates.length ? dates[0] + ' 到 ' + dates[dates.length - 1] : '無') + '（共 ' + es.length + ' 筆記錄）', PAD, 116);
  const prof = [];
  if (+pf.height > 0) prof.push('身高 ' + pf.height + ' cm');
  if (+pf.targetWeight > 0) prof.push('目標體重 ' + pf.targetWeight + ' kg');
  if (es.some(e => e.dose > 0)) prof.push('藥物半衰期 ' + (+pf.halfLife || 120) + ' 小時');
  if (range !== 'all') prof.push('範圍 近 ' + range + ' 天');
  prof.push('產生於 ' + localDate(new Date()));
  g.fillText(prof.join('　|　'), PAD, 152);
  const prev = { color: Chart.defaults.color, size: Chart.defaults.font.size };
  Chart.defaults.color = LIGHT.mu; Chart.defaults.font.size = 22;
  try {
    specs.forEach((sp, i) => {
      const x = PAD + (i % cols) * (CW + PAD), y = HEAD + Math.floor(i / cols) * (TIT + CH + PAD);
      g.fillStyle = LIGHT.tx; g.font = 'bold 32px ' + font; g.fillText(sp.title, x, y + 36);
      try {
        const oc = document.createElement('canvas'); oc.width = CW; oc.height = CH;
        Object.assign(sp.cfg.options, { responsive: false, animation: false, devicePixelRatio: 1, maintainAspectRatio: false });
        const c = new Chart(oc, sp.cfg);
        g.drawImage(oc, x, y + TIT); c.destroy();
      } catch (e) { g.fillStyle = '#b91c1c'; g.font = '28px ' + font; g.fillText('這張圖產生失敗', x, y + TIT + 44); }
    });
  } finally { Chart.defaults.color = prev.color; Chart.defaults.font.size = prev.size; }
  const blob = await new Promise(res => { try { cv.toBlob(res, 'image/png'); } catch (e) { res(null); } });
  if (!blob) throw new Error('圖片太大，這個瀏覽器做不出來。可以把範圍改成「近 30 天」再試。');
  return { blob, W, H };
}

const fileName = () => 'metapulse-charts-' + localDate(new Date()) + '.png';
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

function download(blob) {
  const a = h('a', { href: expUrl || URL.createObjectURL(blob), download: fileName() });
  document.body.append(a); a.click(); a.remove();
}
/** 分享圖片：APK 用原生分享，手機瀏覽器用系統分享，都不行就下載 */
async function shareImage(blob) {
  const Sh = capPlugin('Share'), Fs = capPlugin('Filesystem');
  if (Sh && Fs) {
    const w = await Fs.writeFile({ path: fileName(), data: await b64(blob), directory: 'CACHE' });
    await Sh.share({ title: 'MetaPulse 圖表', files: [w.uri] });
    return;
  }
  const f = new File([blob], fileName(), { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'MetaPulse 圖表' }); return; }
  download(blob);
}
async function copyText(t, ta) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) { ta.style.display = ''; ta.select(); try { return document.execCommand('copy'); } catch (e2) { return false; } }
}

function aiCard(range, bpv) {
  const msg = h('div.mu.tiny', { style: { marginTop: '8px', lineHeight: 1.6 } });
  const aiTip = tip('把所有圖表合成一張圖，或把數據整理成一段文字，貼給 AI（例如 ChatGPT、Gemini）幫你看趨勢、整理要問醫師的問題。數據摘要包含飲食點數、熱量、蛋白質和斷食時數。勾選「加上給 AI 的說明」會在開頭請 AI 分析、不要診斷。裡面有你的健康資料，傳給 AI 前請自己評估隱私。');
  const withPrompt = h('input', { type: 'checkbox', checked: L.sumPrompt !== false });
  withPrompt.onchange = () => { L.sumPrompt = withPrompt.checked; commitLocal(); };
  const ta = h('textarea', { rows: 6, readOnly: true, style: { display: 'none', marginTop: '8px' } });
  const img = h('img', { alt: '圖表截圖', style: { width: '100%', borderRadius: '8px', marginTop: '10px', background: '#fff', display: 'none' } });
  const imgBtns = h('div.grid2', { style: { marginTop: '8px', display: 'none' } });
  const shot = h('button.pri.full', { type: 'button' }, '產生圖表截圖');
  shot.onclick = async () => {
    shot.disabled = true; msg.textContent = '正在產生圖片…';
    try {
      const r = await exportCharts(range, bpv);
      expBlob = r.blob;
      try { if (expUrl) URL.revokeObjectURL(expUrl); } catch (e) { /* 略過 */ }
      expUrl = URL.createObjectURL(r.blob);
      img.src = expUrl; img.style.display = ''; imgBtns.style.display = '';
      msg.textContent = '已產生 ' + r.W + ' × ' + r.H + ' 的圖片。可以分享給 AI，或存到手機。';
    } catch (e) { msg.textContent = '產生圖片失敗：' + (e.message || e); }
    shot.disabled = false;
  };
  const share = h('button.ghost', { type: 'button' }, '分享或儲存');
  share.onclick = async () => {
    try { await shareImage(expBlob); }
    catch (e) { if (!(e && (e.name === 'AbortError' || /cancel/i.test(e.message || '')))) download(expBlob); }
  };
  const copyImg = h('button.ghost', { type: 'button' }, '複製圖片');
  copyImg.onclick = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': expBlob })]); toast('已複製圖片'); }
    catch (e) { toast('這裡不能複製圖片，請改用「分享或儲存」', true); }
  };
  imgBtns.append(share, copyImg);
  const sum = h('button.ghost.full', { type: 'button', style: { marginTop: '8px' } }, '複製數據摘要');
  sum.onclick = async () => {
    const t = buildSummary(S, plan(), localDate(new Date()), withPrompt.checked);
    ta.value = t;
    const ok = await copyText(t, ta);
    msg.textContent = ok ? '已複製數據摘要（' + t.length + ' 字），可以直接貼到 AI 對話。裡面包含飲食點數、熱量、蛋白質和斷食時數。' : '沒辦法自動複製，請在下面的框裡全選後複製。';
  };
  return h('div.card', fold('chart-ai', h('h2', { style: { margin: 0 } }, '給 AI 分析'), [h('div', { style: { marginTop: '10px' } },
    shot, sum,
    h('label.row', { style: { color: 'var(--tx)', marginTop: '10px', fontSize: '15px' } }, withPrompt, '加上給 AI 的說明'),
    aiTip, msg, ta, img, imgBtns)], { open: false }));
}

let live = [];
const OPEN_DEFAULT = { w: true };

export async function renderCharts(root) {
  live.forEach(c => c && c.destroy()); live = [];
  root.textContent = '';
  const any = S.entries.some(e => e.wt > 0 || e.dose > 0 || e.sys > 0 || e.fat > 0 || e.mus > 0 || e.vis > 0 || e.bage > 0 || e.bmr > 0);
  if (!any) { root.append(h('div.card', h('div.empty', '還沒有可以畫圖的資料。到「記錄」新增，或到「設定」→「備份與匯入」把同步版的記錄搬過來。'))); root.append(longTermStatusCard()); return; }
  const range = L.chartRange || 'all', bpv = L.chartBp || 'all';
  root.append(h('div.card', h('div.row.between', h('b.small', '範圍'), pills([['30', '近 30 天'], ['90', '近 90 天'], ['all', '全部']], range, v => { L.chartRange = v; commitLocal(); renderCharts(root); })),
    ));
  const wait = h('div.card', h('div.row.small.mu', h('span.spin'), '正在準備圖表…'));
  root.append(wait);
  try { await loadChart(); } catch (e) {
    wait.textContent = ''; wait.append(h('div.notice', '畫圖的程式下載失敗。請確認有連上網路，再重新整理頁面。')); return;
  }
  wait.remove();
  root.append(aiCard(range, bpv));
  const pal = palette();
  Chart.defaults.color = pal.mu;
  Chart.defaults.font.family = 'system-ui,-apple-system,"Noto Sans TC",sans-serif';
  for (const sp of chartSpecs(pal, range, bpv)) {
    addHover(sp, pal);
    const cv = h('canvas', { style: { touchAction: 'pan-y' } });
    const body = [];
    if (sp.id === 'bp') body.push(h('div', { style: { margin: '10px 0 4px' } }, pills([['all', '全部量測'], ['day', '每日平均'], ['ampm', '早／晚分開']], bpv, v => { L.chartBp = v; commitLocal(); renderCharts(root); })));
    body.push(h('div', { style: { position: 'relative', height: '250px', marginTop: '10px' } }, cv));
    if (sp.note) body.push(tip(sp.note));
    let head = h('h2', { style: { margin: 0 } }, sp.title);
    if (sp.id === 'lean') { const lp = leanParts(); head = h('div.grow', head, lp.sum); body.push(h('div', { style: { marginTop: '10px' } }, lp.body)); }
    const d = fold('chart-' + sp.id, head, body, { open: !!OPEN_DEFAULT[sp.id] });
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
  root.append(longTermStatusCard());
}
