// 端末（localStorage）への小さな保存。プライベートブラウズなどで使えないときも、例外を出さずに既定値を返す。
// （登録データは IndexedDB。ここは作業中の状態や表示の設定など、消えても困らないものだけ）

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
