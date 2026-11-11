# తెలుగు ఉచ్చారణ సాధన – Telugu Pronunciation Ladder

Speak-aloud reading practice: 10 levels × 30 questions (same concept order as the design plan, compressed).
Full spec: [Telugu_Pronunciation_App_Design_Plan.md](Telugu_Pronunciation_App_Design_Plan.md).


Plain HTML + CSS + JavaScript ES modules. No framework, no build step.

**Class progress in a Google Sheet** (who is playing, which level, scores) and the teacher page `#/teacher`: see [apps-script/SETUP.md](apps-script/SETUP.md). Nothing is sent until `js/sync-config.js` has the Apps Script URL.

## Run locally

Use Live Server or any static server: the microphone needs `localhost` or `https`, and `fetch` does not work from `file://`.

- **VS Code:** open this folder, right-click `index.html` → *Open with Live Server*, use **Chrome** or **Edge**.
- **Terminal:** `npx serve .` (or `npx http-server .`) and open the printed `http://localhost:…` URL.

**Test mode without a microphone:** add `?type=1` to the URL (e.g. `http://127.0.0.1:5500/index.html?type=1`).
A text box appears under the buttons; whatever you type is scored as if it had been heard.

**Reset progress:** DevTools → Application → Local Storage → delete `telugu-ladder-progress-v2`.
(The teacher panel with reset comes in Phase 8.)

## Commands

```
node --test                      # unit tests (akshara split, normalise, scoring, progress)
node tools/validate-content.js   # content rules for all 10 level files
```

## Layout

| Path | What |
|---|---|
| `index.html` | single page; `#/` = level map, `#/level/N` = level |
| `js/akshara.js` | Telugu akshara splitter, Levenshtein, akshara diff |
| `js/normalize.js` | NFC, punctuation / zero-width / digit removal, final ము ≈ ం |
| `js/scoring.js` | word and sentence scoring, best of 5 alternatives |
| `js/speech.js` | Web Speech API wrapper, `te-IN`, silence timeout |
| `js/tts.js` | "విను": browser Telugu voice → `audio/levelNN/qNN.mp3` fallback |
| `js/progress.js` | localStorage progress, unlock, resume, stars |
| `js/app.js` | screens: play trail, level, result; parrot buddy, confetti |
| `js/sync.js` / `js/sync-config.js` | sends progress to the teacher's Google Sheet (when configured) |
| `js/teacher-view.js` | teacher page: class charts and table from the Sheet |
| `js/celebrate.js` | level-complete birds, chirp and spoken congratulations |
| `apps-script/Code.gs` | Google Apps Script web app (paste into the Sheet) |
| `js/progress-view.js` | “నా ప్రగతి” page: my levels pie, best-score bars, growth line (Chart.js) |
| `data/ladder.json` | the 10 levels: title and concept |
| `data/levels/levelNN.json` | one file per level; empty `questions` = not written yet |
| `data/ui-text.json` | all Telugu UI text |
| `tools/validate-content.js` | 30 items, 10/10/10, unique ids/texts, no untaught concepts |

## Editing content

Each question in `data/levels/levelNN.json`:

```json
{ "id": "L01-Q05", "difficulty": "easy", "text": "ఉడుత", "focus": "ఉ",
  "split": "ఉ + డు + త", "hint": "…", "accept": ["ఉడుత"] }
```

- `accept`: other spellings that count as correct (recogniser variants). A final ము/ం difference is already accepted automatically.
- `focus`: Stage A only. The letter shown big above the word.
- `audio` (optional): MP3 path; the default is `audio/levelNN/qNN.mp3` (NN = question number in the file).

Run the validator after every edit.
