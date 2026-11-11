// Routing and screens: level carousel (#/), level (#/level/N), my progress charts (#/progress).
// Progress lives in this browser (localStorage).
// Practice rule ("mastery"): a question is finished only when it is read correctly –
// unlimited tries, "Next" stays locked until then. Stars come from first-try answers.

import { splitAksharas, hasTelugu } from './akshara.js?v=8';
import { scoreAttempt } from './scoring.js?v=8';
import * as P from './progress.js?v=8';
import { listen, speechSupport } from './speech.js?v=8';
import { speak } from './tts.js?v=8';
import { renderProgress } from './progress-view.js?v=8';
import { celebrate } from './celebrate.js?v=8';
import { report, syncEnabled } from './sync.js?v=8';
import { renderTeacher } from './teacher-view.js?v=8';

const app = document.getElementById('app');
const TYPE_MODE = new URLSearchParams(location.search).has('type');
const REDUCED_MOTION = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const HINT_AFTER = 3; // show the akshara split automatically after this many tries

let UI = {};
let LEVELS = [];
let TOTAL = 10;
let progress = P.emptyProgress();
let activeListen = null;
const levelCache = new Map();

// ---------- helpers ----------

function t(key, vars = {}) {
  let s = UI[key] ?? key;
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
const meta = (n) => LEVELS.find((l) => l.level === n) ?? { emoji: '⭐', color: '#3b8fe8', title: '' };

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
      tab('#/progress', 'navProgress', 'progress', '📊')));
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

  LEVELS.forEach(({ level: n, title, concept, emoji, color }, i) => {
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
      h('h2', {}, `${t('level')} ${n} – ${level.title}`),
      h('p', { class: 'intro-concept' }, level.concept),
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

  let resolved = false;
  let tries = cur.tries ?? 0; // survives a reload
  const isWord = level.taskType === 'word';

  const target = h('div', { class: `target${q.text.length > 18 ? ' long' : ''}`, lang: 'te' });
  paintTarget(target, q.text, null);
  const passageBox = q.passage
    ? h('div', { class: 'passage', lang: 'te' },
      h('div', { class: 'passage-title' }, `📖 ${q.passageTitle ?? ''}`),
      level.questions.filter((x) => x.passage === q.passage).map((x) =>
        h('span', { class: x.id === q.id ? 'p-sent now' : 'p-sent' }, `${x.text} `)))
    : null;

  const hintBox = h('div', { class: 'hint', hidden: true },
    q.split ? h('div', { class: 'split' }, q.split) : null,
    q.hint ? h('div', {}, q.hint) : null);
  const hintBtn = h('button', { class: 'link-btn', 'aria-expanded': 'false', onclick: () => setHint(hintBox.hidden) }, `💡 ${t('hintShow')}`);
  function setHint(open) {
    hintBox.hidden = !open;
    hintBtn.textContent = open ? `💡 ${t('hintHide')}` : `💡 ${t('hintShow')}`;
    hintBtn.setAttribute('aria-expanded', String(open));
  }
  if (tries >= HINT_AFTER) setHint(true);

  const pal = buddy(tries ? t('buddyRetry') : t('buddyReady'), tries ? 'sad' : '');
  const heardLine = h('p', { class: 'heard' });
  const triesLine = h('p', { class: 'tries muted' }, tries ? t('attemptN', { n: tries + 1 }) : '');
  const wordCard = h('div', { class: 'card stage-card', style: `--c:${m.color}` });

  const listenBtn = h('button', { class: 'btn-listen', onclick: async () => {
    const ok = await speak(q.text, audioPath(level, q, index + 1));
    if (!ok) pal.say(t('noAudio'), 'sad');
  } }, `🔊 ${t('listen')}`);
  const micBtn = h('button', { class: 'primary mic', onclick: onMic });
  const nextBtn = h('button', { class: 'btn-next', disabled: true, title: t('nextLocked'), onclick: onNext }, `${t('next')} ➜`);

  function micLabel() {
    micBtn.textContent = tries > 0 ? `🔁 ${t('repeat')}` : `🎤 ${t('speak')}`;
  }
  micLabel();

  function setListening(on) {
    micBtn.classList.toggle('listening', on);
    if (on) { micBtn.textContent = `⏹ ${t('stop')}`; pal.say(t('buddyListen'), 'listen'); } else micLabel();
  }

  function handleHeard(alternatives) {
    if (resolved) return;
    const result = scoreAttempt(level, q, alternatives);
    tries += 1;
    paintTarget(target, q.text, result);
    heardLine.replaceChildren(`${t('youSaid')} `, h('b', { lang: 'te' }, result.heard || '—'));
    const pct = Math.round(result.score * 100);
    wordCard.classList.remove('win', 'shake');
    void wordCard.offsetWidth; // restart animations
    if (result.passed) {
      resolved = true;
      P.recordAnswer(progress, n, { id: q.id, passed: true, score: result.score, heard: result.heard, tries });
      save();
      pal.say(`✅ ${pick(UI.praise)} (${pct}%)${tries > 1 ? ` – ${t('gotItAfter', { n: tries })}` : ''}`, 'happy');
      wordCard.classList.add('win');
      triesLine.textContent = '';
      micBtn.disabled = true;
      micBtn.textContent = '✅';
      nextBtn.disabled = false;
      nextBtn.removeAttribute('title');
      nextBtn.classList.add('primary', 'ready');
      nextBtn.focus();
      confetti(18);
      return;
    }
    P.setTries(progress, n, tries);
    save();
    const firstBad = result.words.flatMap((w) => w.aksharas).find((x) => x.status !== 'ok');
    pal.say([`🔁 ${t('buddyRetry')} (${pct}%)`, firstBad ? h('span', { class: 'focus-tip' }, t('wrongAt', { a: firstBad.akshara })) : null], 'sad');
    wordCard.classList.add('shake');
    triesLine.textContent = t('attemptN', { n: tries + 1 });
    if (tries >= HINT_AFTER) setHint(true);
    micLabel();
    setTimeout(() => speak(q.text, audioPath(level, q, index + 1)), 500);
  }

  function onMic() {
    if (resolved) return;
    if (activeListen) { stopListening(); return; }
    globalThis.speechSynthesis?.cancel();
    const handle = listen({
      lang: 'te-IN',
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
        if (resolved) { micBtn.disabled = true; micBtn.textContent = '✅'; }
      });
  }

  function onNext() {
    if (!resolved) return; // must read it correctly first
    renderQuestion(level);
  }

  const typeBox = TYPE_MODE
    ? (() => {
      const input = h('input', { type: 'text', lang: 'te', placeholder: t('typeMode'), 'aria-label': t('typeMode') });
      const check = () => { if (input.value.trim()) { handleHeard([input.value]); input.value = ''; } };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
      return h('div', { class: 'type-mode' }, input, h('button', { onclick: check }, t('typeCheck')));
    })()
    : null;

  wordCard.append(...[
    passageBox,
    q.focus ? h('div', { class: 'focus' }, t('focusLetter'), h('b', { lang: 'te' }, q.focus)) : null,
    target,
    hintBtn,
    hintBox,
    h('div', { class: 'actions' }, listenBtn, micBtn, nextBtn),
    typeBox,
  ].filter(Boolean));

  const pct = Math.round((index / total) * 100);
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

  const buttons = [];
  if (n < TOTAL) buttons.push(h('button', { class: 'primary big', onclick: () => { location.hash = `#/level/${n + 1}`; } }, `${meta(n + 1).emoji} ${t('nextLevel')} ➜`));
  buttons.push(h('button', { onclick: retry }, `🔁 ${t('playAgain')}`));
  buttons.push(h('a', { class: 'btn', href: '#/' }, `🗺️ ${t('backToMap')}`));

  show(
    h('section', { class: 'card result won' },
      h('div', { class: 'result-emoji', 'aria-hidden': 'true' }, n === TOTAL ? '🏆' : meta(n).emoji),
      h('h2', {}, t('levelDone', { n })),
      h('div', { class: 'big-score' }, t('firstTryScore', { c: summary.firstTry, t: summary.total })),
      h('div', { class: 'big-stars', 'aria-label': `${summary.stars} / 3` },
        [0, 1, 2].map((i) => h('span', { class: i < summary.stars ? 'star on' : 'star', style: `animation-delay:${0.25 + i * 0.25}s` }, i < summary.stars ? '★' : '☆'))),
      buddy(message, 'happy')),
    retried.length
      ? h('div', { class: 'card' }, h('h2', {}, `📝 ${t('moreTries')}`), h('ul', { class: 'fail-list', lang: 'te' }, retried.map((x) => h('li', {}, x))))
      : null,
    h('div', { class: 'row center' }, buttons),
  );
  confetti(40);
  celebrate({ h, level: n, message, name, spoken: message.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '') });
}

// ---------- routing ----------

function route() {
  stopListening();
  globalThis.speechSynthesis?.cancel();
  const hash = location.hash;
  const m = hash.match(/^#\/level\/(\d+)$/u);
  if (m) renderLevel(Number(m[1]));
  else if (hash === '#/progress') renderProgress({ h, t, show, topBar, progress, levels: LEVELS, total: TOTAL });
  else if (hash === '#/teacher') renderTeacher({ h, t, show, topBar, total: TOTAL });
  else renderMap();
}

async function init() {
  try {
    const [ui, ladder] = await Promise.all([loadJSON('data/ui-text.json'), loadJSON('data/ladder.json')]);
    UI = ui;
    LEVELS = ladder.levels;
    TOTAL = ladder.totalLevels ?? LEVELS.length;
  } catch {
    app.textContent = 'పాఠ్యాంశం లోడ్ కాలేదు. ఈ పేజీని Live Server (లేదా https) ద్వారా తెరవండి. / Could not load content – open this page through Live Server or https, not as a file.';
    return;
  }
  document.title = t('appTitle');
  progress = P.loadProgress();
  const classParam = new URLSearchParams(location.search).get('class');
  if (classParam && /^[\w-]{1,20}$/.test(classParam)) progress.classCode = classParam.toUpperCase();
  save('open');
  window.addEventListener('hashchange', route);
  route();
}

init();
