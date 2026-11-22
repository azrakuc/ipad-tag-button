// データの保護：読み込みに失敗したら保存を止める、iPhone では共有シートでバックアップする
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, openApp, seed, tag, devices } from '../helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await closeBrowser(); await server.close(); });

const rawCategories = (page) => page.evaluate(() => new Promise((resolve) => {
  const req = indexedDB.open('ipad-tag-button', 1);
  req.onsuccess = () => { const g = req.result.transaction('kv').objectStore('kv').get('categories'); g.onsuccess = () => resolve(g.result); };
}));

test('保存データが壊れていたら、知らせて保存を止める（空のデータで上書きしない）', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  // 保存データを、読めない形（配列でない）にする
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('ipad-tag-button', 1);
    req.onsuccess = () => { const tx = req.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ broken: true }, 'categories'); tx.oncomplete = resolve; };
  }));
  await page.reload(); await page.waitForFunction(() => document.querySelector('.tab.active'));
  assert.ok(await page.isVisible('#load-error'));
  assert.match(await page.textContent('#load-error'), /保存を止めています/);
  // 何か登録しようとしても、保存しない
  let alerted = '';
  page.on('dialog', (d) => { alerted = d.message(); d.accept(); });
  await page.click('.tab[data-view=manager]');
  await page.click('#m-add-cat'); await page.fill('#c-name', '新しい'); await page.click('#c-save');
  await page.waitForFunction(() => true);
  assert.match(alerted, /保存を止めています/);
  assert.deepEqual(await rawCategories(page), { broken: true }, '元の保存データはそのまま');
  // 全置換のインポートで、意図して置き換えると保存できるようになる
  await page.setInputFiles('#d-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ categoryName: '復元', groups: [] }])) });
  await page.click('#i-replace');
  await page.waitForFunction(() => document.querySelector('#m-cats').textContent.includes('復元'));
  assert.equal((await rawCategories(page))[0].categoryName, '復元');
  await app.close();
});

test('iPhone / iPad：エクスポートは共有シート。全置換で共有をキャンセルしたら、確かめてから進める', async () => {
  const app = await openApp(server.url, {
    device: devices['iPhone 13'],
    initScript: () => {
      window.__shared = [];
      navigator.canShare = () => true;
      navigator.share = async (data) => {
        window.__shared.push(data.files[0].name);
        if (window.__cancelShare) throw new DOMException('cancel', 'AbortError');
      };
    },
  });
  const { page } = app;
  await seed(page, [{ id: 'c', categoryName: 'キャラ', groups: [{ id: 'g', name: '東方', tags: [tag('霊夢', 'reimu')] }] }]);
  await page.tap('.tab[data-view=manager]');
  assert.equal(await page.isVisible('#d-share'), false, 'iPhone では「共有…」は出さない');
  await page.tap('#d-export');
  await page.waitForFunction(() => window.__shared.length === 1);
  assert.match(await page.evaluate(() => window.__shared[0]), /^tag-button-backup-/);
  // 全置換：共有をキャンセル → 確認（キャンセル）→ 置き換えない
  await page.evaluate(() => { window.__cancelShare = true; });
  let msg = '';
  page.once('dialog', (d) => { msg = d.message(); d.dismiss(); });
  await page.setInputFiles('#d-file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ categoryName: '新しい', groups: [] }])) });
  await page.tap('#i-replace');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('やめました'));
  assert.match(msg, /バックアップを書き出せませんでした/);
  assert.match(await page.textContent('#m-cats'), /キャラ/);
  await app.close();
});
