import test from 'node:test';
import assert from 'node:assert/strict';
import { questionBird, BIRDS } from '../js/celebrate.js';

test('every question in a level gets a different bird + entrance', () => {
  for (let level = 1; level <= 15; level++) {
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      const b = questionBird(level, i);
      const key = `${b.emoji}|${b.move}`;
      assert.ok(!seen.has(key), `level ${level} question ${i + 1} repeats ${key}`);
      seen.add(key);
    }
  }
});

test('neighbouring questions never get the same bird', () => {
  for (let level = 1; level <= 15; level++) {
    for (let i = 1; i < 30; i++) assert.notEqual(questionBird(level, i).emoji, questionBird(level, i - 1).emoji);
  }
});

test('each of the 15 levels has its own end-of-level bird show', () => {
  const keys = new Set();
  for (let level = 1; level <= 15; level++) {
    assert.ok(BIRDS[level], `level ${level} has a celebration`);
    keys.add(`${BIRDS[level].birds.join('')}|${BIRDS[level].style}`);
  }
  assert.equal(keys.size, 15);
});
