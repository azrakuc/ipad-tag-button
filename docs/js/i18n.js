// 日本語・英語の切り替え。選んだ言語は端末に保存する。
// コードの中の文字は tr('日本語', 'English') で書く。HTML の固定文字は data-en 系の属性に英語を持たせる。
// （ユーザーのデータではなく、このアプリ自身の固定の文字だけを扱う）

const KEY = 'itb:lang';
const LANGS = ['ja', 'en'];

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.includes(saved)) return saved;
  } catch {
    // 読めなくても動作には影響しない
  }
  const nav = typeof navigator !== 'undefined' ? String(navigator.language || '') : '';
  return nav.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

let lang = detect();
const listeners = [];

export const getLang = () => lang;
export const tr = (ja, en) => (lang === 'en' ? en : ja);
export const locale = () => (lang === 'en' ? 'en-US' : 'ja-JP');
export const onLang = (fn) => listeners.push(fn);

// data-en（文字）、data-en-placeholder、data-en-aria-label を、今の言語に合わせて書き換える。
// 元の日本語は data-ja 系の属性に控えておき、日本語に戻すときに使う。
function applyStatic() {
  const root = document.documentElement;
  root.lang = lang;
  for (const node of document.querySelectorAll('[data-en]')) {
    if (node.dataset.ja === undefined) node.dataset.ja = node.textContent;
    node.textContent = lang === 'en' ? node.dataset.en : node.dataset.ja;
  }
  for (const [attr, key, keyJa] of [['placeholder', 'enPlaceholder', 'jaPlaceholder'], ['aria-label', 'enAriaLabel', 'jaAriaLabel']]) {
    for (const node of document.querySelectorAll(`[data-en-${attr}]`)) {
      if (node.dataset[keyJa] === undefined) node.dataset[keyJa] = node.getAttribute(attr) ?? '';
      node.setAttribute(attr, lang === 'en' ? node.dataset[key] : node.dataset[keyJa]);
    }
  }
  for (const block of document.querySelectorAll('.help[lang]')) block.hidden = block.lang !== lang;
  const toggle = document.getElementById('lang-toggle');
  if (toggle) {
    toggle.textContent = lang === 'en' ? '日本語' : 'English';
    toggle.setAttribute('aria-label', lang === 'en' ? '日本語に切り替える' : 'Switch to English');
  }
}

export function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // 保存できなくても動作には影響しない
  }
  applyStatic();
  listeners.forEach((fn) => fn());
}

export function init() {
  applyStatic();
  document.getElementById('lang-toggle')?.addEventListener('click', () => setLang(lang === 'en' ? 'ja' : 'en'));
}
