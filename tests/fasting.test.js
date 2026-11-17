import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentFast, mealShift, stageAt, hourlyMessage, hybridSuggestion, eatingWindow } from '../js/fasting.js';
import { longTermIndex, weightTrend, longTermMessage } from '../js/longterm.js';
import { HOURLY_MESSAGES } from '../js/messages.js';
import { addDays } from '../js/points.js';

const H = 3600000;
const t0 = new Date(2026, 10, 17, 20, 0).getTime();
const meal = (h, kcal = 500, carb = 50, g = 'g' + h) => ({ id: 'm' + h, group: g, at: new Date(t0 - h * H).toISOString(), kcal, carb });

test('距上一餐的時間；手動開始與結束', () => {
  const ms = [meal(10), meal(5)];
  let f = currentFast(ms, [], t0);
  assert.equal(f.hours, 5);
  assert.equal(f.manual, false);
  f = currentFast(ms, [{ start: new Date(t0 - 2 * H).toISOString(), end: null }], t0);
  assert.equal(f.hours, 2);
  assert.equal(f.manual, true);
  f = currentFast(ms, [{ start: new Date(t0 - 4 * H).toISOString(), end: new Date(t0 - 1 * H).toISOString() }], t0);
  assert.equal(f.hours, 1, '結束斷食後重新計算');
  assert.equal(currentFast([], [], t0).start, null);
});

test('大餐把階段往後挪', () => {
  assert.equal(mealShift([meal(1, 500, 50)]), 0);
  assert.equal(mealShift([meal(1, 900, 50)]), 1);
  assert.equal(mealShift([meal(1, 600, 80, 'x'), meal(1, 700, 90, 'x')]), 2);
  assert.equal(stageAt(12.5, 0).index, 2);
  assert.equal(stageAt(12.5, 1).index, 1);
  assert.equal(stageAt(3, 2).index, 0);
  assert.equal(stageAt(25, 0).index, 4);
});

test('每小時提示：同一小時固定、超過 24 用 24、20 小時後不鼓勵再撐', () => {
  const a = hourlyMessage(0.2, 123, HOURLY_MESSAGES), b = hourlyMessage(0.9, 123, HOURLY_MESSAGES);
  assert.equal(a, b);
  assert.equal(hourlyMessage(30, 1, HOURLY_MESSAGES), HOURLY_MESSAGES[24][0]);
  for (let h = 20; h <= 24; h++) for (const s of HOURLY_MESSAGES[h]) assert.doesNotMatch(s, /再撐|堅持下去|多撐/);
});

test('依施打週期建議', () => {
  const es = [{ date: '2026-11-15', dose: 5 }];
  assert.equal(hybridSuggestion(es, '2026-11-15').plan, '18:6');
  assert.equal(hybridSuggestion(es, '2026-11-17').day, 3);
  assert.equal(hybridSuggestion(es, '2026-11-17').plan, '18:6');
  assert.equal(hybridSuggestion(es, '2026-11-18').plan, '16:8');
  assert.equal(hybridSuggestion(es, '2026-11-25').plan, '16:8');
  assert.equal(hybridSuggestion(es, '2026-11-16', { fastLoss: true }).plan, '16:8');
  assert.equal(hybridSuggestion(es, '2026-11-16', { lowIntake: true }).plan, '16:8');
  const none = hybridSuggestion([], '2026-11-17');
  assert.equal(none.plan, '16:8');
  assert.equal(none.hasDose, false);
});

test('進食窗口，含跨午夜', () => {
  const at = (h, m = 0) => new Date(2026, 10, 17, h, m).getTime();
  let w = eatingWindow('16:8', '12:00', at(13));
  assert.equal(w.inWindow, true);
  assert.equal(new Date(w.closesAt).getHours(), 20);
  w = eatingWindow('16:8', '12:00', at(21));
  assert.equal(w.inWindow, false);
  assert.equal(new Date(w.opensAt).getDate(), 18);
  w = eatingWindow('18:6', '20:00', at(1)); // 20:00～02:00
  assert.equal(w.inWindow, true);
  w = eatingWindow('24H', '18:00', at(18, 30));
  assert.equal(w.eatHours, 1);
  assert.equal(w.inWindow, true);
});

test('長期指數：跳過沒記錄與記錄不完整的日子，資料足夠才提示', () => {
  const today = '2026-11-30';
  const ms = [];
  for (let i = 1; i <= 25; i++) ms.push({ at: new Date(addDays(today, -i) + 'T12:00:00').toISOString(), kcal: 1400 });
  ms.push({ at: new Date(addDays(today, -26) + 'T12:00:00').toISOString(), kcal: 200 }); // 不完整
  ms.push({ at: new Date(today + 'T08:00:00').toISOString(), kcal: 100 });               // 今天不算
  const lt = longTermIndex(ms, 2000, today);
  assert.equal(lt.validDays, 25);
  assert.equal(lt.ready, true);
  assert.ok(Math.abs(lt.index - 0.7) < 1e-9);
  assert.equal(lt.level, 'veryLow');
  assert.match(longTermMessage(lt, { fast: true }), /明顯偏低.*體重下降速度偏快/);
  const few = longTermIndex(ms.slice(0, 10), 2000, today);
  assert.equal(few.ready, false);
  assert.equal(longTermMessage(few, null), null);
});

test('體重下降速度（14 天平均）', () => {
  const today = '2026-11-30', es = [];
  for (let i = 0; i < 28; i++) es.push({ date: addDays(today, -i), wt: 100 - (27 - i) * 0.2 }); // 每天 -0.2 kg ≈ 每週 1.4%
  const w = weightTrend(es, today);
  assert.ok(w.weeklyPct > 1.3 && w.weeklyPct < 1.6);
  assert.equal(w.fast, true);
  assert.equal(weightTrend(es.slice(0, 3), today).weeklyPct, null);
});

test('手動修改的時間最優先，記下一餐就失效', async () => {
  const { fastEnd, lastMealGroup } = await import('../js/fasting.js');
  const ms = [meal(5, 500, 50, 'gA')];
  assert.deepEqual(currentFast(ms, [], t0).source, { type: 'meal', group: 'gA' });
  // 改早到上一餐之前也照改
  let ov = { group: lastMealGroup(ms, t0), start: t0 - 9 * H };
  let f = currentFast(ms, [], t0, ov);
  assert.equal(f.hours, 9);
  assert.equal(f.source.type, 'override');
  // 結束斷食留下的時間點也被手動時間蓋過
  f = currentFast(ms, [{ id: 'x', start: new Date(t0 - 4 * H).toISOString(), end: new Date(t0 - 1 * H).toISOString() }], t0, ov);
  assert.equal(f.hours, 9);
  // 記了新的一餐 → 失效
  f = currentFast([...ms, meal(1, 500, 50, 'gB')], [], t0, ov);
  assert.equal(f.hours, 1);
  // 預計結束：只改開始 → 依目標往後推；改了結束 → 用結束
  let e = fastEnd(t0 - 9 * H, 16, ov, t0);
  assert.equal(e.left, 7);
  assert.ok(Math.abs(e.pct - 56.25) < 1e-9);
  e = fastEnd(t0 - 9 * H, 16, { end: t0 - 1 * H }, t0);
  assert.equal(e.left, -1);
  assert.equal(e.custom, true);
  assert.ok(Math.abs(e.pct - 112.5) < 1e-9);
  assert.equal(fastEnd(t0 - 2 * H, 16, { end: t0 - 3 * H }, t0).custom, false, '結束早於開始時不採用');
});
