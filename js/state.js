/* 執行期狀態：S（會備份）、L（只存在這台裝置），以及變更通知 */
import { loadState, loadLocal, saveState, saveLocal } from './storage.js';
import { budget } from './points.js';

export const S = loadState();
export const L = loadLocal();

const subs = new Set();
export const onChange = fn => subs.add(fn);

/** 修改 S 後呼叫：存檔並通知各畫面重畫 */
export function commit() {
  const ok = saveState(S);
  subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  return ok;
}
export function commitLocal() { saveLocal(L); }

/** 目前體重：有體重記錄就用最新一筆，沒有就用個人資料 */
export function currentWeight() {
  let best = null;
  for (const e of S.entries) if (e.wt > 0 && (!best || e.date > best.date || (e.date === best.date && (e.time || '') >= (best.time || '')))) best = e;
  return best ? best.wt : +S.profile.weight || 0;
}

export function plan() {
  return budget({ ...S.profile, weight: currentWeight() });
}

export const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
