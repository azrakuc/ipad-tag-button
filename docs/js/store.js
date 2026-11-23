// 端末（localStorage）への小さな保存。プライベートブラウズなどで使えないときも、例外を出さずに既定値を返す。
// （登録データは IndexedDB。ここは作業中の状態や表示の設定など、消えても困らないものだけ）

// キーの接頭辞は smart-tag-button:（旧：itb:）。旧キーの値は、新キーが空のときだけコピーする（旧キーは消さない）。
const LEGACY_PREFIX = 'itb:';
const PREFIX = 'smart-tag-button:';

function migrateLegacyKeys() {
  try {
    const legacy = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) legacy.push(k);
    }
    for (const k of legacy) {
      const next = PREFIX + k.slice(LEGACY_PREFIX.length);
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k));
    }
  } catch {
    // 使えない環境では、移行するものもない
  }
}
migrateLegacyKeys();

export function loadText(key, fallback = '') {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function saveText(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 保存できなくても動作には影響しない
  }
}

export function loadJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export const saveJSON = (key, value) => saveText(key, JSON.stringify(value));
