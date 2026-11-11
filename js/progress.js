// Progress, unlocking and level attempts – design plan §6.5.
// Pure functions over a plain progress object; storage is passed in so the
// logic can be unit-tested in Node.

export const STORAGE_KEY = 'telugu-ladder-progress-v2';
export const TOTAL_LEVELS = 10;

export function emptyProgress() {
  return { version: 1, student: '', levels: {} };
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadProgress(storage = browserStorage(), key = STORAGE_KEY) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return emptyProgress();
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || typeof p.levels !== 'object' || p.levels === null) return emptyProgress();
    return { ...emptyProgress(), ...p };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress, storage = browserStorage(), key = STORAGE_KEY) {
  try {
    storage?.setItem(key, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export const isPassed = (p, n) => !!p.levels[n]?.passed;
export const isUnlocked = (p, n) => n === 1 || isPassed(p, n - 1);

export function passedCount(p, total = TOTAL_LEVELS) {
  let c = 0;
  for (let n = 1; n <= total; n++) if (isPassed(p, n)) c++;
  return c;
}

/** First level not yet passed (the one the student should work on). */
export function currentLevel(p, total = TOTAL_LEVELS) {
  for (let n = 1; n <= total; n++) if (!isPassed(p, n)) return n;
  return total;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Question order for a new attempt: easy block, then medium, then hard,
 * each shuffled (unless shuffle is false, e.g. for paragraph passages).
 * @returns {string[]} question ids
 */
export function orderQuestions(questions, { shuffle: doShuffle = true, rng = Math.random } = {}) {
  const blocks = ['easy', 'medium', 'hard'].map((d) => questions.filter((q) => q.difficulty === d));
  const other = questions.filter((q) => !['easy', 'medium', 'hard'].includes(q.difficulty));
  return [...blocks, other].flatMap((b) => (doShuffle ? shuffle(b, rng) : b)).map((q) => q.id);
}

function levelEntry(p, n) {
  p.levels[n] ??= { passed: false, best: 0, attempts: 0, stars: 0 };
  return p.levels[n];
}

export function startAttempt(p, n, order) {
  const L = levelEntry(p, n);
  L.current = { order, results: [], tries: 0, startedAt: Date.now() };
  return L.current;
}

export function setTries(p, n, tries) {
  const c = p.levels[n]?.current;
  if (c) c.tries = tries;
}

/** Store the final result of the current question and move on. */
export function recordAnswer(p, n, { id, passed, score = 0, heard = '', tries = 0, skipped = false }) {
  const c = p.levels[n]?.current;
  if (!c) throw new Error(`No attempt in progress for level ${n}`);
  const r = { id, passed: !!passed, score: Math.round(score * 100) / 100, heard, tries };
  if (skipped) r.skipped = true;
  c.results.push(r);
  c.tries = 0;
  p.stats ??= { answered: 0, correct: 0 };
  if (!skipped) p.stats.answered += 1;
  if (r.passed && r.tries <= 1) p.stats.correct += 1; // accuracy = right on the first try
  return r;
}

export function starsFor(correct, passMark) {
  if (correct < passMark) return 0;
  if (correct >= 28) return 3;
  if (correct >= 25) return 2;
  return 1;
}

/**
 * Close the current attempt: update best / passed / stars, return a summary.
 * Paragraph levels pass passageOf (id → passage id) and passageMin (0..1):
 * every passage must then reach passageMin as well.
 */
/**
 * mastery: the student must get every question right before moving on (unlimited tries).
 * The level is passed when all questions are passed; stars and best = right on the first try.
 */
export function finishAttempt(p, n, passMark, { passageOf = null, passageMin = 0, mastery = false } = {}) {
  const L = levelEntry(p, n);
  const c = L.current;
  if (!c) throw new Error(`No attempt in progress for level ${n}`);
  const correct = c.results.filter((r) => r.passed).length;
  const weakPassages = [];
  if (passageOf) {
    const groups = new Map();
    for (const r of c.results) {
      const key = passageOf(r.id);
      const g = groups.get(key) ?? { ok: 0, total: 0 };
      g.total += 1;
      if (r.passed) g.ok += 1;
      groups.set(key, g);
    }
    for (const [key, g] of groups) if (g.ok / g.total < passageMin) weakPassages.push(key);
  }
  const firstTry = c.results.filter((r) => r.passed && (r.tries ?? 1) <= 1).length;
  const passed = mastery
    ? c.results.length > 0 && correct === c.results.length
    : correct >= passMark && weakPassages.length === 0;
  const stars = !passed ? 0 : mastery ? (firstTry >= 28 ? 3 : firstTry >= 25 ? 2 : 1) : starsFor(correct, passMark);
  L.attempts += 1;
  L.best = Math.max(L.best ?? 0, mastery ? firstTry : correct);
  L.stars = Math.max(L.stars ?? 0, stars);
  if (passed) L.passed = true;
  L.timeMs = (L.timeMs ?? 0) + Math.max(0, Date.now() - (c.startedAt ?? Date.now()));
  L.last = {
    correct,
    total: c.results.length,
    passed,
    stars,
    firstTry,
    retriedIds: c.results.filter((r) => r.passed && (r.tries ?? 1) > 1).map((r) => r.id),
    failedIds: c.results.filter((r) => !r.passed).map((r) => r.id),
    weakPassages,
    at: Date.now(),
  };
  delete L.current;
  return L.last;
}

/** Local calendar date as YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Keep one growth point per day (levels passed, correct answers); last 120 days. */
export function recordDay(p, date = new Date(), total = TOTAL_LEVELS) {
  const d = dayKey(date);
  const point = { d, p: passedCount(p, total), c: p.stats?.correct ?? 0 };
  p.history ??= [];
  const last = p.history[p.history.length - 1];
  if (last && last.d === d) p.history[p.history.length - 1] = point;
  else p.history.push(point);
  if (p.history.length > 120) p.history.splice(0, p.history.length - 120);
  return point;
}

/** Public, shareable summary for the class board (no answers, no email). */
export function summarize(p, name, total = TOTAL_LEVELS) {
  let stars = 0;
  for (let n = 1; n <= total; n++) stars += p.levels[n]?.stars ?? 0;
  const answered = p.stats?.answered ?? 0;
  const correct = Math.min(p.stats?.correct ?? 0, answered);
  return {
    name: String(name ?? '').slice(0, 60),
    level: currentLevel(p, total),
    passed: passedCount(p, total),
    stars: Math.min(stars, total * 3),
    correct,
    answered,
    history: (p.history ?? []).slice(-120),
  };
}
