# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MetaPulse ("Maple") is a pure-frontend personal tracker for food points (Gemini photo/text recognition), a 7-day rolling points pool, fasting, and dose/weight/BP records. No server, no bundler. It is deployed to GitHub Pages (https://killnopig.github.io/metapulse/) by pushing `main`. A Capacitor Android wrapper lives in a separate local project, `~/metapulse-app`, which loads the Pages URL (`server.url`) and adds native plugins: Health Connect, notifications, share, and filesystem.

The full product spec is `PROMPT.md`. It is gitignored and must never be committed. The repo is public, so never commit personal health data.

## Working with the user

- Reply in Traditional Chinese. UI text must be readable at a 7th-grade level; add a short note when a term needs one.
- When the user gives new requirements or feedback, first reply with a plan. Don't edit, commit, or deploy until the user says 「可以」 or 「可以做」.
- Shell commands given to the user must be zsh-pasteable: chain with `&&`, no `#` comments.
- Each tab should be at most about two phone screens long. Put secondary content in collapsible `fold()` sections.

## Commands

```bash
npm test                                   # node --test tests/*.test.js
node --test tests/sync.test.js             # one file
node --test --test-name-pattern="合併" tests/   # tests whose name matches
python3 -m http.server 8000                # local preview (ES modules need http://, not file://)
```

There is no build or lint step. Tests import the pure modules in `js/` directly. `package.json` sets `"type":"module"`.

## Release / cache busting

- The version lives in `index.html` as `window.APP_VERSION = 'x.y.z'`. Bump it on every deploy, then commit and push `main`.
- The app polls for that regex and shows an "update available" prompt.
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
- `longterm.js`: EMA of daily kcal ÷ BMR. `messages.js` holds the hourly fasting texts.
- `records.js`, `migrate.js`: dose/body/BP helpers and import from the old "dose-tracker-sync" app's backup.
  - Two records are the same only if they have the same `sid` and the same date.
- `sync.js`: merge two states by id (newer `ts` wins), with tombstones in `S.deleted` and `activity` merged by date.
- `gemini.js`: Interactions API with a JSON schema, falling back to `generateContent`.
  - The API that worked is remembered in `L.geminiApiOk`. `FOOD_SCHEMA` is shared by photo and text input.
- `health.js`: reads Health Connect through `@capgo/capacitor-health`. Only active in the native APK (`isNative`).

**State** (`state.js`, `storage.js`):
- `S` holds synced records in localStorage key `metapulse-v1`: entries, meals, foodLibrary, fasts, activity, profile, prefs, deleted, ts. `L` holds device-only settings in `metapulse-local`: API key, theme, fx toggles, fold state. Undo lives in `metapulse-v1-undo`.
- Always mutate `S` and then call `commit()`. It records deletions as tombstones, saves, and triggers a Drive push.
- `replaceState(n, fromRemote)` swaps in a whole state.

**Drive** (`drive.js`):
- Uses GSI token client with `drive.appdata` scope. The app's file is `metapulse.json`.
- `pullAndMerge` and `pushRemote` always merge through `sync.js` before writing; they never overwrite.

**UI** (`js/ui/*`):
- Hand-built DOM with `h()` from `ui/common.js`, which also provides `fold`, `section`, `openSheet`, `toast`, and `kvTable`.
- `app.js` wires the four bottom tabs (今日 / 記錄 / 圖表 / 設定) and re-renders on state changes.
- `ui/fx.js` effects are all original: CSS, SVG gears, Web Audio, and `speechSynthesis`. Don't add copyrighted audio or images.
- Chart.js is lazy-loaded from cdnjs in `ui/charts.js`.

## Hard constraints

- Only touch localStorage keys `metapulse-v1`, `metapulse-local`, and `metapulse-v1-undo`. Other apps share the origin (e.g. `dosetrack-v1-sync`); never read or write their keys.
- The old app's Drive file `dose-tracker-sync.json` is **read-only**: never write, modify, or delete it. Don't modify `~/dose-tracker-sync` or `~/dose-tracker-sync-app`.
- Never store photos in localStorage. Images are shrunk and sent straight to Gemini; optional thumbnails are 200px.
- The app is not a medical device. Wording may remind or suggest, never instruct.

## Android APK (`~/metapulse-app`)

Build with Java 21. Android Studio's bundled JBR is Java 25 and Gradle fails with "Unsupported class file major version 69":

```bash
export JAVA_HOME=~/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home && cd ~/metapulse-app && npx cap sync android && cd android && ./gradlew assembleDebug
```

Web-only changes need no rebuild, because the APK loads the Pages URL. Health Connect permissions are declared in `android/app/src/main/AndroidManifest.xml`.
