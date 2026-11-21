// 起動、画面の切り替え、Service Worker の登録。
import { init as initState } from './state.js';
import { init as initBuilder } from './builder.js';
import { init as initManager } from './manager.js';
import { $ } from './ui.js';

function showView(name) {
  const manager = name === 'manager';
  $('view-builder').hidden = manager;
  $('view-manager').hidden = !manager;
  $('view-toggle').textContent = manager ? '← 作成' : '⚙ 管理';
  $('view-toggle').setAttribute('aria-label', manager ? '作成画面に戻る' : '管理画面を開く');
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
  // ストレージの永続化を要求する（失敗しても動作には影響しない）
  navigator.storage?.persist?.().catch(() => {});

  try {
    await initState();
  } catch (e) {
    alert('データベースを開けませんでした。プライベートブラウズの場合は、通常のブラウズで開いてください。\n' + e.message);
  }
  initBuilder();
  initManager();

  let view = 'builder';
  $('view-toggle').addEventListener('click', () => {
    view = view === 'builder' ? 'manager' : 'builder';
    showView(view);
  });
  showView(view);
  setupServiceWorker();
}

main();
