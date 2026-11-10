// Clean target text and recogniser output before comparing – design plan §6.2.

const ZERO_WIDTH = /[​-‍⁠﻿]/gu;
const PUNCTUATION = /[.,!?;:"'`“”‘’()[\]{}<>\-–—…।॥|/\\*_~]/gu;
const DIGITS = /[0-9౦-౯]/gu;

/**
 * @param {string} text
 * @param {{muToAnusvara?: boolean}} [options]
 *   muToAnusvara (default true): treat a word-final "ము" as "ం"
 *   (పుస్తకము ≈ పుస్తకం). Applied to both sides, so it is symmetric.
 * @returns {string} words separated by single spaces
 */
export function normalizeText(text, { muToAnusvara = true } = {}) {
  let t = String(text ?? '')
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(PUNCTUATION, ' ')
    .replace(DIGITS, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (muToAnusvara && t) {
    t = t
      .split(' ')
      .map((w) => (w.length > 2 && w.endsWith('ము') ? `${w.slice(0, -2)}ం` : w))
      .join(' ');
  }
  return t;
}
