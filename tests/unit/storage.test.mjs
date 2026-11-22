import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCategories, normalizeRandom } from '../../docs/js/storage.js';
import { mergeAppend } from '../../docs/js/io.js';

test('元の拡張機能の形式（groups なし）は、1 つのグループにまとめる', () => {
  const r = normalizeCategories([{ categoryName: 'A', tags: [{ name: 'x', content: 'y' }] }]);
  assert.equal(r.categories[0].groups.length, 1);
  assert.equal(r.categories[0].groups[0].tags[0].name, 'x');
});

test('不正な項目は読み飛ばし、SVG や不正なサムネイルは消す', () => {
  const r = normalizeCategories([
    { categoryName: 'A', groups: [{ name: 'G', tags: [
      { name: 'ok', content: 'c', thumbnail: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { name: '', content: 'c' },
      { name: 'long', content: 'x'.repeat(5001) },
    ] }] },
    { categoryName: '' },
  ]);
  assert.equal(r.categories[0].groups[0].tags.length, 1);
  assert.equal(r.categories[0].groups[0].tags[0].thumbnail, null);
  assert.equal(r.skippedTags, 2);
  assert.equal(r.skippedCategories, 1);
  assert.throws(() => normalizeCategories({}));
});

test('ランダムの設定を正しく読み、範囲外は丸める', () => {
  assert.deepEqual(normalizeRandom({ mode: 'random', count: 99 }), { mode: 'random', count: 20 });
  assert.deepEqual(normalizeRandom({ mode: 'random', count: 0 }), { mode: 'random', count: 1 });
  assert.deepEqual(normalizeRandom({ mode: 'off' }), { mode: 'off' });
  assert.equal(normalizeRandom({ mode: 'fixed' }), undefined);
  const r = normalizeCategories([{ categoryName: 'C', random: { mode: 'random', count: 2 }, groups: [{ name: 'G', random: { mode: 'off' }, tags: [] }] }]);
  assert.deepEqual(r.categories[0].random, { mode: 'random', count: 2 });
  assert.deepEqual(r.categories[0].groups[0].random, { mode: 'off' });
});

test('追加のインポート：同じ名前は統合し、名前と内容が同じタグは読み込まない', () => {
  const cur = normalizeCategories([{ id: 'c', categoryName: 'NSFW', groups: [{ id: 'g', name: '1. 体位系', tags: [{ id: 't', name: '正常位', content: 'a, b' }] }] }]).categories;
  const inc = normalizeCategories([
    { categoryName: 'NSFW', groups: [{ name: '1. 体位系', tags: [{ name: '正常位', content: 'a,  b' }, { name: '騎乗位', content: 'c' }] }, { name: '2. 新', random: { mode: 'off' }, tags: [] }] },
    { categoryName: '衣装', random: { mode: 'random', count: 1 }, groups: [] },
  ]).categories;
  const m = mergeAppend(cur, inc);
  assert.equal(m.addedTags, 1);
  assert.equal(m.duplicateTags, 1);
  assert.deepEqual(m.categories.map((c) => c.categoryName), ['NSFW', '衣装']);
  assert.deepEqual(m.categories[0].groups[1].random, { mode: 'off' });
  assert.deepEqual(m.categories[1].random, { mode: 'random', count: 1 });
  assert.equal(cur[0].groups[0].tags.length, 1, '元のデータは変更しない');
});
