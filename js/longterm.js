/* 長期攝取指數（代謝提示）與體重下降速度（純函數）
 * 當日比例 = 當日攝取熱量 ÷ 基礎代謝
 * 長期指數 = 前一天長期指數 × (1 − α) + 當日比例 × α
 * - 沒有記錄的日子跳過，不當作 0 大卡
 * - 當天記錄熱量低於基礎代謝的 30% → 記錄不完整，跳過
 * - 今天還沒過完，不列入 */
import { LONGTERM } from './config.js';
import { localDate, addDays } from './points.js';

export function dailyKcal(meals) {
  const m = {};
  for (const x of meals) { const d = localDate(x.at); m[d] = (m[d] || 0) + (+x.kcal || 0); }
  return m;
}

/**
 * @returns {{index:number|null, validDays, recentValid, ready:boolean, level:'ok'|'low'|'veryLow'|null, series:[{date, ratio, index}]}}
 */
export function longTermIndex(meals, bmr, todayStr, cfg = LONGTERM) {
  const out = { index: null, validDays: 0, recentValid: 0, ready: false, level: null, series: [] };
  if (!(bmr > 0)) return out;
  const byDay = dailyKcal(meals);
  const days = Object.keys(byDay).filter(d => d < todayStr).sort();
  const recentFrom = addDays(todayStr, -cfg.recentDays);
  let idx = null;
  for (const d of days) {
    const ratio = byDay[d] / bmr;
    if (ratio < cfg.minDayRatio) continue;              // 記錄不完整
    idx = idx === null ? ratio : idx * (1 - cfg.alpha) + ratio * cfg.alpha;
    out.validDays++;
    if (d >= recentFrom) out.recentValid++;
    out.series.push({ date: d, ratio, index: idx });
  }
  out.index = idx;
  out.ready = out.validDays >= cfg.minValidDays && out.recentValid / cfg.recentDays >= cfg.recentValidRatio;
  if (out.ready) out.level = idx < cfg.veryLow ? 'veryLow' : idx < cfg.low ? 'low' : 'ok';
  return out;
}

/**
 * 體重下降速度：比較「最近 14 天平均」和「7 天前的 14 天平均」，換算每週下降佔體重幾 %
 * @returns {{weeklyPct:number|null, fast:boolean}}
 */
export function weightTrend(entries, todayStr, cfg = LONGTERM) {
  const byDay = {};
  for (const e of entries) if (e.wt > 0) (byDay[e.date] = byDay[e.date] || []).push(e.wt);
  const avg = (from, to) => {
    const v = []; for (const d in byDay) if (d >= from && d <= to) v.push(byDay[d].reduce((a, b) => a + b, 0) / byDay[d].length);
    return v.length >= 4 ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const n = cfg.weightMaDays;
  const now = avg(addDays(todayStr, -(n - 1)), todayStr);
  const prev = avg(addDays(todayStr, -(n - 1) - 7), addDays(todayStr, -7));
  if (now === null || prev === null) return { weeklyPct: null, fast: false };
  const weeklyPct = (prev - now) / prev * 100;
  return { weeklyPct, fast: weeklyPct > cfg.fastLossPct };
}

/** 提示文字（沒觸發時回傳 null） */
export function longTermMessage(lt, wt) {
  if (!lt.ready || lt.level === 'ok' || !lt.level) return null;
  let t = lt.level === 'veryLow'
    ? '熱量持續明顯偏低，代謝可能逐漸降低，建議留意蛋白質與身體狀況'
    : '最近一段時間熱量偏低，代謝可能逐漸降低';
  if (wt && wt.fast) t += '；體重下降速度偏快';
  return t;
}

/**
 * 淨體重趨勢（淨體重＝體重 ×（1 − 體脂率））：最近 28 天平均和再前 28 天平均比較，不看單日
 * 同時看最近 28 天的平均蛋白質（只算有餐點記錄的日子，不含今天）
 * @returns {{ready, cur, prev, change, pct, curDays, prevDays, protein, mealDays, falling, lowProtein, alert}}
 */
export function leanTrend(entries, meals, proteinTarget, todayStr, cfg = LONGTERM) {
  const W = cfg.leanWindow, from1 = addDays(todayStr, -(W - 1)), from0 = addDays(todayStr, -(2 * W - 1));
  const day = {};
  for (const e of entries || []) {
    if (!(e.wt > 0 && e.fat > 0) || e.date > todayStr || e.date < from0) continue;
    (day[e.date] = day[e.date] || []).push(e.wt * (1 - e.fat / 100));
  }
  const cur = [], prev = [];
  for (const d in day) { const v = day[d].reduce((a, b) => a + b, 0) / day[d].length; (d >= from1 ? cur : prev).push(v); }
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const ready = cur.length >= cfg.leanMinDays && prev.length >= cfg.leanMinDays;
  const c = avg(cur), p = avg(prev);
  const change = ready ? c - p : null, pct = ready ? (c - p) / p * 100 : null;
  const pro = {};
  for (const m of meals || []) { const d = localDate(m.at); if (d >= from1 && d < todayStr) pro[d] = (pro[d] || 0) + (+m.protein || 0); }
  const pd = Object.values(pro), protein = pd.length >= cfg.leanMinMealDays ? avg(pd) : null;
  const falling = ready && pct <= -cfg.leanDropPct;
  const lowProtein = protein !== null && proteinTarget > 0 && protein < proteinTarget;
  return { ready, cur: c, prev: p, change, pct, curDays: cur.length, prevDays: prev.length, protein, mealDays: pd.length, falling, lowProtein, alert: falling && lowProtein };
}
