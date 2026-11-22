// ランダム（🎲）で、どのカードを残し、どのカードを選び直すかを決める。DOM に依存しない（テストしやすいように分けている）。
//
// カテゴリーの設定（category.random）がグループの設定より先：
//   全体から選ぶ { mode: 'random', count } … グループをまたいで count 枚（「対象外」のグループは候補から外す）
//   対象外       { mode: 'off' }            … そのカテゴリーからは選ばない
//   なし                                     … グループごとの設定に従う
// グループの設定（group.random）：
//   固定（なし）… 今選んでいるカードを残す（無ければ何も入れない）
//   ランダム    … そのグループから count 枚を選び直す
//   対象外      … 選ばない（選択中でも外す）

export function pickRandom(list, n, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

// 戻り値：keep = 残すカード ID の Set、picked = 新しく選んだカード ID の配列、units = ランダムにした単位の数（0 なら設定なし）
export function planRandom(categories, selectedIds, rand = Math.random) {
  const prev = new Set(selectedIds);
  const keep = new Set();
  const picked = [];
  let units = 0;
  for (const cat of categories) {
    if (cat.random?.mode === 'off') continue;
    if (cat.random?.mode === 'random') {
      units++;
      const pool = cat.groups.filter((g) => g.random?.mode !== 'off').flatMap((g) => g.tags);
      picked.push(...pickRandom(pool, cat.random.count, rand).map((t) => t.id));
      continue;
    }
    for (const g of cat.groups) {
      const mode = g.random?.mode || 'fixed';
      if (mode === 'fixed') g.tags.forEach((t) => prev.has(t.id) && keep.add(t.id));
      else if (mode === 'random') {
        units++;
        picked.push(...pickRandom(g.tags, g.random.count, rand).map((t) => t.id));
      }
    }
  }
  return { keep, picked, units };
}
