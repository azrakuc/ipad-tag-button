// 画面どうしで共有するデータと、変更の通知。
import * as Storage from './storage.js';

export const state = {
  categories: [],
  settings: { separator: ', ' },
  meta: {},
};

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export const emit = () => listeners.forEach((fn) => fn());

export async function init() {
  [state.categories, state.settings, state.meta] = await Promise.all([
    Storage.loadCategories(),
    Storage.loadSettings(),
    Storage.loadMeta(),
  ]);
}

// state.categories を変更したあとに呼ぶ。保存に失敗したら、保存済みの内容に戻す。
export async function commit() {
  try {
    await Storage.saveCategories(state.categories);
    emit();
    return true;
  } catch (e) {
    alert('保存に失敗しました。直前の変更は反映されていません。\n' + e.message);
    state.categories = await Storage.loadCategories();
    emit();
    return false;
  }
}

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
