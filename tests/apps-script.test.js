// Runs apps-script/Code.gs in Node against a small in-memory fake of the Sheets API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

function fakeSpreadsheet() {
  const sheets = new Map();
  const makeSheet = (name) => {
    const rows = [];
    const range = (r, c, nr = 1, nc = 1) => ({
      setValues(v) { v.forEach((row, i) => { rows[r - 1 + i] ??= []; row.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => rows[r - 1 + i]?.[c - 1 + j] ?? '')); },
      getValue() { return rows[r - 1]?.[c - 1] ?? ''; },
      setFontWeight() { return this; },
      setBackground() { return this; },
    });
    const sh = {
      name, rows,
      getRange: range,
      getLastRow: () => rows.length,
      appendRow: (v) => rows.push([...v]),
      setFrozenRows() {},
      getDataRange: () => ({ getValues: () => rows.map((r) => [...r]) }),
    };
    sheets.set(name, sh);
    return sh;
  };
  return {
    sheets,
    getSheetByName: (n) => sheets.get(n) ?? null,
    insertSheet: (n) => makeSheet(n),
    getUrl: () => 'https://docs.google.com/spreadsheets/d/TEST',
  };
}

function load({ key = 'teacher-secret-1', codes = '[]' } = {}) {
  const ss = fakeSpreadsheet();
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ text: s, setMimeType() { return this; } }),
    },
  };
  vm.createContext(ctx);
  const src = SOURCE
    .replace("const TEACHER_KEY = 'CHANGE-ME';", `const TEACHER_KEY = ${JSON.stringify(key)};`)
    .replace('const CLASS_CODES = [];', `const CLASS_CODES = ${codes};`);
  vm.runInContext(`${src}\nthis.doPost = doPost; this.doGet = doGet;`, ctx);
  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  const get = (params) => JSON.parse(ctx.doGet({ parameter: params }).text);
  return { ss, post, get };
}

const base = {
  event: 'progress', classCode: '7b', name: 'Ravi', device: 'dev-123456',
  level: 2, question: 5, passed: 1, stars: 3, firstTry: 30, answered: 34, best: [28],
};

test('first report creates the Students sheet and a row', () => {
  const { ss, post } = load();
  assert.deepEqual(post(base), { ok: true });
  const rows = ss.sheets.get('Students').rows;
  assert.equal(rows.length, 2); // header + 1
  assert.equal(rows[0][0], 'Class');
  assert.deepEqual(rows[1].slice(0, 10), ['7B', 'Ravi', 'dev-123456', 2, 5, 1, 3, 30, 34, 88]);
  assert.equal(rows[1][10], 28); // L1 best
});

test('same student + device updates the row instead of adding one', () => {
  const { ss, post } = load();
  post(base);
  post({ ...base, question: 9, answered: 40 });
  post({ ...base, name: 'ravi', level: 3, question: 1, passed: 2 }); // name match ignores case
  const rows = ss.sheets.get('Students').rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[1][3], 3);
  assert.equal(rows[1][5], 2);
});

test('different device or name gets its own row', () => {
  const { ss, post } = load();
  post(base);
  post({ ...base, device: 'dev-999999' });
  post({ ...base, name: 'Priya' });
  assert.equal(ss.sheets.get('Students').rows.length, 4);
});

test('level start / complete and open are logged; plain progress is not', () => {
  const { ss, post } = load();
  post(base);
  post({ ...base, event: 'level_start' });
  post({ ...base, event: 'level_complete' });
  post({ ...base, event: 'open' });
  const log = ss.sheets.get('Log').rows;
  assert.equal(log.length, 4); // header + 3
  assert.deepEqual(log.slice(1).map((r) => r[4]), ['level_start', 'level_complete', 'open']);
});

test('invalid input is rejected and nothing is written', () => {
  const { ss, post } = load();
  assert.equal(post('not json').ok, false);
  assert.equal(post({ ...base, name: '' }).ok, false);
  assert.equal(post({ ...base, classCode: '' }).ok, false);
  assert.equal(post({ ...base, device: 'x' }).ok, false);
  assert.equal(post({ ...base, device: '<script>' }).ok, false);
  assert.equal(ss.sheets.get('Students'), undefined);
});

test('numbers are clamped and formulas are neutralised', () => {
  const { ss, post } = load();
  post({ ...base, name: '=HYPERLINK("x")', level: 99, stars: -5, firstTry: 999, answered: 10, best: [500, -1] });
  const r = ss.sheets.get('Students').rows[1];
  assert.equal(r[1], "'=HYPERLINK(\"x\")");
  assert.equal(r[3], 10); // level clamped
  assert.equal(r[6], 0); // stars clamped
  assert.equal(r[7], 10); // firstTry ≤ answered
  assert.equal(r[9], 100);
  assert.deepEqual([r[10], r[11]], [30, 0]);
});

test('class codes can be restricted', () => {
  const { post } = load({ codes: "['7B','8A']" });
  assert.equal(post(base).ok, true); // '7b' → '7B'
  assert.equal(post({ ...base, classCode: '9C' }).ok, false);
});

test('teacher GET needs the right key', () => {
  const { post, get } = load();
  post(base);
  assert.equal(get({}).ok, false);
  assert.equal(get({ key: 'wrong' }).ok, false);
  const res = get({ key: 'teacher-secret-1' });
  assert.equal(res.ok, true);
  assert.equal(res.sheetUrl, 'https://docs.google.com/spreadsheets/d/TEST');
  assert.equal(res.students.length, 1);
  assert.equal(res.students[0].name, 'Ravi');
  assert.equal(res.students[0].best.length, 10);
});

test('the default placeholder key never unlocks the data', () => {
  const { post, get } = load({ key: 'CHANGE-ME' });
  post(base);
  assert.equal(get({ key: 'CHANGE-ME' }).ok, false);
});
