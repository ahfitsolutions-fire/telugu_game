import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeEnglish, normalizeHindi, englishNumber, hindiNumber, scoreTranslation, scoreLangAttempt,
} from '../js/translate-score.js';

test('English normalisation: case, articles, punctuation, contractions, numbers', () => {
  assert.deepEqual(normalizeEnglish('The Cow eats grass.'), ['cow', 'eats', 'grass']);
  assert.deepEqual(normalizeEnglish("It's raining!"), ['it', 'is', 'raining']);
  assert.deepEqual(normalizeEnglish('8 planets'), ['eight', 'planets']);
  assert.deepEqual(normalizeEnglish('Two-wheeler'), ['two', 'wheeler']);
  assert.deepEqual(normalizeEnglish("farmer's face"), ['farmers', 'face']);
  assert.equal(englishNumber(400), 'four hundred');
  assert.equal(englishNumber(1234), 'one thousand two hundred thirty four');
});

test('Hindi normalisation: nukta, chandrabindu, half-nasal, danda, digits', () => {
  assert.deepEqual(normalizeHindi('जहाज़'), normalizeHindi('जहाज'));
  assert.deepEqual(normalizeHindi('माँ आई।'), ['मां', 'आई']);
  assert.deepEqual(normalizeHindi('हिन्दी'), normalizeHindi('हिंदी'));
  assert.deepEqual(normalizeHindi('8 ग्रह'), ['आठ', 'ग्रह']);
  assert.deepEqual(normalizeHindi('४०० साल'), ['चार', 'सौ', 'साल']);
  assert.equal(hindiNumber(9), 'नौ');
});

test('English word: exact, with article, plural, wrong word', () => {
  assert.equal(scoreTranslation('elephant', ['an elephant'], { lang: 'en' }).passed, true);
  assert.equal(scoreTranslation('elephant', ['Elephant'], { lang: 'en' }).score, 1);
  assert.equal(scoreTranslation('elephant', ['elephants'], { lang: 'en' }).passed, true);
  assert.equal(scoreTranslation('elephant', ['umbrella'], { lang: 'en' }).passed, false);
  assert.equal(scoreTranslation('elephant', ['the elephant is big'], { lang: 'en' }).passed, true);
});

test('Accepted alternatives pass (rat / mouse)', () => {
  const r = scoreTranslation('rat', ['mouse'], { lang: 'en', accept: ['mouse'] });
  assert.equal(r.passed, true);
  assert.equal(r.accepted, true);
  assert.equal(scoreTranslation('rat', ['mouse'], { lang: 'en' }).passed, false);
});

test('English sentence: alignment, tokens and the best alternative', () => {
  const r = scoreTranslation('The cow eats grass.', ['cow eat grass', 'how heats glass'], { lang: 'en', threshold: 0.7 });
  assert.equal(r.passed, true);
  assert.equal(r.heard, 'cow eat grass');
  assert.deepEqual(r.tokens.map((x) => x.status), ['skip', 'ok', 'ok', 'ok']);
  const half = scoreTranslation('The sun rises in the east.', ['the sun'], { lang: 'en', threshold: 0.7 });
  assert.equal(half.passed, false);
  assert.deepEqual(half.tokens.map((x) => x.status), ['skip', 'ok', 'missing', 'missing', 'skip', 'missing']);
});

test('Hindi word and sentence', () => {
  assert.equal(scoreTranslation('हाथी', ['हाथी'], { lang: 'hi' }).score, 1);
  assert.equal(scoreTranslation('जहाज़', ['जहाज'], { lang: 'hi' }).score, 1);
  assert.equal(scoreTranslation('माँ आई।', ['मां आई'], { lang: 'hi', threshold: 0.7 }).passed, true);
  assert.equal(scoreTranslation('गाय घास खाती है।', ['गाय घास खाती है'], { lang: 'hi', threshold: 0.7 }).score, 1);
  assert.equal(scoreTranslation('गाय घास खाती है।', ['बिल्ली दूध पीती'], { lang: 'hi', threshold: 0.7 }).passed, false);
});

test('No speech / empty alternatives give score 0 and uncoloured tokens', () => {
  const r = scoreTranslation('elephant', [], { lang: 'en' });
  assert.equal(r.score, 0);
  assert.equal(r.passed, false);
  assert.equal(r.tokens[0].status, null);
});

test('Every question in every level passes when the translation itself is heard', () => {
  for (let n = 1; n <= 15; n++) {
    const level = JSON.parse(readFileSync(new URL(`../data/levels/level${String(n).padStart(2, '0')}.json`, import.meta.url), 'utf8'));
    for (const q of level.questions) {
      for (const lang of ['en', 'hi']) {
        const r = scoreLangAttempt(level, q, lang, [q[lang]]);
        assert.equal(r.score, 1, `${q.id} ${lang}: ${q[lang]}`);
        for (const alt of q[`${lang}Accept`] ?? []) assert.equal(scoreLangAttempt(level, q, lang, [alt]).passed, true, `${q.id} ${lang} accept ${alt}`);
      }
    }
  }
});
