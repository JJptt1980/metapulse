/* 桌面小工具（只有 Maple app）：把斷食開始、預計結束、各階段時間與熱血雞湯交給原生小工具
 * 原生端（MapleWidget 外掛）存進 SharedPreferences，小工具自己倒數，不必開 app */
import { S } from './state.js';
import { capPlugin } from './health.js';
import { fastInfo } from './ui/fasting.js';
import { FASTING } from './config.js';
import { stageStarts } from './fasting.js';
import { WIDGET_MESSAGES, WIDGET_EATING } from './messages.js';

const H = 3600000;
export function widgetData(now = Date.now()) {
  const fi = fastInfo(now);
  // termBar：終端機小工具進度條的符號（滿／空／前後括號），改這裡就好，不用重裝 APK
  const base = { msgs: WIDGET_MESSAGES, eating: WIDGET_EATING, updated: now, termBar: { full: '■', empty: '□', open: '[', close: ']' } };
  if (!fi.start) return { ...base, fasting: false, start: 0 };
  return { ...base, fasting: !!fi.fasting, start: fi.start, end: fi.end || 0,
    stages: stageStarts(fi.shift || 0).map((h, i) => ({ at: fi.start + h * H, text: FASTING.stages[i].short + '：' + FASTING.stages[i].text })) };
}

let timer = null;
export function updateWidgetSoon() { clearTimeout(timer); timer = setTimeout(() => { updateWidget().catch(() => {}); }, 1200); }
export async function updateWidget() {
  const P = capPlugin('MapleWidget');
  if (!P || !S) return;
  await P.update({ data: JSON.stringify(widgetData()) });
}
