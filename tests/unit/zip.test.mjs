import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../../docs/js/io.js';
import { LIMITS } from '../../docs/js/storage.js';
import { buildZip } from '../zip-builder.mjs';

const json = (value) => JSON.stringify(value);
const cat = (name, group, tags) => ({ categoryName: name, groups: [{ name: group, tags: tags.map(([n, c]) => ({ name: n, content: c })) }] });
const zipFile = (entries, name = 'backup.zip') => new File([buildZip(entries)], name, { type: 'application/zip' });

test('zip の中の JSON を 1 つ読める（deflate）', async () => {
  const r = await parseFile(zipFile([{ name: 'a.json', data: json([cat('A', 'G', [['x', 'y']])]) }]));
  assert.equal(r.categories[0].categoryName, 'A');
  assert.equal(r.categories[0].groups[0].tags[0].name, 'x');
  assert.equal(r.sourceFiles, 1);
});

test('無圧縮（stored）の zip も読める', async () => {
  const r = await parseFile(zipFile([{ name: 'a.json', method: 0, data: json([cat('A', 'G', [['x', 'y']])]) }]));
  assert.equal(r.categories.length, 1);
});

test('複数の JSON を 1 つにまとめる：同じカテゴリー・グループは統合し、同じタグは 1 つにする', async () => {
  const r = await parseFile(zipFile([
    { name: 'one.json', data: json([cat('A', 'G', [['x', 'y'], ['p', 'q']])]) },
    { name: 'dir/two.json', data: json([cat('A', 'G', [['x', 'y'], ['m', 'n']]), cat('B', 'H', [['b', 'b']])]) },
  ]));
  assert.equal(r.sourceFiles, 2);
  assert.deepEqual(r.categories.map((c) => c.categoryName), ['A', 'B']);
  assert.deepEqual(r.categories[0].groups[0].tags.map((t) => t.name), ['x', 'p', 'm']);
});

test('JSON 以外、フォルダ、__MACOSX、「.」で始まるファイルは無視する', async () => {
  const r = await parseFile(zipFile([
    { name: 'dir/', data: '' },
    { name: '__MACOSX/._a.json', data: 'not json' },
    { name: '.hidden.json', data: 'not json' },
    { name: 'readme.txt', data: 'hello' },
    { name: 'a.JSON', data: json([cat('A', 'G', [['x', 'y']])]) },
  ]));
  assert.equal(r.sourceFiles, 1);
});

test('名前が .zip でなくても、zip の印があれば zip として読む', async () => {
  const r = await parseFile(zipFile([{ name: 'a.json', data: json([cat('A', 'G', [['x', 'y']])]) }], 'backup.dat'));
  assert.equal(r.categories.length, 1);
});

test('JSON が 1 つもない zip は、読み込みを拒否する', async () => {
  await assert.rejects(parseFile(zipFile([{ name: 'a.txt', data: 'x' }])), /JSON ファイルがありません|no JSON files/);
});

test('読めない JSON が 1 つでもあれば、ファイル名を示して全体を拒否する', async () => {
  await assert.rejects(
    parseFile(zipFile([{ name: 'ok.json', data: json([cat('A', 'G', [['x', 'y']])]) }, { name: 'broken.json', data: '{oops' }])),
    /broken\.json/,
  );
  await assert.rejects(parseFile(zipFile([{ name: 'package.json', data: json({ name: 'x' }) }])), /package\.json/);
});

test('暗号化された zip と、壊れた zip は拒否する', async () => {
  await assert.rejects(parseFile(zipFile([{ name: 'a.json', data: '[]', flags: 1 }])), /暗号化|encrypted/);
  await assert.rejects(parseFile(new File([Buffer.from('PK\x03\x04 broken')], 'x.zip')), /zip/);
  const whole = buildZip([{ name: 'a.json', data: json([cat('A', 'G', [['x', 'y']])]) }]);
  await assert.rejects(parseFile(new File([whole.subarray(0, whole.length - 10)], 'cut.zip')), /zip/);
});

test('展開すると上限（20MB）を超える zip は、展開の途中で拒否する（zip 爆弾の対策）', async () => {
  const big = Buffer.alloc(LIMITS.fileBytes + 1024, 0x20);
  const file = zipFile([{ name: 'big.json', data: big }]);
  assert.ok(file.size < 100 * 1024, '圧縮後は小さい');
  await assert.rejects(parseFile(file), /上限|limit/);
});

test('JSON の読み込みは、これまでどおり動く', async () => {
  const r = await parseFile(new File([json([cat('A', 'G', [['x', 'y']])])], 'a.json'));
  assert.equal(r.categories.length, 1);
  assert.equal(r.sourceFiles, undefined);
});
