// Routing and screens: level carousel (#/), level (#/level/N), my progress charts (#/progress).
// Progress lives in this browser (localStorage).
// Website language (te / en / hi) is chosen on the first visit (#/lang to change it).
// Practice rule: every question is said in తెలుగు ➜ English ➜ हिंदी. Each language is finished when it
// is read correctly, or after 7 wrong tries (marked "practise later"). Finishing every question opens
// the next level. Stars = language steps right on the first try.

import { splitAksharas, hasTelugu } from './akshara.js?v=10';
import { scoreAttempt } from './scoring.js?v=10';
import * as P from './progress.js?v=10';
import { listen, speechSupport } from './speech.js?v=10';
import { speakIn } from './tts.js?v=10';
import { scoreLangAttempt } from './translate-score.js?v=10';
import { renderProgress } from './progress-view.js?v=10';
import { celebrate, chirp, questionBird } from './celebrate.js?v=10';
import { report, syncEnabled } from './sync.js?v=10';
import { renderTeacher } from './teacher-view.js?v=10';

const app = document.getElementById('app');
const TYPE_MODE = new URLSearchParams(location.search).has('type');
const REDUCED_MOTION = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const HINT_AFTER = 3; // show the akshara split automatically after this many tries
const MAX_TRIES = 7; // after this many wrong tries the question is marked "practise later" and Next opens

const LANGS = ['te', 'en', 'hi']; // practice order for every question
const LANG_NAME = { te: 'తెలుగు', en: 'English', hi: 'हिंदी' };
const REC_LANG = { te: 'te-IN', en: 'en-IN', hi: 'hi-IN' }; // speech recognition locales
const LANG_KEY = 'telugu-ladder-lang';

let UI = {};
let UI_TE = {}; // Telugu text: the fallback for any missing key
let uiLang = null; // website language, null until chosen
let LEVELS = [];
let TOTAL = 10;
let progress = P.emptyProgress();
let activeListen = null;
const levelCache = new Map();

// ---------- helpers ----------

function t(key, vars = {}) {
  let s = UI[key] ?? UI_TE[key] ?? key;
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const pad = (n) => String(n).padStart(2, '0');
const starText = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const pick = (list) => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list);
/** Level info with title / concept in the website language. */
function meta(n) {
  const l = LEVELS.find((x) => x.level === n) ?? { level: n, emoji: '⭐', color: '#3b8fe8', title: '', concept: '' };
  const tr = uiLang && uiLang !== 'te' ? l.i18n?.[uiLang] : null;
  return { ...l, title: tr?.title ?? l.title, concept: tr?.concept ?? l.concept };
}

function readLang() {
  try { const v = localStorage.getItem(LANG_KEY); return LANGS.includes(v) ? v : null; } catch { return null; }
}

/** Switch the website language (loads data/ui-text.<lang>.json; Telugu is data/ui-text.json). */
async function setUiLang(code) {
  if (!LANGS.includes(code)) return;
  UI = code === 'te' ? UI_TE : await loadJSON(`data/ui-text.${code}.json`).catch(() => UI_TE);
  uiLang = code;
  try { localStorage.setItem(LANG_KEY, code); } catch { /* private window */ }
  document.documentElement.lang = code;
  document.title = t('appTitle');
}

function save(event = 'progress') {
  P.recordDay(progress, new Date(), TOTAL);
  const ok = P.saveProgress(progress);
  report(progress, event); // to the teacher's Google Sheet, if connected (batched)
  return ok;
}

function show(...nodes) {
  app.replaceChildren(...nodes.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  window.scrollTo(0, 0);
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function loadLevel(n) {
  if (!levelCache.has(n)) levelCache.set(n, await loadJSON(`data/levels/level${pad(n)}.json`));
  return levelCache.get(n);
}

function stopListening() {
  activeListen?.stop();
  activeListen = null;
}

function supportNotice() {
  const s = speechSupport();
  if (s === 'ok') return null;
  return h('div', { class: 'card notice', role: 'alert' }, t(s === 'insecure' ? 'insecure' : 'notSupported'));
}

function backLink() {
  return h('a', { href: '#/', class: 'btn link-btn' }, `← ${t('backToMap')}`);
}

/** Emoji confetti burst (skipped when the user prefers reduced motion). */
function confetti(count = 26) {
  if (REDUCED_MOTION) return;
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  const bits = ['⭐', '🌟', '🎉', '🎈', '✨', '🍬', '🌈'];
  for (let i = 0; i < count; i++) {
    layer.append(h('span', {
      style: `left:${Math.random() * 100}%;animation-delay:${Math.random() * 0.4}s;animation-duration:${1.6 + Math.random() * 1.2}s;font-size:${18 + Math.random() * 18}px`,
    }, pick(bits)));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

/** The parrot buddy with a speech bubble. mood: '' | 'happy' | 'sad' | 'listen' */
function buddy(text, mood = '') {
  const bubble = h('div', { class: 'bubble', 'aria-live': 'polite' }, text);
  const el = h('div', { class: `buddy ${mood}` }, h('span', { class: 'buddy-face', 'aria-hidden': 'true' }, '🦜'), bubble);
  el.say = (msg, m = '') => { bubble.replaceChildren(...[msg].flat().filter(Boolean)); el.className = `buddy ${m}`; };
  return el;
}

function topBar(active) {
  const tab = (href, key, name, icon) => h('a', { href, class: active === name ? 'tab active' : 'tab', 'aria-current': active === name ? 'page' : null }, `${icon} ${t(key)}`);
  const nameInput = h('input', {
    id: 'student-name', type: 'text', value: progress.student ?? '', placeholder: t('namePlaceholder'), maxlength: '40', autocomplete: 'off',
    onchange: (e) => { progress.student = e.target.value.trim(); save(); refreshHome(); },
  });
  const classInput = syncEnabled()
    ? h('label', { class: 'name-field', for: 'class-code' }, `${t('classLabel')}:`, h('input', {
      id: 'class-code', type: 'text', value: progress.classCode ?? '', placeholder: t('classPlaceholder'), maxlength: '20', autocomplete: 'off', class: 'class-input',
      onchange: (e) => { progress.classCode = e.target.value.trim().toUpperCase(); e.target.value = progress.classCode; save(); refreshHome(); },
    }))
    : null;
  return h('header', { class: 'top' },
    h('div', { class: 'top-row' },
      h('h1', { class: 'logo' }, h('span', { class: 'logo-mark', 'aria-hidden': 'true' }, 'అ'), t('appTitle')),
      h('div', { class: 'who-fields' },
        h('label', { class: 'name-field', for: 'student-name' }, `${t('nameLabel')}:`, nameInput),
        classInput)),
    h('nav', { class: 'tabs', 'aria-label': 'menu' },
      tab('#/', 'navLevels', 'map', '🗺️'),
      tab('#/progress', 'navProgress', 'progress', '📊'),
      h('a', { href: '#/lang', class: 'tab lang-tab', title: t('langButton') }, `🌐 ${LANG_NAME[uiLang] ?? ''}`)));
}

/** Re-draw the home screen after the name / class code changes (greeting + tip). */
function refreshHome() {
  if (!location.hash || location.hash === '#/') renderMap();
}

// ---------- level carousel (home) ----------

function levelCarousel(startIndex) {
  const slides = [];
  const cards = [];
  let active = -1;
  let dragMoved = false;

  const track = h('div', { class: 'track', tabindex: '0', role: 'group', 'aria-label': t('navLevels') });
  const dots = h('div', { class: 'dots' });

  LEVELS.map((l) => meta(l.level)).forEach(({ level: n, title, concept, emoji, color }, i) => {
    const passed = P.isPassed(progress, n);
    const unlocked = P.isUnlocked(progress, n);
    const inProgress = !!progress.levels[n]?.current;
    const state = passed ? 'passed' : unlocked ? 'current' : 'locked';
    const action = !unlocked
      ? `🔒 ${t('unlockHint', { p: n - 1 })}`
      : inProgress ? `▶ ${t('continueLevel')}` : passed ? `🔁 ${t('playAgain')}` : `▶ ${t('playNow')}`;
    const card = h('button', {
      class: `lvl3d ${state}`,
      style: `--c:${color}`,
      'aria-label': `${t('level')} ${n} – ${title}${unlocked ? '' : ' 🔒'}`,
      onclick: () => onCard(i),
    },
    h('span', { class: 'art' },
      h('span', { class: 'art-num' }, `${t('level')} ${n}`),
      passed ? h('span', { class: 'art-badge' }, '✓') : null,
      h('span', { class: 'art-emoji', 'aria-hidden': 'true' }, unlocked ? emoji : '🔒')),
    h('span', { class: 'body' },
      h('span', { class: 'lvl-title' }, title),
      h('span', { class: 'ttl' }, concept),
      passed ? h('span', { class: 'stars' }, starText(progress.levels[n]?.stars ?? 1)) : null,
      h('span', { class: 'action' }, action)));
    cards.push(card);
    const slide = h('div', { class: 'slide' }, card);
    slides.push(slide);
    track.append(slide);
    dots.append(h('button', { class: 'dot', style: `--c:${color}`, 'aria-label': `${t('level')} ${n}`, onclick: () => goTo(i) }));
  });

  function goTo(i, smooth = true) {
    const k = Math.max(0, Math.min(slides.length - 1, i));
    const s = slides[k];
    track.scrollTo({ left: s.offsetLeft - (track.clientWidth - s.offsetWidth) / 2, behavior: smooth && !REDUCED_MOTION ? 'smooth' : 'auto' });
  }

  function update() {
    const mid = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    slides.forEach((s, i) => {
      const off = (s.offsetLeft + s.offsetWidth / 2 - mid) / s.offsetWidth;
      const a = Math.abs(off);
      if (a < bestDist) { bestDist = a; best = i; }
      const rot = Math.max(-55, Math.min(55, -off * 34));
      const scale = 1 - Math.min(a, 2) * 0.13;
      cards[i].style.transform = `perspective(1000px) rotateY(${rot}deg) scale(${scale})`;
      cards[i].style.opacity = String(Math.max(0.25, 1 - Math.min(a, 3) * 0.24));
      s.style.zIndex = String(100 - Math.round(a * 10));
    });
    if (best !== active) {
      active = best;
      cards.forEach((c, i) => c.classList.toggle('center', i === active));
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === active));
    }
  }

  function onCard(i) {
    if (dragMoved) return;
    if (i !== active) { goTo(i); return; }
    const n = LEVELS[i].level;
    if (P.isUnlocked(progress, n)) { location.hash = `#/level/${n}`; return; }
    cards[i].classList.remove('nope');
    void cards[i].offsetWidth; // restart the shake animation
    cards[i].classList.add('nope');
  }

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(active + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(active - 1); }
  });

  // drag with the mouse on desktop (touch already swipes natively)
  let drag = null;
  track.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: track.scrollLeft };
    dragMoved = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6 && !dragMoved) { dragMoved = true; track.classList.add('dragging'); }
    if (dragMoved) track.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    if (dragMoved) {
      track.classList.remove('dragging');
      goTo(active);
      setTimeout(() => { dragMoved = false; }, 0);
    }
  });

  const prev = h('button', { class: 'nav-arrow prev', 'aria-label': '‹', onclick: () => goTo(active - 1) }, '‹');
  const next = h('button', { class: 'nav-arrow next', 'aria-label': '›', onclick: () => goTo(active + 1) }, '›');
  const root = h('section', { class: 'carousel' }, prev, track, next, dots, h('p', { class: 'swipe-hint' }, t('swipeHint')));
  root.start = () => { goTo(startIndex, false); update(); };
  window.addEventListener('resize', () => { if (root.isConnected) { goTo(active, false); update(); } });
  return root;
}

function renderMap() {
  const done = P.passedCount(progress, TOTAL);
  const current = P.currentLevel(progress, TOTAL);
  const name = progress.student?.trim();
  let stars = 0;
  for (let n = 1; n <= TOTAL; n++) stars += progress.levels[n]?.stars ?? 0;

  const greeting = done === TOTAL
    ? t('greetDone', { name: name || '' })
    : name ? t('greet', { name, n: current }) : t('greetNew');
  const pct = Math.round((done / TOTAL) * 100);
  const carousel = levelCarousel(current - 1);

  const needWho = syncEnabled() && (!name || !progress.classCode);
  show(
    topBar('map'),
    supportNotice(),
    needWho ? h('div', { class: 'card tip', role: 'note' }, `✏️ ${t('syncTip')}`) : null,
    h('section', { class: 'hero card' },
      buddy(greeting, done === TOTAL ? 'happy' : ''),
      h('div', { class: 'hero-stats' },
        h('div', { class: 'jar' }, h('span', { class: 'jar-icon', 'aria-hidden': 'true' }, '⭐'), h('b', {}, String(stars)), h('span', {}, t('starJar'))),
        h('div', { class: 'trail-meter' },
          h('div', { class: 'meter-label' }, `${t('overall', { done, total: TOTAL })}`),
          h('div', { class: 'bar fun', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(TOTAL), 'aria-valuenow': String(done) },
            h('span', { style: `width:${pct}%` }),
            h('i', { class: 'runner', style: `left:clamp(18px, ${pct}%, calc(100% - 18px))`, 'aria-hidden': 'true' }, meta(Math.min(current, TOTAL)).emoji))))),
    carousel,
    h('p', { class: 'muted foot-note' }, t('privacy')),
  );
  requestAnimationFrame(() => carousel.start());
}

// ---------- level intro ----------

async function renderLevel(n) {
  if (!Number.isInteger(n) || n < 1 || n > TOTAL) { location.hash = '#/'; return; }
  if (!P.isUnlocked(progress, n)) {
    show(backLink(), h('div', { class: 'card' }, buddy(t('locked', { p: n - 1 }), 'sad')));
    return;
  }
  show(h('p', { class: 'card' }, t('loading')));
  let level;
  try {
    level = await loadLevel(n);
  } catch {
    show(backLink(), h('div', { class: 'card notice' }, t('loadError')));
    return;
  }
  const m = meta(n);
  const total = level.questions.length;
  const L = progress.levels[n];

  const begin = () => {
    P.startAttempt(progress, n, P.orderQuestions(level.questions, { shuffle: level.taskType !== 'paragraph' }));
    save('level_start');
    renderQuestion(level);
  };
  const buttons = L?.current
    ? [h('button', { class: 'primary big', onclick: () => renderQuestion(level) }, `▶ ${t('resume', { q: L.current.results.length + 1, t: total })}`),
      h('button', { onclick: begin }, `🔁 ${t('restart')}`)]
    : [h('button', { class: 'primary big', onclick: begin }, `▶ ${t('start')}`)];

  show(
    backLink(),
    supportNotice(),
    h('section', { class: 'card intro', style: `--c:${m.color}` },
      h('div', { class: 'intro-emoji', 'aria-hidden': 'true' }, m.emoji),
      h('h2', {}, `${t('level')} ${n} – ${m.title}`),
      h('p', { class: 'intro-concept' }, m.concept),
      h('p', { class: 'lang-steps', 'aria-hidden': 'true' }, LANGS.map((c, i) => h('span', { class: `ls ls-${c}` }, `${i + 1}. ${LANG_NAME[c]}`))),
      h('p', { class: 'rule' }, t('masteryRule', { t: total })),
      L?.best ? h('p', { class: 'muted' }, `${t('best')}: ${L.best} / ${total}  ${starText(L.stars ?? 0)}`) : null,
      h('div', { class: 'row center' }, buttons)),
  );
}

// ---------- question ----------

function audioPath(level, q, index) {
  return q.audio ?? `audio/level${pad(level.level)}/q${pad(index)}.mp3`;
}

/** Fill `box` with the target text; colour aksharas when a scoring result is given. */
function paintTarget(box, text, result) {
  const tokens = text.split(/(\s+)/u);
  const teluguTokens = tokens.filter((tok) => hasTelugu(tok));
  const perWord = result && result.words.length === teluguTokens.length;
  const flat = result ? result.words.flatMap((w) => w.aksharas) : [];
  let wordIdx = 0;
  let flatIdx = 0;
  const nodes = [];
  for (const tok of tokens) {
    if (!tok) continue;
    if (/^\s+$/u.test(tok)) { nodes.push(' '); continue; }
    const units = splitAksharas(tok);
    const statuses = perWord ? result.words[wordIdx]?.aksharas ?? [] : null;
    let unitIdx = 0;
    for (const u of units) {
      if (!hasTelugu(u)) { nodes.push(u); continue; }
      let status = null;
      if (result) {
        const list = perWord ? statuses : flat;
        const k = perWord ? unitIdx : flatIdx;
        status = list.length ? list[Math.min(k, list.length - 1)].status : 'missing';
      }
      nodes.push(h('span', { class: `ak${status ? ` ${status}` : ''}` }, u));
      unitIdx++;
      flatIdx++;
    }
    if (hasTelugu(tok)) wordIdx++;
  }
  box.replaceChildren(...nodes);
}

/** English / Hindi target: colour whole words (ok / wrong / missing). */
function paintPlain(box, text, result) {
  if (!result) { box.textContent = text; return; }
  box.replaceChildren(...result.tokens.flatMap((tk, i) => [i ? ' ' : '', h('span', { class: `wd${tk.status ? ` ${tk.status}` : ''}` }, tk.text)]));
}

function speechErrorText(code) {
  return {
    'no-speech': t('errNoSpeech'),
    'audio-capture': t('errAudioCapture'),
    'not-allowed': t('errNotAllowed'),
    'service-not-allowed': t('errNotAllowed'),
    network: t('errNetwork'),
    unsupported: t('notSupported'),
    insecure: t('insecure'),
  }[code] ?? t('errOther');
}

const textOf = (q, lang) => (lang === 'te' ? q.text : q[lang]);
const hintOf = (q) => (uiLang === 'en' ? q.hintEn : uiLang === 'hi' ? q.hintHi : null) ?? q.hint;
const passageTitleOf = (q) => (uiLang === 'en' ? q.passageTitleEn : uiLang === 'hi' ? q.passageTitleHi : null) ?? q.passageTitle;
const capFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The little bird that sits on every question card (a different bird + entrance per question). */
function perchBird(n, index, fresh) {
  const { emoji, move } = questionBird(n, index);
  const el = h('div', { class: `perch-bird move-${move}${fresh && !REDUCED_MOTION ? '' : ' settled'}`, 'aria-hidden': 'true' },
    h('span', { class: 'pb-body' }, emoji),
    h('span', { class: 'pb-note' }, '♪'));
  el.react = (mood) => {
    el.classList.remove('happy', 'oops', 'listen');
    void el.offsetWidth; // restart the animation
    if (mood) el.classList.add(mood);
  };
  return el;
}

let birdShownFor = null;

function renderQuestion(level) {
  stopListening();
  const n = level.level;
  const m = meta(n);
  const cur = progress.levels[n]?.current;
  if (!cur) { renderLevel(n); return; }
  const total = cur.order.length;
  const index = cur.results.length;
  if (index >= total) { finishLevel(level); return; }
  const q = level.questions.find((x) => x.id === cur.order[index]);
  if (!q) { // content changed under a saved attempt: start over
    P.startAttempt(progress, n, P.orderQuestions(level.questions));
    save();
    renderQuestion(level);
    return;
  }

  // where we are inside this question: step 0 = Telugu, 1 = English, 2 = Hindi
  const langs = Array.isArray(cur.langs) ? cur.langs.slice(0, 3) : [];
  const step = Math.min(langs.length, 2);
  const lang = LANGS[step];
  let tries = cur.tries ?? 0; // survives a reload
  let resolved = false;
  let autoTimer = null;
  const scores = [];

  /** This language is finished (passed, or the try limit was reached). */
  function completeStep(passed, score) {
    resolved = true;
    scores.push(score);
    langs.push({ lang, passed, tries });
    rowStatus(step, passed ? 'done' : 'later');
    micBtn.disabled = true;
    micBtn.textContent = passed ? '✅' : '⏭';
    if (step < 2) {
      P.setStep(progress, n, { step: step + 1, tries: 0, langs });
      save();
      nextBtn.textContent = t('nextLang', { lang: LANG_NAME[LANGS[step + 1]] });
      if (passed) {
        autoTimer = setTimeout(() => {
          if (wordCard.isConnected) renderQuestion(level);
        }, 1600);
      }
    } else {
      const all = langs.every((x) => x.passed);
      P.recordAnswer(progress, n, {
        id: q.id, passed: all, score: scores.reduce((s, x) => s + x, 0) / scores.length, tries: Math.max(...langs.map((x) => x.tries)), langs,
      });
      save();
      nextBtn.textContent = t('nextQuestion');
      if (all) confetti(18);
    }
    nextBtn.disabled = false;
    nextBtn.removeAttribute('title');
    nextBtn.classList.add('primary', 'ready');
    nextBtn.focus();
  }

  if (tries >= MAX_TRIES) { // saved by an older version: count this language as "practise later"
    langs.push({ lang, passed: false, tries });
    if (step < 2) P.setStep(progress, n, { step: step + 1, tries: 0, langs });
    else P.recordAnswer(progress, n, { id: q.id, passed: false, tries, langs });
    save();
    renderQuestion(level);
    return;
  }

  const fresh = birdShownFor !== q.id;
  birdShownFor = q.id;
  const bird = perchBird(n, index, fresh);
  const isWord = level.taskType === 'word';

  // three rows: తెలుగు / English / हिंदी – each with its text and its own 🔊
  const rows = LANGS.map((code, i) => {
    const text = textOf(q, code);
    const box = h('div', { class: `trio-text${i === step && code === 'te' && q.text.length > 18 ? ' long' : ''}`, lang: code });
    if (code === 'te') paintTarget(box, text, null); else box.textContent = code === 'en' ? capFirst(text) : text;
    const done = langs[i];
    const state = done ? (done.passed ? 'done' : 'later') : i === step ? 'now' : 'wait';
    const icon = h('span', { class: 'trio-icon', 'aria-hidden': 'true' });
    const row = h('div', { class: `trio-row ${state}`, 'data-lang': code },
      h('span', { class: 'trio-badge' }, h('b', {}, String(i + 1)), LANG_NAME[code]),
      box,
      h('button', {
        class: 'trio-say', 'aria-label': `${t('listen')} – ${LANG_NAME[code]}`,
        onclick: async () => {
          const ok = await speakIn(code, text, code === 'te' ? audioPath(level, q, index + 1) : null);
          if (!ok) pal.say(code === 'te' ? t('noAudio') : t('noVoice', { lang: LANG_NAME[code] }), 'sad');
        },
      }, '🔊'),
      icon);
    row.box = box;
    row.icon = icon;
    return row;
  });
  function rowStatus(i, state) {
    rows[i].className = `trio-row ${state}`;
    rows[i].icon.textContent = state === 'done' ? '✅' : state === 'later' ? '🎯' : '';
  }
  rows.forEach((r, i) => { if (langs[i]) rowStatus(i, langs[i].passed ? 'done' : 'later'); });
  const target = rows[step].box;

  const passageBox = q.passage
    ? h('div', { class: 'passage', lang },
      h('div', { class: 'passage-title' }, `📖 ${passageTitleOf(q) ?? ''}`),
      level.questions.filter((x) => x.passage === q.passage).map((x) =>
        h('span', { class: x.id === q.id ? 'p-sent now' : 'p-sent' }, `${lang === 'en' ? capFirst(textOf(x, lang)) : textOf(x, lang)} `)))
    : null;

  const hint = hintOf(q);
  const hintBox = h('div', { class: 'hint', hidden: true },
    q.split ? h('div', { class: 'split', lang: 'te' }, q.split) : null,
    hint ? h('div', {}, hint) : null);
  const hasHint = lang === 'te' && (q.split || hint);
  const hintBtn = hasHint ? h('button', { class: 'link-btn', 'aria-expanded': 'false', onclick: () => setHint(hintBox.hidden) }, `💡 ${t('hintShow')}`) : null;
  function setHint(open) {
    if (!hintBtn) return;
    hintBox.hidden = !open;
    hintBtn.textContent = open ? `💡 ${t('hintHide')}` : `💡 ${t('hintShow')}`;
    hintBtn.setAttribute('aria-expanded', String(open));
  }
  if (tries >= HINT_AFTER) setHint(true);

  const pal = buddy(tries ? t('buddyRetry') : step === 0 ? t('buddyReady') : t('buddyReadyLang', { lang: LANG_NAME[lang] }), tries ? 'sad' : '');
  const heardLine = h('p', { class: 'heard' });
  const triesLine = h('p', { class: 'tries muted' }, tries ? t('attemptOfMax', { n: tries + 1, m: MAX_TRIES }) : '');
  const wordCard = h('div', { class: 'card stage-card', style: `--c:${m.color}` });

  const micBtn = h('button', { class: 'primary mic', onclick: onMic });
  const nextBtn = h('button', { class: 'btn-next', disabled: true, title: t('nextLocked'), onclick: onNext }, `${t('next')} ➜`);

  function micLabel() {
    micBtn.textContent = tries > 0 ? `🔁 ${t('repeat')}` : `🎤 ${t('speak')} · ${LANG_NAME[lang]}`;
  }
  micLabel();

  function setListening(on) {
    micBtn.classList.toggle('listening', on);
    if (on) { micBtn.textContent = `⏹ ${t('stop')}`; pal.say(t('buddyListen'), 'listen'); bird.react('listen'); } else micLabel();
  }

  function handleHeard(alternatives) {
    if (resolved) return;
    tries += 1;
    let result;
    if (lang === 'te') {
      result = scoreAttempt(level, q, alternatives);
      paintTarget(target, q.text, result);
    } else {
      result = scoreLangAttempt(level, q, lang, alternatives);
      paintPlain(target, lang === 'en' ? capFirst(q[lang]) : q[lang], result);
    }
    heardLine.replaceChildren(`${t('youSaid')} `, h('b', { lang }, result.heard || '—'));
    const pct = Math.round(result.score * 100);
    wordCard.classList.remove('win', 'shake');
    void wordCard.offsetWidth; // restart animations
    if (result.passed) {
      pal.say(`${t('langDone', { lang: LANG_NAME[lang] })} ${pick(UI.praise ?? UI_TE.praise)} (${pct}%)${tries > 1 ? ` – ${t('gotItAfter', { n: tries })}` : ''}`, 'happy');
      wordCard.classList.add('win');
      bird.react('happy');
      chirp();
      triesLine.textContent = '';
      completeStep(true, result.score);
      return;
    }
    wordCard.classList.add('shake');
    bird.react('oops');
    if (tries >= MAX_TRIES) { // try limit reached: move on, practise this one later
      const msg = step < 2 ? t('maxTriesLang', { n: MAX_TRIES, next: LANG_NAME[LANGS[step + 1]] }) : t('maxTriesReached', { n: MAX_TRIES });
      pal.say(`🌟 ${msg}`, '');
      triesLine.textContent = '';
      setHint(true);
      completeStep(false, result.score);
      setTimeout(() => speakIn(lang, textOf(q, lang), lang === 'te' ? audioPath(level, q, index + 1) : null), 500);
      return;
    }
    P.setStep(progress, n, { step, tries, langs });
    save();
    const firstBad = lang === 'te' ? result.words.flatMap((w) => w.aksharas).find((x) => x.status !== 'ok') : null;
    pal.say([`🔁 ${t('buddyRetry')} (${pct}%)`, firstBad ? h('span', { class: 'focus-tip' }, t('wrongAt', { a: firstBad.akshara })) : null], 'sad');
    triesLine.textContent = t('attemptOfMax', { n: tries + 1, m: MAX_TRIES });
    if (tries >= HINT_AFTER) setHint(true);
    micLabel();
    setTimeout(() => speakIn(lang, textOf(q, lang), lang === 'te' ? audioPath(level, q, index + 1) : null), 500);
  }

  function onMic() {
    if (resolved) return;
    if (activeListen) { stopListening(); return; }
    globalThis.speechSynthesis?.cancel();
    const handle = listen({
      lang: REC_LANG[lang],
      silenceMs: isWord ? 5000 : 20000,
      maxMs: isWord ? 12000 : 60000,
      continuous: level.taskType === 'paragraph',
      onStart: () => setListening(true),
    });
    activeListen = handle;
    handle.promise
      .then(handleHeard)
      .catch((code) => {
        if (code === 'aborted') { pal.say(t('buddyReady')); return; }
        pal.say(speechErrorText(code), 'sad');
      })
      .finally(() => {
        if (activeListen === handle) activeListen = null;
        setListening(false);
        if (resolved) micBtn.disabled = true;
        if (resolved) micBtn.textContent = langs.at(-1)?.passed ? '✅' : '⏭';
        bird.classList.remove('listen');
      });
  }

  function onNext() {
    if (!resolved) return; // must finish this language first
    clearTimeout(autoTimer);
    renderQuestion(level);
  }

  const typeBox = TYPE_MODE
    ? (() => {
      const input = h('input', { type: 'text', lang, placeholder: t('typeMode'), 'aria-label': t('typeMode') });
      const check = () => { if (input.value.trim()) { handleHeard([input.value]); input.value = ''; } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      return h('div', { class: 'type-mode' }, input, h('button', { onclick: check }, t('typeCheck')));
    })()
    : null;

  wordCard.append(...[
    bird,
    h('p', { class: 'trio-label' }, `🗣️ ${t('stepsLabel')}`),
    passageBox,
    lang === 'te' && q.focus ? h('div', { class: 'focus' }, t('focusLetter'), h('b', { lang: 'te' }, q.focus)) : null,
    h('div', { class: 'trio' }, rows),
    hintBtn,
    hintBtn ? hintBox : null,
    h('div', { class: 'actions two' }, micBtn, nextBtn),
    typeBox,
  ].filter(Boolean));

  const pct = Math.round(((index + step / 3) / total) * 100);
  show(
    backLink(),
    h('div', { class: 'q-head' },
      h('span', {}, `${m.emoji} ${t('level')} ${n} • ${t('question')} ${index + 1} / ${total}`),
      h('span', { class: `diff ${q.difficulty}` }, t(q.difficulty))),
    h('div', { class: 'bar fun' },
      h('span', { style: `width:${pct}%` }),
      h('i', { class: 'runner', style: `left:clamp(18px, ${pct}%, calc(100% - 18px))`, 'aria-hidden': 'true' }, m.emoji)),
    supportNotice(),
    wordCard,
    h('div', { class: 'card feedback' }, pal, heardLine, triesLine),
  );
  if (!fresh && step > 0 && !tries) bird.react('happy'); // hop when the next language starts
}

// ---------- result + celebration ----------

function finishLevel(level) {
  const n = level.level;
  const byId = new Map(level.questions.map((q) => [q.id, q]));
  const summary = P.finishAttempt(progress, n, level.passMark, { mastery: true });
  save(summary.passed ? 'level_complete' : 'progress');

  const retry = () => {
    P.startAttempt(progress, n, P.orderQuestions(level.questions, { shuffle: level.taskType !== 'paragraph' }));
    save();
    renderQuestion(level);
  };
  if (!summary.passed) { // only possible with an attempt saved by an older version
    show(h('section', { class: 'card result tryagain' }, buddy(t('resultCheer'), 'sad'),
      h('div', { class: 'row center' }, h('button', { class: 'primary big', onclick: retry }, `🔁 ${t('retry')}`))));
    return;
  }

  const name = progress.student?.trim() ?? '';
  const message = name ? t('congratsName', { name, n }) : t('congratsNoName', { n });
  const retried = summary.retriedIds.map((id) => byId.get(id)?.text).filter(Boolean);
  const failed = summary.failedIds.map((id) => {
    const q = byId.get(id);
    if (!q) return null;
    const which = (summary.failedLangs?.[id] ?? []).map((l) => LANG_NAME[l]).join(', ');
    return which ? `${q.text} – ${which}` : q.text;
  }).filter(Boolean);
  const firstC = summary.firstTryLangs ?? summary.firstTry;
  const firstT = summary.totalLangs ?? summary.total;

  const buttons = [];
  if (n < TOTAL) buttons.push(h('button', { class: 'primary big', onclick: () => { location.hash = `#/level/${n + 1}`; } }, `${meta(n + 1).emoji} ${t('nextLevel')} ➜`));
  buttons.push(h('button', { onclick: retry }, `🔁 ${t('playAgain')}`));
  buttons.push(h('a', { class: 'btn', href: '#/' }, `🗺️ ${t('backToMap')}`));

  show(
    h('section', { class: 'card result won' },
      h('div', { class: 'result-emoji', 'aria-hidden': 'true' }, n === TOTAL ? '🏆' : meta(n).emoji),
      h('h2', {}, t('levelDone', { n })),
      h('div', { class: 'big-score' }, t('firstTryScore', { c: firstC, t: firstT })),
      h('div', { class: 'big-stars', 'aria-label': `${summary.stars} / 3` },
        [0, 1, 2].map((i) => h('span', { class: i < summary.stars ? 'star on' : 'star', style: `animation-delay:${0.25 + i * 0.25}s` }, i < summary.stars ? '★' : '☆'))),
      buddy(message, 'happy')),
    failed.length
      ? h('div', { class: 'card' }, h('h2', {}, `🎯 ${t('practiseLater', { c: failed.length })}`), h('ul', { class: 'fail-list', lang: 'te' }, failed.map((x) => h('li', {}, x))))
      : null,
    retried.length
      ? h('div', { class: 'card' }, h('h2', {}, `📝 ${t('moreTries')}`), h('ul', { class: 'fail-list', lang: 'te' }, retried.map((x) => h('li', {}, x))))
      : null,
    h('div', { class: 'row center' }, buttons),
  );
  confetti(40);
  celebrate({ h, level: n, message, name, spoken: message.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, ''), lang: uiLang });
}

// ---------- language choice ----------

function renderLanguage() {
  const choices = [
    { code: 'te', hello: 'నమస్తే! తెలుగులో ఆడదాం', bird: '🦜' },
    { code: 'en', hello: "Hello! Let's play in English", bird: '🐦' },
    { code: 'hi', hello: 'नमस्ते! हिंदी में खेलें', bird: '🕊️' },
  ];
  show(
    h('section', { class: 'card lang-pick' },
      h('div', { class: 'lang-birds', 'aria-hidden': 'true' }, '🐦 🦜 🕊️'),
      h('h2', {}, 'భాష ఎంచుకోండి • Choose your language • भाषा चुनो'),
      h('p', { class: 'muted' }, 'తెలుగు ➜ English ➜ हिंदी'),
      h('div', { class: 'lang-grid' }, choices.map((c) => h('button', {
        class: `lang-card${uiLang === c.code ? ' on' : ''}`,
        lang: c.code,
        onclick: async () => {
          await setUiLang(c.code);
          if (location.hash === '#/lang') location.hash = '#/'; // hashchange → route()
          else route();
        },
      }, h('span', { class: 'lang-bird', 'aria-hidden': 'true' }, c.bird), h('b', {}, LANG_NAME[c.code]), h('span', {}, c.hello))))),
  );
}

// ---------- routing ----------

function route() {
  stopListening();
  globalThis.speechSynthesis?.cancel();
  const hash = location.hash;
  const m = hash.match(/^#\/level\/(\d+)$/u);
  if (!uiLang || hash === '#/lang') renderLanguage();
  else if (m) renderLevel(Number(m[1]));
  else if (hash === '#/progress') renderProgress({ h, t, show, topBar, progress, levels: LEVELS.map((l) => meta(l.level)), total: TOTAL });
  else if (hash === '#/teacher') renderTeacher({ h, t, show, topBar, total: TOTAL });
  else renderMap();
}

async function init() {
  try {
    const [ui, ladder] = await Promise.all([loadJSON('data/ui-text.json'), loadJSON('data/ladder.json')]);
    UI_TE = ui;
    UI = ui;
    LEVELS = ladder.levels;
    TOTAL = ladder.totalLevels ?? LEVELS.length;
    const saved = readLang();
    if (saved) await setUiLang(saved);
  } catch {
    app.textContent = 'పాఠ్యాంశం లోడ్ కాలేదు. ఈ పేజీని Live Server (లేదా https) ద్వారా తెరవండి. / Could not load content – open this page through Live Server or https, not as a file.';
    return;
  }
  if (uiLang) document.title = t('appTitle');
  progress = P.loadProgress();
  const classParam = new URLSearchParams(location.search).get('class');
  if (classParam && /^[\w-]{1,20}$/.test(classParam)) progress.classCode = classParam.toUpperCase();
  save('open');
  window.addEventListener('hashchange', route);
  route();
}

init();
