// タグの分割・重複判定・連結（DOM に依存しない）

// 同じタグかどうかの比較用キー：前後の空白を除き、連続する空白を 1 つにして小文字にする。
export const normKey = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

const OPEN = '([{';
const CLOSE = ')]}';

// 括弧の外にあるカンマ・改行で区切る。"(a, b:1.2)" のような重み付き表記は 1 タグのまま残す。
// 括弧が閉じていないときは、単純にカンマと改行で区切り直す。
function splitRaw(content, respectBrackets) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of content) {
    if (respectBrackets) {
      if (OPEN.includes(ch)) depth++;
      else if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
    }
    if ((ch === ',' || ch === '\n' || ch === '\r') && depth === 0) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return { parts, balanced: depth === 0 };
}

// 内容の文字列を [{ key, text }] にする。空のタグと、同じ内容の中の重複は捨てる。
export function splitTags(content) {
  let { parts, balanced } = splitRaw(String(content), true);
  if (!balanced) parts = splitRaw(String(content), false).parts;
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const text = p.trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const key = normKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text });
  }
  return out;
}

export const SEPARATORS = { 'comma-space': ', ', comma: ',', space: ' ', newline: '\n' };

export const joinTags = (texts, separator) => texts.join(separator);

// --- 分け方（カンマ／文／分けない） ---
// 文章形式のプロンプトは、カンマで分けると文の途中で切れてしまうため、文ごと・全体のまま扱う方法も用意する。
const END_JA = '。！？';
const END_EN = '.!?';

// 改行と、文末（。！？ と、後ろが空白か文末の . ! ?）で区切る。句読点は文に残す。
export function splitSentences(content) {
  const s = String(content);
  const parts = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n' || ch === '\r') {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
    const next = s[i + 1];
    if (END_JA.includes(ch) || (END_EN.includes(ch) && (next === undefined || /\s/.test(next)))) {
      parts.push(cur);
      cur = '';
    }
  }
  parts.push(cur);
  return dedupe(parts);
}

function dedupe(parts) {
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const text = p.trim().replace(/\s+/g, ' ');
    if (!text) continue;
    const key = normKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text });
  }
  return out;
}

export const SPLIT_MODES = ['comma', 'sentence', 'whole'];

export function splitByMode(content, mode) {
  if (mode === 'sentence') return splitSentences(content);
  if (mode === 'whole') return dedupe([String(content).replace(/\s*[\r\n]+\s*/g, ' ')]);
  return splitTags(content);
}

// 切り出した部分を内容にまとめるときの区切り（カンマで分けるときだけ「, 」）。
export const joinerFor = (mode) => (mode === 'comma' ? ', ' : ' ');
