# తెలుగు ఉచ్చారణ సాధన – Telugu Pronunciation Ladder
## Complete design plan (for building with Claude in VS Code)

---

## 1. Goal

A web page where a student (10th class, weak in Telugu reading) climbs from **letters → words → sentences → paragraphs** by **speaking aloud**. The browser listens, checks what was said against the target, and the student moves to the next level **only after passing the current one**.

- **50 levels × 30 questions = 1,500 speaking tasks**, grouped into 8 stages (A–H).
- Each new level introduces a new, harder concept (same order as Forms 4 and 5: అక్షరాలు → గుణింతాలు → సరళ పదాలు → ద్విత్వాక్షరాలు → సంయుక్తాక్షరాలు → క్ష/జ్ఞ/శ్ర, three-consonant clusters, సంధి → sentences → paragraphs).
- Within each level, the 30 questions go from easy to hard (10 easy, 10 medium, 10 hard).
- The last level of every stage is a **checkpoint (review) level** mixing everything from that stage.

---

## 2. Honest limits (read this first)

| Fact | What it means for the design |
|---|---|
| Browser speech recognition (Web Speech API, `lang = "te-IN"`) works well in **Chrome and Edge** (desktop and Android). It does **not** work in Firefox, and is unreliable in Safari/iPhone. | Show a "please open in Chrome" screen if it's not supported. |
| Chrome sends the audio to Google's servers to recognise it. It needs **internet** and **HTTPS or localhost**. | Host on GitHub Pages / Netlify (both give HTTPS). Tell parents audio is processed by Google. |
| Speech recognition checks **what words it heard**, not how perfect the sounds were. It also "auto-corrects" toward real words. | This is an *intelligibility* check ("could a listener understand you?"), not a phonetics lab. Good enough to gate reading levels; add a teacher-override button. |
| Recognising a **single isolated letter** (e.g. "ఖ") is weak. | Level 1–2 tasks use the letter inside a tiny word or accept several valid spoken forms (see §6). |
| A Telugu text-to-speech voice ("listen to the correct pronunciation") is not on every computer. | Use the browser voice if a `te-IN` voice exists; otherwise play pre-recorded MP3s (teacher records them, or generate once with Google Cloud TTS `te-IN` voices). |
| Children's voices are recognised less accurately than adults'. | Generous thresholds + 3 attempts + "listen first" button. |

**Upgrade path (later, optional):** a small backend using Google Cloud Speech-to-Text (`te-IN`) works in every browser and gives word confidence scores. Start with the free browser API; move only if needed.

---

## 3. Level map (50 levels × 30 questions = 1,500 tasks)

**Task type per stage:** A–C = read a letter inside a short word / read a word · D–F = read a word · G = read a sentence · H = read a paragraph.
★ = checkpoint (review) level for that stage.

### Stage A – అక్షరాలు (Letters) · Levels 1–6
| Lvl | Concept | Example targets |
|---|---|---|
| 1 | అచ్చులు అ – ఔ (vowel shown big, read inside a tiny word) | అల, ఆట, ఇల, ఈగ, ఉడుత, ఊయల, ఎలుక, ఏనుగు, ఒడి, ఓడ |
| 2 | హల్లులు – క వర్గం, చ వర్గం | కల, ఖని, గడ, ఘటం, చలి, ఛాయ, జల, ఝరి |
| 3 | హల్లులు – ట వర్గం, త వర్గం | టపా, ఠీవి, డబ్బా, ఢంకా, తల, థాలి, దయ, ధనం, నది |
| 4 | హల్లులు – ప వర్గం, య–హ, ళ, ఱ | పడవ, ఫలం, బడి, భయం, మనసు, యాత్ర, రథం, లత, వల, శంఖం, సభ, హంస |
| 5 | Look-alike / sound-alike letters | బ/భ, ద/ధ, ప/ఫ, ట/ఠ, శ/ష/స, న/ణ, ల/ళ – బలం vs భయం, దయ vs ధనం |
| 6 ★ | Stage A checkpoint | All letters mixed |

### Stage B – గుణింతాలు (Vowel signs) · Levels 7–14
| Lvl | Concept | Example targets |
|---|---|---|
| 7 | ా , ి | పాప, కాకి, బాల, చిలక, మిరప |
| 8 | ీ , ు , ూ | గీత, పులి, తులసి, పూవు, దూడ |
| 9 | ె , ే , ై | మెడ, చేప, తేనె, పైన, వైపు |
| 10 | ొ , ో , ౌ | కొడవలి, కోట, తోట, మౌనం, పౌరుడు |
| 11 | ం (అనుస్వారం), ః (విసర్గం) | కంచం, పంట, దుఃఖం, అంతఃపురం |
| 12 | ృ (ఋ గుణింతం) | కృప, మృగం, గృహం, తృణం, పృథివి |
| 13 | One consonant through all signs (క కా కి కీ … కం కః) | గుణింతం series read aloud as words |
| 14 ★ | Stage B checkpoint | Mixed words with all vowel signs |

> **Content rule:** a level may only use concepts already taught in earlier levels plus its own new concept (e.g. no వత్తులు before Level 19). In Stage A the target letter is shown big; the small word around it is only context.

### Stage C – సరళ పదాలు (Simple words, no వత్తు) · Levels 15–18
| Lvl | Concept | Example targets |
|---|---|---|
| 15 | 2-akshara words | అల, నది, మల, కథ, రథం |
| 16 | 3-akshara words | పలక, కమలం, పడవ, తామర, మామిడి |
| 17 | 4-akshara words | గులాబీ, సరోవరం, కనుమరుగు |
| 18 ★ | 5+ akshara words + checkpoint | ఆకాశవాణి, పాఠశాల, సమావేశం |

### Stage D – ద్విత్వాక్షరాలు · Levels 19–22
| Lvl | Concept | Example targets |
|---|---|---|
| 19 | క వర్గం, చ వర్గం ద్విత్వం (క్క, గ్గ, చ్చ, జ్జ) | అక్క, మొగ్గ, పచ్చ, గజ్జె |
| 20 | ట వర్గం, త వర్గం ద్విత్వం (ట్ట, డ్డ, ణ్ణ, త్త, ద్ద, న్న) | పెట్టె, గుడ్డ, కత్తి, అన్న, పెద్ద |
| 21 | ప వర్గం + య, ల, వ, స, ళ (ప్ప, బ్బ, మ్మ, య్య, ల్ల, వ్వ, స్స, ళ్ళ) | పప్పు, డబ్బు, అమ్మ, అయ్య, పిల్లి, నవ్వు |
| 22 ★ | ద్విత్వం + గుణింతం, 2 ద్విత్వాలు in one word | కొబ్బరి, కుక్కపిల్ల, అక్కచెల్లెళ్ళు |

### Stage E – సంయుక్తాక్షరాలు · Levels 23–30
| Lvl | Concept | Example targets |
|---|---|---|
| 23 | ర-వత్తు | చక్రం, ప్రేమ, గ్రామం, త్రాసు |
| 24 | య-వత్తు | విద్య, సత్యం, వ్యాపారం, సూర్యుడు |
| 25 | వ-వత్తు | స్వరం, ద్వారం, త్వరగా, ధ్వని |
| 26 | ల-వత్తు | శుక్లం, విప్లవం, క్లేశం, శ్లోకం |
| 27 | న, మ, ణ వత్తులు | అగ్ని, పద్మం, ఆత్మ, కృష్ణ, రత్నం |
| 28 | రేఫ (ర్ first: ర్మ, ర్వ, ర్త, ర్య) | ధర్మం, గర్వం, కర్తవ్యం, కార్యం |
| 29 | మహాప్రాణ వత్తులు (చ్ఛ, ద్ధ, ఘ్న, భ్య, ఖ్య, ధ్య) | స్వేచ్ఛ, బుద్ధి, విఘ్నం, అభ్యాసం, ముఖ్యం |
| 30 ★ | ద్విత్వం + సంయుక్తం in one word | ప్రక్క, ప్రత్యుత్పన్నమతి, సమ్మేళనం |

### Stage F – ప్రత్యేక / క్లిష్ట అక్షరాలు · Levels 31–36
| Lvl | Concept | Example targets |
|---|---|---|
| 31 | క్ష | రక్ష, పక్షి, క్షమ, వృక్షం, లక్ష్యం |
| 32 | జ్ఞ | జ్ఞానం, విజ్ఞానం, ఆజ్ఞ, కృతజ్ఞత |
| 33 | శ్ర, శ్చ, శ్న, శ్య, ష్ట, ష్ఠ | శ్రమ, ఆశ్చర్యం, ప్రశ్న, దృశ్యం, కష్టం, నిష్ఠ |
| 34 | మూడు హల్లుల కలయికలు | రాష్ట్రం, స్త్రీ, శాస్త్రం, జ్యోత్స్న, స్వాతంత్ర్యం, లక్ష్మణుడు |
| 35 | సంధి / విసర్గ రూపాలు | మనస్తాపం, నమస్తే, వాగ్దానం, పునఃప్రారంభం, ప్రాతఃకాలం |
| 36 ★ | 5+ akshara complex words | విజ్ఞానశాస్త్రం, ఉపాధ్యాయుడు, ఉద్యోగస్థుడు, దౌర్భాగ్యం |

### Stage G – వాక్యాలు (Sentences) · Levels 37–44
| Lvl | Concept | Example targets |
|---|---|---|
| 37 | 2–3 word sentences, simple words | "అమ్మ వచ్చింది." "నది పారుతోంది." |
| 38 | 3–4 words with గుణింతాలు | "పాప పాట పాడింది." |
| 39 | Sentences with ద్విత్వాక్షరాలు | "అక్క పప్పు వండింది." |
| 40 | Sentences with సంయుక్తాక్షరాలు | "పక్షి ఆకాశంలో ఎగురుతోంది." |
| 41 | Questions & exclamations | "నువ్వు ఎక్కడికి వెళ్తున్నావు?" |
| 42 | 6–8 words, mixed concepts | "విద్యార్థులు శ్రద్ధగా పరీక్ష రాశారు." |
| 43 | సామెతలు (proverbs) | "కృషితో నాస్తి దుర్భిక్షం." "చేతులు కాలాక ఆకులు పట్టుకున్నట్టు." |
| 44 ★ | 8–12 word complex sentences | Freedom struggle / science sentences with క్ష, జ్ఞ, 3-consonant words |

### Stage H – పేరాగ్రాఫ్ పఠనం · Levels 45–50
Each level still has **30 sentence-tasks**, grouped into passages. Pass also needs **every passage ≥ 60 %**.
| Lvl | Structure | Content |
|---|---|---|
| 45 | 15 passages × 2 sentences | Daily life, family |
| 46 | 10 passages × 3 sentences | School, friends, animals |
| 47 | 7–8 short stories × 4 sentences | Moral stories |
| 48 | 6 paragraphs × 5 sentences | Textbook-style lessons (nature, farmers, festivals) |
| 49 | 6 paragraphs × 5 sentences | News / informational (science, health, history) |
| 50 ★ | 6 paragraphs × 5 sentences – **final test** | All concepts from Levels 1–49 |

### Pass rules
| Levels | Pass mark | Similarity threshold |
|---|---|---|
| 1–18 | 24/30 (80 %) | 0.80 + accept list |
| 19–36 | 24/30 (80 %) | 0.85 |
| 37–44 | 23/30 (77 %) | 0.80 |
| 45–50 | 22/30 (73 %) + each passage ≥ 60 % | 0.75 |

**Inside each level:** Q1–10 easy, Q11–20 medium, Q21–30 hard.
**Unlocking:** Level N+1 unlocks only when Level N is passed. A failed level can be retried; the questions are shuffled within each difficulty block.
**Stage badge:** passing a ★ checkpoint gives the stage badge (A–H). Optional rule: a student who fails a checkpoint twice is sent back to the weakest level of that stage (the one with the lowest best score).

---

## 4. Screens (wireframes)

### 4.1 Home / Level map
```
┌──────────────────────────────────────────┐
│  తెలుగు ఉచ్చారణ సాధన         [పేరు: ___]  │
│                                          │
│  మొత్తం: 9 / 50 స్థాయిలు  ▓▓░░░░░░░░ 18%  │
│                                          │
│  ▼ దశ A – అక్షరాలు (1–6)        🏅 పూర్తి   │
│  ▼ దశ B – గుణింతాలు (7–14)               │
│     ✅ 7  ✅ 8  ✅ 9  ▶ 10  🔒 11 … 🔒 14★  │
│  ► దశ C – సరళ పదాలు (15–18)      🔒       │
│  ► దశ D – ద్విత్వాక్షరాలు (19–22)  🔒       │
│  ► … దశ H – పేరాగ్రాఫ్ (45–50)    🔒       │
└──────────────────────────────────────────┘
```

### 4.2 Practice screen (one question)
```
┌──────────────────────────────────────────┐
│  స్థాయి 23 • ప్రశ్న 12 / 30   ▓▓▓▓░░░░   │
│                                          │
│              చ క్రం                       │  ← huge font (Noto Sans Telugu, 64–96px)
│        చ + క్ + ర + ం   (hint toggle)      │
│                                          │
│  [🔊 విను]   [🎤 చదువు]   [⏭ తర్వాత]       │
│                                          │
│  మీరు చెప్పింది: చక్రం                     │
│  ✅ సరైనది! (100%)                         │
│  ప్రయత్నాలు: 1 / 3                         │
└──────────────────────────────────────────┘
```
- The level map groups the 50 levels into 8 collapsible stages; only the current stage is open by default.
- Wrong aksharas are shown in **red**, correct ones in **green**, e.g. చ **క్రం** if only "చ" matched.
- After 3 failed attempts: play the model audio, mark the question failed, move on.

### 4.3 Level result
- Score (e.g. 26/30), passed/failed, list of failed items to "practise again", button to next level (only if passed).

### 4.4 Paragraph mode (Levels 45–50)
- Whole paragraph displayed; the current sentence is highlighted; student reads sentence by sentence; final "read whole paragraph" attempt is a bonus.

### 4.5 Teacher / parent panel (PIN protected)
- See progress per level, failed words, time spent.
- "Teacher override" – mark a question correct if recognition was wrong.
- Reset progress, export results (CSV).

---

## 5. Architecture

**Recommended stack (simple, no build step needed):**
- Plain **HTML + CSS + JavaScript (ES modules)**. Easy for Claude to write and easy to host.
- Content in **JSON files** (one per level) so the teacher can edit words without touching code.
- Progress in **localStorage** (works offline-ish, per device).
- Optional: send results to a **Google Sheet** through a Google Apps Script web app (`doPost`) – you already use Apps Script, so this fits.
- Hosting: **GitHub Pages** (free HTTPS). For local testing in VS Code: the "Live Server" extension or `npx serve` (localhost is allowed for the microphone).

### 5.1 Folder structure
```
telugu-pronunciation/
├── index.html              ← level map
├── practice.html           ← question screen (or single-page with views)
├── css/
│   └── styles.css
├── js/
│   ├── app.js              ← routing, screen rendering
│   ├── speech.js           ← SpeechRecognition wrapper (te-IN)
│   ├── tts.js              ← speak target (browser voice → MP3 fallback)
│   ├── akshara.js          ← split Telugu text into aksharas
│   ├── normalize.js        ← clean recogniser output
│   ├── scoring.js          ← compare spoken vs target, return % and diff
│   ├── progress.js         ← localStorage save/load, unlock logic
│   └── sheets.js           ← optional: POST results to Apps Script
├── data/
│   ├── stages.json         ← 8 stages: name, level range, badge
│   ├── levels/
│   │   ├── level01.json … level50.json   ← loaded only when opened
│   └── ui-text.json        ← all Telugu UI labels
├── audio/                  ← optional MP3s: level23/q12.mp3
├── tools/
│   └── validate-content.js ← checks every level: 30 items, 10/10/10, no duplicates, no untaught concepts
├── tests/
│   ├── akshara.test.js
│   └── scoring.test.js
└── apps-script/
    └── Code.gs             ← optional results logger
```

### 5.2 Level data format (`data/level05.json`)
```json
{
  "level": 5,
  "title": "సంయుక్తాక్షరాలు – 1",
  "concept": "ర, య, వ, ల వత్తులు",
  "taskType": "word",
  "passMark": 24,
  "threshold": 0.85,
  "questions": [
    {
      "id": "L05-Q01",
      "difficulty": "easy",
      "text": "చక్రం",
      "split": "చ + క్రం",
      "hint": "క కింద ర-వత్తు",
      "accept": ["చక్రం", "చక్రము"],
      "audio": "audio/level05/q01.mp3"
    }
  ]
}
```
- `accept` = all spoken forms counted as correct (e.g. ము/ం endings, recogniser spelling variants).
- `threshold` = minimum similarity for this level.

---

## 6. Core logic

### 6.1 Speech recognition (`speech.js`)
```js
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = new SR();
rec.lang = 'te-IN';
rec.interimResults = false;
rec.maxAlternatives = 5;      // check all 5 guesses, take the best score
rec.continuous = false;       // true for paragraph mode
```
- Use **all alternatives**; the score is the best match among them.
- Handle errors: `no-speech`, `audio-capture`, `not-allowed` (mic blocked) → Telugu messages.
- Auto-stop after 5 s of silence (words) / 20 s (sentences).

### 6.2 Normalisation (`normalize.js`)
Before comparing, both target and heard text are:
1. Unicode NFC-normalised.
2. Stripped of punctuation (. , ! ? " ' । ॥), extra spaces, zero-width joiners (U+200C/U+200D).
3. Telugu digits/English digits removed or mapped.
4. Optional equivalences (configurable, per level): final "ము" ≈ "ం" (పుస్తకము / పుస్తకం).

### 6.3 Akshara splitting (`akshara.js`)
Telugu must be compared by **akshara** (syllable unit), not by character. One akshara =
`(consonant + ్ )* consonant  [vowel sign]  [ం | ః | ఁ]`  or  `independent vowel [ం | ః]`.

Unicode ranges: consonants U+0C15–U+0C39, virama U+0C4D, vowel signs U+0C3E–U+0C4C, U+0C62–U+0C63, ం U+0C02, ః U+0C03, ఁ U+0C01, vowels U+0C05–U+0C14.

Example: `స్వాతంత్ర్యం` → [స్వా, తం, త్ర్యం]. Unit-test this with ~30 words from Forms 4/5.

### 6.4 Scoring (`scoring.js`)
- **Letters / words (L1–L7):** Levenshtein distance over akshara arrays.
  `score = 1 − distance / max(len(target), len(heard))`. Pass if `score ≥ threshold` **or** heard text equals any `accept` value.
- **Sentences (L8–L9):** word-level alignment; each word scored by akshara similarity; sentence score = average. Missing words count as 0.
- **Paragraph (L10):** each sentence scored separately; paragraph result = sentences passed.
- Return `{score, passed, diff: [{akshara, status: 'ok'|'wrong'|'missing'}]}` so the UI can colour aksharas.

Suggested thresholds: L1–3 0.80 (+ accept list), L4–7 0.85, L8–9 0.80, L10 0.75.

### 6.5 Progress & gating (`progress.js`)
```json
{
  "student": "పేరు",
  "levels": {
    "1": { "passed": true, "best": 27, "attempts": 2 },
    "2": { "passed": false, "best": 19, "attempts": 1, "current": { "q": 14, "results": [...] } }
  }
}
```
- Resume mid-level after a page reload.
- `isUnlocked(n) = n === 1 || levels[n-1].passed`.
- Teacher override flips a single result to correct (logged as `override: true`).

---

## 7. Feedback & motivation
- Instant colour feedback per akshara; Telugu messages: "అద్భుతం!", "మళ్ళీ ప్రయత్నించండి", "ఈ అక్షరంపై దృష్టి పెట్టండి: క్ష".
- Stars per level (3★ ≥ 28, 2★ ≥ 25, 1★ = pass).
- "Practise my mistakes" mode replays failed items (does not count toward unlock).
- Daily streak counter (optional).

---

## 8. Design / accessibility
- Font: **Noto Sans Telugu** (Google Fonts), target text 64–96 px, UI 18–20 px.
- High-contrast colours; green/red also marked with ✓/✗ icons (colour-blind safe).
- Large buttons (min 56 px), works on a phone held in portrait.
- All UI text in Telugu (from `ui-text.json`), with optional English toggle for the teacher.

---

## 9. Content plan (1,500 items)
- Claude drafts the levels **one stage at a time** (6–8 levels per batch, 180–240 items), reusing vocabulary and concepts from Forms 4 and 5.
- Every `levelNN.json`: exactly 30 items, 10 easy / 10 medium / 10 hard, no duplicate `text` anywhere in the 50 levels.
- `tools/validate-content.js` (run with `node`) enforces: item counts, difficulty split, unique ids/texts, and the "no untaught concept" rule – e.g. it rejects a virama (్) in Levels 1–18, ః (విసర్గం) before Level 11 (word-final ం is allowed from Level 1 because it is so common), ృ before Level 12, క్ష/జ్ఞ before Level 31, three-consonant clusters before Level 34.
- **A Telugu teacher must review every item** (spelling, natural words, sentence grammar) before release.
- Avoid words the recogniser confuses with English or numbers; test each word once by speaking it in Chrome and add variants to `accept`.
- Sentences (Levels 37–44): 240 original sentences. Paragraphs (Levels 45–50): about 60 original passages (daily life, school, moral stories, festivals, farmers, rivers, science, health, freedom struggle).
- Suggested review pace for the teacher: one stage per week → all 50 levels reviewed in about 8 weeks, while students already use the finished stages.

---

## 10. Build phases (milestones)

| Phase | Deliverable | Done when |
|---|---|---|
| 1. Skeleton | Folder structure, index page, level map from JSON, localStorage progress | Levels show, locks work |
| 2. Speech | `speech.js` + mic button + "you said: …" display | Speaking "అమ్మ" shows అమ్మ in Chrome |
| 3. Scoring | `akshara.js`, `normalize.js`, `scoring.js` + unit tests | All tests pass; coloured diff appears |
| 4. Level flow | 30-question loop, 3 attempts, result screen, unlock next, 8-stage level map, checkpoint badges | Pass Level 1 → Level 2 unlocks |
| 5. Content | `validate-content.js`, then levels 1–50 JSON in 8 stage batches (1,500 items) | Validator passes, teacher-reviewed |
| 6. Audio | Browser TTS + MP3 fallback | "విను" works on a PC without a Telugu voice |
| 7. Paragraph mode | Levels 45–50 passage reading, per-passage pass rule | All Stage H levels playable |
| 8. Teacher panel | PIN, progress table, override, CSV export | Teacher can view & override |
| 9. Optional sync | Apps Script `doPost` → Google Sheet | Results row appears in Sheet |
| 10. Deploy | GitHub Pages | Works on student's phone in Chrome |

---

## 11. Testing checklist
- Unit tests: akshara split (incl. స్త్రీ, క్ష్మ, జ్ఞా, దుఃఖం, కృ), Levenshtein, normalisation.
- Manual: each level's first/last 3 items spoken in Chrome desktop + Android.
- Mic denied, no internet, Firefox → friendly Telugu error screens.
- Reload mid-level → resumes at same question.
- Fail a level → next stays locked; pass → unlocks.

---

## 12. Privacy
- Store only first name + scores. No audio is saved by the app.
- Show a one-line notice: Chrome's speech recognition sends audio to Google to convert it to text.
- If results go to a Google Sheet, only the teacher's sheet receives them.

---

## 13. Prompt to paste into Claude in VS Code

> Read `Telugu_Pronunciation_App_Design_Plan.md` in this folder. Build the app it describes, phase by phase (section 10), starting with Phases 1–4.
> Use plain HTML, CSS and JavaScript ES modules, no framework, no build step. Follow the folder structure in §5.1 and the JSON format in §5.2.
> Implement the akshara splitter and scoring exactly as in §6.3–6.4 and write unit tests for them (runnable with `node --test`).
> The app has 50 levels × 30 questions in 8 stages (§3). Create `data/stages.json` and `data/levels/level01.json` … `level06.json` (Stage A, 30 items each, 10 easy / 10 medium / 10 hard) so I can test the full flow; create the other 44 level files as stubs with the correct title, concept and pass rule from §3. Also write `tools/validate-content.js` (§9).
> Later, when I say "next stage", fill the next stage's levels with real items, following the content rule in §3, and run the validator.
> All student-facing text must be in Telugu. Use the Noto Sans Telugu font. Speech recognition language: `te-IN`.
> After each phase, tell me how to test it in Chrome with the Live Server extension, then wait for my OK before the next phase.
