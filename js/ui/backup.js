/* 設定頁「備份與匯入」：一張卡分兩區
 * - Google：Drive 自動備份（帳號、同步、切換、中斷）＋ 從 Drive 讀取同步版備份
 * - 其他：備份文字（產生、還原）與同步版的文字／檔案匯入共用一個輸入框，自動判斷格式 */
import { S, L, commit, commitLocal, replaceState } from '../state.js';
import { h, toast, section, sumLine } from './common.js';
import { connect, disconnect, syncNow, linked, ready, driveStatus, driveEmail, onDrive, readSyncBackup } from '../drive.js';
import { normalizeState } from '../storage.js';
import { parseSyncBackup, previewImport, applyImport } from '../migrate.js';

const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '剛剛' : m < 60 ? m + ' 分鐘前' : m < 1440 ? Math.round(m / 60) + ' 小時前' : Math.round(m / 1440) + ' 天前'; };
const fmtAt = t => new Date(t).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const sub = (t, first) => h('div.small', { style: { fontWeight: 650, margin: first ? '0 0 6px' : '18px 0 6px', paddingTop: first ? 0 : '14px', borderTop: first ? 0 : '1px solid var(--ln)' } }, t);

export function backupCard() {
  const sumEl = sumLine();
  const out = h('div', { style: { marginTop: '10px' } });   // 匯入預覽與結果（兩區共用）

  /* ---------- 同步版匯入：預覽與確認 ---------- */
  const showSync = (parsed, source) => {
    out.textContent = '';
    let pv;
    try { pv = previewImport(parsed, S.entries, S.profile); } catch (e) { out.append(h('div.notice', e.message)); return; }
    const pf = pv.profile, pl = [];
    if (pf.height) pl.push('身高 ' + pf.height + ' cm');
    if (pf.targetWeight) pl.push('目標體重 ' + pf.targetWeight + ' kg');
    if (pf.halfLife) pl.push('半衰期 ' + pf.halfLife + ' 小時');
    out.append(h('div', { style: { background: 'var(--soft)', borderRadius: '12px', padding: '10px 12px', lineHeight: 1.8 } },
      h('div.small', h('b', '同步版存檔：'), source),
      h('div.small', '共 ' + pv.total + ' 筆' + (pv.from ? '（' + pv.from + ' ～ ' + pv.to + '）' : '')),
      h('div.small', '新增 ', h('b', pv.add.length), ' 筆・更新 ', h('b', pv.update.length), ' 筆・已存在略過 ', pv.dup, ' 筆' + (pv.bad ? '・日期格式錯誤略過 ' + pv.bad + ' 筆' : '')),
      pl.length ? h('div.small', '個人資料：' + pl.join('、')) : null));
    if (!pv.add.length && !pv.update.length && !pl.length) { out.append(h('div.notice.ok', '沒有新的資料，MetaPulse 已經是最新的。')); return; }
    const go = h('button.pri.full', { type: 'button' }, '確認匯入');
    go.onclick = () => {
      const r = applyImport(S, pv);
      L.lastSyncImport = { at: Date.now(), added: r.added, updated: r.updated }; commitLocal();
      commit(); draw();
      out.textContent = '';
      out.append(h('div.notice.ok', '✓ 已新增 ' + r.added + ' 筆、更新 ' + r.updated + ' 筆。同步版的資料沒有被改動。'),
        h('div.notice', '移植完成前可以繼續用同步版記錄，之後再匯入一次即可（不會重複）。'));
      toast('匯入完成');
    };
    out.append(go);
  };

  /* ---------- Google ---------- */
  const acct = h('div.small');
  const main = h('button.pri.full', { type: 'button', style: { marginTop: '8px' } });
  main.onclick = () => { if (linked() && ready()) syncNow(); else connect(true); };
  const sw = h('button.ghost', { type: 'button', onclick: () => { disconnect(); connect(true, true); } }, '切換帳號');
  const off = h('button.ghost', { type: 'button', onclick: () => { disconnect(); draw(); } }, '中斷連線');
  const acctBtns = h('div.grid2', { style: { marginTop: '8px' } }, sw, off);
  const fromDrive = h('button.ghost.full', { type: 'button', style: { marginTop: '8px' } }, '從 Google Drive 匯入同步版存檔');
  fromDrive.onclick = async () => {
    if (!ready()) { out.textContent = ''; out.append(h('div.notice', '請先按上面的「連線 Google Drive」，登入和同步版同一個 Google 帳號，再按一次。')); return; }
    fromDrive.disabled = true; out.textContent = ''; out.append(h('div.row.small.mu', h('span.spin'), '讀取中…'));
    try { showSync(parseSyncBackup(await readSyncBackup()), 'Google Drive'); }
    catch (e) { out.textContent = ''; out.append(h('div.notice', e.message === 'auth' ? 'Google Drive 需要重新連線。' : '讀取失敗：' + e.message)); }
    fromDrive.disabled = false;
  };

  /* ---------- 其他：文字或檔案 ---------- */
  const ta = h('textarea', { rows: 3, placeholder: '貼上 MetaPulse 或同步版的存檔文字' });
  const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain' });
  const msg = h('div.mu.small', { style: { marginTop: '6px' } });
  let confirmRestore = 0;
  const handle = (text, source) => {
    msg.textContent = ''; out.textContent = '';
    let p;
    try { p = JSON.parse(String(text).replace(/```(json)?/g, '').trim()); } catch (e) { msg.textContent = '看不懂這段內容，請確認貼上的是完整的存檔文字（從 { 開頭到 } 結尾）。'; return; }
    if (p && Array.isArray(p.meals)) {             // MetaPulse 自己的備份 → 還原（取代全部）
      if (Date.now() - confirmRestore > 5000) {
        confirmRestore = Date.now();
        msg.textContent = '這是 MetaPulse 的備份（' + (p.entries || []).length + ' 筆身體記錄、' + p.meals.length + ' 筆餐點）。還原會取代目前所有資料，5 秒內再按一次確認。';
        return;
      }
      confirmRestore = 0;
      replaceState(normalizeState(p));
      msg.textContent = '已還原 ' + S.entries.length + ' 筆身體記錄、' + S.meals.length + ' 筆餐點。'; toast('已還原');
      return;
    }
    try { showSync(parseSyncBackup(p), source); }   // 同步版備份 → 匯入預覽（不覆蓋）
    catch (e) { msg.textContent = e.message; }
  };
  file.onchange = async () => {
    const f = file.files && file.files[0]; file.value = ''; if (!f) return;
    try { const t = await f.text(); ta.value = t; handle(t, '檔案「' + f.name + '」'); } catch (e) { msg.textContent = '讀取檔案失敗。'; }
  };
  const gen = h('button.ghost', { type: 'button', onclick: () => { ta.value = JSON.stringify(S); ta.select(); L.lastBackup = Date.now(); commitLocal(); draw(); msg.textContent = '已產生（' + S.entries.length + ' 筆身體記錄、' + S.meals.length + ' 筆餐點），請全選、複製後另外保存。'; } }, '產生存檔文字');
  const use = h('button.ghost', { type: 'button', onclick: () => { if (ta.value.trim()) handle(ta.value, '貼上的文字'); else ta.focus(); } }, '匯入或還原');

  function draw() {
    const em = driveEmail();
    sumEl.textContent = (linked() ? 'Google Drive：' + (em || '已連線') + '・' + driveStatus().replace(/（點這裡.*?）/, '') + (L.lastBackup ? '（' + ago(L.lastBackup) + '）' : '') : 'Google Drive 尚未連線')
      + (L.lastSyncImport ? '・同步版 ' + fmtAt(L.lastSyncImport.at) + ' 匯入' : '');
    acct.textContent = linked() ? '帳號：' + (em || '（按「重新登入」後顯示）') + '・' + driveStatus().replace(/（點這裡.*?）/, '') : '連線後，每次修改記錄都會自動存一份到你自己的 Google Drive（雲端硬碟）。';
    main.textContent = linked() ? (ready() ? '立即同步' : '重新登入 Google Drive') : '連線 Google Drive';
    acctBtns.style.display = linked() ? '' : 'none';
  }
  onDrive(() => { if (sumEl.isConnected) draw(); });
  draw();

  const body = [
    sub('Google', true), acct, main, acctBtns,
    h('div.mu.tiny', { style: { marginTop: '8px', lineHeight: 1.6 } }, 'MetaPulse 的存檔會放在你 Google Drive 裡一個看不到的專用資料夾，只有這個 app 能讀寫，別人（包括作者）都看不到。手機和雲端的存檔，以比較新的那份為準。'),
    fromDrive,
    h('div.mu.tiny', { style: { marginTop: '8px', lineHeight: 1.6 } }, '「同步版」是你之前用的「注射與體重記錄 同步版」app。按上面的按鈕，可以把它存在 Google Drive 的記錄搬過來；只會讀取，不會改動同步版，可以重複按，不會重複加入。'),
    sub('其他：用文字或檔案存檔、搬資料'),
    ta, h('div.grid2', { style: { marginTop: '8px' } }, gen, use),
    h('label', '或選擇存檔檔案（.json 或 .txt）'), file, msg,
    h('div.mu.tiny', { style: { marginTop: '6px', lineHeight: 1.6 } }, '「產生存檔文字」會把全部記錄變成一段文字，可以複製貼到記事本或傳給自己保存。貼上或選擇檔案後，app 會自動判斷：MetaPulse 的存檔會「還原」（用它取代現在全部的資料，要再按一次確認）；同步版的存檔會「匯入」（只加入新的記錄，可以重複做）。'),
    out,
  ];
  return section('backup', '備份與匯入', sumEl, body, !linked() || !S.entries.length);
}
