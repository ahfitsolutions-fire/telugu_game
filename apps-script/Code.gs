/**
 * Telugu Pronunciation Ladder – class progress logger.
 *
 * Paste this into the Google Sheet's Extensions → Apps Script, set TEACHER_KEY
 * (and optionally CLASS_CODES), then Deploy → Web app (Execute as: Me, Who has access: Anyone).
 * Full steps: apps-script/SETUP.md in the project.
 *
 *   POST  (from the app)            → updates the student's row in "Students"; level start/finish also go to "Log"
 *   GET   ?key=TEACHER_KEY          → JSON list of students for the teacher page
 *
 * Do NOT commit your real TEACHER_KEY to GitHub – change it only inside the Apps Script editor.
 */

const TEACHER_KEY = 'CHANGE-ME';   // teacher-page password: change it before deploying (8+ characters)
const CLASS_CODES = [];            // e.g. ['7B', '8A']. Empty = accept any class code.

const LEVELS = 10;
const STUDENTS = 'Students';
const LOG = 'Log';
const HEAD = [
  'Class', 'Name', 'Device', 'Current level', 'Question', 'Levels passed', 'Stars',
  'First-try correct', 'Words answered', 'Accuracy %',
  ...Array.from({ length: LEVELS }, (_, i) => `L${i + 1} best`),
  'Last event', 'Last active', 'First seen',
];
const LOG_HEAD = ['Time', 'Class', 'Name', 'Device', 'Event', 'Level', 'Levels passed', 'Stars'];
const EVENTS = ['open', 'progress', 'level_start', 'level_complete'];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  const v = validate_(data);
  if (!v) return json_({ ok: false, error: 'invalid' });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    upsertStudent_(v);
    if (v.event === 'level_start' || v.event === 'level_complete' || v.event === 'open') appendLog_(v);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) { /* not held */ }
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!keyIsSet_() || p.key !== TEACHER_KEY) return json_({ ok: false, error: 'key' });
  const sh = sheet_(STUDENTS, HEAD);
  const values = sh.getDataRange().getValues();
  values.shift(); // header
  const students = values.filter((r) => r[1] !== '').map((r) => ({
    classCode: String(r[0]),
    name: String(r[1]),
    device: String(r[2]),
    level: Number(r[3]) || 1,
    question: Number(r[4]) || 0,
    passed: Number(r[5]) || 0,
    stars: Number(r[6]) || 0,
    firstTry: Number(r[7]) || 0,
    answered: Number(r[8]) || 0,
    accuracy: Number(r[9]) || 0,
    best: r.slice(10, 10 + LEVELS).map((x) => Number(x) || 0),
    lastEvent: String(r[10 + LEVELS]),
    lastActive: toIso_(r[11 + LEVELS]),
    firstSeen: toIso_(r[12 + LEVELS]),
  }));
  return json_({ ok: true, sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(), students });
}

// ---------- helpers ----------

function keyIsSet_() {
  return typeof TEACHER_KEY === 'string' && TEACHER_KEY.length >= 8 && TEACHER_KEY !== 'CHANGE-ME';
}

function int_(x, min, max) {
  const n = Math.round(Number(x));
  if (!isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Plain text, trimmed, and never starting with = + - @ (stops spreadsheet formula injection). */
function text_(x, max) {
  let s = String(x == null ? '' : x).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function validate_(d) {
  if (!d || typeof d !== 'object') return null;
  const classCode = text_(d.classCode, 20).toUpperCase();
  const name = text_(d.name, 40);
  const device = String(d.device || '');
  if (!classCode || !name || !/^[A-Za-z0-9-]{6,40}$/.test(device)) return null;
  if (CLASS_CODES.length && CLASS_CODES.map((c) => String(c).toUpperCase()).indexOf(classCode) < 0) return null;
  const event = EVENTS.indexOf(d.event) >= 0 ? d.event : 'progress';
  const best = Array.isArray(d.best) ? d.best : [];
  const answered = int_(d.answered, 0, 1e6);
  const firstTry = int_(d.firstTry, 0, answered);
  return {
    classCode, name, device, event,
    level: int_(d.level, 1, LEVELS),
    question: int_(d.question, 0, 100),
    passed: int_(d.passed, 0, LEVELS),
    stars: int_(d.stars, 0, LEVELS * 3),
    firstTry,
    answered,
    accuracy: answered ? Math.round((firstTry / answered) * 100) : 0,
    best: Array.from({ length: LEVELS }, (_, i) => int_(best[i], 0, 30)),
  };
}

function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold').setBackground('#e8eefc');
    sh.setFrozenRows(1);
  }
  return sh;
}

function upsertStudent_(v) {
  const sh = sheet_(STUDENTS, HEAD);
  const now = new Date();
  const last = sh.getLastRow();
  let row = -1;
  let firstSeen = now;
  if (last > 1) {
    const keys = sh.getRange(2, 1, last - 1, 3).getValues(); // Class, Name, Device
    for (let i = 0; i < keys.length; i++) {
      if (String(keys[i][2]) === v.device && String(keys[i][1]).toLowerCase() === v.name.toLowerCase()) {
        row = i + 2;
        firstSeen = sh.getRange(row, HEAD.length).getValue() || now;
        break;
      }
    }
  }
  const values = [
    v.classCode, v.name, v.device, v.level, v.question, v.passed, v.stars,
    v.firstTry, v.answered, v.accuracy, ...v.best, v.event, now, firstSeen,
  ];
  if (row < 0) sh.appendRow(values);
  else sh.getRange(row, 1, 1, values.length).setValues([values]);
}

function appendLog_(v) {
  sheet_(LOG, LOG_HEAD).appendRow([new Date(), v.classCode, v.name, v.device, v.event, v.level, v.passed, v.stars]);
}

function toIso_(x) {
  return x instanceof Date ? x.toISOString() : String(x || '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
