// 管理画面：カテゴリー・タグの登録、設定、データの読み書き。
import { state, onChange, commit, updateSettings } from './state.js';
import { newId } from './storage.js';
import { SEPARATORS } from './tags.js';
import { resizeImage } from './image.js';
import * as IO from './io.js';
import { $, el, toast } from './ui.js';

let selCatId = null;

const selCat = () => state.categories.find((c) => c.id === selCatId) || null;

// --- 描画 ---
function renderCats() {
  const list = $('m-cats');
  list.replaceChildren();
  for (const cat of state.categories) {
    const name = el('button', { type: 'button', className: 'm-main', textContent: `${cat.categoryName}（${cat.tags.length}）` });
    name.addEventListener('click', () => {
      selCatId = cat.id;
      render();
    });
    const edit = el('button', { type: 'button', className: 'btn', textContent: '編集' });
    edit.addEventListener('click', () => openCatDialog(cat.id));
    const li = el('li', { className: 'm-item' + (cat.id === selCatId ? ' active' : '') }, [
      el('span', { className: 'drag-handle', textContent: '☰' }), name, edit,
    ]);
    li.dataset.id = cat.id;
    list.append(li);
  }
  if (state.categories.length === 0) list.append(el('li', { className: 'empty small', textContent: 'カテゴリーがありません。' }));
}

function renderTags() {
  const list = $('m-tags');
  list.replaceChildren();
  const cat = selCat();
  $('m-tags-title').textContent = cat ? `「${cat.categoryName}」のタグ` : 'タグ';
  if (!cat) {
    list.append(el('li', { className: 'empty small', textContent: 'カテゴリーを選んでください。' }));
    return;
  }
  for (const tag of cat.tags) {
    const thumb = el('div', { className: 'm-thumb' });
    if (tag.thumbnail) thumb.append(el('img', { src: tag.thumbnail, alt: '', draggable: false }));
    const text = el('button', { type: 'button', className: 'm-main' }, [
      el('strong', { textContent: tag.name }),
      el('span', { className: 'm-sub', textContent: tag.content }),
    ]);
    text.addEventListener('click', () => openTagDialog(tag.id));
    const li = el('li', { className: 'm-item' }, [
      el('span', { className: 'drag-handle', textContent: '☰' }), thumb, text,
    ]);
    li.dataset.id = tag.id;
    list.append(li);
  }
  if (cat.tags.length === 0) list.append(el('li', { className: 'empty small', textContent: 'タグがありません。' }));
}

async function renderSettings() {
  $('s-separator').value = Object.keys(SEPARATORS).find((k) => SEPARATORS[k] === state.settings.separator) || 'comma-space';
  const last = state.meta.lastExportedAt;
  $('d-last').textContent = last ? `最終エクスポート：${new Date(last).toLocaleString('ja-JP')}` : 'まだエクスポートしていません。定期的にバックアップしてください。';
  if (navigator.storage?.estimate) {
    const { usage } = await navigator.storage.estimate();
    $('s-storage').textContent = `ストレージ使用量：${((usage || 0) / 1024 / 1024).toFixed(2)} MB`;
  }
}

function render() {
  if (!selCat()) selCatId = state.categories[0]?.id ?? null;
  renderCats();
  renderTags();
  renderSettings();
}

// --- カテゴリー編集 ---
let editingCatId = null;

function openCatDialog(id) {
  editingCatId = id;
  const cat = state.categories.find((c) => c.id === id);
  $('c-title').textContent = cat ? 'カテゴリーを編集' : 'カテゴリーを追加';
  $('c-name').value = cat ? cat.categoryName : '';
  $('c-del').hidden = !cat;
  $('dlg-cat').showModal();
}

async function saveCat() {
  const name = $('c-name').value.trim();
  if (!name) return toast('カテゴリー名を入力してください');
  const cat = state.categories.find((c) => c.id === editingCatId);
  if (cat) {
    cat.categoryName = name;
  } else {
    const created = { id: newId(), categoryName: name, tags: [] };
    state.categories.push(created);
    selCatId = created.id;
  }
  $('dlg-cat').close();
  await commit();
}

async function deleteCat() {
  const cat = state.categories.find((c) => c.id === editingCatId);
  if (!cat) return;
  if (!confirm(`カテゴリー「${cat.categoryName}」を削除しますか？\n中のタグ（${cat.tags.length} 件）もすべて削除されます。`)) return;
  state.categories = state.categories.filter((c) => c.id !== cat.id);
  $('dlg-cat').close();
  await commit();
}

// --- タグ編集 ---
let editingTagId = null;
let thumb = null;          // ダイアログに表示中のサムネイル（data URL）
let thumbTask = null;      // 縮小処理の最中は Promise が入る

function setThumb(url) {
  thumb = url || null;
  $('t-thumb-box').hidden = !thumb;
  if (thumb) $('t-thumb').src = thumb;
  else $('t-thumb').removeAttribute('src');
}

function openTagDialog(id) {
  if (state.categories.length === 0) return toast('先にカテゴリーを追加してください');
  editingTagId = id;
  let tag = null;
  let owner = selCat();
  if (id) {
    for (const c of state.categories) {
      const t = c.tags.find((x) => x.id === id);
      if (t) { tag = t; owner = c; }
    }
  }
  $('t-title').textContent = tag ? 'タグを編集' : 'タグを追加';
  $('t-name').value = tag ? tag.name : '';
  $('t-content').value = tag ? tag.content : '';
  $('t-cat').replaceChildren(...state.categories.map((c) => el('option', { value: c.id, textContent: c.categoryName })));
  $('t-cat').value = owner.id;
  $('t-file').value = '';
  thumbTask = null;
  setThumb(tag ? tag.thumbnail : null);
  $('t-del').hidden = !tag;
  $('t-dup').hidden = !tag;
  $('dlg-tag').showModal();
}

async function saveTag() {
  const name = $('t-name').value.trim();
  const content = $('t-content').value.trim();
  if (!name || !content) return toast('名前と内容を入力してください');
  if (thumbTask) {
    try { await thumbTask; } catch { /* 失敗は選択時に表示済み */ }
  }
  const destId = $('t-cat').value;
  const dest = state.categories.find((c) => c.id === destId);
  let existing = null;
  let from = null;
  if (editingTagId) {
    for (const c of state.categories) {
      const t = c.tags.find((x) => x.id === editingTagId);
      if (t) { existing = t; from = c; }
    }
  }
  if (existing) {
    Object.assign(existing, { name, content, thumbnail: thumb });
    if (from !== dest) {
      from.tags = from.tags.filter((t) => t !== existing);
      dest.tags.push(existing);
    }
  } else {
    dest.tags.push({ id: newId(), name, content, thumbnail: thumb });
  }
  selCatId = dest.id;
  $('dlg-tag').close();
  await commit();
}

async function duplicateTag() {
  for (const c of state.categories) {
    const i = c.tags.findIndex((t) => t.id === editingTagId);
    if (i >= 0) {
      const src = c.tags[i];
      c.tags.splice(i + 1, 0, { ...src, id: newId(), name: `${src.name}(コピー)`.slice(0, 100) });
      break;
    }
  }
  $('dlg-tag').close();
  await commit();
  toast('複製しました');
}

async function deleteTag() {
  for (const c of state.categories) {
    const tag = c.tags.find((t) => t.id === editingTagId);
    if (!tag) continue;
    if (!confirm(`タグ「${tag.name}」を削除しますか？`)) return;
    c.tags = c.tags.filter((t) => t !== tag);
    break;
  }
  $('dlg-tag').close();
  await commit();
}

// --- インポート ---
let pending = null;

async function onFileChosen() {
  const file = $('d-file').files[0];
  $('d-file').value = '';
  if (!file) return;
  try {
    pending = await IO.parseFile(file);
  } catch (e) {
    pending = null;
    alert('読み込めませんでした。\n' + e.message + '\n\n今のデータは変更されていません。');
    return;
  }
  const lines = [
    `カテゴリー：${pending.categories.length} 件`,
    `タグ：${IO.countTags(pending.categories)} 件`,
  ];
  if (pending.skippedCategories || pending.skippedTags) {
    lines.push(`読み飛ばし：カテゴリー ${pending.skippedCategories} 件、タグ ${pending.skippedTags} 件（不正な内容、または大きすぎる項目）`);
  }
  $('i-summary').textContent = lines.join('\n');
  $('dlg-import').showModal();
}

async function applyImport(mode) {
  if (!pending) return;
  const data = pending;
  pending = null;
  $('dlg-import').close();
  if (mode === 'replace') {
    if (IO.countTags(state.categories) > 0 || state.categories.length > 0) await IO.download();
    state.categories = data.categories;
    selCatId = null;
    if (await commit()) toast('全置換しました');
  } else {
    const { categories, addedTags, duplicateTags } = IO.mergeAppend(state.categories, data.categories);
    state.categories = categories;
    if (await commit()) toast(`追加しました（タグ ${addedTags} 件、重複 ${duplicateTags} 件は読み込まず）`, { ms: 4000 });
  }
}

// --- 初期化 ---
export function init() {
  Sortable.create($('m-cats'), {
    handle: '.drag-handle',
    animation: 0,
    onEnd: async ({ oldIndex, newIndex }) => {
      if (oldIndex === newIndex) return;
      const [moved] = state.categories.splice(oldIndex, 1);
      state.categories.splice(newIndex, 0, moved);
      await commit();
    },
  });
  Sortable.create($('m-tags'), {
    handle: '.drag-handle',
    animation: 0,
    onEnd: async ({ oldIndex, newIndex }) => {
      const cat = selCat();
      if (!cat || oldIndex === newIndex) return;
      const [moved] = cat.tags.splice(oldIndex, 1);
      cat.tags.splice(newIndex, 0, moved);
      await commit();
    },
  });

  $('m-add-cat').addEventListener('click', () => openCatDialog(null));
  $('m-add-tag').addEventListener('click', () => openTagDialog(null));
  $('c-save').addEventListener('click', saveCat);
  $('c-cancel').addEventListener('click', () => $('dlg-cat').close());
  $('c-del').addEventListener('click', deleteCat);

  $('t-save').addEventListener('click', saveTag);
  $('t-cancel').addEventListener('click', () => $('dlg-tag').close());
  $('t-del').addEventListener('click', deleteTag);
  $('t-dup').addEventListener('click', duplicateTag);
  $('t-thumb-del').addEventListener('click', () => {
    thumbTask = null;
    $('t-file').value = '';
    setThumb(null);
  });
  $('t-file').addEventListener('change', () => {
    const file = $('t-file').files[0];
    if (!file) return;
    const task = resizeImage(file);
    thumbTask = task;
    task
      .then((url) => { if (thumbTask === task) setThumb(url); })
      .catch((e) => {
        if (thumbTask !== task) return;
        $('t-file').value = '';
        toast(e.message);
      })
      .finally(() => { if (thumbTask === task) thumbTask = null; });
  });

  $('s-separator').addEventListener('change', () => updateSettings({ separator: SEPARATORS[$('s-separator').value] }));

  $('d-export').addEventListener('click', () => IO.download().then(() => toast('エクスポートしました')));
  if (IO.canShare()) {
    $('d-share').hidden = false;
    $('d-share').addEventListener('click', () => IO.share().catch((e) => toast('共有できませんでした：' + e.message)));
  }
  $('d-import').addEventListener('click', () => $('d-file').click());
  $('d-file').addEventListener('change', onFileChosen);
  $('i-cancel').addEventListener('click', () => { pending = null; $('dlg-import').close(); });
  $('i-replace').addEventListener('click', () => applyImport('replace'));
  $('i-append').addEventListener('click', () => applyImport('append'));

  onChange(render);
  render();
}
