/* 設定頁：Google Drive 備份、備份文字、從同步版匯入 */
import { S, L, commit, commitLocal, replaceState } from '../state.js';
import { h, toast, fold } from './common.js';
import { connect, disconnect, syncNow, linked, ready, driveStatus, onDrive, readSyncBackup } from '../drive.js';
import { normalizeState } from '../storage.js';
import { parseSyncBackup, previewImport, applyImport } from '../migrate.js';

/* ---------- Google Drive ---------- */
export function driveCard() {
  const card = h('div.card', h('h2', 'Google Drive 雲端備份'));
  const st = h('div.small', { style: { marginTop: '-4px' } });
  const main = h('button.pri.full', { type: 'button' });
  const off = h('button.ghost.full', { type: 'button', onclick: () => { disconnect(); draw(); } }, '中斷連線');
  main.onclick = () => { if (linked() && ready()) syncNow(); else connect(true); };
  const draw = () => {
    st.textContent = driveStatus();
    main.textContent = linked() ? (ready() ? '立即同步' : '重新連線 Google Drive') : '連線 Google Drive';
    off.style.display = linked() ? '' : 'none';
  };
  onDrive(() => { if (card.isConnected) draw(); });
  card.append(st,
    h('div.mu.tiny', { style: { marginTop: '6px', lineHeight: 1.6 } }, '登入你自己的 Google 帳號後，資料會備份到你 Drive 裡的隱藏應用程式資料夾（metapulse.json），只有這個網頁能讀寫，作者看不到。之後每次修改都會自動備份；本機與雲端以最後修改時間較新的為準，不會合併。'),
    main, off);
  draw();
  return card;
}

/* ---------- 備份文字 ---------- */
export function backupTextCard() {
  const ta = h('textarea', { rows: 4, placeholder: '備份文字' });
  const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain' });
  const msg = h('div.mu.small', { style: { marginTop: '6px' } });
  file.onchange = async () => {
    const f = file.files && file.files[0]; if (!f) return;
    try { ta.value = await f.text(); msg.textContent = '已讀入「' + f.name + '」，確認後按「從文字還原」。'; } catch (e) { msg.textContent = '讀取檔案失敗。'; }
    file.value = '';
  };
  const body = [
    h('div.mu.small', { style: { marginTop: '8px' } }, '沒連線 Google Drive 時，資料只存在這支手機的瀏覽器，清除瀏覽資料或換手機會遺失。建議定期產生備份文字另存。'),
    ta, h('label', '或選擇備份檔（.json 或 .txt）'), file,
    h('div.grid2',
      h('button.ghost.full', { type: 'button', onclick: () => { ta.value = JSON.stringify(S); ta.select(); L.lastBackup = Date.now(); commitLocal(); msg.textContent = '已產生（' + S.entries.length + ' 筆身體記錄、' + S.meals.length + ' 筆餐點），請全選複製另存。'; } }, '產生備份文字'),
      h('button.ghost.full', {
        type: 'button', onclick: () => {
          let p;
          try { p = JSON.parse(ta.value.replace(/```(json)?/g, '').trim()); } catch (e) { msg.textContent = '格式不正確，請貼上完整的 MetaPulse 備份文字。'; return; }
          if (p && Array.isArray(p.entries) && !Array.isArray(p.meals)) { msg.textContent = '這看起來是同步版的備份，請用下方「從同步版匯入」，不會覆蓋現有資料。'; return; }
          if (!p || !Array.isArray(p.meals)) { msg.textContent = '格式不正確，請貼上完整的 MetaPulse 備份文字。'; return; }
          if (!ta.dataset.c) { ta.dataset.c = 1; msg.textContent = '還原會取代目前所有資料，再按一次「從文字還原」確認。'; setTimeout(() => { ta.dataset.c = ''; }, 5000); return; }
          ta.dataset.c = '';
          replaceState(normalizeState(p));
          msg.textContent = '已還原 ' + S.entries.length + ' 筆身體記錄、' + S.meals.length + ' 筆餐點。'; toast('已還原');
        },
      }, '從文字還原')),
    msg,
  ];
  return h('div.card', fold('data', h('h2', { style: { margin: 0 } }, '備份文字'), body));
}

/* ---------- 從同步版匯入 ---------- */
export function syncImportCard() {
  const out = h('div', { style: { marginTop: '10px' } });
  const ta = h('textarea', { rows: 3, placeholder: '貼上同步版「產生備份文字」的內容' });
  const file = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain' });
  let pv = null;

  const show = (parsed, source) => {
    out.textContent = '';
    try { pv = previewImport(parsed, S.entries, S.profile); } catch (e) { out.append(h('div.notice', e.message)); return; }
    const pf = pv.profile, pl = [];
    if (pf.height) pl.push('身高 ' + pf.height + ' cm');
    if (pf.targetWeight) pl.push('目標體重 ' + pf.targetWeight + ' kg');
    if (pf.halfLife) pl.push('半衰期 ' + pf.halfLife + ' 小時');
    const box = h('div', { style: { background: 'var(--soft)', borderRadius: '12px', padding: '10px 12px', lineHeight: 1.8 } },
      h('div.small', h('b', '來源：'), source),
      h('div.small', '共 ' + pv.total + ' 筆' + (pv.from ? '（' + pv.from + ' ～ ' + pv.to + '）' : '')),
      h('div.small', '新增 ', h('b', pv.add.length), ' 筆・更新 ', h('b', pv.update.length), ' 筆・已存在略過 ', pv.dup, ' 筆' + (pv.bad ? '・日期格式錯誤略過 ' + pv.bad + ' 筆' : '')),
      pl.length ? h('div.small', '個人資料：' + pl.join('、')) : null);
    out.append(box);
    if (!pv.add.length && !pv.update.length && !pl.length) { out.append(h('div.notice.ok', '沒有新的資料，MetaPulse 已經是最新的。')); return; }
    const go = h('button.pri.full', { type: 'button' }, '確認匯入');
    go.onclick = () => {
      const r = applyImport(S, pv);
      commit(); pv = null;
      out.textContent = '';
      out.append(h('div.notice.ok', '✓ 已新增 ' + r.added + ' 筆、更新 ' + r.updated + ' 筆。同步版的資料沒有被改動。'),
        h('div.notice', '移植完成前可以繼續用同步版記錄，之後再匯入一次即可（不會重複）。全部功能移植完成後，請改在 MetaPulse 記錄。'));
      toast('匯入完成');
    };
    out.append(go);
  };

  const fromDrive = h('button.ghost.full', { type: 'button' }, '從 Google Drive 讀取同步版備份');
  fromDrive.onclick = async () => {
    if (!ready()) { out.textContent = ''; out.append(h('div.notice', '請先在上方連線 Google Drive（同一個 Google 帳號），再按一次。')); return; }
    fromDrive.disabled = true; out.textContent = ''; out.append(h('div.row.small.mu', h('span.spin'), '讀取中…'));
    try { show(parseSyncBackup(await readSyncBackup()), 'Google Drive（dose-tracker-sync.json）'); }
    catch (e) { out.textContent = ''; out.append(h('div.notice', e.message === 'auth' ? 'Google Drive 需要重新連線。' : '讀取失敗：' + e.message)); }
    fromDrive.disabled = false;
  };
  file.onchange = async () => {
    const f = file.files && file.files[0]; if (!f) return;
    try { const t = await f.text(); ta.value = t; show(parseSyncBackup(t), '檔案「' + f.name + '」'); }
    catch (e) { out.textContent = ''; out.append(h('div.notice', e.message)); }
    file.value = '';
  };
  const prev = h('button.ghost.full', { type: 'button', onclick: () => { try { show(parseSyncBackup(ta.value), '貼上的備份文字'); } catch (e) { out.textContent = ''; out.append(h('div.notice', e.message)); } } }, '預覽');

  const body = [
    h('div.mu.small', { style: { marginTop: '8px', lineHeight: 1.6 } }, '把「注射與體重記錄 同步版」的記錄搬過來。只會讀取同步版的資料，不會修改它；可以重複匯入，已經匯入過的不會重複加入，同步版改過的會更新。'),
    fromDrive,
    h('label', '或貼上同步版的備份文字'), ta, prev,
    h('label', '或選擇同步版的備份檔'), file,
    out,
  ];
  return h('div.card', fold('sync-import', h('h2', { style: { margin: 0 } }, '從同步版匯入'), body, { open: !S.entries.length }));
}
