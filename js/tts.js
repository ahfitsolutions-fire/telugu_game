// "Listen" button: browser Telugu voice first, then a pre-recorded MP3.
// Full audio work (recording / generating MP3s) is Phase 6; this already
// uses any te-IN voice the device has and any MP3 placed in audio/.

function voices() {
  return new Promise((resolve) => {
    const synth = globalThis.speechSynthesis;
    if (!synth) { resolve([]); return; }
    const now = synth.getVoices();
    if (now.length) { resolve(now); return; }
    const done = () => resolve(synth.getVoices());
    synth.addEventListener?.('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

export async function findTeluguVoice() {
  const list = await voices();
  return list.find((v) => /^te([-_]|$)/i.test(v.lang)) ?? null;
}

function playMp3(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    const audio = new Audio(url);
    audio.onended = () => resolve(true);
    audio.onerror = () => resolve(false);
    audio.play().catch(() => resolve(false));
  });
}

/**
 * Speak the target. Resolves true if something played, false if no Telugu
 * voice and no MP3 were available.
 */
export async function speak(text, audioUrl) {
  const voice = await findTeluguVoice();
  if (voice && globalThis.SpeechSynthesisUtterance) {
    return new Promise((resolve) => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 0.8;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      speechSynthesis.speak(u);
    });
  }
  return playMp3(audioUrl);
}

const LOCALE = { te: 'te', en: 'en', hi: 'hi' };

/** Best voice for a language: an Indian one (te-IN / en-IN / hi-IN) first, then any. */
export async function findVoice(lang) {
  const list = await voices();
  const base = LOCALE[lang] ?? lang;
  const re = new RegExp(`^${base}([-_]|$)`, 'i');
  const all = list.filter((v) => re.test(v.lang));
  return all.find((v) => /[-_]IN$/i.test(v.lang)) ?? all[0] ?? null;
}

/**
 * Speak text in 'te' | 'en' | 'hi'. Telugu falls back to the MP3 like speak().
 * Resolves true if something played.
 */
export async function speakIn(lang, text, audioUrl) {
  if (lang === 'te') return speak(text, audioUrl);
  const voice = await findVoice(lang);
  if (!voice || !globalThis.SpeechSynthesisUtterance) return false;
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 0.85;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.speak(u);
  });
}
