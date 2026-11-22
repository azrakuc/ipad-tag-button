// 管理画面の切り出しフォーム：長いプロンプトをチップに分け、選んだ部分をタグとして登録する。
import { state, commit } from './state.js';
import { newId, LIMITS } from './storage.js';
import { splitTags, splitSentences, splitByMode, joinerFor } from './tags.js';
import { resizeImage } from './image.js';
import { readPrompt, noPromptMessage } from './metadata.js';
import { tr, onLang } from './i18n.js';
import { loadText, saveText, loadJSON, saveJSON } from './store.js';
import { $, el, toast, getSplitMode, onSplitMode } from './ui.js';

const SOURCE_KEY = 'itb:extractSource';
const DRAFT_KEY = 'itb:extractDraft'; // ③の入力中の内容（名前・内容・サムネイル）
const MAX_SOURCE = 100000;
const CHIP_DELAY_MS = 250;

let getTarget = () => ({ cat: null, group: null });
let thumb = null;        // ③のサムネイル（data URL）
let sourceFile = null;   // ①を画像から入れたときの、元の画像（メモリーだけ）
let incoming = null;     // 置き換え確認の待ち：{ text, file }
let registered = null;   // 登録済みタグのキー（キャッシュ）
let chipTimer;

const saveSource = () => saveText(SOURCE_KEY, $('x-source').value);

// ③の入力中の内容を端末に保存する。再読み込みやアプリの切り替えで消えないようにするため。
const saveDraft = () => saveJSON(DRAFT_KEY, { name: $('x-name').value, content: $('x-content').value, thumb });

function loadDraft() {
  const d = loadJSON(DRAFT_KEY, null);
  if (!d || typeof d !== 'object') return;
  if (typeof d.name === 'string') $('x-name').value = d.name.slice(0, LIMITS.name);
  if (typeof d.content === 'string') $('x-content').value = d.content.slice(0, LIMITS.content);
  // 自分で縮小した画像だけを戻す（data:image/ で始まるもの）
  if (typeof d.thumb === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(d.thumb)) setThumb(d.thumb, false);
}

function registeredKeys() {
  if (!registered) {
    registered = new Set();
    for (const cat of state.categories) {
      for (const group of cat.groups) {
        // どの分け方でも「登録済み」と判定できるように、カンマ区切りと文区切りの両方を入れる
        for (const tag of group.tags) {
          for (const t of [...splitTags(tag.content), ...splitSentences(tag.content)]) registered.add(t.key);
        }
      }
    }
  }
  return registered;
}

// --- ②のチップ ---
function renderChips() {
  const box = $('x-chips');
  box.replaceChildren();
  const tags = splitByMode($('x-source').value, getSplitMode());
  if (tags.length === 0) {
    box.append(el('p', { className: 'empty small', textContent: tr('①にプロンプトを入れると、ここにタグが並びます。', 'Put a prompt in ① and its tags will appear here.') }));
    return;
  }
  for (const t of tags) {
    const chip = el('button', { type: 'button', className: 'pick', textContent: t.text });
    chip.dataset.key = t.key;
    chip.addEventListener('click', () => toggleChip(t));
    box.append(chip);
  }
  updateChipStates();
}

function updateChipStates() {
  const on = new Set(splitByMode($('x-content').value, getSplitMode()).map((t) => t.key));
  const done = registeredKeys();
  for (const chip of $('x-chips').querySelectorAll('.pick')) {
    const key = chip.dataset.key;
    chip.classList.toggle('on', on.has(key));
    chip.classList.toggle('done', !on.has(key) && done.has(key));
    chip.setAttribute('aria-pressed', String(on.has(key)));
  }
}

function toggleChip(t) {
  const box = $('x-content');
  const mode = getSplitMode();
  const joiner = joinerFor(mode);
  const current = splitByMode(box.value, mode);
  if (current.some((c) => c.key === t.key)) {
    box.value = current.filter((c) => c.key !== t.key).map((c) => c.text).join(joiner);
  } else {
    const base = box.value.trim().replace(/,\s*$/, '');
    box.value = base ? `${base}${joiner}${t.text}` : t.text;
  }
  updateChipStates();
  saveDraft();
}

// --- 登録先の表示 ---
export function refresh() {
  registered = null;
  const { cat, group } = getTarget();
  $('x-target').textContent = group
    ? tr(`登録先：${cat.categoryName} > ${group.name}（上のリストで選択中）`, `Register to: ${cat.categoryName} > ${group.name} (selected in the lists above)`)
    : tr('上のリストでグループを選んでください。', 'Select a group in the lists above.');
  $('x-register').disabled = !group;
  $('x-append').disabled = !group;
  updateChipStates();
}

// --- ①の入力 ---
function setSource(text, file, mode) {
  const box = $('x-source');
  const next = mode === 'add' ? `${box.value.trimEnd()}\n${text}` : text;
  box.value = next.slice(0, MAX_SOURCE);
  sourceFile = file;
  $('x-thumb-src').hidden = !sourceFile;
  saveSource();
  renderChips();
}

// 画像画面などから①にプロンプトを入れる。①に内容があるときは、置き換えるか足すかを聞く。
export function receive(text, file = null) {
  if (!$('x-source').value.trim()) return setSource(text, file, 'replace');
  incoming = { text, file };
  $('dlg-source').showModal();
}

function answerIncoming(mode) {
  const data = incoming;
  incoming = null;
  $('dlg-source').close();
  if (data && mode) setSource(data.text, data.file, mode);
}

async function onImageChosen() {
  const file = $('x-image-file').files[0];
  $('x-image-file').value = '';
  if (!file) return;
  try {
    const result = await readPrompt(file);
    if (!result.positive) return toast(noPromptMessage(), { ms: 6000 });
    receive(result.positive, file);
  } catch (e) {
    toast(e.message, { ms: 4000 });
  }
}

function clearSource() {
  const backup = { text: $('x-source').value, file: sourceFile };
  if (!backup.text) return;
  setSource('', null, 'replace');
  toast(tr('クリアしました', 'Cleared'), { label: tr('元に戻す', 'Undo'), ms: 6000, onAction: () => setSource(backup.text, backup.file, 'replace') });
}

// --- ③のサムネイル ---
function setThumb(url, save = true) {
  thumb = url || null;
  if (save) saveDraft();
  $('x-thumb').hidden = !thumb;
  $('x-thumb-del').hidden = !thumb;
  if (thumb) $('x-thumb').src = thumb;
  else $('x-thumb').removeAttribute('src');
}

async function useImage(file) {
  try {
    setThumb(await resizeImage(file));
  } catch (e) {
    toast(e.message);
  }
}

// --- 登録 ---
// 登録しても③は空にしない（少し変えて続けて登録できるように）。空にするときは「選択を解除」を使う。
async function register() {
  const { group } = getTarget();
  if (!group) return toast(tr('上のリストでグループを選んでください', 'Select a group in the lists above'));
  const name = $('x-name').value.trim();
  const content = $('x-content').value.trim();
  if (!name || !content) return toast(tr('名前と内容を入力してください', 'Enter a name and content'));
  if (name.length > LIMITS.name || content.length > LIMITS.content) return toast(tr('名前か内容が長すぎます', 'The name or content is too long'));
  // ③が残るので、うっかり 2 回押しても同じタグが二重にできないようにする
  if (group.tags.some((t) => t.name === name && t.content === content)) {
    return toast(tr('同じ名前と内容のタグが、このグループにすでにあります', 'A tag with the same name and content already exists in this group'), { ms: 3000 });
  }
  group.tags.push({ id: newId(), name, content, thumbnail: thumb });
  if (await commit()) toast(tr(`「${name}」を登録しました`, `Registered "${name}"`));
}

// --- 既存のタグに追記 ---
function openAppend() {
  const { group } = getTarget();
  if (!group) return toast(tr('上のリストでグループを選んでください', 'Select a group in the lists above'));
  if (splitByMode($('x-content').value, getSplitMode()).length === 0) return toast(tr('③の内容が空です。②のチップをタップしてください', 'The content in ③ is empty. Tap chips in ②'));
  const list = $('a-list');
  list.replaceChildren();
  for (const tag of group.tags) {
    const btn = el('button', { type: 'button', className: 'm-main' }, [
      el('strong', { textContent: tag.name }),
      el('span', { className: 'm-sub', textContent: tag.content }),
    ]);
    btn.addEventListener('click', () => appendTo(tag));
    list.append(el('li', { className: 'm-item' }, [btn]));
  }
  if (group.tags.length === 0) list.append(el('li', { className: 'empty small', textContent: tr('このグループにタグがありません。', 'This group has no tags.') }));
  $('dlg-append').showModal();
}

async function appendTo(tag) {
  const mode = getSplitMode();
  const have = new Set([...splitTags(tag.content), ...splitSentences(tag.content)].map((t) => t.key));
  const added = splitByMode($('x-content').value, mode).filter((t) => !have.has(t.key));
  $('dlg-append').close();
  if (added.length === 0) return toast(tr('追記するタグはありません（すべて含まれています）', 'Nothing to append (all tags are already included)'));
  const next = `${tag.content.trim().replace(/,\s*$/, '')}${joinerFor(mode)}${added.map((t) => t.text).join(joinerFor(mode))}`;
  if (next.length > LIMITS.content) return toast(tr(`内容が ${LIMITS.content} 文字を超えるため追記できません`, `Can't append: the content would exceed ${LIMITS.content} characters`));
  tag.content = next;
  if (await commit()) toast(tr(`「${tag.name}」に ${added.length} 件を追記しました`, `Appended ${added.length} tags to "${tag.name}"`));
}

// hooks.getTarget：管理画面で選択中の { cat, group } を返す。
export function init(hooks) {
  getTarget = hooks.getTarget;
  $('x-source').value = loadText(SOURCE_KEY).slice(0, MAX_SOURCE);

  loadDraft();

  $('x-source').addEventListener('input', () => {
    saveSource();
    clearTimeout(chipTimer);
    chipTimer = setTimeout(renderChips, CHIP_DELAY_MS);
  });
  $('x-content').addEventListener('input', () => {
    updateChipStates();
    saveDraft();
  });
  $('x-name').addEventListener('input', saveDraft);
  $('x-clear').addEventListener('click', clearSource);
  $('x-image').addEventListener('click', () => $('x-image-file').click());
  $('x-image-file').addEventListener('change', onImageChosen);

  $('x-thumb-pick').addEventListener('click', () => $('x-thumb-file').click());
  $('x-thumb-file').addEventListener('change', () => {
    const file = $('x-thumb-file').files[0];
    $('x-thumb-file').value = '';
    if (file) useImage(file);
  });
  $('x-thumb-src').addEventListener('click', () => sourceFile && useImage(sourceFile));
  $('x-thumb-del').addEventListener('click', () => setThumb(null));

  $('x-register').addEventListener('click', register);
  $('x-append').addEventListener('click', openAppend);
  $('x-unselect').addEventListener('click', () => {
    $('x-content').value = '';
    updateChipStates();
    saveDraft();
  });
  $('a-cancel').addEventListener('click', () => $('dlg-append').close());

  $('s-cancel').addEventListener('click', () => answerIncoming(null));
  $('s-add').addEventListener('click', () => answerIncoming('add'));
  $('s-replace').addEventListener('click', () => answerIncoming('replace'));
  $('dlg-source').addEventListener('close', () => { incoming = null; });

  onSplitMode(renderChips);
  onLang(() => {
    renderChips();
    refresh();
  });
  renderChips();
  refresh();
}
