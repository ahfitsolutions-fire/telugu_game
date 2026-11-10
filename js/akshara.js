// Split Telugu text into aksharas (syllable units) – design plan §6.3.
//
// One akshara = (consonant + ్ )* consonant [vowel sign] [ం | ః | ఁ]
//            or independent vowel [ం | ః | ఁ]
// A virama that is not followed by a consonant (word-final pollu, e.g. "సర్")
// stays with its consonant. ZWNJ after a virama blocks the conjunct.

const VIRAMA = 0x0c4d;
const NUKTA = 0x0c3c;
const ZWNJ = 0x200c;
const ZWJ = 0x200d;

const isConsonant = (c) => (c >= 0x0c15 && c <= 0x0c39) || (c >= 0x0c58 && c <= 0x0c5a);
const isIndependentVowel = (c) => (c >= 0x0c05 && c <= 0x0c14) || c === 0x0c60 || c === 0x0c61;
const isVowelSign = (c) => (c >= 0x0c3e && c <= 0x0c4c) || c === 0x0c62 || c === 0x0c63;
const isLengthMark = (c) => c === 0x0c55 || c === 0x0c56;
const isModifier = (c) => c >= 0x0c00 && c <= 0x0c04; // ఀ ఁ ం ః
const isSpace = (ch) => ch !== undefined && /\s/u.test(ch);

/** True when the string contains at least one Telugu-block character. */
export function hasTelugu(s) {
  return /[ఀ-౿]/u.test(s);
}

/**
 * Split text into aksharas. Whitespace is dropped; any non-Telugu character
 * (punctuation, Latin, digits) becomes its own unit.
 * @param {string} text
 * @returns {string[]}
 */
export function splitAksharas(text) {
  const chars = Array.from(String(text ?? '').normalize('NFC'));
  const cp = (k) => (k < chars.length ? chars[k].codePointAt(0) : undefined);
  const out = [];
  let i = 0;

  while (i < chars.length) {
    const c = cp(i);
    if (c === ZWNJ || c === ZWJ || isSpace(chars[i])) { i++; continue; }

    let unit = chars[i];
    i++;

    if (isConsonant(c)) {
      if (cp(i) === NUKTA) unit += chars[i++];
      while (cp(i) === VIRAMA) {
        let j = i + 1;
        while (cp(j) === ZWJ) j++; // ZWJ does not break a conjunct; ZWNJ does
        if (isConsonant(cp(j))) {
          unit += chars[i] + chars[j];
          i = j + 1;
          if (cp(i) === NUKTA) unit += chars[i++];
        } else {
          unit += chars[i++]; // pollu (dead consonant)
          break;
        }
      }
      if (isVowelSign(cp(i))) {
        unit += chars[i++];
        if (isLengthMark(cp(i))) unit += chars[i++];
      }
      while (isModifier(cp(i))) unit += chars[i++];
    } else if (isIndependentVowel(c)) {
      while (isModifier(cp(i))) unit += chars[i++];
    } else if ((isModifier(c) || isVowelSign(c) || c === VIRAMA) && out.length) {
      // Stray combining mark: attach it to the previous akshara.
      out[out.length - 1] += unit;
      continue;
    }
    out.push(unit);
  }
  return out;
}

/** Split text into words on whitespace (no other cleaning). */
export function splitWords(text) {
  return String(text ?? '').trim().split(/\s+/u).filter(Boolean);
}

/** Levenshtein distance between two arrays (or strings). */
export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Align target aksharas against heard aksharas and label each target akshara.
 * @returns {{akshara: string, status: 'ok'|'wrong'|'missing'}[]}
 */
export function diffAksharas(target, heard) {
  const m = target.length;
  const n = heard.length;
  const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (target[i - 1] === heard[j - 1] ? 0 : 1),
      );
    }
  }
  const out = [];
  let i = m;
  let j = n;
  while (i > 0) {
    if (j > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === heard[j - 1] ? 0 : 1)) {
      out.push({ akshara: target[i - 1], status: target[i - 1] === heard[j - 1] ? 'ok' : 'wrong' });
      i--; j--;
    } else if (d[i][j] === d[i - 1][j] + 1) {
      out.push({ akshara: target[i - 1], status: 'missing' });
      i--;
    } else {
      j--; // extra akshara in what was heard – nothing to colour
    }
  }
  return out.reverse();
}
