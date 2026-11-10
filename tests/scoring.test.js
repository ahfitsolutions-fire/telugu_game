import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText } from '../js/normalize.js';
import { similarity, scoreWord, scoreSentence, scoreAttempt } from '../js/scoring.js';

test('normalize: punctuation, zero-width, digits, spaces', () => {
  assert.equal(normalizeText(' "అమ్మ  వచ్చింది!" '), 'అమ్మ వచ్చింది');
  assert.equal(normalizeText('నువ్వు ఎక్కడికి వెళ్తున్నావు?'), 'నువ్వు ఎక్కడికి వెళ్తున్నావు');
  assert.equal(normalizeText('బ్రౌజర్‌లో'), 'బ్రౌజర్లో');
  assert.equal(normalizeText('పాఠం 5 ౫'), 'పాఠం');
  assert.equal(normalizeText('వాక్యం। ఇంకొకటి॥'), 'వాక్యం ఇంకొకటి');
});

test('normalize: word-final ము ≈ ం (and can be switched off)', () => {
  assert.equal(normalizeText('పుస్తకము'), 'పుస్తకం');
  assert.equal(normalizeText('ఇనుము చక్రము'), 'ఇనుం చక్రం');
  assert.equal(normalizeText('ము'), 'ము');
  assert.equal(normalizeText('పుస్తకము', { muToAnusvara: false }), 'పుస్తకము');
});

test('similarity', () => {
  assert.equal(similarity(['అ', 'మ్మ'], ['అ', 'మ్మ']), 1);
  assert.equal(similarity(['పా', 'ఠ', 'శా', 'ల'], ['పా', 'ట', 'శా', 'ల']), 0.75);
  assert.equal(similarity([], []), 1);
});

test('scoreWord: exact match passes with full diff', () => {
  const r = scoreWord('చక్రం', ['చక్రం'], { threshold: 0.85 });
  assert.equal(r.score, 1);
  assert.equal(r.passed, true);
  assert.deepEqual(r.words[0].aksharas.map((a) => a.status), ['ok', 'ok']);
});

test('scoreWord: one wrong akshara out of four fails at 0.80', () => {
  const r = scoreWord('పాఠశాల', ['పాటశాల'], { threshold: 0.8 });
  assert.equal(r.score, 0.75);
  assert.equal(r.passed, false);
  assert.deepEqual(r.words[0].aksharas.map((a) => a.status), ['ok', 'wrong', 'ok', 'ok']);
});

test('scoreWord: best of the alternatives wins', () => {
  const r = scoreWord('పాఠశాల', ['పాటశాల', 'పాఠశాల', 'బాట'], { threshold: 0.8 });
  assert.equal(r.score, 1);
  assert.equal(r.heard, 'పాఠశాల');
});

test('scoreWord: accept list and ము ending', () => {
  assert.equal(scoreWord('ఱంపం', ['రంపం'], { accept: ['రంపం'] }).passed, true);
  assert.equal(scoreWord('ఱంపం', ['రంపం'], { accept: ['రంపం'] }).accepted, true);
  assert.equal(scoreWord('పుస్తకం', ['పుస్తకము']).score, 1);
});

test('scoreWord: recogniser splitting the word or adding words', () => {
  assert.equal(scoreWord('ఉడుత', ['ఉ డుత']).score, 1);
  assert.equal(scoreWord('ఆట', ['ఆట ఆడు']).score, 1);
});

test('scoreWord: nothing heard', () => {
  const r = scoreWord('అల', []);
  assert.equal(r.score, 0);
  assert.equal(r.passed, false);
  assert.deepEqual(r.words[0].aksharas.map((a) => a.status), ['missing', 'missing']);
});

test('scoreSentence: exact sentence, punctuation ignored', () => {
  const r = scoreSentence('అమ్మ వచ్చింది.', ['అమ్మ వచ్చింది']);
  assert.equal(r.score, 1);
  assert.equal(r.passed, true);
  assert.equal(r.words.length, 2);
});

test('scoreSentence: a missing word counts as 0', () => {
  const r = scoreSentence('పాప పాట పాడింది.', ['పాప పాడింది']);
  assert.ok(Math.abs(r.score - 2 / 3) < 1e-9);
  assert.equal(r.words[1].score, 0);
  assert.deepEqual(r.words[1].aksharas.map((a) => a.status), ['missing', 'missing']);
  assert.equal(r.passed, false);
});

test('scoreSentence: partly wrong word gets partial credit', () => {
  const r = scoreSentence('అక్క పప్పు వండింది', ['అక్క పప్పు వండిది'], { threshold: 0.8 });
  // వండింది = [వం, డిం, ది] … heard [వం, డి, ది]
  assert.ok(r.score > 0.6 && r.score < 1);
  assert.equal(r.words[0].score, 1);
  assert.equal(r.words[1].score, 1);
});

test('scoreAttempt picks the scorer from taskType and threshold from the level', () => {
  const wordLevel = { taskType: 'word', threshold: 0.85 };
  const sentLevel = { taskType: 'sentence', threshold: 0.8 };
  assert.equal(scoreAttempt(wordLevel, { text: 'అమ్మ' }, ['అమ్మ']).passed, true);
  assert.equal(scoreAttempt(sentLevel, { text: 'నది పారుతోంది.' }, ['నది పారుతోంది']).passed, true);
});
