// Level-complete celebration: a different bird (and flight path) for every level
// flies in, chirps, says "congratulations, <name>" out loud and flies away.

import { findTeluguVoice } from './tts.js?v=7';

// level → bird emoji(s) and flight style (CSS class fly-<style>)
export const BIRDS = {
  1: { birds: ['🐦'], style: 'hop' },        // little bird hopping in
  2: { birds: ['🦜'], style: 'loop' },       // parrot loop-the-loop
  3: { birds: ['🕊️'], style: 'arc' },        // dove gliding in a high arc
  4: { birds: ['🦅'], style: 'dive' },       // eagle diving from the sky
  5: { birds: ['🦉'], style: 'spiral' },     // owl spiralling in
  6: { birds: ['🦢'], style: 'wave' },       // swan gliding on waves
  7: { birds: ['🦩'], style: 'zigzag' },     // flamingo zig-zag
  8: { birds: ['🦚'], style: 'rise' },       // peacock rising with a spin
  9: { birds: ['🐦', '🐦', '🐦', '🐦', '🐦'], style: 'flock' }, // a flock in V formation
  10: { birds: ['🦜', '🕊️', '🦢', '🦩', '🦚', '🦅'], style: 'parade' }, // everyone celebrates
};

const REDUCED = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A short synthesized bird chirp (no audio files needed). */
export function chirp() {
  try {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const now = ac.currentTime;
    [0, 0.16, 0.32, 0.62, 0.74].forEach((t0, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      const base = i < 3 ? 2400 : 3000;
      osc.frequency.setValueAtTime(base, now + t0);
      osc.frequency.exponentialRampToValueAtTime(base * 1.6, now + t0 + 0.07);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, now + t0 + 0.12);
      gain.gain.setValueAtTime(0.0001, now + t0);
      gain.gain.exponentialRampToValueAtTime(0.18, now + t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t0 + 0.13);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + t0);
      osc.stop(now + t0 + 0.15);
    });
    setTimeout(() => ac.close?.(), 1500);
  } catch { /* sound is optional */ }
}

/** Say congratulations with the student's name (Telugu voice if the device has one, else English). */
export async function sayCongrats(name, level, teluguText) {
  const synth = globalThis.speechSynthesis;
  if (!synth || !globalThis.SpeechSynthesisUtterance) return;
  synth.cancel();
  const te = await findTeluguVoice();
  let u;
  if (te) {
    u = new SpeechSynthesisUtterance(teluguText);
    u.voice = te;
    u.lang = te.lang;
  } else {
    // English fallback: a Telugu-script name can't be read by an English voice
    const latin = /^[\p{Script=Latin}\s.'-]+$/u.test(name ?? '') ? `, ${name}` : '';
    u = new SpeechSynthesisUtterance(`Congratulations${latin}! You completed level ${level}!`);
    const en = synth.getVoices().find((v) => /^en[-_]IN/i.test(v.lang)) ?? synth.getVoices().find((v) => /^en/i.test(v.lang));
    if (en) u.voice = en;
    u.lang = en?.lang ?? 'en-IN';
  }
  u.rate = 0.9;
  u.pitch = 1.35; // a cheerful, bird-like voice
  synth.speak(u);
}

/**
 * Show the flying-bird celebration. Resolves when it is over (about 6.5 s, or on tap).
 * @param {{h: Function, level: number, message: string, name: string, spoken: string}} opts
 */
export function celebrate({ h, level, message, name, spoken }) {
  const cfg = BIRDS[level] ?? BIRDS[1];
  const many = cfg.birds.length > 1;
  const mid = (cfg.birds.length - 1) / 2;
  const birds = cfg.birds.map((b, i) => {
    // flock: V formation offsets; parade: evenly spaced around a circle
    const dx = `${((i - mid) * 11).toFixed(1)}vw`;
    const dy = `${(Math.abs(i - mid) * 7).toFixed(1)}vh`;
    const a = `${Math.round((360 / cfg.birds.length) * i)}deg`;
    return h('span', {
      class: `bird fly-${cfg.style}`,
      style: `--dx:${many ? dx : '0px'};--dy:${many ? dy : '0px'};--a:${a};animation-delay:${cfg.style === 'flock' ? Math.abs(i - mid) * 0.1 : 0}s`,
      'aria-hidden': 'true',
    }, b);
  });
  const bubble = h('div', { class: 'bird-bubble', role: 'status' }, message);
  const overlay = h('div', { class: `celebrate ${REDUCED() ? 'still' : ''}`, title: 'tap to close' }, birds, bubble);

  return new Promise((resolve) => {
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      overlay.classList.add('out');
      setTimeout(() => { overlay.remove(); resolve(); }, 350);
    };
    overlay.addEventListener('click', close);
    document.body.append(overlay);
    chirp();
    setTimeout(() => sayCongrats(name, level, spoken), 900);
    setTimeout(close, 6500);
  });
}
