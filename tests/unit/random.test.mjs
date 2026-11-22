import test from 'node:test';
import assert from 'node:assert/strict';
import { planRandom, pickRandom } from '../../docs/js/random.js';

const t = (id) => ({ id, name: id, content: id });
const data = () => [
  { id: 'q', categoryName: '品質', groups: [{ id: 'gq', name: '品質', tags: [t('high'), t('normal')] }] },
  { id: 'c', categoryName: 'キャラ', random: { mode: 'random', count: 1 }, groups: [
    { id: 'g1', name: '東方', tags: [t('reimu'), t('marisa')] },
    { id: 'g2', name: '使わない', random: { mode: 'off' }, tags: [t('excluded')] },
  ] },
  { id: 'o', categoryName: '衣装', groups: [
    { id: 'o1', name: '日常', random: { mode: 'random', count: 2 }, tags: [t('hoodie'), t('sweater'), t('shirt')] },
    { id: 'o2', name: '制服', random: { mode: 'off' }, tags: [t('maid')] },
  ] },
  { id: 'n', categoryName: 'NSFW', random: { mode: 'off' }, groups: [{ id: 'n1', name: '体位', tags: [t('standing')] }] },
];

test('固定は今の選択を残し、対象外は外し、ランダムは数どおりに選ぶ', () => {
  for (let i = 0; i < 200; i++) {
    const { keep, picked, units } = planRandom(data(), ['high', 'maid', 'standing', 'reimu']);
    assert.equal(units, 2);
    assert.deepEqual([...keep], ['high']);
    const chara = picked.filter((id) => ['reimu', 'marisa'].includes(id));
    const outfit = picked.filter((id) => ['hoodie', 'sweater', 'shirt'].includes(id));
    assert.equal(chara.length, 1);
    assert.equal(outfit.length, 2);
    assert.equal(new Set(outfit).size, 2, '同じカードを 2 回選ばない');
    assert.ok(!picked.includes('excluded') && !picked.includes('maid') && !picked.includes('standing'));
  }
});

test('ランダムの設定がないときは units = 0', () => {
  const d = [{ id: 'a', categoryName: 'A', groups: [{ id: 'g', name: 'G', tags: [t('x')] }] }];
  assert.equal(planRandom(d, ['x']).units, 0);
});

test('候補より多く選ぶ設定でも、ある分だけ選ぶ', () => {
  assert.equal(pickRandom([1, 2], 5).length, 2);
});
