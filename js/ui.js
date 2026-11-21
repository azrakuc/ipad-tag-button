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
