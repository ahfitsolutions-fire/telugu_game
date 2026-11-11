// Compare what the student said with the target – design plan §6.4.
//
// Every scorer returns:
//   { score: 0..1, passed, heard, accepted,
//     words: [{ text, score, aksharas: [{akshara, status}] }] }
// `words` has one entry for word tasks and one per target word for sentences,
// so the UI can colour aksharas the same way in both modes.

import { splitAksharas, levenshtein, diffAksharas } from './akshara.js?v=9';
import { normalizeText } from './normalize.js?v=9';

/** 1 − distance / max(len) over akshara arrays. */
export function similarity(targetAks, heardAks) {
  const max = Math.max(targetAks.length, heardAks.length);
  if (max === 0) return 1;
  return 1 - levenshtein(targetAks, heardAks) / max;
}

function asList(alternatives) {
  const list = Array.isArray(alternatives) ? alternatives : [alternatives];
  return list.filter((a) => typeof a === 'string' && a.trim());
}

function emptyResult(target, opts) {
  const words = normalizeText(target, opts).split(' ').filter(Boolean).map((w) => ({
    text: w,
    score: 0,
    aksharas: splitAksharas(w).map((akshara) => ({ akshara, status: 'missing' })),
  }));
  return { score: 0, passed: false, heard: '', accepted: false, words };
}

/**
 * Word / letter task. Spaces are ignored (the recogniser sometimes splits a
 * word); each single heard token is also tried, and the best match wins.
 */
export function scoreWord(target, alternatives, { threshold = 0.8, accept = [], muToAnusvara = true } = {}) {
  const opts = { muToAnusvara };
  const squash = (s) => normalizeText(s, opts).replace(/ /gu, '');
  const targetWord = squash(target);
  const tAks = splitAksharas(targetWord);
  const acceptSet = new Set([targetWord, ...accept.map(squash)].filter(Boolean));

  let best = null;
  for (const alt of asList(alternatives)) {
    const norm = normalizeText(alt, opts);
    const tokens = norm.split(' ').filter(Boolean);
    const candidates = new Set([norm.replace(/ /gu, ''), ...tokens]);
    for (const cand of candidates) {
      if (!cand) continue;
      const accepted = acceptSet.has(cand);
      const hAks = splitAksharas(cand);
      const score = accepted ? 1 : similarity(tAks, hAks);
      if (!best || score > best.score) best = { score, accepted, heard: alt, hAks };
    }
  }
  if (!best) return emptyResult(target, opts);

  const aksharas = best.accepted
    ? tAks.map((akshara) => ({ akshara, status: 'ok' }))
    : diffAksharas(tAks, best.hAks);
  return {
    score: best.score,
    passed: best.score >= threshold,
    heard: best.heard,
    accepted: best.accepted,
    words: [{ text: targetWord, score: best.score, aksharas }],
  };
}

function wordSimilarity(a, b) {
  return similarity(splitAksharas(a), splitAksharas(b));
}

/** Align target words with heard words; returns the heard word (or null) for each target word. */
function alignWords(tWords, hWords) {
  const m = tWords.length;
  const n = hWords.length;
  const sim = tWords.map((t) => hWords.map((h) => wordSimilarity(t, h)));
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (1 - sim[i - 1][j - 1]));
    }
  }
  const matched = new Array(m).fill(null);
  let i = m;
  let j = n;
  const eq = (x, y) => Math.abs(x - y) < 1e-9;
  while (i > 0 && j > 0) {
    if (eq(d[i][j], d[i - 1][j - 1] + (1 - sim[i - 1][j - 1]))) {
      matched[i - 1] = hWords[j - 1];
      i--; j--;
    } else if (eq(d[i][j], d[i - 1][j] + 1)) {
      i--;
    } else {
      j--;
    }
  }
  return matched;
}

/**
 * Sentence task: word-level alignment, each word scored by akshara similarity,
 * sentence score = average (missing words count as 0).
 */
export function scoreSentence(target, alternatives, { threshold = 0.8, accept = [], muToAnusvara = true } = {}) {
  const opts = { muToAnusvara };
  const tNorm = normalizeText(target, opts);
  const tWords = tNorm.split(' ').filter(Boolean);
  const acceptSet = new Set([tNorm, ...accept.map((a) => normalizeText(a, opts))].filter(Boolean));

  let best = null;
  for (const alt of asList(alternatives)) {
    const hNorm = normalizeText(alt, opts);
    if (!hNorm) continue;
    let words;
    let accepted = false;
    if (acceptSet.has(hNorm)) {
      accepted = true;
      words = tWords.map((w) => ({
        text: w, score: 1, aksharas: splitAksharas(w).map((akshara) => ({ akshara, status: 'ok' })),
      }));
    } else {
      const matched = alignWords(tWords, hNorm.split(' '));
      words = tWords.map((w, k) => {
        const tAks = splitAksharas(w);
        if (matched[k] === null) {
          return { text: w, score: 0, aksharas: tAks.map((akshara) => ({ akshara, status: 'missing' })) };
        }
        const hAks = splitAksharas(matched[k]);
        return { text: w, score: similarity(tAks, hAks), aksharas: diffAksharas(tAks, hAks) };
      });
    }
    const score = words.length ? words.reduce((s, w) => s + w.score, 0) / words.length : 0;
    if (!best || score > best.score) best = { score, accepted, heard: alt, words };
  }
  if (!best) return emptyResult(target, opts);
  return { ...best, passed: best.score >= threshold };
}

/** Score one attempt at a question using the level's task type and threshold. */
export function scoreAttempt(level, question, alternatives) {
  const opts = {
    threshold: question.threshold ?? level.threshold ?? 0.8,
    accept: question.accept ?? [],
    muToAnusvara: level.muToAnusvara !== false,
  };
  return level.taskType === 'word'
    ? scoreWord(question.text, alternatives, opts)
    : scoreSentence(question.text, alternatives, opts);
}
