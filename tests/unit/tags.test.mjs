import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTags, splitByMode, normKey, withTrailingComma, joinTags } from '../../docs/js/tags.js';

const texts = (a) => a.map((t) => t.text);

test('カンマと改行で分け、括弧の中では分けない', () => {
  assert.deepEqual(texts(splitTags('a, (b, c:1.2)\nd,, ')), ['a', '(b, c:1.2)', 'd']);
  assert.deepEqual(texts(splitTags('a, (b, c')), ['a', '(b', 'c']); // 括弧が閉じていないとき
});

test('同じタグの判定：空白・大文字小文字・アンダースコアの違いを同じとみなす', () => {
  assert.equal(normKey(' Long_Hair '), normKey('long  hair'));
  assert.deepEqual(texts(splitTags('long_hair, long hair, Long_Hair, (long_hair:1.2)')), ['long_hair', '(long_hair:1.2)']);
});

test('文で分ける・分けない', () => {
  const t = 'A girl with long, black hair. She sits! Version 3.5 is used.\n次の文？はい';
  assert.deepEqual(texts(splitByMode(t, 'sentence')), ['A girl with long, black hair.', 'She sits!', 'Version 3.5 is used.', '次の文？', 'はい']);
  assert.equal(splitByMode(t, 'whole').length, 1);
});

test('カンマ区切りのときだけ、末尾にカンマを付ける', () => {
  assert.equal(withTrailingComma(joinTags(['a', 'b'], ', '), ', '), 'a, b, ');
  assert.equal(withTrailingComma(joinTags(['a', 'b'], ','), ','), 'a,b,');
  assert.equal(withTrailingComma(joinTags(['a', 'b'], ' '), ' '), 'a b');
  assert.equal(withTrailingComma(joinTags(['a', 'b'], '\n'), '\n'), 'a\nb');
  assert.equal(withTrailingComma('', ', '), '');
});
