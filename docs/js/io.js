// JSON のインポート・エクスポート。
import { state, updateMeta, catTags } from './state.js';
import { LIMITS, newId, normalizeCategories } from './storage.js';
import { normKey } from './tags.js';
import { tr } from './i18n.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// 元の拡張機能（グループを知らない）でも読めるように、全タグをまとめた tags も付けて書き出す。
// この形式を読み込むときは groups を優先し、tags は使わない。
const toExport = (categories) => categories.map((c) => ({ ...c, tags: catTags(c) }));

function makeFile() {
  const json = JSON.stringify(toExport(state.categories), null, 2);
  return new File([json], `tag-button-backup-${today()}.json`, { type: 'application/json' });
}

export function download() {
  const file = makeFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return updateMeta({ lastExportedAt: new Date().toISOString() });
}

export const canShare = () => !!(navigator.canShare && navigator.canShare({ files: [makeFile()] }));

export async function share() {
  try {
    await navigator.share({ files: [makeFile()] });
    await updateMeta({ lastExportedAt: new Date().toISOString() });
  } catch (e) {
    if (e.name !== 'AbortError') throw e;
  }
}

// ファイルを読んで検証する。不正なら例外を投げる（データは一切変更しない）。
export async function parseFile(file) {
  if (file.size > LIMITS.fileBytes) throw new Error(tr('ファイルが大きすぎます（20MB まで）。', 'The file is too large (up to 20 MB).'));
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error(tr('JSON として読めません。', 'Could not read it as JSON.'));
  }
  const result = normalizeCategories(data);
  if (result.categories.length === 0 && (result.skippedCategories > 0 || data.length > 0)) {
    throw new Error(tr('読み込める内容がありませんでした。', 'There was nothing to import.'));
  }
  return result;
}

export const countTags = (categories) => categories.reduce((n, c) => n + catTags(c).length, 0);
export const countGroups = (categories) => categories.reduce((n, c) => n + c.groups.length, 0);

const dupKey = (t) => `${normKey(t.name)}\u0000${normKey(t.content)}`;

// 今のデータに追加した結果を返す（今のデータは変更しない）。
// 同じ名前のカテゴリー・グループは統合し、名前と内容がどちらも同じタグは読み込まない。
export function mergeAppend(current, imported) {
  const result = current.map((c) => ({ ...c, groups: c.groups.map((g) => ({ ...g, tags: [...g.tags] })) }));
  const usedIds = new Set(result.flatMap((c) => [c.id, ...c.groups.flatMap((g) => [g.id, ...g.tags.map((t) => t.id)])]));
  const fresh = (id) => {
    const v = usedIds.has(id) ? newId() : id;
    usedIds.add(v);
    return v;
  };
  let addedTags = 0;
  let duplicateTags = 0;

  for (const inc of imported) {
    let cat = result.find((c) => c.categoryName === inc.categoryName);
    if (!cat) {
      cat = { id: fresh(inc.id), categoryName: inc.categoryName, groups: [] };
      result.push(cat);
    }
    for (const g of inc.groups) {
      let group = cat.groups.find((x) => x.name === g.name);
      if (!group) {
        group = { id: fresh(g.id), name: g.name, tags: [], ...(g.random ? { random: g.random } : {}) };
        cat.groups.push(group);
      }
      const seen = new Set(group.tags.map(dupKey));
      for (const t of g.tags) {
        if (seen.has(dupKey(t))) {
          duplicateTags++;
          continue;
        }
        seen.add(dupKey(t));
        group.tags.push({ ...t, id: fresh(t.id) });
        addedTags++;
      }
    }
  }
  return { categories: result, addedTags, duplicateTags };
}
