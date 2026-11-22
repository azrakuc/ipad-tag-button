// 起動、画面の切り替え、Service Worker の登録。
import { init as initState, state, readOnlyMessage } from './state.js';
import { init as initBuilder, show as showBuilder } from './builder.js';
import { init as initManager, show as showManager } from './manager.js';
import { init as initImage } from './imageview.js';
import { receive } from './extract.js';
import { $, initModeSelects } from './ui.js';
import { init as initLang, tr } from './i18n.js';

const VIEWS = ['builder', 'manager', 'image', 'help'];

const ON_SHOW = { builder: () => showBuilder(), manager: () => showManager() };
let ready = false; // 初期化が終わるまでは、表示の切り替えで描かない

function showView(name) {
  for (const v of VIEWS) $(`view-${v}`).hidden = v !== name;
  if (ready) ON_SHOW[name]?.();
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab.dataset.view === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', String(on));
  }
}

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => {
      $('update-banner').hidden = false;
      $('update-btn').onclick = () => worker.postMessage('SKIP_WAITING');
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker);
      });
    });
  }).catch(() => { /* オフライン対応が使えなくても、アプリ自体は動く */ });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
}

async function main() {
  initLang();
  // 他の初期化が失敗しても、画面の切り替えと更新の案内は動くように、先に設定する。
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  }
  showView('builder');
  setupServiceWorker();

  // ストレージの永続化を要求する（失敗しても動作には影響しない）
  navigator.storage?.persist?.().catch(() => {});

  try {
    await initState();
  } catch (e) {
    alert(tr('データベースを開けませんでした。プライベートブラウズの場合は、通常のブラウズで開いてください。\n', 'Could not open the database. If you are in private browsing, please open the app in a normal window.\n') + e.message);
  }
  initModeSelects();
  initBuilder();
  initManager();
  initImage({
    onExtract: (text, file) => {
      showView('manager');
      receive(text, file);
    },
  });
  ready = true;
  showBuilder();
  // 登録データを読み込めなかったときは、知らせる（保存は state.js が止めている）
  if (state.readOnly) {
    $('load-error').hidden = false;
    $('load-error-text').textContent = readOnlyMessage() + (state.loadError ? `\n(${state.loadError})` : '');
  }
}

main();
