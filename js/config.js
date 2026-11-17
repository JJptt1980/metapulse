/* 所有可調整的係數與門檻集中在這裡。改數字即可，不需要改其他程式。 */

/** 點數：大約 40 kcal ≈ 1 點；蛋白質較便宜、脂肪較貴、纖維折抵。
 *  點數 = 蛋白質g×4÷50 + 碳水g×4÷40 + 脂肪g×9÷35 − 纖維g÷5 */
export const POINTS = {
  proteinKcalPerG: 4, proteinKcalPerPoint: 50,
  carbKcalPerG: 4, carbKcalPerPoint: 40,
  fatKcalPerG: 9, fatKcalPerPoint: 35,
  fiberGPerPoint: 5,
  roundTo: 0.5,
};

/** 預算：TDEE 與 kcal 換算成點數 */
export const BUDGET = {
  kcalPerPoint: 40,          // 週點數池與保底用
  kcalPerKgFat: 7700,        // 每公斤體重約等於多少 kcal 赤字
  maxWeeklyLossPct: 1,       // 每週目標減重上限（佔體重 %）
  defaultWeeklyLossPct: 0.5, // 沒填「預計達成週數」時的預設每週減重（%），使用者可在設定改
  rollingDays: 7,            // 週點數池採 7 天滾動
  proteinPerKgDefault: 1.2,
  activityDefault: 1.2,
  exerciseRefund: 0.75,     // 運動回補：消耗 kcal × 0.75 ÷ 40（手錶通常高估消耗）
};

/** 活動係數選項（算 TDEE 用） */
export const ACTIVITY_LEVELS = [
  [1.2, '久坐（幾乎不運動）'],
  [1.375, '輕度（每週運動 1～3 天）'],
  [1.55, '中度（每週運動 3～5 天）'],
  [1.725, '高度（每週運動 6～7 天）'],
];

/** 份量 */
export const PORTION = {
  quick: [0.5, 1, 1.5, 2],
  sliderMin: 0.1, sliderMax: 1.5, sliderStep: 0.05,
};
