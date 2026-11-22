// 作成画面：タグカードをタップしてプロンプトを組み立てる。
import { state, onChange, findTag, catTags } from './state.js';
import { splitTags, joinTags } from './tags.js';
import { $, el, toast } from './ui.js';
import { tr, onLang } from './i18n.js';

const WORK_KEY = 'itb:work';
const LAST_KEY = 'itb:lastCategory';
const COLLAPSED_KEY = 'itb:collapsedGroups';
const SEL_COLLAPSED_KEY = 'itb:selCollapsed'; // 選択中のタグ欄を折りたたんでいるか（縦画面だけで効く）
const LONG_PRESS_MS = 500;

// 作業中の状態：work.tags = 並び順どおりのタグ [{ key, text }]、work.selected = 選択中のカード ID
let work = loadWork();
let currentCat = localStorage.getItem(LAST_KEY);
let reorder = false;
let collapsed = loadCollapsed();
let chipSorter;

function loadWork() {
  try {
    const w = JSON.parse(localStorage.getItem(WORK_KEY));
    const tags = Array.isArray(w?.tags)
      ? w.tags.filter((t) => t && typeof t.key === 'string' && typeof t.text === 'string')
      : [];
    const selected = Array.isArray(w?.selected) ? w.selected.filter((s) => typeof s === 'string') : [];
    return { tags, selected };
  } catch {
    return { tags: [], selected: [] };
  }
}

function saveWork() {
  try {
    localStorage.setItem(WORK_KEY, JSON.stringify(work));
  } catch {
    // 保存できなくても動作には影響しない
  }
}

function loadCollapsed() {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSED_KEY));
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

const hasKey = (key) => work.tags.some((t) => t.key === key);

// 選択中のカードのうち、作業欄にタグが 1 つも残っていないものと、存在しないものを外す。
function pruneSelected() {
  work.selected = work.selected.filter((id) => {
    const tag = findTag(id);
    return tag && splitTags(tag.content).some((t) => hasKey(t.key));
  });
}

// --- 並び順 ---
// 「グループの順」のときは、選択中のカードと作業欄のタグを、管理画面の並び（カテゴリー > グループ > タグ）の順に並べ直す。
// カードを持たないタグ（画像画面から足したものなど）は、末尾に今の順のまま残す。
const groupOrder = () => state.settings.tagOrder !== 'tap';
const LAST = Number.MAX_SAFE_INTEGER;

function sortWork() {
  if (!groupOrder()) return;
  const pos = new Map();
  let i = 0;
  for (const cat of state.categories) for (const g of cat.groups) for (const t of g.tags) pos.set(t.id, i++);
  work.selected.sort((a, b) => (pos.get(a) ?? LAST) - (pos.get(b) ?? LAST));
  const rank = new Map();
  let r = 0;
  for (const id of work.selected) {
    const tag = findTag(id);
    if (tag) for (const t of splitTags(tag.content)) if (!rank.has(t.key)) rank.set(t.key, r++);
  }
  work.tags = work.tags
    .map((t, idx) => ({ t, idx }))
    .sort((a, b) => (rank.get(a.t.key) ?? LAST) - (rank.get(b.t.key) ?? LAST) || a.idx - b.idx)
    .map((x) => x.t);
}

function toggleCard(tag) {
  const index = work.selected.indexOf(tag.id);
  const mine = splitTags(tag.content);
  if (index < 0) {
    work.selected.push(tag.id);
    for (const t of mine) if (!hasKey(t.key)) work.tags.push(t);
  } else {
    work.selected.splice(index, 1);
    // 他の選択中カードにも含まれるタグは残す
    const keep = new Set();
    for (const id of work.selected) {
      const other = findTag(id);
      if (other) splitTags(other.content).forEach((t) => keep.add(t.key));
    }
    const drop = new Set(mine.map((t) => t.key));
    work.tags = work.tags.filter((t) => !drop.has(t.key) || keep.has(t.key));
  }
  sortWork();
  saveWork();
  refresh();
}

// 画像画面などから、タグを作業欄に足す。すでにあるタグは足さない。足した件数を返す。
export function addToWork(items) {
  let added = 0;
  for (const t of items) {
    if (hasKey(t.key)) continue;
    work.tags.push({ key: t.key, text: t.text });
    added++;
  }
  if (added) {
    saveWork();
    refresh();
  }
  return added;
}

// --- ランダム ---
// グループごとの設定に従って、カードを選び直す。
//   固定（既定）：今選んでいるカードを残す（無ければ何も入れない）
//   ランダム   ：そのグループの中から count 枚を選び直す
//   対象外     ：そのグループのカードは選ばない（選択中でも外す）
function pickRandom(list, n) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

function randomize() {
  const before = { tags: [...work.tags], selected: [...work.selected] };
  const prev = new Set(work.selected);
  const keep = new Set();
  const picked = [];
  let randomGroups = 0;
  for (const cat of state.categories) {
    // カテゴリーの設定が先：全体から選ぶ（対象外のグループは除く）／対象外／グループごと
    if (cat.random?.mode === 'off') continue;
    if (cat.random?.mode === 'random') {
      randomGroups++;
      const pool = cat.groups.filter((g) => g.random?.mode !== 'off').flatMap((g) => g.tags);
      picked.push(...pickRandom(pool, cat.random.count).map((t) => t.id));
      continue;
    }
    for (const g of cat.groups) {
      const mode = g.random?.mode || 'fixed';
      if (mode === 'fixed') g.tags.forEach((t) => prev.has(t.id) && keep.add(t.id));
      else if (mode === 'random') {
        randomGroups++;
        picked.push(...pickRandom(g.tags, g.random.count).map((t) => t.id));
      }
    }
  }
  if (randomGroups === 0) {
    return toast(tr('ランダムにするものがありません。管理タブで、カテゴリーかグループの「編集」から「ランダム」を設定してください', 'Nothing is set to random. In the Manage tab, set "Random" in the "Edit" of a category or group'), { ms: 5000 });
  }
  // 今の作業欄のうち、カードを持たないタグと、残すカードのタグはそのまま（×で消したタグも戻さない）
  const keysOf = (ids) => new Set(ids.flatMap((id) => (findTag(id) ? splitTags(findTag(id).content).map((t) => t.key) : [])));
  const cardKeys = keysOf(work.selected);
  const keptKeys = keysOf([...keep]);
  const tags = work.tags.filter((t) => !cardKeys.has(t.key) || keptKeys.has(t.key));
  for (const id of picked) {
    for (const t of splitTags(findTag(id).content)) if (!tags.some((x) => x.key === t.key)) tags.push(t);
  }
  work = { tags, selected: [...work.selected.filter((id) => keep.has(id)), ...picked] };
  sortWork();
  saveWork();
  refresh();
  toast(tr(`ランダムで ${picked.length} 枚選びました`, `Picked ${picked.length} cards at random`), {
    label: tr('元に戻す', 'Undo'),
    ms: 5000,
    onAction: () => {
      work = before;
      pruneSelected();
      saveWork();
      refresh();
    },
  });
}

function removeChip(key) {
  work.tags = work.tags.filter((t) => t.key !== key);
  pruneSelected();
  saveWork();
  refresh();
}

// --- 描画 ---
function renderCats() {
  const bar = $('cats');
  bar.replaceChildren();
  for (const cat of state.categories) {
    const btn = el('button', {
      type: 'button',
      className: 'cat-btn' + (cat.id === currentCat ? ' active' : ''),
      textContent: cat.categoryName,
    });
    btn.addEventListener('click', () => {
      currentCat = cat.id;
      localStorage.setItem(LAST_KEY, cat.id);
      renderCats();
      renderCards();
      $('cards').scrollTop = 0;
    });
    bar.append(btn);
  }
}

function cardFor(tag) {
  const card = el('button', { type: 'button', className: 'card' });
  card.dataset.id = tag.id;
  const img = el('div', { className: 'card-img' });
  if (tag.thumbnail) img.append(el('img', { src: tag.thumbnail, alt: '', draggable: false }));
  else img.textContent = Array.from(tag.name).slice(0, 2).join('').toUpperCase();
  card.append(img, el('div', { className: 'card-name', textContent: tag.name }));

  // 長押しでタグの内容を表示する
  let timer;
  let fired = false;
  card.addEventListener('pointerdown', () => {
    fired = false;
    timer = setTimeout(() => {
      fired = true;
      toast(`${tag.name}${tr('： ', ': ')}${tag.content}`, { ms: 4000 });
    }, LONG_PRESS_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    card.addEventListener(ev, () => clearTimeout(timer));
  }
  card.addEventListener('contextmenu', (e) => e.preventDefault());
  card.addEventListener('click', () => {
    if (fired) {
      fired = false;
      return;
    }
    toggleCard(tag);
  });
  return card;
}

function renderCards() {
  const box = $('cards');
  box.replaceChildren();
  if (state.categories.length === 0) {
    box.append(el('p', { className: 'empty', textContent: tr('カテゴリーがありません。上の「管理」タブでカテゴリー・グループ・タグを登録するか、JSON を読み込んでください。使い方は「説明」タブにあります。', 'No categories yet. Add categories, groups and tags in the "Manage" tab, or import a JSON file. See the "Help" tab for how to use the app.') }));
    return;
  }
  const cat = state.categories.find((c) => c.id === currentCat);
  if (!cat || catTags(cat).length === 0) {
    box.append(el('p', { className: 'empty', textContent: tr('このカテゴリーにはタグがありません。', 'This category has no tags.') }));
    return;
  }
  for (const group of cat.groups) {
    if (group.tags.length === 0) continue;
    const open = !collapsed.has(group.id);
    const head = el('button', { type: 'button', className: 'group-head' }, [
      el('span', { className: 'group-arrow', textContent: open ? '▼' : '▶' }),
      el('span', { textContent: tr(`${group.name}（${group.tags.length}）`, `${group.name} (${group.tags.length})`) }),
    ]);
    head.setAttribute('aria-expanded', String(open));
    const grid = el('div', { className: 'group-cards' });
    grid.hidden = !open;
    for (const tag of group.tags) grid.append(cardFor(tag));
    head.addEventListener('click', () => {
      const nowOpen = grid.hidden; // 閉じていたら開く
      grid.hidden = !nowOpen;
      head.setAttribute('aria-expanded', String(nowOpen));
      head.firstChild.textContent = nowOpen ? '▼' : '▶';
      if (nowOpen) collapsed.delete(group.id);
      else collapsed.add(group.id);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
      } catch {
        // 保存できなくても動作には影響しない
      }
    });
    box.append(el('section', { className: 'group' }, [head, grid]));
  }
  updateCardSelection();
}

function updateCardSelection() {
  for (const card of $('cards').querySelectorAll('.card')) {
    const on = work.selected.includes(card.dataset.id);
    card.classList.toggle('selected', on);
    card.setAttribute('aria-pressed', String(on));
  }
}

function renderChips() {
  const box = $('chips');
  box.replaceChildren();
  if (work.tags.length === 0) {
    box.append(el('p', { className: 'empty small', textContent: tr('カードをタップするとここに追加されます。', 'Tap a card to add its tags here.') }));
    return;
  }
  for (const t of work.tags) {
    const chip = el('span', { className: 'chip' }, [el('span', { textContent: t.text })]);
    chip.dataset.key = t.key;
    const x = el('button', { type: 'button', className: 'chip-x', textContent: '×' });
    x.setAttribute('aria-label', tr(`${t.text} を削除`, `Remove ${t.text}`));
    x.addEventListener('click', () => removeChip(t.key));
    chip.append(x);
    box.append(chip);
  }
}

// 選択中のタグ欄の開閉。縦画面ではカードを選ぶ場所を広げるために折りたためる（横画面では常に開く）。
let selCollapsed = (() => {
  try {
    return localStorage.getItem(SEL_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
})();

function applySelCollapsed() {
  $('sel-panel').classList.toggle('collapsed', selCollapsed);
  $('sel-toggle').setAttribute('aria-expanded', String(!selCollapsed));
  $('sel-arrow').textContent = selCollapsed ? '▶' : '▼';
}

function toggleSel() {
  selCollapsed = !selCollapsed;
  if (selCollapsed && reorder) setReorder(false);
  try {
    localStorage.setItem(SEL_COLLAPSED_KEY, selCollapsed ? '1' : '0');
  } catch {
    // 保存できなくても動作には影響しない
  }
  applySelCollapsed();
}

// カテゴリーボタンの下に、選択中のカード名を 1 行で並べる（はみ出す分は、その行だけ横にスクロール）。
function renderSelCards() {
  const box = $('sel-cards');
  const tags = work.selected.map(findTag).filter(Boolean);
  box.replaceChildren(el('span', { className: 'sel-cards-label', textContent: tr('選択中：', 'Selected:') }));
  if (tags.length === 0) {
    box.append(el('span', { className: 'sel-cards-empty', textContent: tr('選択中のカードはありません', 'No cards selected') }));
    return;
  }
  for (const tag of tags) box.append(el('span', { className: 'sel-card-name', textContent: tag.name, title: tag.name }));
}

function refresh() {
  renderSelCards();
  $('sel-title').textContent = tr(`選択中のタグ（${work.tags.length}）`, `Selected tags (${work.tags.length})`);
  updateCardSelection();
  renderChips();
  $('output').value = joinTags(work.tags.map((t) => t.text), state.settings.separator);
}

function render() {
  if (!state.categories.some((c) => c.id === currentCat)) currentCat = state.categories[0]?.id ?? null;
  pruneSelected();
  sortWork(); // 管理画面で並べ替えたときや、設定を「グループの順」にしたときに追従する
  saveWork();
  renderCats();
  renderCards();
  refresh();
}

// --- 操作 ---
async function copy() {
  const out = $('output');
  const text = out.value;
  if (!text) return toast(tr('コピーするタグがありません', 'There are no tags to copy'));
  try {
    await navigator.clipboard.writeText(text);
    toast(tr('コピーしました', 'Copied'));
  } catch {
    out.focus();
    out.select();
    out.setSelectionRange(0, text.length);
    toast(tr('自動でコピーできませんでした。選択された文字を手動でコピーしてください', "Couldn't copy automatically. Please copy the selected text manually"), { ms: 4000 });
  }
}

function clearAll() {
  if (work.tags.length === 0 && work.selected.length === 0) return;
  const backup = { tags: work.tags, selected: work.selected };
  work = { tags: [], selected: [] };
  saveWork();
  refresh();
  toast(tr('クリアしました', 'Cleared'), {
    label: tr('元に戻す', 'Undo'),
    ms: 6000,
    onAction: () => {
      work = backup;
      pruneSelected();
      saveWork();
      refresh();
    },
  });
}

function setReorder(on) {
  reorder = on;
  chipSorter.option('disabled', !on);
  $('chips').classList.toggle('reorder', on);
  $('reorder-btn').setAttribute('aria-pressed', String(on));
  $('reorder-btn').textContent = on ? tr('並べ替え終了', 'Done reordering') : tr('並べ替え', 'Reorder');
}

export function init() {
  chipSorter = Sortable.create($('chips'), {
    disabled: true,
    animation: 0,
    delay: 100,
    delayOnTouchOnly: true,
    onEnd: () => {
      const byKey = new Map(work.tags.map((t) => [t.key, t]));
      work.tags = [...$('chips').querySelectorAll('.chip')].map((c) => byKey.get(c.dataset.key)).filter(Boolean);
      saveWork();
      refresh();
    },
  });
  $('copy-btn').addEventListener('click', copy);
  $('copy-mini').addEventListener('click', copy);
  $('random-btn').addEventListener('click', randomize);
  $('random-mini').addEventListener('click', randomize);
  $('sel-toggle').addEventListener('click', toggleSel);
  applySelCollapsed();
  $('clear-btn').addEventListener('click', clearAll);
  $('reorder-btn').addEventListener('click', () => setReorder(!reorder));
  onChange(render);
  onLang(() => {
    render();
    setReorder(reorder);
  });
  render();
}
