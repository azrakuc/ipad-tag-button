// IndexedDB への保存と、データの検証・整形。
// データ形式は元の Chrome 拡張機能（tag_button）と同じ：
//   [{ id, categoryName, tags: [{ id, name, content, thumbnail }] }]

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
export function normalizeCategories(data) {
  if (!Array.isArray(data)) throw new Error('形式が正しくありません（配列ではありません）。');
  const seenIds = new Set();
  const categories = [];
  const counts = { tooLarge: 0 };
  let skippedCategories = 0;
  let skippedTags = 0;
  for (const c of data) {
    if (!c || typeof c !== 'object' || !isText(c.categoryName) || c.categoryName.length > LIMITS.name) {
      skippedCategories++;
      continue;
    }
    let id = isText(c.id) ? c.id : newId();
    if (seenIds.has(id)) id = newId();
    seenIds.add(id);
    const tags = [];
    for (const t of Array.isArray(c.tags) ? c.tags : []) {
      const tag = normalizeTag(t, seenIds, counts);
      if (tag) tags.push(tag);
      else skippedTags++;
    }
    categories.push({ id, categoryName: c.categoryName, tags });
  }
  return { categories, skippedCategories, skippedTags };
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
    tx.onabort = () => reject(tx.error || new Error('保存が中止されました。'));
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

const DEFAULT_SETTINGS = { separator: ', ' };

export async function loadSettings() {
  const s = await get('settings', {});
  return { ...DEFAULT_SETTINGS, ...(s && typeof s.separator === 'string' ? { separator: s.separator } : {}) };
}

export const saveSettings = (settings) => set('settings', settings);

export async function loadMeta() {
  const m = await get('meta', {});
  return m && typeof m === 'object' ? m : {};
}

export const saveMeta = (meta) => set('meta', meta);
