/* Google Drive 備份（drive.appdata）。沿用同步版的 OAuth 寫法與 Client ID。
 * - 自己的備份檔：metapulse.json（讀寫）
 * - 同步版的備份檔：dose-tracker-sync.json（只讀，絕不寫入、修改或刪除） */
import { S, L, commitLocal, replaceState, onChange } from './state.js';
import { normalizeState } from './storage.js';

export const GOOGLE_CLIENT_ID = '157434461885-nmum0qv1h34r1u9f0scn7g75u7s09iiu.apps.googleusercontent.com';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FN = 'metapulse.json';
export const SYNC_FN = 'dose-tracker-sync.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

let tok = null, tokExp = 0, tc = null, fid = null, tmr = null;
const listeners = new Set();
let status = L.driveLinked ? 'Google Drive 已連結，連線中…' : '本機儲存';
export const driveEmail = () => L.driveEmail || '';

/** 取得目前登入的帳號（Drive about；只需 drive.appdata 權限） */
async function fetchAccount() {
  try {
    const j = await (await gfetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName)')).json();
    const em = j && j.user && j.user.emailAddress;
    if (em && em !== L.driveEmail) { L.driveEmail = em; commitLocal(); }
  } catch (e) { /* 取不到帳號不影響備份 */ }
}
export const onDrive = fn => listeners.add(fn);
const emit = (text, event) => { if (text) status = text; listeners.forEach(f => { try { f(status, event); } catch (e) { console.error(e); } }); };
export const driveStatus = () => status;
export const linked = () => !!L.driveLinked;
export const ready = () => !!tok && Date.now() < tokExp - 60000;

async function gfetch(url, opt = {}) {
  const r = await fetch(url, { ...opt, headers: { Authorization: 'Bearer ' + tok, ...(opt.headers || {}) } });
  if (r.status === 401) { tok = null; throw new Error('auth'); }
  if (!r.ok) throw new Error('http ' + r.status);
  return r;
}
async function findId(name) {
  const r = await gfetch(API + '?spaces=appDataFolder&fields=files(id,modifiedTime)&q=' + encodeURIComponent("name='" + name + "'"));
  const j = await r.json();
  return j.files && j.files[0] ? j.files[0].id : null;
}

/** 備份到 Drive */
export async function pushRemote() {
  if (!ready()) { emit('Google Drive 需要重新連線（點此重新連線）', 'need-auth'); return false; }
  try {
    const data = JSON.stringify(S);
    if (!fid) fid = await findId(FN);
    if (fid) {
      await gfetch(UPLOAD + '/' + fid + '?uploadType=media', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: data });
    } else {
      const bd = 'mpb' + Date.now();
      const body = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: FN, parents: ['appDataFolder'] })
        + '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + data + '\r\n--' + bd + '--';
      const r = await gfetch(UPLOAD + '?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + bd }, body });
      fid = (await r.json()).id;
    }
    L.lastBackup = Date.now(); commitLocal();
    emit('已備份到 Google Drive', 'pushed');
    return true;
  } catch (e) {
    emit(e.message === 'auth' ? 'Google Drive 需要重新連線（點此重新連線）' : 'Drive 備份失敗，資料仍在本機（點此重新連線）', 'push-failed');
    return false;
  }
}

export function schedPush() {
  if (!L.driveLinked) return;
  emit('同步中…');
  clearTimeout(tmr); tmr = setTimeout(pushRemote, 1000);
}

/** 連線後：雲端較新且有資料 → 載入雲端；否則把本機備份上去（以最後修改時間較新的為準，不合併） */
async function pullAndMerge() {
  fid = await findId(FN);
  if (fid) {
    const d = await (await gfetch(API + '/' + fid + '?alt=media')).json();
    const remoteHas = d && ((d.meals && d.meals.length) || (d.entries && d.entries.length));
    const localHas = S.meals.length || S.entries.length;
    if (d && (d.ts || 0) > (S.ts || 0) && (remoteHas || !localHas)) {
      const n = normalizeState(d); n.ts = d.ts; // 保留雲端時間，不視為本機新修改
      replaceState(n, true);
      L.lastBackup = Date.now(); commitLocal();
      emit('已從 Google Drive 載入', 'pulled');
      return;
    }
  }
  await pushRemote();
}

/** interactive：使用者按按鈕；chooseAccount：強制顯示帳號選擇畫面 */
export function connect(interactive, chooseAccount) {
  if (!window.google || !google.accounts || !google.accounts.oauth2) { emit('Google 登入元件尚未載入，請稍後再試', 'error'); return; }
  if (!tc) tc = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
    callback: async r => {
      if (r.error || !r.access_token) { emit('Google 連線失敗（點此重新連線）', 'need-auth'); return; }
      tok = r.access_token; tokExp = Date.now() + (r.expires_in || 3600) * 1000;
      L.driveLinked = true; commitLocal();
      await fetchAccount();
      try { await pullAndMerge(); } catch (e) { emit('Drive 同步失敗，資料仍在本機（點此重新連線）', 'push-failed'); }
      emit(null, 'linked');
    },
    error_callback: () => emit('Google Drive 需要重新連線（點此重新連線）', 'need-auth'),
  });
  const opt = { prompt: !interactive ? 'none' : (chooseAccount || !L.driveEmail ? 'select_account' : '') };
  if (L.driveEmail && !chooseAccount) opt.hint = L.driveEmail;
  tc.requestAccessToken(opt);
}

export function disconnect() {
  try { if (tok && window.google) google.accounts.oauth2.revoke(tok); } catch (e) { /* 忽略 */ }
  tok = null; fid = null; L.driveLinked = false; L.driveEmail = ''; commitLocal();
  emit('本機儲存（已中斷 Google Drive）', 'unlinked');
}

/** 立即同步（已連線時） */
export async function syncNow() {
  if (!ready()) { connect(true); return; }
  emit('同步中…');
  try { await pullAndMerge(); } catch (e) { emit('Drive 同步失敗，資料仍在本機', 'push-failed'); }
}

/** 只讀取同步版的備份檔（不寫入、不修改、不刪除） */
export async function readSyncBackup() {
  if (!ready()) throw new Error('請先連線 Google Drive');
  const id = await findId(SYNC_FN);
  if (!id) throw new Error('在你的 Google Drive 找不到同步版的備份（' + SYNC_FN + '）。請確認同步版有連線同一個 Google 帳號並備份過。');
  return await (await gfetch(API + '/' + id + '?alt=media')).json();
}

/* 資料變動時自動備份 */
onChange(ev => { if (!ev || !ev.remote) schedPush(); });

/* 開啟時若曾連線，靜默重新取得授權 */
export function initDrive() {
  if (!L.driveLinked) return;
  const tryConnect = (n = 0) => {
    if (window.google && google.accounts && google.accounts.oauth2) connect(false);
    else if (n < 20) setTimeout(() => tryConnect(n + 1), 500);
    else emit('Google 登入元件載入失敗，資料仍在本機', 'error');
  };
  tryConnect();
}
