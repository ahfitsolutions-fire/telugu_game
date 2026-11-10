// SpeechRecognition wrapper (te-IN) – design plan §6.1.

export function getRecognitionCtor() {
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

/** 'ok' | 'unsupported' (e.g. Firefox) | 'insecure' (not https / localhost) */
export function speechSupport() {
  if (!getRecognitionCtor()) return 'unsupported';
  if (globalThis.isSecureContext === false) return 'insecure';
  return 'ok';
}

/**
 * Listen once. Resolves with up to 5 alternative transcripts (best first);
 * rejects with an error code: 'no-speech', 'audio-capture', 'not-allowed',
 * 'network', 'aborted', 'unsupported', 'insecure', …
 *
 * @param {{lang?: string, silenceMs?: number, maxMs?: number, continuous?: boolean, onStart?: () => void}} opts
 * @returns {{promise: Promise<string[]>, stop: () => void}}
 */
export function listen({ lang = 'te-IN', silenceMs = 5000, maxMs = 15000, continuous = false, onStart } = {}) {
  const support = speechSupport();
  if (support !== 'ok') return { promise: Promise.reject(support), stop() {} };

  const SR = getRecognitionCtor();
  const rec = new SR();
  rec.lang = lang;
  rec.interimResults = false;
  rec.maxAlternatives = 5;
  rec.continuous = continuous;

  const segments = []; // each final result: array of alternative transcripts
  let error = null;
  let silenceTimer = null;
  let maxTimer = null;
  const stop = () => { try { rec.stop(); } catch { /* already stopped */ } };
  const resetSilence = () => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(stop, silenceMs);
  };

  const promise = new Promise((resolve, reject) => {
    rec.onstart = () => {
      resetSilence();
      maxTimer = setTimeout(stop, maxMs);
      onStart?.();
    };
    rec.onspeechstart = resetSilence;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (!r.isFinal) continue;
        const alts = [];
        for (let k = 0; k < r.length; k++) {
          const tr = r[k].transcript?.trim();
          if (tr) alts.push(tr);
        }
        if (alts.length) segments.push(alts);
      }
      resetSilence();
    };
    rec.onerror = (e) => { error = e.error || 'unknown'; };
    rec.onend = () => {
      clearTimeout(silenceTimer);
      clearTimeout(maxTimer);
      if (!segments.length) { reject(error || 'no-speech'); return; }
      // Alternative k = k-th guess of every segment joined (fall back to the best guess).
      const width = Math.max(...segments.map((s) => s.length));
      const out = [];
      for (let k = 0; k < width; k++) {
        const joined = segments.map((s) => s[k] ?? s[0]).join(' ');
        if (!out.includes(joined)) out.push(joined);
      }
      resolve(out);
    };
  });

  try {
    rec.start();
  } catch (err) {
    return { promise: Promise.reject(err?.name === 'NotAllowedError' ? 'not-allowed' : 'unknown'), stop() {} };
  }
  return { promise, stop };
}
