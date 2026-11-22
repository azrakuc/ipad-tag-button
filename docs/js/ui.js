// 画面まわりの小さな道具。ユーザーのデータは必ず textContent で表示する（innerHTML は使わない）。

export const $ = (id) => document.getElementById(id);

export function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

let toastTimer;
export function toast(message, { label, onAction, ms = 2200 } = {}) {
  const box = $('toast');
  box.replaceChildren(el('span', { textContent: message }));
  if (label) {
    const btn = el('button', { type: 'button', className: 'toast-btn', textContent: label });
    btn.addEventListener('click', () => {
      box.hidden = true;
      onAction?.();
    });
    box.append(btn);
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, ms);
}

// --- 分け方の設定（切り出しフォームと画像画面で共有。端末に保存する） ---
const MODE_KEY = 'itb:splitMode';
const MODES = ['comma', 'sentence', 'whole'];
const modeListeners = [];
let mode = 'comma';
try {
  const saved = localStorage.getItem(MODE_KEY);
  if (MODES.includes(saved)) mode = saved;
} catch {
  // 読めなくても動作には影響しない
}

export const getSplitMode = () => mode;
export const onSplitMode = (fn) => modeListeners.push(fn);

export function setSplitMode(next) {
  if (!MODES.includes(next)) return;
  mode = next;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // 保存できなくても動作には影響しない
  }
  for (const sel of document.querySelectorAll('.mode-select')) sel.value = mode;
  modeListeners.forEach((fn) => fn());
}

// .mode-select の選択肢を、保存された値で初期化して、変更を共有する。
export function initModeSelects() {
  for (const sel of document.querySelectorAll('.mode-select')) {
    sel.value = mode;
    sel.addEventListener('change', () => setSplitMode(sel.value));
  }
}
