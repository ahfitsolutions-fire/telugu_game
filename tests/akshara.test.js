import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitAksharas, splitWords, levenshtein, diffAksharas } from '../js/akshara.js';

const cases = {
  'అమ్మ': ['అ', 'మ్మ'],
  'చక్రం': ['చ', 'క్రం'],
  'స్వాతంత్ర్యం': ['స్వా', 'తం', 'త్ర్యం'],
  'స్త్రీ': ['స్త్రీ'],
  'లక్ష్మి': ['ల', 'క్ష్మి'],
  'లక్ష్మణుడు': ['ల', 'క్ష్మ', 'ణు', 'డు'],
  'జ్ఞానం': ['జ్ఞా', 'నం'],
  'విజ్ఞానశాస్త్రం': ['వి', 'జ్ఞా', 'న', 'శా', 'స్త్రం'],
  'దుఃఖం': ['దుః', 'ఖం'],
  'అంతఃపురం': ['అం', 'తః', 'పు', 'రం'],
  'పునఃప్రారంభం': ['పు', 'నః', 'ప్రా', 'రం', 'భం'],
  'కృప': ['కృ', 'ప'],
  'గృహం': ['గృ', 'హం'],
  'ఋషి': ['ఋ', 'షి'],
  'రాష్ట్రం': ['రా', 'ష్ట్రం'],
  'శాస్త్రం': ['శా', 'స్త్రం'],
  'జ్యోత్స్న': ['జ్యో', 'త్స్న'],
  'ఉడుత': ['ఉ', 'డు', 'త'],
  'ఆకాశవాణి': ['ఆ', 'కా', 'శ', 'వా', 'ణి'],
  'పాఠశాల': ['పా', 'ఠ', 'శా', 'ల'],
  'కుక్కపిల్ల': ['కు', 'క్క', 'పి', 'ల్ల'],
  'అక్కచెల్లెళ్ళు': ['అ', 'క్క', 'చె', 'ల్లె', 'ళ్ళు'],
  'ప్రత్యుత్పన్నమతి': ['ప్ర', 'త్యు', 'త్ప', 'న్న', 'మ', 'తి'],
  'ఐరావతం': ['ఐ', 'రా', 'వ', 'తం'],
  'ఔషధం': ['ఔ', 'ష', 'ధం'],
  'పైన': ['పై', 'న'],
  'మౌనం': ['మౌ', 'నం'],
  'దౌర్భాగ్యం': ['దౌ', 'ర్భా', 'గ్యం'],
  'ఆశ్చర్యం': ['ఆ', 'శ్చ', 'ర్యం'],
  'వాగ్దానం': ['వా', 'గ్దా', 'నం'],
  'స్వేచ్ఛ': ['స్వే', 'చ్ఛ'],
  'ఱంపం': ['ఱం', 'పం'],
};

for (const [word, expected] of Object.entries(cases)) {
  test(`split ${word}`, () => {
    assert.deepEqual(splitAksharas(word), expected);
  });
}

test('word-final pollu stays with its consonant', () => {
  assert.deepEqual(splitAksharas('సర్'), ['స', 'ర్']);
});

test('ZWNJ after virama blocks the conjunct', () => {
  assert.deepEqual(splitAksharas('బ్రౌజర్‌లో'), ['బ్రౌ', 'జ', 'ర్', 'లో']);
});

test('spaces are dropped, punctuation is its own unit', () => {
  assert.deepEqual(splitAksharas('అమ్మ వచ్చింది.'), ['అ', 'మ్మ', 'వ', 'చ్చిం', 'ది', '.']);
});

test('decomposed input is NFC-normalised first', () => {
  assert.deepEqual(splitAksharas('కై'.normalize('NFD')), ['కై']);
});

test('splitWords', () => {
  assert.deepEqual(splitWords('  అమ్మ   వచ్చింది. '), ['అమ్మ', 'వచ్చింది.']);
});

test('levenshtein over arrays', () => {
  assert.equal(levenshtein(['అ', 'మ్మ'], ['అ', 'మ్మ']), 0);
  assert.equal(levenshtein(['చ', 'క్రం'], ['చ', 'కం']), 1);
  assert.equal(levenshtein([], ['క']), 1);
  assert.equal(levenshtein(['క', 'ల', 'ప'], []), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
});

test('diffAksharas marks ok / wrong / missing', () => {
  assert.deepEqual(diffAksharas(['చ', 'క్రం'], ['చ', 'కం']), [
    { akshara: 'చ', status: 'ok' },
    { akshara: 'క్రం', status: 'wrong' },
  ]);
  assert.deepEqual(diffAksharas(['ఉ', 'డు', 'త'], ['ఉ', 'త']), [
    { akshara: 'ఉ', status: 'ok' },
    { akshara: 'డు', status: 'missing' },
    { akshara: 'త', status: 'ok' },
  ]);
  // Extra heard aksharas do not change the target labels.
  assert.deepEqual(diffAksharas(['అ', 'ల'], ['అ', 'ల', 'లు']).map((x) => x.status), ['ok', 'ok']);
});
