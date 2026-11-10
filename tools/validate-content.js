// Content validator – design plan §9.   Run:  node tools/validate-content.js
//
// Checks every data/levels/levelNN.json against data/ladder.json:
//  - file exists, level/title/taskType/passMark/threshold match the plan
//  - filled levels: exactly 30 questions, Q1–10 easy, Q11–20 medium, Q21–30 hard
//  - ids are LNN-QNN, unique; `text` unique across all levels
//  - "no untaught concept" rules on `text`
//  - `focus` letter (if given) appears in `text`
//  - paragraph levels: every question has a `passage` id
// Empty `questions` = not written yet (reported, not an error). Exit code 1 on any error.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeText } from '../js/normalize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pad = (n) => String(n).padStart(2, '0');
const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(rel) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    err(rel, `invalid JSON – ${e.message}`);
    return null;
  }
}

function expectedRules(n) {
  if (n <= 3) return { taskType: 'word', passMark: 24, threshold: 0.8 };
  if (n <= 6) return { taskType: 'word', passMark: 24, threshold: 0.85 };
  if (n <= 8) return { taskType: 'sentence', passMark: 23, threshold: 0.8 };
  return { taskType: 'paragraph', passMark: 22, threshold: 0.75 };
}

// Concept rules: [first level where allowed, regex, description]
const CONSONANT = '[\\u0C15-\\u0C39]';
const CONCEPT_RULES = [
  [4, /్/u, 'virama (్) – ద్విత్వ / సంయుక్త letters start at Level 4'],
  [2, /ః/u, 'visarga (ః) – taught at Level 2'],
  [2, /[ృౄ]/u, 'ృ / ౄ vowel sign – taught at Level 2'],
  [6, /క్ష/u, 'క్ష – taught at Level 6'],
  [6, /జ్ఞ/u, 'జ్ఞ – taught at Level 6'],
  [6, new RegExp(`${CONSONANT}\u0C4D${CONSONANT}\u0C4D${CONSONANT}`, 'u'), 'three-consonant cluster – taught at Level 6'],
];

const ladder = readJson('data/ladder.json');
if (!ladder) {
  console.error('data/ladder.json missing or invalid');
  process.exit(1);
}
const total = ladder.totalLevels ?? 10;
const perLevel = ladder.questionsPerLevel ?? 30;
if (!Array.isArray(ladder.levels) || ladder.levels.length !== total) err('ladder.json', `levels list should have ${total} entries`);
ladder.levels?.forEach((l, i) => { if (l.level !== i + 1) err('ladder.json', `entry ${i + 1} has level ${l.level}`); });

const seenText = new Map(); // normalized text -> id
const summary = { filled: [], stubs: [] };

for (let n = 1; n <= total; n++) {
  const rel = `data/levels/level${pad(n)}.json`;
  const L = readJson(rel);
  if (!L) {
    if (!existsSync(path.join(ROOT, rel))) err(rel, 'file missing');
    continue;
  }
  const exp = expectedRules(n);
  if (L.level !== n) err(rel, `level is ${L.level}, expected ${n}`);
  const listed = ladder.levels?.find((x) => x.level === n);
  if (listed && (listed.title !== L.title || listed.concept !== L.concept)) err(rel, 'title/concept differ from ladder.json');
  if (!L.title || !L.concept) err(rel, 'title and concept are required');
  if (L.taskType !== exp.taskType) err(rel, `taskType "${L.taskType}", expected "${exp.taskType}"`);
  if (L.passMark !== exp.passMark) err(rel, `passMark ${L.passMark}, expected ${exp.passMark}`);
  if (L.threshold !== exp.threshold) err(rel, `threshold ${L.threshold}, expected ${exp.threshold}`);
  if (L.taskType === 'paragraph' && typeof L.passageMin !== 'number') err(rel, 'paragraph level needs passageMin');

  const qs = Array.isArray(L.questions) ? L.questions : null;
  if (!qs) { err(rel, 'questions must be an array'); continue; }
  if (qs.length === 0) { summary.stubs.push(n); continue; }
  summary.filled.push(n);

  if (qs.length !== perLevel) err(rel, `${qs.length} questions, expected ${perLevel}`);
  const third = perLevel / 3;
  const ids = new Set();
  qs.forEach((q, i) => {
    const where = `${rel} ${q.id ?? `#${i + 1}`}`;
    const expId = `L${pad(n)}-Q${pad(i + 1)}`;
    if (q.id !== expId) err(where, `id should be ${expId}`);
    if (ids.has(q.id)) err(where, 'duplicate id');
    ids.add(q.id);

    const expDiff = ['easy', 'medium', 'hard'][Math.min(2, Math.floor(i / third))];
    if (q.difficulty !== expDiff) err(where, `difficulty "${q.difficulty}", expected "${expDiff}" (10 easy / 10 medium / 10 hard in order)`);

    if (typeof q.text !== 'string' || !q.text.trim()) { err(where, 'text is required'); return; }
    if (q.text !== q.text.normalize('NFC')) err(where, 'text is not NFC-normalised');
    if (!/[ఀ-౿]/u.test(q.text)) err(where, 'text has no Telugu characters');

    const key = normalizeText(q.text);
    if (seenText.has(key)) err(where, `duplicate text "${q.text}" (also ${seenText.get(key)})`);
    else seenText.set(key, q.id);

    for (const [from, re, what] of CONCEPT_RULES) {
      if (n < from && re.test(q.text)) err(where, `"${q.text}" uses ${what}`);
    }

    if (q.accept !== undefined && (!Array.isArray(q.accept) || q.accept.some((a) => typeof a !== 'string' || !a.trim()))) {
      err(where, 'accept must be a list of non-empty strings');
    }
    {
      if (q.focus === undefined) { /* optional */ } else if (!q.text.includes(q.focus)) err(where, `focus "${q.focus}" is not in "${q.text}"`);
    }
    const words = normalizeText(q.text).split(' ').filter(Boolean).length;
    if (L.taskType === 'word' && words > 1) warn(where, `word task has ${words} words`);
    if (L.taskType !== 'word' && words < 2) warn(where, 'sentence task has only one word');
    if (L.taskType === 'paragraph' && !q.passage) err(where, 'paragraph question needs a passage id');
  });
}

for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`ERROR ${e}`);
const fmt = (a) => (a.length ? a.join(', ') : '–');
console.log(`\nFilled levels (${summary.filled.length}): ${fmt(summary.filled)}`);
console.log(`Stub levels   (${summary.stubs.length}): ${summary.stubs.length ? `${summary.stubs[0]}–${summary.stubs.at(-1)}` : '–'}`);
console.log(`Questions: ${seenText.size} unique texts`);
console.log(errors.length ? `\n✗ ${errors.length} error(s), ${warnings.length} warning(s)` : `\n✓ OK (${warnings.length} warning(s))`);
process.exit(errors.length ? 1 : 0);
