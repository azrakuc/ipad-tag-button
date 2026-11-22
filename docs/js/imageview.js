// 画像画面：画像に入っているプロンプトを取り出して表示する。画像も結果も保存しない。
import { readPrompt, noPromptMessage } from './metadata.js';
import { tr, onLang } from './i18n.js';
import { splitByMode } from './tags.js';
import { addToWork } from './builder.js';
import { $, el, toast, getSplitMode, onSplitMode } from './ui.js';

let current = null;   // { file, result }
let previewUrl = null;
let picked = new Set();
// メッセージ欄の中身（言語を切り替えても書き直せるように、文字ではなく関数で持つ）
const INITIAL_MSG = () => tr(
  '画像を選ぶと、入っているプロンプトを取り出します。画像は iPad の中で読むだけで、どこにも送信・保存しません。',
  'Choose an image to extract the prompt stored in it. The image is only read on this device and is never sent or saved.',
);
let msgFn = INITIAL_MSG;
function setMsg(fn) {
  msgFn = fn;
  $('i-msg').textContent = fn();
}

// 設定の項目名（metadata.js は言語に依存しない名前を返す）
const LABELS = {
  Sampler: () => tr('サンプラー', 'Sampler'),
  Size: () => tr('サイズ', 'Size'),
  Model: () => tr('モデル', 'Model'),
};

let token = 0;        // 読み込みの途中で別の画像が選ばれたときに、古い結果を捨てるため

function showPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $('i-preview').src = previewUrl;
  $('i-preview').hidden = false;
  $('i-drop-text').hidden = true;
}

function renderRaw(raw) {
  const body = $('i-raw-body');
  body.replaceChildren();
  for (const e of raw) {
    body.append(el('div', { className: 'raw-item' }, [
      el('strong', { textContent: e.name }),
      el('pre', { className: 'raw-text', textContent: e.text }),
    ]));
  }
  $('i-raw').hidden = raw.length === 0;
}

function renderPositive(text) {
  const box = $('i-pos');
  box.replaceChildren();
  picked = new Set();
  const tags = splitByMode(text, getSplitMode());
  if (tags.length === 0) {
    box.append(el('p', { className: 'empty small', textContent: tr('ポジティブはありません。', 'No positive prompt.') }));
    return;
  }
  for (const t of tags) {
    const chip = el('button', { type: 'button', className: 'pick', textContent: t.text });
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', () => {
      if (picked.has(t.key)) picked.delete(t.key);
      else picked.add(t.key);
      chip.classList.toggle('on', picked.has(t.key));
      chip.setAttribute('aria-pressed', String(picked.has(t.key)));
    });
    box.append(chip);
  }
}

function renderResult(result) {
  const found = !!(result.positive || result.negative);
  $('i-result').hidden = !found;
  $('i-msg').hidden = found;
  renderRaw(result.raw);
  if (!found) {
    setMsg(noPromptMessage);
    return;
  }
  $('i-source').textContent = tr(`読み取り元：${result.source}`, `Source: ${result.source}`);
  renderPositive(result.positive);
  $('i-neg').textContent = result.negative || tr('（なし）', '(none)');
  const dl = $('i-settings');
  dl.replaceChildren();
  for (const [k, v] of result.settings) dl.append(el('dt', { textContent: LABELS[k] ? LABELS[k]() : k }), el('dd', { textContent: v }));
  dl.hidden = result.settings.length === 0;
}

async function load(file) {
  const mine = ++token;
  current = null;
  showPreview(file);
  $('i-result').hidden = true;
  $('i-raw').hidden = true;
  $('i-msg').hidden = false;
  setMsg(() => tr('読み取り中…', 'Reading…'));
  try {
    const result = await readPrompt(file);
    if (mine !== token) return;
    current = { file, result };
    renderResult(result);
  } catch (e) {
    if (mine !== token) return;
    setMsg(() => e.message);
  }
}

async function copy(text) {
  if (!text) return toast(tr('コピーする内容がありません', 'Nothing to copy'));
  try {
    await navigator.clipboard.writeText(text);
    toast(tr('コピーしました', 'Copied'));
  } catch {
    toast(tr('自動でコピーできませんでした', "Couldn't copy automatically"), { ms: 3000 });
  }
}

function pickedItems() {
  const all = splitByMode(current.result.positive, getSplitMode());
  const chosen = all.filter((t) => picked.has(t.key));
  return chosen.length > 0 ? chosen : all;
}

// onExtract(text, file)：「管理で切り出す」が押されたときに呼ばれる。
export function init({ onExtract }) {
  setMsg(INITIAL_MSG);
  onLang(() => {
    $('i-msg').textContent = msgFn();
    if (current) renderResult(current.result);
  });
  onSplitMode(() => current && renderPositive(current.result.positive));
  $('i-pick').addEventListener('click', () => $('i-file').click());
  $('i-file').addEventListener('change', () => {
    const file = $('i-file').files[0];
    $('i-file').value = '';
    if (file) load(file);
  });

  const view = $('view-image');
  const drop = $('i-drop');
  view.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  view.addEventListener('dragleave', (e) => {
    if (e.target === view || e.target === drop) drop.classList.remove('over');
  });
  view.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    const file = [...(e.dataTransfer?.files || [])][0];
    if (file) load(file);
    else toast(tr('画像のファイルを落としてください', 'Please drop an image file'));
  });

  $('i-copy-pos').addEventListener('click', () => current && copy(current.result.positive));
  $('i-copy-neg').addEventListener('click', () => current && copy(current.result.negative));
  $('i-add').addEventListener('click', () => {
    if (!current) return;
    const items = pickedItems();
    if (items.length === 0) return toast(tr('追加するタグがありません', 'No tags to add'));
    const n = addToWork(items);
    toast(n ? tr(`作業欄に ${n} 件追加しました`, `Added ${n} tags to the work area`) : tr('すべて作業欄にあります', 'All of them are already in the work area'));
  });
  $('i-extract').addEventListener('click', () => {
    if (!current?.result.positive) return toast(tr('切り出すポジティブがありません', 'There is no positive prompt to extract'));
    onExtract(current.result.positive, current.file);
  });
}
