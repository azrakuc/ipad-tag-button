// 管理画面：切り出しフォーム、ランダムの設定、並べ替え、インポート
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, openApp, seed, tag } from '../helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await closeBrowser(); await server.close(); });

const form = (page) => page.evaluate(() => [document.getElementById('x-name').value, document.getElementById('x-content').value]);
const tagCount = (page) => page.locator('#m-tags .m-item').count();
const reopen = async (page) => { await page.reload(); await page.waitForFunction(() => document.querySelector('.tab.active')); await page.click('.tab[data-view=manager]'); };

test('切り出し：チップで内容を作って登録。③は残り、二重登録は防ぎ、再読み込みでも残る', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, [{ id: 'c', categoryName: 'NSFW', groups: [{ id: 'g', name: '1. 体位系', tags: [] }] }]);
  await page.click('.tab[data-view=manager]');
  await page.fill('#x-source', 'a, b, c, d');
  await page.waitForSelector('#x-chips .pick');
  assert.match(await page.textContent('#x-target'), /NSFW > 1\. 体位系/);
  await page.click('#x-chips .pick >> nth=0'); await page.click('#x-chips .pick >> nth=1');
  await page.click('#x-chips .pick >> nth=0'); // 外す
  assert.equal(await page.inputValue('#x-content'), 'b');
  await page.fill('#x-name', '一つ目'); await page.click('#x-register');
  await page.waitForFunction(() => document.querySelectorAll('#m-tags .m-item').length === 1);
  assert.deepEqual(await form(page), ['一つ目', 'b'], '登録しても③は残る');
  assert.equal(await page.locator('#x-chips .pick.done').count(), 0, '内容に入っているチップは「選択中」');
  await page.click('#x-register');
  assert.match(await page.textContent('#toast'), /すでにあります/);
  assert.equal(await tagCount(page), 1);
  await page.click('#x-chips .pick >> nth=2'); await page.fill('#x-name', '二つ目'); await page.click('#x-register');
  await page.waitForFunction(() => document.querySelectorAll('#m-tags .m-item').length === 2);
  // 追記：まだないタグだけ足す。③は残る
  await page.click('#x-chips .pick >> nth=3'); await page.click('#x-append'); await page.click('#a-list .m-main >> nth=0');
  await page.waitForFunction(() => document.querySelector('#m-tags .m-sub').textContent === 'b, c, d');
  assert.equal((await form(page))[1], 'b, c, d');
  await reopen(page);
  assert.deepEqual(await form(page), ['二つ目', 'b, c, d'], '再読み込みでも③は残る');
  assert.equal(await page.inputValue('#x-source'), 'a, b, c, d', '①も残る');
  await page.click('#x-unselect'); await reopen(page);
  assert.deepEqual(await form(page), ['二つ目', '']);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('ランダムの設定：カテゴリーとグループの編集、一覧の表示、開き直し', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, [{ id: 'c', categoryName: 'キャラ', groups: [{ id: 'g1', name: '東方', tags: [tag('霊夢', 'reimu')] }, { id: 'g2', name: '艦これ', tags: [] }] }]);
  await page.click('.tab[data-view=manager]');
  await page.click('#m-cats .m-item:has-text("キャラ") .btn');
  assert.equal(await page.isVisible('#c-count-field'), false);
  await page.selectOption('#c-random', 'random'); await page.fill('#c-count', '1'); await page.click('#c-save');
  await page.click('#m-groups .m-item:has-text("艦これ") .btn');
  await page.selectOption('#g-random', 'off'); await page.click('#g-save');
  await page.waitForFunction(() => document.querySelector('#m-groups').textContent.includes('対象外'));
  assert.match(await page.textContent('#m-cats'), /🎲 全体から 1 個/);
  assert.match(await page.textContent('#m-groups'), /艦これ（0）🎲 対象外/);
  await page.click('#m-cats .m-item:has-text("キャラ") .btn');
  assert.equal(await page.inputValue('#c-random'), 'random');
  await page.selectOption('#c-random', 'groups'); await page.click('#c-save');
  await page.waitForFunction(() => !document.querySelector('#m-cats').textContent.includes('全体から'));
  await app.close();
});

test('並べ替えを何回でもできる（Sortable の不具合の再発防止）', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, ['A', 'B', 'C'].map((n) => ({ id: n, categoryName: n, groups: [] })));
  await page.click('.tab[data-view=manager]');
  const order = () => page.$$eval('#m-cats .m-main', (e) => e.map((x) => x.textContent[0]).join(''));
  const handle = (i) => page.locator('#m-cats .drag-handle').nth(i);
  const expected = ['BCA', 'CAB', 'ABC'];
  for (const want of expected) {
    await handle(0).dragTo(handle(2));
    await page.waitForFunction((w) => [...document.querySelectorAll('#m-cats .m-main')].map((x) => x.textContent[0]).join('') === w, want);
  }
  assert.equal(await order(), 'ABC');
  assert.deepEqual(app.errors, []);
  await app.close();
});

const file = (name, data) => ({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });

test('インポート：追加は統合、全置換はバックアップを書き出して確認してから置き換える', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, [{ id: 'c', categoryName: 'キャラ', groups: [{ id: 'g', name: '東方', tags: [tag('霊夢', 'reimu')] }] }]);
  await page.click('.tab[data-view=manager]');
  // 追加
  await page.setInputFiles('#d-file', file('a.json', [{ categoryName: 'キャラ', groups: [{ name: '東方', tags: [{ name: '霊夢', content: 'reimu' }, { name: '魔理沙', content: 'marisa' }] }] }]));
  await page.click('#i-append');
  await page.waitForFunction(() => document.querySelector('#m-cats').textContent.includes('キャラ（2）'));
  // 全置換：確認でキャンセルすると置き換えない
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d[dialogs.length === 1 ? 'dismiss' : 'accept'](); });
  const replaceWith = file('b.json', [{ categoryName: '新しい', groups: [] }]);
  await page.setInputFiles('#d-file', replaceWith);
  const download = page.waitForEvent('download');
  await page.click('#i-replace');
  assert.match((await download).suggestedFilename(), /^tag-button-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('やめました'));
  assert.match(await page.textContent('#m-cats'), /キャラ/);
  // もう一度：今度は確認で OK
  await page.setInputFiles('#d-file', replaceWith);
  await page.click('#i-replace');
  await page.waitForFunction(() => document.querySelector('#m-cats').textContent.includes('新しい'));
  assert.equal(dialogs.length, 2);
  assert.match(dialogs[0], /バックアップを書き出しました/);
  await app.close();
});
