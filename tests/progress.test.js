import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/progress.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

const questions = ['easy', 'medium', 'hard'].flatMap((d, b) =>
  Array.from({ length: 10 }, (_, i) => ({ id: `L01-Q${String(b * 10 + i + 1).padStart(2, '0')}`, difficulty: d })));

test('only level 1 is unlocked at the start', () => {
  const p = P.emptyProgress();
  assert.equal(P.isUnlocked(p, 1), true);
  assert.equal(P.isUnlocked(p, 2), false);
  assert.equal(P.currentLevel(p), 1);
});

test('orderQuestions keeps easy → medium → hard blocks', () => {
  const order = P.orderQuestions(questions);
  const diff = (id) => questions.find((q) => q.id === id).difficulty;
  assert.equal(order.length, 30);
  assert.equal(new Set(order).size, 30);
  assert.ok(order.slice(0, 10).every((id) => diff(id) === 'easy'));
  assert.ok(order.slice(10, 20).every((id) => diff(id) === 'medium'));
  assert.ok(order.slice(20).every((id) => diff(id) === 'hard'));
  assert.deepEqual(P.orderQuestions(questions, { shuffle: false }), questions.map((q) => q.id));
});

function play(p, n, correctCount) {
  P.startAttempt(p, n, questions.map((q) => q.id));
  questions.forEach((q, i) => P.recordAnswer(p, n, { id: q.id, passed: i < correctCount, score: i < correctCount ? 1 : 0.4 }));
  return P.finishAttempt(p, n, 24);
}

test('failing keeps the next level locked; passing unlocks it', () => {
  const p = P.emptyProgress();
  const fail = play(p, 1, 20);
  assert.equal(fail.passed, false);
  assert.equal(fail.failedIds.length, 10);
  assert.equal(P.isUnlocked(p, 2), false);
  const pass = play(p, 1, 26);
  assert.equal(pass.passed, true);
  assert.equal(pass.stars, 2);
  assert.equal(P.isUnlocked(p, 2), true);
  assert.equal(p.levels[1].best, 26);
  assert.equal(p.levels[1].attempts, 2);
  assert.equal(p.levels[1].current, undefined);
});

test('a later failed retry does not take away a pass', () => {
  const p = P.emptyProgress();
  play(p, 1, 29);
  play(p, 1, 10);
  assert.equal(P.isPassed(p, 1), true);
  assert.equal(p.levels[1].best, 29);
  assert.equal(p.levels[1].stars, 3);
});

test('stars', () => {
  assert.equal(P.starsFor(23, 24), 0);
  assert.equal(P.starsFor(24, 24), 1);
  assert.equal(P.starsFor(25, 24), 2);
  assert.equal(P.starsFor(28, 24), 3);
  assert.equal(P.starsFor(22, 22), 1);
});

test('mid-level progress survives save / load (resume after reload)', () => {
  const s = memoryStorage();
  const p = P.emptyProgress();
  p.student = 'రాము';
  P.startAttempt(p, 1, questions.map((q) => q.id));
  P.recordAnswer(p, 1, { id: 'L01-Q01', passed: true, score: 1, heard: 'అల', tries: 1 });
  P.setTries(p, 1, 2);
  P.saveProgress(p, s);
  const back = P.loadProgress(s);
  assert.equal(back.student, 'రాము');
  assert.equal(back.levels[1].current.results.length, 1);
  assert.equal(back.levels[1].current.tries, 2);
});

test('corrupt or missing storage gives empty progress', () => {
  const s = memoryStorage();
  s.setItem(P.STORAGE_KEY, '{not json');
  assert.deepEqual(P.loadProgress(s), P.emptyProgress());
  assert.deepEqual(P.loadProgress(null), P.emptyProgress());
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(P.loadProgress(throwing), P.emptyProgress());
  assert.equal(P.saveProgress(P.emptyProgress(), throwing), false);
});

test('paragraph levels: every passage must reach passageMin', () => {
  const p = P.emptyProgress();
  const ids = questions.map((q) => q.id);
  const passageOf = (id) => `P${Math.floor((Number(id.slice(-2)) - 1) / 3)}`; // 10 passages × 3
  P.startAttempt(p, 9, ids);
  // 27 correct, but all 3 sentences of the first passage wrong
  ids.forEach((id, i) => P.recordAnswer(p, 9, { id, passed: i >= 3 }));
  const r = P.finishAttempt(p, 9, 22, { passageOf, passageMin: 0.6 });
  assert.equal(r.correct, 27);
  assert.equal(r.passed, false);
  assert.deepEqual(r.weakPassages, ['P0']);
  assert.equal(r.stars, 0);
  // 2 of 3 in every passage (67 %) → passes the passage rule
  P.startAttempt(p, 9, ids);
  ids.forEach((id, i) => P.recordAnswer(p, 9, { id, passed: i % 3 !== 2 }));
  const ok = P.finishAttempt(p, 9, 20, { passageOf, passageMin: 0.6 });
  assert.equal(ok.passed, true);
});

test('stats, daily history and public summary', () => {
  const p = P.emptyProgress();
  P.startAttempt(p, 1, questions.map((q) => q.id));
  questions.forEach((q, i) => P.recordAnswer(p, 1, { id: q.id, passed: i < 26 }));
  P.finishAttempt(p, 1, 24);
  assert.deepEqual(p.stats, { answered: 30, correct: 26 });
  P.recordDay(p, new Date(2026, 10, 9));
  P.recordDay(p, new Date(2026, 10, 10));
  P.recordDay(p, new Date(2026, 10, 10));
  assert.deepEqual(p.history.map((x) => x.d), ['2026-11-09', '2026-11-10']);
  const s = P.summarize(p, 'రాము');
  assert.deepEqual({ ...s, history: s.history.length }, {
    name: 'రాము', level: 2, passed: 1, stars: 2, correct: 26, answered: 30, history: 2,
  });
});

test('skipped questions do not count as answered', () => {
  const p = P.emptyProgress();
  P.startAttempt(p, 1, ['a', 'b']);
  P.recordAnswer(p, 1, { id: 'a', passed: false, skipped: true });
  P.recordAnswer(p, 1, { id: 'b', passed: true });
  assert.deepEqual(p.stats, { answered: 1, correct: 1 });
});

test('mastery: every question must be passed; stars from first-try answers', () => {
  const p = P.emptyProgress();
  const ids = questions.map((q) => q.id);
  P.startAttempt(p, 1, ids);
  // all 30 passed in the end; 4 needed more than one try
  ids.forEach((id, i) => P.recordAnswer(p, 1, { id, passed: true, tries: i < 4 ? 3 : 1 }));
  const r = P.finishAttempt(p, 1, 24, { mastery: true });
  assert.equal(r.passed, true);
  assert.equal(r.correct, 30);
  assert.equal(r.firstTry, 26);
  assert.equal(r.stars, 2);
  assert.equal(r.retriedIds.length, 4);
  assert.equal(p.levels[1].best, 26);
  assert.equal(p.stats.correct, 26); // accuracy counts first-try answers
  assert.equal(P.isUnlocked(p, 2), true);
});

test('mastery: an unfinished attempt does not pass', () => {
  const p = P.emptyProgress();
  P.startAttempt(p, 1, ['a', 'b', 'c']);
  P.recordAnswer(p, 1, { id: 'a', passed: true, tries: 1 });
  P.recordAnswer(p, 1, { id: 'b', passed: false, tries: 7 });
  assert.equal(P.finishAttempt(p, 1, 1, { mastery: true }).passed, false);
  assert.equal(P.isUnlocked(p, 2), false);
});

test('mastery: reaching the last question opens the next level even with no question passed', () => {
  const p = P.emptyProgress();
  P.startAttempt(p, 1, ['a', 'b']);
  P.recordAnswer(p, 1, { id: 'a', passed: false, tries: 7 });
  P.recordAnswer(p, 1, { id: 'b', passed: false, tries: 7 });
  const r = P.finishAttempt(p, 1, 24, { mastery: true });
  assert.equal(r.passed, true);
  assert.equal(r.correct, 0);
  assert.equal(r.firstTry, 0);
  assert.deepEqual(r.failedIds, ['a', 'b']);
  assert.equal(P.isUnlocked(p, 2), true);
});
