// 管理画面：カテゴリー > グループ > タグ の登録、設定、データの読み書き。
import { state, onChange, commit, updateSettings, catTags, locateTag } from './state.js';
import { newId } from './storage.js';
import { SEPARATORS } from './tags.js';
import { resizeImage } from './image.js';
import * as IO from './io.js';
import { $, el, toast } from './ui.js';

let selCatId = null;
let selGroupId = null;

const selCat = () => state.categories.find((c) => c.id === selCatId) || null;
const selGroup = () => selCat()?.groups.find((g) => g.id === selGroupId) || null;

// --- 描画 ---
const handle = () => el('span', { className: 'drag-handle', textContent: '☰' });
const emptyItem = (text) => el('li', { className: 'empty small', textContent: text });

function renderCats() {
  const list = $('m-cats');
  list.replaceChildren();
  for (const cat of state.categories) {
    const name = el('button', { type: 'button', className: 'm-main', textContent: `${cat.categoryName}（${catTags(cat).length}）` });
    name.addEventListener('click', () => {
      selCatId = cat.id;
      selGroupId = null;
      render();
    });
    const edit = el('button', { type: 'button', className: 'btn', textContent: '編集' });
    edit.addEventListener('click', () => openCatDialog(cat.id));
    list.append(el('li', { className: 'm-item' + (cat.id === selCatId ? ' active' : '') }, [handle(), name, edit]));
  }
  if (state.categories.length === 0) list.append(emptyItem('カテゴリーがありません。'));
}

function renderGroups() {
  const list = $('m-groups');
  list.replaceChildren();
  const cat = selCat();
  $('m-groups-title').textContent = cat ? `「${cat.categoryName}」のグループ` : 'グループ';
  if (!cat) return list.append(emptyItem('カテゴリーを選んでください。'));
  for (const group of cat.groups) {
    const name = el('button', { type: 'button', className: 'm-main', textContent: `${group.name}（${group.tags.length}）` });
    name.addEventListener('click', () => {
      selGroupId = group.id;
      render();
    });
    const edit = el('button', { type: 'button', className: 'btn', textContent: '編集' });
    edit.addEventListener('click', () => openGroupDialog(group.id));
    list.append(el('li', { className: 'm-item' + (group.id === selGroupId ? ' active' : '') }, [handle(), name, edit]));
  }
  if (cat.groups.length === 0) list.append(emptyItem('グループがありません。'));
}

function renderTags() {
  const list = $('m-tags');
  list.replaceChildren();
  const group = selGroup();
  $('m-tags-title').textContent = group ? `「${group.name}」のタグ` : 'タグ';
  if (!group) return list.append(emptyItem('グループを選んでください。'));
  for (const tag of group.tags) {
    const thumb = el('div', { className: 'm-thumb' });
    if (tag.thumbnail) thumb.append(el('img', { src: tag.thumbnail, alt: '', draggable: false }));
    const text = el('button', { type: 'button', className: 'm-main' }, [
      el('strong', { textContent: tag.name }),
      el('span', { className: 'm-sub', textContent: tag.content }),
    ]);
    text.addEventListener('click', () => openTagDialog(tag.id));
    list.append(el('li', { className: 'm-item' }, [handle(), thumb, text]));
  }
  if (group.tags.length === 0) list.append(emptyItem('タグがありません。'));
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
  if (!selGroup()) selGroupId = selCat()?.groups[0]?.id ?? null;
  renderCats();
  renderGroups();
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
    const created = { id: newId(), categoryName: name, groups: [] };
    state.categories.push(created);
    selCatId = created.id;
    selGroupId = null;
  }
  $('dlg-cat').close();
  await commit();
}

async function deleteCat() {
  const cat = state.categories.find((c) => c.id === editingCatId);
  if (!cat) return;
  if (!confirm(`カテゴリー「${cat.categoryName}」を削除しますか？\n中のグループ（${cat.groups.length} 件）とタグ（${catTags(cat).length} 件）もすべて削除されます。`)) return;
  state.categories = state.categories.filter((c) => c.id !== cat.id);
  $('dlg-cat').close();
  await commit();
}

// --- グループ編集 ---
let editingGroupId = null;

function openGroupDialog(id) {
  if (!selCat()) return toast('先にカテゴリーを追加してください');
  editingGroupId = id;
  const group = selCat().groups.find((g) => g.id === id);
  $('g-title').textContent = group ? 'グループを編集' : 'グループを追加';
  $('g-name').value = group ? group.name : '';
  $('g-del').hidden = !group;
  $('dlg-group').showModal();
}

async function saveGroup() {
  const name = $('g-name').value.trim();
  if (!name) return toast('グループ名を入力してください');
  const cat = selCat();
  const group = cat.groups.find((g) => g.id === editingGroupId);
  if (group) {
    group.name = name;
  } else {
    const created = { id: newId(), name, tags: [] };
    cat.groups.push(created);
    selGroupId = created.id;
  }
  $('dlg-group').close();
  await commit();
}

async function deleteGroup() {
  const cat = selCat();
  const group = cat?.groups.find((g) => g.id === editingGroupId);
  if (!group) return;
  if (!confirm(`グループ「${group.name}」を削除しますか？\n中のタグ（${group.tags.length} 件）もすべて削除されます。`)) return;
  cat.groups = cat.groups.filter((g) => g !== group);
  $('dlg-group').close();
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

// 選んだカテゴリーのグループを、グループの選択肢に入れる。
function fillGroupSelect(catId, groupId) {
  const cat = state.categories.find((c) => c.id === catId);
  const groups = cat ? cat.groups : [];
  $('t-group').replaceChildren(...groups.map((g) => el('option', { value: g.id, textContent: g.name })));
  if (groups.some((g) => g.id === groupId)) $('t-group').value = groupId;
}

function openTagDialog(id) {
  if (state.categories.length === 0) return toast('先にカテゴリーを追加してください');
  const found = id ? locateTag(id) : null;
  const cat = found ? found.cat : selCat();
  const group = found ? found.group : selGroup();
  if (!found && !group) return toast('先にグループを追加してください');
  editingTagId = id;
  $('t-title').textContent = found ? 'タグを編集' : 'タグを追加';
  $('t-name').value = found ? found.tag.name : '';
  $('t-content').value = found ? found.tag.content : '';
  $('t-cat').replaceChildren(...state.categories.map((c) => el('option', { value: c.id, textContent: c.categoryName })));
  $('t-cat').value = cat.id;
  fillGroupSelect(cat.id, group?.id);
  $('t-file').value = '';
  thumbTask = null;
  setThumb(found ? found.tag.thumbnail : null);
  $('t-del').hidden = !found;
  $('t-dup').hidden = !found;
  $('dlg-tag').showModal();
}

async function saveTag() {
  const name = $('t-name').value.trim();
  const content = $('t-content').value.trim();
  if (!name || !content) return toast('名前と内容を入力してください');
  const destCat = state.categories.find((c) => c.id === $('t-cat').value);
  const dest = destCat?.groups.find((g) => g.id === $('t-group').value);
  if (!dest) return toast('グループを選んでください（先にグループを追加してください）');
  if (thumbTask) {
    try { await thumbTask; } catch { /* 失敗は選択時に表示済み */ }
  }
  const found = editingTagId ? locateTag(editingTagId) : null;
  if (found) {
    Object.assign(found.tag, { name, content, thumbnail: thumb });
    if (found.group !== dest) {
      found.group.tags = found.group.tags.filter((t) => t !== found.tag);
      dest.tags.push(found.tag);
    }
  } else {
    dest.tags.push({ id: newId(), name, content, thumbnail: thumb });
  }
  selCatId = destCat.id;
  selGroupId = dest.id;
  $('dlg-tag').close();
  await commit();
}

async function duplicateTag() {
  const found = locateTag(editingTagId);
  if (!found) return;
  const i = found.group.tags.indexOf(found.tag);
  found.group.tags.splice(i + 1, 0, { ...found.tag, id: newId(), name: `${found.tag.name}(コピー)`.slice(0, 100) });
  $('dlg-tag').close();
  await commit();
  toast('複製しました');
}

async function deleteTag() {
  const found = locateTag(editingTagId);
  if (!found) return;
  if (!confirm(`タグ「${found.tag.name}」を削除しますか？`)) return;
  found.group.tags = found.group.tags.filter((t) => t !== found.tag);
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
    `グループ：${IO.countGroups(pending.categories)} 件`,
    `タグ：${IO.countTags(pending.categories)} 件`,
  ];
  const { skippedCategories: sc, skippedGroups: sg, skippedTags: st } = pending;
  if (sc || sg || st) {
    lines.push(`読み飛ばし：カテゴリー ${sc} 件、グループ ${sg} 件、タグ ${st} 件（不正な内容、または大きすぎる項目）`);
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
    if (state.categories.length > 0) await IO.download();
    state.categories = data.categories;
    selCatId = null;
    selGroupId = null;
    if (await commit()) toast('全置換しました');
  } else {
    const { categories, addedTags, duplicateTags } = IO.mergeAppend(state.categories, data.categories);
    state.categories = categories;
    if (await commit()) toast(`追加しました（タグ ${addedTags} 件、重複 ${duplicateTags} 件は読み込まず）`, { ms: 4000 });
  }
}

// --- 初期化 ---
function sortable(id, getList) {
  Sortable.create($(id), {
    handle: '.drag-handle',
    animation: 0,
    onEnd: async ({ oldIndex, newIndex }) => {
      const list = getList();
      if (!list || oldIndex === newIndex) return;
      const [moved] = list.splice(oldIndex, 1);
      list.splice(newIndex, 0, moved);
      await commit();
    },
  });
}

export function init() {
  sortable('m-cats', () => state.categories);
  sortable('m-groups', () => selCat()?.groups);
  sortable('m-tags', () => selGroup()?.tags);

  $('m-add-cat').addEventListener('click', () => openCatDialog(null));
  $('m-add-group').addEventListener('click', () => openGroupDialog(null));
  $('m-add-tag').addEventListener('click', () => openTagDialog(null));
  $('c-save').addEventListener('click', saveCat);
  $('c-cancel').addEventListener('click', () => $('dlg-cat').close());
  $('c-del').addEventListener('click', deleteCat);
  $('g-save').addEventListener('click', saveGroup);
  $('g-cancel').addEventListener('click', () => $('dlg-group').close());
  $('g-del').addEventListener('click', deleteGroup);

  $('t-save').addEventListener('click', saveTag);
  $('t-cancel').addEventListener('click', () => $('dlg-tag').close());
  $('t-del').addEventListener('click', deleteTag);
  $('t-dup').addEventListener('click', duplicateTag);
  $('t-cat').addEventListener('change', () => fillGroupSelect($('t-cat').value, null));
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
