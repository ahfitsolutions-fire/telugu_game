// Sends a small progress summary to the teacher's Google Sheet (apps-script/Code.gs).
// Nothing is sent unless SHEET_URL is set AND the student has typed a name and class code.
// Sent: class code, name, a random device id, current level/question, levels passed, stars,
// first-try correct, words answered, best score per level. Never audio.

import { SHEET_URL } from './sync-config.js?v=9';
import * as P from './progress.js?v=9';

const DEVICE_KEY = 'telugu-ladder-device';
const EVERY_MS = 15000; // word-by-word progress is sent at most this often
let pending = null;
let timer = null;

export const syncEnabled = (url = SHEET_URL) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url);

export function deviceId(storage = globalThis.localStorage) {
  try {
    let id = storage?.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9-]{6,40}$/.test(id)) {
      id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      storage?.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'no-storage-device';
  }
}

/** The level the student is in the middle of (most recently started), if any. */
function inProgress(p) {
  let best = null;
  for (const [n, L] of Object.entries(p.levels ?? {})) {
    if (L?.current && (!best || (L.current.startedAt ?? 0) >= (best.startedAt ?? 0))) {
      best = { level: Number(n), question: L.current.results.length + 1, startedAt: L.current.startedAt };
    }
  }
  return best;
}

export function buildPayload(p, event, device, total = P.TOTAL_LEVELS) {
  const now = inProgress(p);
  let stars = 0;
  for (let n = 1; n <= total; n++) stars += p.levels?.[n]?.stars ?? 0;
  return {
    event,
    classCode: String(p.classCode ?? '').trim(),
    name: String(p.student ?? '').trim(),
    device,
    level: now?.level ?? P.currentLevel(p, total),
    question: now?.question ?? 0,
    passed: P.passedCount(p, total),
    stars,
    firstTry: p.stats?.correct ?? 0,
    answered: p.stats?.answered ?? 0,
    best: Array.from({ length: total }, (_, i) => p.levels?.[i + 1]?.best ?? 0),
  };
}

function send(body, url = SHEET_URL) {
  try {
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    if (globalThis.navigator?.sendBeacon?.(url, blob)) return;
  } catch { /* fall back to fetch */ }
  // text/plain + no-cors = a "simple" request: no CORS preflight, which Apps Script cannot answer
  globalThis.fetch?.(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }).catch(() => {});
}

export function flush() {
  clearTimeout(timer);
  timer = null;
  if (!pending) return;
  const body = JSON.stringify(pending);
  pending = null;
  send(body);
}

/**
 * Queue a report. 'progress' events are batched (at most every 15 s);
 * 'open', 'level_start' and 'level_complete' are sent straight away.
 */
export function report(p, event = 'progress') {
  if (!syncEnabled()) return false;
  if (!String(p.student ?? '').trim() || !String(p.classCode ?? '').trim()) return false;
  pending = buildPayload(p, event, deviceId());
  if (event !== 'progress') { flush(); return true; }
  timer ??= setTimeout(flush, EVERY_MS);
  return true;
}

/** Teacher page: read all students (needs the teacher key). */
export async function fetchClass(key) {
  const res = await fetch(`${SHEET_URL}?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
  return res.json();
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
