# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MetaPulse is a pure-frontend personal tracker for food points (Gemini photo/text recognition), a 7-day rolling points pool, fasting, and dose/weight/BP records. No server, no bundler. It is deployed to GitHub Pages (https://killnopig.github.io/metapulse/) by pushing `main`. A Capacitor Android wrapper lives in a separate local project, `~/metapulse-app`, which loads the Pages URL (`server.url`) and adds native plugins: Health Connect, notifications, share, and filesystem.

The full product spec is `PROMPT.md`. It is gitignored and must never be committed. The repo is public, so never commit personal health data.

## Naming

The app's user-facing name is **MetaPulse** everywhere (UI text, APK label, guide, privacy page). "Maple" is only an internal short form: the `MapleWidget` plugin, the `maple_widget` prefs, and the terminal widget's `$ maple fast` line.

## Working with the user

- Reply in Traditional Chinese. UI text must be readable at a 7th-grade level; add a short note when a term needs one.
- When the user gives new requirements or feedback, first reply with a plan. Don't edit, commit, or deploy until the user says 「可以」 or 「可以做」.
- Shell commands given to the user must be zsh-pasteable: chain with `&&`, no `#` comments.
- Minimal UI. Each tab must stay within two phone screens (about 1600px at 412px wide, with folds in their default state). Put secondary content in collapsible `fold()` sections.
- Every option, button, label, and fold summary must fit on one line. Shorten the text; CSS ellipsis is only a fallback. Explanatory text goes inside `tip()` from `ui/common.js`, which shows a one-line "ⓘ 說明" that expands on tap.

## Commands

```bash
npm test                                   # node --test tests/*.test.js
node --test tests/sync.test.js             # one file
node --test --test-name-pattern="合併" tests/   # tests whose name matches
python3 -m http.server 8000                # local preview (ES modules need http://, not file://)
```

Visual checks: headless Chrome (`--headless=new`) can't go narrower than about 500px, so to check the 412px phone width, load the page inside an iframe of that width and screenshot the wrapper. Use made-up data only and stop the local server afterwards.

There is no build or lint step. Tests import the pure modules in `js/` directly. `package.json` sets `"type":"module"`.

## Release / cache busting

- The version lives in `index.html` as `window.APP_VERSION = 'x.y.z'`. Bump it on every deploy, then commit and push `main`.
- The app polls for that regex and shows an "update available" prompt.
- After pushing, poll the live site with curl until it serves the new `APP_VERSION`; only then is the deploy done.
- `index.html` builds an import map that appends `?v=APP_VERSION` to every module. **Every new module must be added to the module list in `index.html`**, or it will be served from stale cache or fail to resolve.

## Architecture

**Pure logic** (`js/*.js`, unit-tested, no DOM):
- `config.js`: all tunable coefficients (`POINTS`, `BUDGET`, `PORTION`, `FASTING`, `LONGTERM`). Change numbers here, not inline.
- `points.js`:
  - Points: `protein×4/50 + carb×4/40 + fat×9/35 − fiber/5`, never below 0, rounded to 0.5.
  - BMR/TDEE; 7-day rolling pool `(TDEE×7 − weekly deficit)/40`; daily floor `BMR/40`; exercise refund.
- `units.js`, `foods.js`: serving/gram/fist conversion and food-library search.
- `fasting.js`: current fast, stages shifted by big meals, end/percent, hybrid-mode suggestion, eating window.
  - Priority: manual override (`S.prefs.fastOverride`), then manual fast records (`S.fasts`), then last meal.
  - The override stays valid until a new meal group is logged.
  - Before 「結束進餐」 is pressed the UI shows stage 0 「進食中」 (no countdown). The fast starts automatically `S.prefs.fastAutoHours` hours after the last meal (default `FASTING.fastingFromHours` = 2; 0 = never), set in the settings tab.
- `longterm.js`: EMA of daily kcal ÷ BMR. `messages.js` holds the hourly fasting texts.
- `records.js`, `migrate.js`: dose/body/BP helpers and import from the old "dose-tracker-sync" app's backup.
  - Two records are the same only if they have the same `sid` and the same date.
- `sync.js`: merge two states by id (newer `ts` wins), with tombstones in `S.deleted` and `activity` merged by date. The merged collections are listed in `COLS` (entries, meals, foodLibrary, fasts, medLog, exercise); a new synced collection must be added there.
- `sync.js` also has `backupReminder` (today-tab "too long without backup" banner).
- `omron.js`: parses Omron CSV files and builds an import plan via `planMeasurements`. Undo shares `metapulse-v1-undo` with Health Connect.
- `summary.js`: builds the plain-text data summary for AI, including daily food stats and fasting hours (`dailyFast`).
- `gemini.js`: Interactions API with a JSON schema, falling back to `generateContent`.
  - The API that worked is remembered in `L.geminiApiOk`. `FOOD_SCHEMA` is shared by photo and text input.
- `ledger.js`: the points "passbook". Per day: budget = pool/7 + exercise refund, left = budget − eaten; the balance sums `left` over a window chosen in `S.prefs.weekStart` (rolling 7 days / from Sunday / from Monday). `allActivity(S)` combines Health Connect activity with manual `S.exercise` (kcal = MET × kg × hours, types in `config.js` `EXERCISES`).
- `notify.js`: local notifications (native only). ID ranges: meds 7000+, dose day 7100, test 7199, fasting 7200–7239. Fasting reminders come from `fastNotes()` in `fasting.js` (frequency and quiet hours live in `L.notify`).
- `widget.js`: builds the home-screen widget data (fast start/end, stages, `WIDGET_MESSAGES` / `WIDGET_EATING` from `messages.js`, terminal bar symbols) and hands it to the APK's `MapleWidget` plugin on every change and when the page is hidden.
- `lines.js`: the widget/card fuel line and pep-talk lines. Each is a head × tail combination, one per 2 minutes, with no repeats within a fast (each segment needs heads × tails ≥ its minutes ÷ 2; `tests/lines.test.js` checks this). The order is shuffled per fast-start date. `widget.js` precomputes a `timeline` (2-minute slots up to hour 30) for the APK, which shows the next 16 slots in ViewFlippers.
- `sounds.js`: user-chosen start/end sounds stored on the device in IndexedDB `metapulse-sounds` (≤2MB each), never in the repo.
- `health.js`: reads Health Connect through `@capgo/capacitor-health`. Only active in the native APK (`isNative`).

**State** (`state.js`, `storage.js`):
- `S` holds synced records in localStorage key `metapulse-v1`: entries, meals, foodLibrary, fasts, medLog, exercise, activity, profile, prefs (incl. `meds`, `weekStart`), deleted, ts. `L` holds device-only settings in `metapulse-local`: API key, theme, fx toggles, fold state, notification settings. The default theme is light; it follows the system only if the user picked "auto" themselves (`L.themeChosen`). Undo lives in `metapulse-v1-undo`.
- Always mutate `S` and then call `commit()`. It records deletions as tombstones, saves, and triggers a Drive push.
- `replaceState(n, fromRemote)` swaps in a whole state.

**Drive** (`drive.js`):
- Uses GSI token client with `drive.appdata` scope. The app's file is `metapulse.json`.
- `pullAndMerge` and `pushRemote` always merge through `sync.js` before writing; they never overwrite.

**UI** (`js/ui/*`):
- Hand-built DOM with `h()` from `ui/common.js`, which also provides `fold`, `section`, `openSheet`, `toast`, and `kvTable`.
- `app.js` wires the four bottom tabs (飲食運動 = `today.js`, 身體 = `log.js`, 圖表 = `charts.js`, 設定 = `settings.js`) and re-renders on state changes.
- `ui/fx.js` effects are all original: CSS, SVG gears, Web Audio, and `speechSynthesis`. Don't add copyrighted audio or images. (`assets/zawarudo.m4a` is original: generated with macOS `say -v "Grandpa (中文（台灣）)"` and `afconvert`, so it may stay.)
- Chart.js is lazy-loaded from cdnjs in `ui/charts.js`.
- Back gesture: the APK's `MainActivity` (`OnBackPressedCallback`) calls `window.__mpBack()` (`app.js`), which uses `backLayer()` in `ui/common.js`. Order: user-opened folds inside the sheet → the sheet → user-opened folds on the page → back to the today tab → 「再滑一次就離開」 toast (a second swipe within 2s exits). Any new overlay must hook into this chain, or a swipe closes the app.

## Landing page (`landing/`)

A separate promotional page (`index.html`, `style.css`, `main.js`, `og.png`) at `/metapulse/landing/`. Landing tasks must not touch the app itself and need no `APP_VERSION` bump. Its spec is `LANDING_PROMPT.md`, which, like `PROMPT.md`, is gitignored and never committed. The copy is public, so it must stay conservative:
- No weight-loss claims, "燃脂", "肝醣耗盡", drug or injection names. Meds appear only as 「用藥與注射提醒」.
- Points, calories, and nutrients are always 「估算」, and every mock screen is labelled 「示意畫面，非真實資料」.

## Hard constraints

- Only touch localStorage keys `metapulse-v1`, `metapulse-local`, and `metapulse-v1-undo`. Other apps share the origin (e.g. `dosetrack-v1-sync`); never read or write their keys.
- The old app's Drive file `dose-tracker-sync.json` is **read-only**: never write, modify, or delete it. Don't modify `~/dose-tracker-sync` or `~/dose-tracker-sync-app`.
- Never store photos in localStorage. Images are shrunk and sent straight to Gemini; optional thumbnails are 200px.
- The app is not a medical device. Wording may remind or suggest, never instruct.
- The user's own sound files (e.g. JoJo mp3s) must never enter the repo; they are only loaded through the in-app custom-sound feature.
- Never copy the user's real health data to temporary or served locations (test harnesses, local servers). Use made-up data for tests.

## Android APK (`~/metapulse-app`)

Build with Java 21. Android Studio's bundled JBR is Java 25 and Gradle fails with "Unsupported class file major version 69":

```bash
export JAVA_HOME=~/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home && cd ~/metapulse-app && npx cap sync android && cd android && ./gradlew assembleDebug
```

Web-only changes need no rebuild, because the APK loads the Pages URL. Bump `versionCode` / `versionName` in `android/app/build.gradle` for each new APK.

Release signing: the keystore and `keystore.properties` live in `~/metapulse-app/release/` (gitignored; the user must back them up). `./gradlew assembleRelease` signs with it when the file exists. Moving a phone from the debug APK to the release APK requires uninstalling first (different signature).

Official APK releases are published as GitHub Releases in this repo, with tags like `apk-1.0.0` and `MetaPulse.apk` attached (the landing page links to `releases/latest/download/MetaPulse.apk`). Publishing a non-prerelease `apk-*` Release triggers `.github/workflows/fb-post.yml`, which posts the release notes plus the landing link to the MetaPulse Facebook Page. The Release notes are public copy, so they follow the landing-page wording rules. The Page ID and token live only in the repo Secrets `FB_PAGE_ID` / `FB_PAGE_TOKEN` and are never committed. The workflow can also be run by hand from the Actions tab (dry run by default).

Home-screen widgets: `FastingWidget` (normal), `FastingTermWidget` (terminal style, 4×2) and `FastingSmallWidget` (terminal, labelled 3×2) share `FastingWidget.compute()`, which reads the JSON the web wrote through `MapleWidgetPlugin` into SharedPreferences `maple_widget`. The countdown runs on a system `Chronometer`; everything else is recomputed only on app updates or about every 30 minutes. Terminal bar symbols come from the web (`termBar`), so changing them needs no APK rebuild. Health Connect permissions are declared in `android/app/src/main/AndroidManifest.xml`.
