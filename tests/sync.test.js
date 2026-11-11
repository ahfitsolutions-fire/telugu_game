import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, syncEnabled, deviceId, report } from '../js/sync.js?v=8';
import * as P from '../js/progress.js?v=8';

test('syncEnabled only accepts an Apps Script web-app URL', () => {
  assert.equal(syncEnabled(''), false);
  assert.equal(syncEnabled('https://example.com/exec'), false);
  assert.equal(syncEnabled('https://script.google.com/macros/s/AKfycbx_abc-123/exec'), true);
  assert.equal(syncEnabled('https://script.google.com/macros/s/AKfycbx_abc-123/dev'), false);
});

test('nothing is sent while SHEET_URL is empty (repo default)', () => {
  const p = { ...P.emptyProgress(), student: 'Ravi', classCode: '7B' };
  assert.equal(report(p, 'open'), false);
});

test('deviceId is created once and reused', () => {
  const m = new Map();
  const storage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const a = deviceId(storage);
  assert.match(a, /^[A-Za-z0-9-]{6,40}$/);
  assert.equal(deviceId(storage), a);
});

test('payload: current level/question, totals and best per level', () => {
  const p = { ...P.emptyProgress(), student: ' Ravi ', classCode: '7B' };
  const ids = Array.from({ length: 30 }, (_, i) => `L01-Q${String(i + 1).padStart(2, '0')}`);
  P.startAttempt(p, 1, ids);
  ids.forEach((id, i) => P.recordAnswer(p, 1, { id, passed: true, tries: i < 2 ? 2 : 1 }));
  P.finishAttempt(p, 1, 24, { mastery: true });
  P.startAttempt(p, 2, ['a', 'b', 'c']);
  P.recordAnswer(p, 2, { id: 'a', passed: true, tries: 1 });
  const x = buildPayload(p, 'progress', 'dev-123456');
  assert.deepEqual(x, {
    event: 'progress', classCode: '7B', name: 'Ravi', device: 'dev-123456',
    level: 2, question: 2, passed: 1, stars: 3, firstTry: 29, answered: 31,
    best: [28, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  });
});

test('payload without a level in progress points at the next level', () => {
  const p = { ...P.emptyProgress(), student: 'Priya', classCode: '7B' };
  const x = buildPayload(p, 'open', 'dev-abcdef');
  assert.equal(x.level, 1);
  assert.equal(x.question, 0);
  assert.equal(x.passed, 0);
});
