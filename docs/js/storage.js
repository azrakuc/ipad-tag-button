import { tr } from './i18n.js';
// IndexedDB への保存と、データの検証・整形。
// データ形式は元の Chrome 拡張機能（tag_button）と同じ：
//   [{ id, categoryName, groups: [{ id, name, tags: [{ id, name, content, thumbnail }] }] }]
// （元の拡張機能は groups のない [{ id, categoryName, tags }]。読み込み時に変換する）

const DB_NAME = 'ipad-tag-button';
const STORE = 'kv';

export const LIMITS = {
  fileBytes: 20 * 1024 * 1024,
  thumbnailChars: 200 * 1024,
  name: 100,
  content: 5000,
};

// SVG は受け付けない。
const THUMB_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const newId = () => crypto.randomUUID();
const isText = (v) => typeof v === 'string' && v.trim() !== '';

function normalizeTag(raw, seenIds, counts) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isText(raw.name) || !isText(raw.content)) return null;
  if (raw.name.length > LIMITS.name || raw.content.length > LIMITS.content) {
    counts.tooLarge++;
    return null;
  }
  let id = isText(raw.id) ? raw.id : newId();
  if (seenIds.has(id)) id = newId();
  seenIds.add(id);
  const t = raw.thumbnail;
  const thumbnail = typeof t === 'string' && t.length <= LIMITS.thumbnailChars && THUMB_RE.test(t) ? t : null;
  return { id, name: raw.name, content: raw.content, thumbnail };
}

// 不正な項目は捨てて件数を数える。いちばん外側が配列でなければ例外を投げる。
// 形式：[{ id, categoryName, groups: [{ id, name, tags: [...] }] }]
// 元の拡張機能の形式（groups がなく tags だけ）は、1 つのグループ「タグ」にまとめて読み込む。
export function normalizeCategories(data) {
  if (!Array.isArray(data)) throw new Error(tr('形式が正しくありません（配列ではありません）。', 'Invalid format (not an array).'));
  const seenIds = new Set();
  const uniqueId = (raw) => {
    let id = isText(raw) ? raw : newId();
    if (seenIds.has(id)) id = newId();
    seenIds.add(id);
    return id;
  };
  const categories = [];
  const counts = { tooLarge: 0 };
  let skippedCategories = 0;
  let skippedGroups = 0;
  let skippedTags = 0;

  for (const c of data) {
    if (!c || typeof c !== 'object' || !isText(c.categoryName) || c.categoryName.length > LIMITS.name) {
      skippedCategories++;
      continue;
    }
    const catId = uniqueId(c.id);
    let rawGroups;
    if (Array.isArray(c.groups)) rawGroups = c.groups;
    else rawGroups = Array.isArray(c.tags) && c.tags.length > 0 ? [{ name: tr('タグ', 'Tags'), tags: c.tags }] : [];

    const groups = [];
    for (const g of rawGroups) {
      if (!g || typeof g !== 'object' || !isText(g.name) || g.name.length > LIMITS.name) {
        skippedGroups++;
        continue;
      }
      const groupId = uniqueId(g.id);
      const tags = [];
      for (const t of Array.isArray(g.tags) ? g.tags : []) {
        const tag = normalizeTag(t, seenIds, counts);
        if (tag) tags.push(tag);
        else skippedTags++;
      }
      groups.push({ id: groupId, name: g.name, tags });
    }
    categories.push({ id: catId, categoryName: c.categoryName, groups });
  }
  return { categories, skippedCategories, skippedGroups, skippedTags };
}

// --- IndexedDB（キーと値だけの単純な保存領域）---
let dbPromise;
function openDb() {
  dbPromise ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function get(key, fallback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result === undefined ? fallback : req.result);
    req.onerror = () => reject(req.error);
  });
}

async function set(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error(tr('保存が中止されました。', 'Saving was aborted.')));
  });
}

export async function loadCategories() {
  try {
    return normalizeCategories(await get('categories', [])).categories;
  } catch {
    return [];
  }
}

export const saveCategories = (categories) => set('categories', categories);

// tagOrder：選択中のタグの並び。'group' = 管理画面の並び（カテゴリー > グループ > タグ）の順、'tap' = 押した順
const DEFAULT_SETTINGS = { separator: ', ', tagOrder: 'group' };

export async function loadSettings() {
  const s = await get('settings', {});
  return {
    ...DEFAULT_SETTINGS,
    ...(s && typeof s.separator === 'string' ? { separator: s.separator } : {}),
    ...(s && (s.tagOrder === 'group' || s.tagOrder === 'tap') ? { tagOrder: s.tagOrder } : {}),
  };
}

export const saveSettings = (settings) => set('settings', settings);

export async function loadMeta() {
  const m = await get('meta', {});
  return m && typeof m === 'object' ? m : {};
}

export const saveMeta = (meta) => set('meta', meta);
