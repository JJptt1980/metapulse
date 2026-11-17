# MetaPulse — 飲食、斷食與用藥記錄（Maple）

個人用的飲食點數、斷食與用藥記錄網頁 app。純前端、不需要伺服器，資料存在你自己的裝置。

**線上使用：** https://killnopig.github.io/metapulse/

> 本 app 是個人記錄與趨勢檢視工具，不是醫療器材，不提供診斷、治療或用藥建議。點數、熱量與營養素（含 AI 辨識結果）都是粗略估算。

## 目前進度

- [x] **Phase 1**：飲食點數（拍照／文字／常用食物／手動）、份量單位與滑桿、微調抽屜、常用食物庫、7 天滾動點數池、每日保底、蛋白質進度、個人資料與 Gemini 設定
- [x] Phase 2：注射、體重與體組成、血壓記錄與圖表；Google Drive 備份；從同步版匯入
- [x] Phase 3：斷食計時、階段、三種模式、每小時提示、長期攝取指數
- [ ] Phase 4：Omron CSV、圖表截圖與數據摘要、AI 轉換提示詞、備份提醒
- [ ] Phase 5：Android APK、Health Connect、運動回補、淨體重趨勢、本機通知

## 點數怎麼算

```
點數 = 蛋白質g×4÷50 + 碳水g×4÷40 + 脂肪g×9÷35 − 纖維g÷5
```

不小於 0，四捨五入到 0.5。大約 40 kcal ≈ 1 點；蛋白質較便宜、脂肪較貴、纖維折抵。

- 每日 TDEE = BMR × 活動係數。BMR 可手動輸入，沒有就用 Mifflin-St Jeor 估算。
- 每週赤字由（目前體重 − 目標體重）÷ 預計週數推算；沒填週數時用每週減重百分比（預設 0.5%，可調）。每週減重上限為體重的 1%。
- 7 天點數池 = （TDEE × 7 − 每週赤字 kcal）÷ 40，採滾動計算（今天往前 6 天加今天）。
- 每日保底預設 = BMR ÷ 40 點，只是提醒今天吃太少，不是要求吃到。
- 所有係數集中在 `js/config.js`。

## 從同步版搬資料

「設定」→「從同步版匯入」：

- 從 Google Drive 讀取同步版的備份檔 `dose-tracker-sync.json`（需先連線同一個 Google 帳號），或貼上同步版「產生備份文字」的內容、選擇備份檔。
- 匯入前預覽新增、更新、略過的筆數與日期範圍；身高、目標體重、半衰期一併帶入。
- 可以重複匯入：以同步版每筆記錄的 id 判斷，已匯入的略過，同步版改過的會更新；沒有 id 對應時用日期與數值判斷重複（血壓量測時間相差 2 分鐘內視為同一筆）。
- **只讀取同步版的資料，不會寫入、修改或刪除它。**

## Google Drive 備份

沿用同步版的 OAuth Client ID，scope 只用 `drive.appdata`。備份檔為 `metapulse.json`（包含 entries、meals、foodLibrary、fasts、profile、prefs）。每次修改後自動備份；本機與雲端以最後修改時間較新的為準，不合併。API key、主題、收合狀態等只存在本機，不列入備份。

## AI 辨識（Google Gemini）

1. 到 Google AI Studio 申請 API key。
2. 在「設定」→「AI 辨識」貼上 API key、填模型名稱（例如 `gemini-3.5-flash`），按「測試連線」。
3. API key 只存在這台裝置，不會列入備份。照片會先縮小到 1024px 再直接從手機送到 Google，app 不保存照片（可在設定開啟 200px 縮圖）。

預設使用 Interactions API（`response_format` 搭配 JSON schema 強制輸出 JSON），失敗時自動改用 `generateContent`（`responseJsonSchema`）。照片與文字共用同一個 schema（`js/gemini.js` 的 `FOOD_SCHEMA`）。

## 資料

- 本機儲存鍵：`metapulse-v1`（記錄，會備份）、`metapulse-local`（API key、主題、收合狀態等，只存在這台裝置）。同網域的其他 app（例如 `dosetrack-v1-sync`）的資料不會被讀寫。
- `entries` 沿用同步版的欄位（`date`、`dose`、`wt`、`sys`、`dia`、`pul`、`fat`、`mus`、`vis`、`bage`、`bmr`、`site`、`note`），另外加上 `time`（量測時間）與 `src`（來源）。
- `meals` 每一筆是一道食物，同一餐以 `group` 串起來；營養素以「一份」為基準存在 `per`，並存下當時算好的合計與點數。

## 斷食與長期指數

- 斷食時間＝距離最後一筆餐點的時間；也可以手動「從現在開始斷食」，記餐時自動結束。
- 階段（距上一餐）：0–4 小時消化中、4–12 開始使用肝醣、12–16 逐漸偏向脂肪、16–20 長時間斷食、20 以上蛋白質分解可能增加。上一餐超過 800 大卡或碳水 100 g 時整體往後挪 1 小時，超過 1200 大卡或 150 g 挪 2 小時。
- 三種模式：自由斷食、依施打週期（第 1～3 天建議 18:6、第 4～7 天 16:8；減重太快或長期指數有提示時一律 16:8；只建議不自動切換）、自選固定（16:8、18:6、20:4、24H 一天一餐，含進食窗口）。
- 每小時提示文字在 `js/messages.js`，可自行增刪。
- 長期攝取指數＝每天（熱量 ÷ 基礎代謝）的指數移動平均（α＝0.05），跳過沒記錄和記錄不完整（低於基礎代謝 30%）的日子；至少 21 個有效日且最近 28 天有 70% 以上才提示。
- 所有規則與門檻集中在 `js/config.js` 的 `FASTING`、`LONGTERM`。

## 開發

```bash
npm test
```

不使用打包工具：`index.html` 載入 `js/` 底下的 ES module。每個模組都透過 import map 加上 `?v=版本號`，更新後不會讀到舊快取；新增模組時記得把檔名加進 `index.html` 的模組清單。

發布新版：修改 `index.html` 裡的 `APP_VERSION`，推上 `main`。使用者開啟 app 或從背景切回時會看到「有新版本」提示。

```
index.html            頁面、樣式、版本號
js/config.js          可調係數
js/points.js          點數、BMR／TDEE、週點數池（純函數）
js/units.js           份／克／拳頭換算（純函數）
js/foods.js           常用食物搜尋排序（純函數）
js/gemini.js          Gemini API
js/storage.js         本機儲存與資料正規化
js/state.js           執行期狀態
js/ui/                各畫面
tests/                node --test
```

## 免責聲明

- 本 app 是個人記錄與趨勢檢視工具，不是醫療器材，不提供診斷、治療或用藥建議。
- 斷食期間若頭暈、心悸、極度不適，請結束斷食並進食。同時使用胰島素或磺醯脲類藥物者，斷食前請先諮詢醫師。
- 用藥、調整劑量或出現不適症狀時，請諮詢醫師或藥師；緊急狀況請立即就醫。
- 本 app 按現狀提供，不附任何保證。

## 授權

MIT License
