/* 兩份資料（這支手機、Google Drive）合併成一份（純函數）
 * - 各種記錄依 id 合併：兩邊都有同一筆時，用整份比較新（ts 較大）的那邊
 * - 刪除過的記錄記在 deleted { id: 刪除時間 }，合併後不會再冒出來
 * - 個人資料、設定：用比較新的那份
 * - 運動消耗依日期合併 */

export const COLS = ['entries', 'meals', 'foodLibrary', 'fasts'];
const PRUNE_DAYS = 180;

export function idsOf(S) {
  const o = {};
  for (const c of COLS) o[c] = new Set((S[c] || []).map(x => x && x.id).filter(x => x != null).map(String));
  return o;
}

/** 比較前後兩次的 id，把不見的記為刪除 */
export function recordDeletes(S, before, now = Date.now()) {
  S.deleted = S.deleted || {};
  const after = idsOf(S);
  for (const c of COLS) for (const id of before[c] || []) if (!after[c].has(id)) S.deleted[id] = now;
  return S;
}

function pruneDeleted(del, now) {
  const o = {}, cut = now - PRUNE_DAYS * 864e5;
  for (const k in del || {}) if (del[k] >= cut) o[k] = del[k];
  return o;
}

export function mergeStates(a, b, now = Date.now()) {
  if (!b) return a;
  if (!a) return b;
  const newer = (+a.ts || 0) >= (+b.ts || 0) ? a : b, older = newer === a ? b : a;
  const deleted = { ...(older.deleted || {}) };
  for (const k in newer.deleted || {}) deleted[k] = Math.max(deleted[k] || 0, newer.deleted[k]);
  const out = { ...older, ...newer, deleted: pruneDeleted(deleted, now), ts: Math.max(+a.ts || 0, +b.ts || 0) };
  for (const c of COLS) {
    const m = new Map();
    for (const x of older[c] || []) if (x && x.id != null) m.set(String(x.id), x);
    for (const x of newer[c] || []) if (x && x.id != null) m.set(String(x.id), x);
    for (const id of Object.keys(deleted)) m.delete(id);
    out[c] = [...m.values()];
  }
  out.meals.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  const act = new Map();
  for (const x of older.activity || []) act.set(x.date, x);
  for (const x of newer.activity || []) act.set(x.date, x);
  out.activity = [...act.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
  out.profile = { ...(older.profile || {}), ...(newer.profile || {}) };
  out.prefs = { ...(older.prefs || {}), ...(newer.prefs || {}) };
  return out;
}

/** 兩份的記錄內容是否相同（不比 ts） */
export function sameData(a, b) {
  const pick = s => JSON.stringify([COLS.map(c => (s[c] || []).map(x => JSON.stringify(x)).sort()), (s.activity || []).map(x => JSON.stringify(x)).sort(), s.profile, s.prefs, Object.keys(s.deleted || {}).sort()]);
  return pick(a) === pick(b);
}
