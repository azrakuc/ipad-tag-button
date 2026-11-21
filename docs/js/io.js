// JSON のインポート・エクスポート。
import { state, updateMeta } from './state.js';
import { LIMITS, newId, normalizeCategories } from './storage.js';
import { normKey } from './tags.js';

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function makeFile() {
  const json = JSON.stringify(state.categories, null, 2);
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
  if (file.size > LIMITS.fileBytes) throw new Error('ファイルが大きすぎます（20MB まで）。');
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('JSON として読めません。');
  }
  const result = normalizeCategories(data);
  if (result.categories.length === 0 && (result.skippedCategories > 0 || data.length > 0)) {
    throw new Error('読み込める内容がありませんでした。');
  }
  return result;
}

export const countTags = (categories) => categories.reduce((n, c) => n + c.tags.length, 0);

const dupKey = (t) => `${normKey(t.name)}\u0000${normKey(t.content)}`;

// 今のデータに追加した結果を返す（今のデータは変更しない）。
// 同じ名前のカテゴリーには、名前と内容がどちらも同じでないタグだけを足す。
export function mergeAppend(current, imported) {
  const result = current.map((c) => ({ ...c, tags: [...c.tags] }));
  const usedIds = new Set(result.flatMap((c) => [c.id, ...c.tags.map((t) => t.id)]));
  const fresh = (id) => (usedIds.has(id) ? newId() : id);
  let addedTags = 0;
  let duplicateTags = 0;

  for (const inc of imported) {
    let target = result.find((c) => c.categoryName === inc.categoryName);
    if (!target) {
      target = { id: fresh(inc.id), categoryName: inc.categoryName, tags: [] };
      usedIds.add(target.id);
      result.push(target);
    }
    const seen = new Set(target.tags.map(dupKey));
    for (const t of inc.tags) {
      if (seen.has(dupKey(t))) {
        duplicateTags++;
        continue;
      }
      seen.add(dupKey(t));
      const tag = { ...t, id: fresh(t.id) };
      usedIds.add(tag.id);
      target.tags.push(tag);
      addedTags++;
    }
  }
  return { categories: result, addedTags, duplicateTags };
}
