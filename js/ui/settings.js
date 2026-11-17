/* 設定分頁：個人資料與預算、AI 辨識、常用食物庫、外觀、資料、免責聲明 */
import { S, L, commit, commitLocal, plan, currentWeight } from '../state.js';
import { h, icon, toast, fold, pills, val, $ } from './common.js';
import { ACTIVITY_LEVELS, BUDGET } from '../config.js';
import { bmrMifflin, ageFrom } from '../points.js';
import { libraryManager } from './library.js';
import { itemCard } from './mealEditor.js';
import { analyzeMeal, listModels, DEFAULT_MODELS } from '../gemini.js';
import { normalizeState } from '../storage.js';

const r1 = x => Math.round(x * 10) / 10;

export const DISCLAIMER = [
  '本 app 是個人記錄與趨勢檢視工具，不是醫療器材，不提供診斷、治療或用藥建議。',
  '點數、熱量與營養素（包含 AI 辨識的結果）都是粗略估算，可能和實際有明顯差距，請當作參考。',
  '斷食期間若頭暈、心悸、極度不適，請結束斷食並進食。同時使用胰島素或磺醯脲類藥物者，斷食前請先諮詢醫師。',
  '「預估體內殘留」、BMI 分類、建議注射部位與下次注射日只是輔助提醒，請以醫師或藥師的指示和藥品仿單為準。用藥、調整劑量、漏打或出現不適症狀時，請諮詢醫師或藥師；緊急狀況請立即就醫。',
  '資料儲存在你自己的裝置；照片與文字描述會送到你自己設定的 Google Gemini API 辨識。請自行定期備份，作者不保證資料不會遺失。',
  '本 app 按現狀提供，不附任何保證，作者不對因使用或無法使用本 app 造成的任何後果負責。本 app 與任何藥廠或藥品品牌無關。',
];
export const legal = () => h('div.legal.mu.small', DISCLAIMER.map(t => h('p', t)));

export function applyTheme() {
  const de = document.documentElement;
  if (L.theme === 'light' || L.theme === 'dark') de.setAttribute('data-theme', L.theme); else de.removeAttribute('data-theme');
}

function field(label, input, hint) {
  return h('div', h('label', label), input, hint ? h('div.mu.tiny', { style: { marginTop: '3px' } }, hint) : null);
}
const numIn = (v, attrs = {}) => h('input.num', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: v > 0 ? v : '', ...attrs });

/* ---------- 個人資料 ---------- */
function profileCard() {
  const P = S.profile;
  const card = h('div.card', h('h2', '個人資料與每日預算'));
  const sum = h('div', { style: { marginTop: '14px' } });
  const save = () => { commit(); drawSum(); };
  const bind = (el, key, f = val) => { el.oninput = () => { P[key] = f(el); save(); }; return el; };

  const bmrEst = h('span');
  const bmrIn = bind(numIn(P.bmrManual, { placeholder: '自動估算' }), 'bmrManual');
  const floorIn = bind(numIn(P.floorPoints, { placeholder: '自動' }), 'floorPoints');
  const pctIn = bind(numIn(P.weeklyLossPct, { placeholder: String(BUDGET.defaultWeeklyLossPct), max: String(BUDGET.maxWeeklyLossPct) }), 'weeklyLossPct');
  const actSel = h('select', ...ACTIVITY_LEVELS.map(([v, t]) => h('option', { value: String(v) }, t + '（×' + v + '）')));
  actSel.value = String(P.activity || 1.2);
  if (actSel.value === '') { actSel.append(h('option', { value: String(P.activity) }, '自訂（×' + P.activity + '）')); actSel.value = String(P.activity); }
  actSel.onchange = () => { P.activity = +actSel.value; save(); };

  const hasEntryWt = S.entries.some(e => e.wt > 0);
  card.append(
    h('div.grid2',
      field('身高 (cm)', bind(numIn(P.height), 'height')),
      field('性別（估算 BMR 用）', pills([['M', '男'], ['F', '女']], P.sex, v => { P.sex = v; save(); }, 'seg'))),
    h('div.grid2',
      field('出生年（西元）', bind(numIn(P.birthYear, { inputmode: 'numeric', placeholder: '例如 1985' }), 'birthYear')),
      field('目前體重 (kg)', bind(numIn(P.weight), 'weight'), hasEntryWt ? '已有體重記錄，計算時使用最新一筆 ' + currentWeight() + ' kg' : null)),
    h('div.grid2',
      field('目標體重 (kg)', bind(numIn(P.targetWeight), 'targetWeight')),
      field('預計達成週數', bind(numIn(P.targetWeeks, { inputmode: 'numeric', placeholder: '可留空' }), 'targetWeeks'))),
    field('沒填週數時，每週減重 (% 體重)', pctIn, '預設 ' + BUDGET.defaultWeeklyLossPct + '%，上限 ' + BUDGET.maxWeeklyLossPct + '%。有填週數時以週數推算。'),
    field('活動係數（算 TDEE 用）', actSel),
    fold('prof-adv', h('span.small.mu', '進階：基礎代謝、蛋白質、保底'), [
      field('基礎代謝 BMR (kcal)', bmrIn, bmrEst),
      h('div.grid2',
        field('蛋白質目標 (g/kg)', bind(numIn(P.proteinPerKg, { placeholder: '1.2' }), 'proteinPerKg')),
        field('每日保底 (點)', floorIn, '預設 = BMR ÷ 40')),
    ]),
    sum);

  function drawSum() {
    const w = currentWeight();
    const est = bmrMifflin({ weight: w, height: +P.height, age: ageFrom(+P.birthYear), sex: P.sex });
    bmrEst.textContent = est ? '留空時依 Mifflin-St Jeor 估算：' + est + ' kcal（體重更新時跟著重算）' : '填好身高、體重、出生年後可自動估算';
    const b = plan();
    sum.textContent = '';
    if (!b.ok) { sum.append(h('div.notice', '還差身高、體重、出生年（或直接輸入 BMR），才能算出預算。')); return; }
    const row = (k, v) => h('div.row.between.small', h('span.mu', k), h('b.num', v));
    sum.append(h('div', { style: { background: 'var(--soft)', borderRadius: '12px', padding: '10px 12px' } },
      row('基礎代謝 BMR', b.bmr + ' kcal' + (b.bmrSource === 'estimate' ? '（估算）' : '')),
      row('每日消耗 TDEE', b.tdee + ' kcal'),
      row('每週目標減重', b.weeklyLossKg ? r1(b.weeklyLossKg) + ' kg（' + r1(b.weeklyLossPct) + '%，約 ' + b.deficitKcal + ' kcal 赤字）' : '不設赤字'),
      row('7 天點數池', b.poolPoints + ' 點（平均每天 ' + b.dailyPoints + '）'),
      row('每日保底', b.floorPoints + ' 點'),
      row('每日蛋白質', b.proteinTarget + ' g')));
    if (b.capped) sum.append(h('div.notice', '依目前設定每週要減 ' + r1(b.wantedPct) + '%，超過每週體重 1% 的上限，已改用 1%（' + r1(w * 0.01) + ' kg／週）計算。'));
  }
  drawSum();
  return card;
}

/* ---------- AI ---------- */
function aiCard() {
  const card = h('div.card', h('h2', 'AI 辨識（Google Gemini）'));
  const key = h('input', { type: 'password', value: L.geminiKey, placeholder: '貼上 API key', autocomplete: 'off', spellcheck: false });
  key.oninput = () => { L.geminiKey = key.value.trim(); commitLocal(); };
  const eye = h('button.ghost', { type: 'button', 'aria-label': '顯示或隱藏', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; } }, icon('eye'));
  const modelBox = h('div');
  const modelMsg = h('div.mu.tiny', { style: { marginTop: '4px' } });
  const drawModels = () => {
    modelBox.textContent = '';
    const list = (L.geminiModels && L.geminiModels.length ? L.geminiModels : DEFAULT_MODELS).slice();
    if (L.geminiModel && !list.includes(L.geminiModel)) list.unshift(L.geminiModel);
    const sel = h('select', { 'aria-label': '模型' },
      ...list.map(v => h('option', { value: v }, v + (v === 'gemini-3.5-flash-lite' ? '（預設）' : ''))),
      h('option', { value: '__custom' }, '自訂名稱…'));
    sel.value = L.geminiModel || list[0];
    const custom = h('input', { value: L.geminiModel, placeholder: '輸入模型名稱', autocomplete: 'off', spellcheck: false, style: { marginTop: '8px', display: 'none' } });
    custom.oninput = () => { L.geminiModel = custom.value.trim(); commitLocal(); };
    sel.onchange = () => {
      if (sel.value === '__custom') { custom.style.display = ''; custom.value = ''; custom.focus(); return; }
      custom.style.display = 'none'; L.geminiModel = sel.value; commitLocal();
    };
    const fetchBtn = h('button.ghost', { type: 'button', style: { whiteSpace: 'nowrap' } }, '取得可用模型');
    fetchBtn.onclick = async () => {
      fetchBtn.disabled = true; modelMsg.textContent = '查詢中…';
      try {
        const ms = await listModels(L.geminiKey);
        if (!ms.length) throw new Error('沒有找到可用的模型');
        L.geminiModels = ms; commitLocal(); drawModels();
        modelMsg.textContent = '已取得 ' + ms.length + ' 個可用模型。';
      } catch (e) { fetchBtn.disabled = false; modelMsg.textContent = '查詢失敗：' + (e.message || e); }
    };
    modelBox.append(h('div.row', h('div.grow', sel), fetchBtn), custom);
  };
  drawModels();
  modelMsg.textContent = L.geminiModels && L.geminiModels.length ? '' : '清單是內建的；按「取得可用模型」可查你的帳號實際能用哪些。';
  const api = h('select', h('option', { value: 'auto' }, '自動（先用 Interactions，失敗改 generateContent）'), h('option', { value: 'interactions' }, 'Interactions API'), h('option', { value: 'generateContent' }, 'generateContent'));
  api.value = L.geminiApi || 'auto';
  api.onchange = () => { L.geminiApi = api.value; commitLocal(); };
  const adv = h('input', { type: 'checkbox', checked: L.mealAdvice !== false });
  adv.onchange = () => { L.mealAdvice = adv.checked; commitLocal(); };
  const fast = h('input', { type: 'checkbox', checked: L.geminiFast !== false });
  fast.onchange = () => { L.geminiFast = fast.checked; commitLocal(); };
  const out = h('div.small', { style: { marginTop: '8px' } });
  const test = h('button.ghost.full', { type: 'button' }, '測試連線（估算「一顆水煮蛋」）');
  test.onclick = async () => {
    out.textContent = ''; out.append(h('span.spin'), ' 測試中…'); test.disabled = true;
    try {
      const r = await analyzeMeal({ key: L.geminiKey, model: L.geminiModel, api: L.geminiApi, prefer: L.geminiApiOk, fast: L.geminiFast !== false, text: '一顆水煮蛋' });
      if (L.geminiApiOk !== r.api) { L.geminiApiOk = r.api; commitLocal(); }
      const x = r.items[0];
      out.textContent = ''; out.append(h('div.notice.ok', '✓ 連線成功（' + r.api + '，' + (r.ms / 1000).toFixed(1) + ' 秒）：' + (x ? x.name + '，一份約 ' + Math.round(x.servingGrams) + ' g、' + Math.round(x.per.kcal) + ' kcal、蛋白質 ' + r1(x.per.protein) + ' g' : '沒有回傳食物')));
    } catch (e) { out.textContent = ''; out.append(h('div.notice', '✗ ' + (e.message || e))); }
    test.disabled = false;
  };
  card.append(
    h('label', 'API key'), h('div.row', h('div.grow', key), eye),
    h('label', '模型'), modelBox, modelMsg,
    h('label.row', { style: { color: 'var(--tx)', marginTop: '12px', fontSize: '15px' } }, fast, '速度優先（讓模型少思考）'),
    h('label.row', { style: { color: 'var(--tx)', marginTop: '8px', fontSize: '15px' } }, adv, '記錄後給這一餐回饋與下一餐建議'),
    fold('ai-adv', h('span.small.mu', '進階：API 介面'), [h('label', 'API 介面'), api]),
    test, out,
    h('div.mu.tiny', { style: { marginTop: '8px', lineHeight: 1.6 } },
      'API key 只存在這台裝置，不會列入備份；照片與文字直接從你的手機送到 Google。可到 Google AI Studio 申請 API key。'));
  return card;
}

/* ---------- 外觀與資料 ---------- */
function prefsCard() {
  const card = h('div.card', h('h2', '外觀與隱私'));
  const theme = h('select', h('option', { value: 'auto' }, '跟隨系統'), h('option', { value: 'light' }, '淺色'), h('option', { value: 'dark' }, '深色'));
  theme.value = L.theme; theme.onchange = () => { L.theme = theme.value; commitLocal(); applyTheme(); };
  const th = h('input', { type: 'checkbox', checked: !!L.keepThumbs });
  th.onchange = () => { L.keepThumbs = th.checked; commitLocal(); };
  card.append(h('label', '主題'), theme,
    h('label.row', { style: { color: 'var(--tx)', marginTop: '14px', fontSize: '15px' } }, th, '保存餐點縮圖（200px，會占用本機空間）'),
    h('div.mu.tiny', '預設不保存照片，只保存辨識結果。'));
  return card;
}

function dataCard() {
  const ta = h('textarea', { rows: 4, placeholder: '備份文字' });
  const msg = h('div.mu.small', { style: { marginTop: '6px' } });
  const body = [
    h('div.mu.small', 'Google Drive 備份與「從同步版匯入」會在下一階段加入。在那之前，可以先用備份文字另存。'),
    ta,
    h('div.grid2',
      h('button.ghost.full', { type: 'button', onclick: () => { ta.value = JSON.stringify(S); ta.select(); msg.textContent = '已產生（' + S.meals.length + ' 筆餐點、' + S.foodLibrary.length + ' 項常用食物），請全選複製另存。'; } }, '產生備份文字'),
      h('button.ghost.full', {
        type: 'button', onclick: () => {
          try {
            const p = JSON.parse(ta.value.replace(/```(json)?/g, '').trim());
            if (!p || !Array.isArray(p.meals)) throw 0;
            const n = normalizeState(p);
            Object.keys(S).forEach(k => delete S[k]); Object.assign(S, n);
            commit(); msg.textContent = '已還原 ' + S.meals.length + ' 筆餐點。'; toast('已還原');
          } catch (e) { msg.textContent = '格式不正確，請貼上完整的 MetaPulse 備份文字。'; }
        },
      }, '從文字還原')),
    msg,
  ];
  return h('div.card', fold('data', h('h2', { style: { margin: 0 } }, '備份與資料'), body));
}

export function renderSettings(root) {
  root.textContent = '';
  root.append(profileCard(), aiCard(),
    h('div.card', fold('lib', h('h2', { style: { margin: 0 } }, '常用食物庫'), [h('div', { style: { marginTop: '10px' } }, libraryManager(itemCard))])),
    prefsCard(), dataCard(),
    h('div.card', fold('legal', h('h2', { style: { margin: 0 } }, '關於本 app 與免責聲明'), [h('div', { style: { marginTop: '10px' } }, legal())])),
    h('p.mu.small', { style: { textAlign: 'center', margin: '18px 0 6px' } }, '覺得好用？', h('a', { href: 'https://ko-fi.com/killnopig', target: '_blank', rel: 'noopener', style: { color: 'var(--ac)' } }, '請我喝杯咖啡'), '（自願，不影響任何功能）'));
}

/** 首次開啟的免責聲明 */
export function showDisclaimerOnce() {
  if (L.disclaimerOk) return;
  const m = $('modal');
  m.textContent = '';
  m.append(h('div.card', h('h2', '使用前請閱讀'), legal(),
    h('button.pri.full', { type: 'button', onclick: () => { L.disclaimerOk = true; commitLocal(); m.classList.remove('on'); } }, '我了解了')));
  m.classList.add('on');
}
