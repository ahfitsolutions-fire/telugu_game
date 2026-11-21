// Score the English / Hindi translation step (the Telugu step keeps using scoring.js).
//
// Both sides are normalised (case, punctuation, numbers → words, Hindi nukta /
// chandrabindu / half-nasal spellings), target words are aligned with heard words,
// and each word is compared letter by letter. Extra heard words are not penalised.
// Returns { score, passed, heard, accepted, tokens: [{ text, status }] } where tokens
// are the target's display words with 'ok' | 'wrong' | 'missing' | 'skip'.

import { levenshtein } from './akshara.js?v=10';

export const THRESHOLDS = { word: 0.75, sentence: 0.7, paragraph: 0.7 };

const EN_SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function englishNumber(n) {
  if (!Number.isInteger(n) || n < 0 || n > 999999) return String(n);
  if (n < 20) return EN_SMALL[n];
  if (n < 100) return `${EN_TENS[Math.floor(n / 10)]}${n % 10 ? ` ${EN_SMALL[n % 10]}` : ''}`;
  if (n < 1000) return `${EN_SMALL[Math.floor(n / 100)]} hundred${n % 100 ? ` ${englishNumber(n % 100)}` : ''}`;
  return `${englishNumber(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${englishNumber(n % 1000)}` : ''}`;
}

const HI_SMALL = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह',
  'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस'];

export function hindiNumber(n) {
  if (!Number.isInteger(n) || n < 0) return String(n);
  if (n <= 20) return HI_SMALL[n];
  if (n < 1000 && n % 100 === 0) return `${HI_SMALL[n / 100]} सौ`;
  if (n < 21000 && n % 1000 === 0) return `${HI_SMALL[n / 1000]} हजार`;
  return String(n);
}

const CONTRACTIONS = [
  [/\b(it|that|what|there|he|she|here|who|where)'s\b/g, '$1 is'], [/\blet's\b/g, 'let us'],
  [/\bcan't\b/g, 'can not'], [/\bwon't\b/g, 'will not'], [/\bcannot\b/g, 'can not'], [/n't\b/g, ' not'],
  [/'re\b/g, ' are'], [/'m\b/g, ' am'], [/'ll\b/g, ' will'], [/'ve\b/g, ' have'], [/'d\b/g, ' would'],
];
const EN_DROP = new Set(['a', 'an', 'the']);

export function normalizeEnglish(text) {
  let s = String(text ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’‘`]/g, "'");
  for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  s = s.replace(/(\d),(\d)/g, '$1$2').replace(/\d+/g, (d) => ` ${englishNumber(Number(d))} `);
  s = s.replace(/'/g, '').replace(/[^a-z\s]/g, ' ');
  return s.split(/\s+/).filter((w) => w && !EN_DROP.has(w));
}

const DEV_DIGITS = '०१२३४५६७८९';

export function normalizeHindi(text) {
  let s = String(text ?? '').normalize('NFD').replace(/़/g, '').normalize('NFC') // no nukta: ज़ → ज
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/ँ/g, 'ं') // chandrabindu → anusvara (माँ ≈ मां)
    .replace(/[नमणङञ]्(?=[क-ह])/g, 'ं') // हिन्दी ≈ हिंदी
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));
  s = s.replace(/\d+/g, (d) => ` ${hindiNumber(Number(d))} `);
  s = s.toLowerCase().replace(/[^ऀ-ॣ॰-ॿa-z\s]/g, ' ').replace(/[।॥]/g, ' ');
  return s.split(/\s+/).filter(Boolean);
}

export const normalizerFor = (lang) => (lang === 'hi' ? normalizeHindi : normalizeEnglish);

function charSim(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const max = Math.max(x.length, y.length);
  return max ? 1 - levenshtein(x, y) / max : 1;
}

/** Best similarity for every target word, aligned in order against the heard words (null = not heard). */
export function alignScores(tWords, hWords) {
  const m = tWords.length;
  const n = hWords.length;
  const sim = tWords.map((tw) => hWords.map((hw) => charSim(tw, hw)));
  // d[i][j] = best total similarity for the first i target words using the first j heard words
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.max(d[i - 1][j], d[i][j - 1], d[i - 1][j - 1] + sim[i - 1][j - 1]);
    }
  }
  const out = new Array(m).fill(null);
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (d[i][j] === d[i - 1][j - 1] + sim[i - 1][j - 1] && sim[i - 1][j - 1] > 0) { out[i - 1] = sim[i - 1][j - 1]; i--; j--; } else if (d[i][j] === d[i - 1][j]) i--;
    else j--;
  }
  return out;
}

function asList(alternatives) {
  return (Array.isArray(alternatives) ? alternatives : [alternatives]).filter((a) => typeof a === 'string' && a.trim());
}

/**
 * @param {string} target  display text, e.g. "The cow eats grass."
 * @param {string[]|string} alternatives  recogniser guesses
 * @param {{lang: 'en'|'hi', threshold?: number, accept?: string[]}} opts
 */
export function scoreTranslation(target, alternatives, { lang = 'en', threshold = 0.75, accept = [] } = {}) {
  const norm = normalizerFor(lang);
  const display = String(target).split(/\s+/).filter(Boolean);
  const perToken = display.map((tok) => norm(tok));
  const flat = perToken.flat();
  const forms = [flat, ...accept.map(norm)].filter((f) => f.length);

  let best = { score: 0, heard: '', accepted: false, wordScores: flat.map(() => null) };
  for (const alt of asList(alternatives)) {
    const heard = norm(alt);
    if (!heard.length) continue;
    forms.forEach((form, k) => {
      const scores = alignScores(form, heard);
      const score = scores.reduce((s, x) => s + (x ?? 0), 0) / form.length;
      if (score > best.score || (!best.heard && score === best.score)) {
        best = { score, heard: alt, accepted: k > 0 && score >= threshold, wordScores: k === 0 ? scores : flat.map(() => score) };
      }
    });
  }

  let w = 0;
  const tokens = display.map((text, i) => {
    const n = perToken[i].length;
    if (!n) return { text, status: 'skip' };
    const s = best.wordScores.slice(w, w + n);
    w += n;
    if (!best.heard) return { text, status: null };
    if (s.some((x) => x === null)) return { text, status: 'missing' };
    return { text, status: Math.min(...s) >= 0.7 ? 'ok' : 'wrong' };
  });
  return { score: best.score, passed: best.score >= threshold, heard: best.heard, accepted: best.accepted, tokens };
}

/** Score one English / Hindi attempt for a question of the given level. */
export function scoreLangAttempt(level, question, lang, alternatives) {
  return scoreTranslation(question[lang], alternatives, {
    lang,
    threshold: question[`${lang}Threshold`] ?? THRESHOLDS[level.taskType] ?? 0.75,
    accept: question[`${lang}Accept`] ?? [],
  });
}
