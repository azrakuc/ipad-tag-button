// 画面どうしで共有するデータと、変更の通知。
import * as Storage from './storage.js';
import { tr } from './i18n.js';

export const state = {
  categories: [],
  settings: { separator: ', ', tagOrder: 'group' },
  meta: {},
  // 登録データを読み込めなかったときは true。上書きで元のデータを消さないよう、保存を止める。
  // （全置換のインポートで、意図して置き換えたときだけ解除する）
  readOnly: false,
  loadError: '',
};

// --- カテゴリー > グループ > タグ の検索 ---
export const catTags = (cat) => cat.groups.flatMap((g) => g.tags);

export function locateTag(id) {
  for (const cat of state.categories) {
    for (const group of cat.groups) {
      const tag = group.tags.find((t) => t.id === id);
      if (tag) return { cat, group, tag };
    }
  }
  return null;
}

export const findTag = (id) => locateTag(id)?.tag ?? null;

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

export async function init() {
  const [cats, settings, meta] = await Promise.allSettled([
    Storage.loadCategories(),
    Storage.loadSettings(),
    Storage.loadMeta(),
  ]);
  if (cats.status === 'fulfilled') {
    state.categories = cats.value;
  } else {
    state.categories = [];
    state.readOnly = true;
    state.loadError = String(cats.reason?.message || cats.reason || '');
  }
  if (settings.status === 'fulfilled') state.settings = settings.value;
  if (meta.status === 'fulfilled') state.meta = meta.value;
}

const readOnlyMessage = () => tr(
  '保存データを読み込めなかったため、データを守るために保存を止めています。アプリを開き直してください。直らないときは、バックアップの JSON を「全置換」でインポートしてください。',
  'Your saved data could not be loaded, so saving is paused to protect it. Please reopen the app. If that does not help, import your backup JSON with "Replace all".',
);

// state.categories を変更したあとに呼ぶ。保存に失敗したら、保存済みの内容に戻す。
export async function commit() {
  if (state.readOnly) {
    alert(readOnlyMessage());
    return false;
  }
  try {
    await Storage.saveCategories(state.categories);
    emit();
    return true;
  } catch (e) {
    alert(tr('保存に失敗しました。直前の変更は反映されていません。\n', 'Saving failed. Your last change was not applied.\n') + e.message);
    try {
      state.categories = await Storage.loadCategories();
    } catch (err) {
      state.readOnly = true; // 読み直せないときは、これ以上の保存を止める
      state.loadError = String(err?.message || err);
    }
    emit();
    return false;
  }
}

export { readOnlyMessage };

export async function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await Storage.saveSettings(state.settings);
  emit();
}

export async function updateMeta(patch) {
  state.meta = { ...state.meta, ...patch };
  await Storage.saveMeta(state.meta);
  emit();
}
