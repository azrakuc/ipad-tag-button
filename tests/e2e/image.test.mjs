// 画像画面：プロンプトの取り出し、分け方、作業欄への追加、管理で切り出す
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, openApp, seed } from '../helpers.mjs';
import { png, tEXt, A1111 } from '../pngs.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await closeBrowser(); await server.close(); });

const image = (text) => ({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png(tEXt('parameters', text))) });

test('A1111 の画像から取り出して、作業欄に追加・管理で切り出す', async () => {
  const app = await openApp(server.url, { permissions: ['clipboard-read', 'clipboard-write'] });
  const { page } = app;
  await seed(page, [{ id: 'c', categoryName: 'C', groups: [{ id: 'g', name: 'G', tags: [] }] }]);
  await page.click('.tab[data-view=image]');
  await page.setInputFiles('#i-file', image(A1111));
  await page.waitForSelector('#i-result:not([hidden])');
  assert.match(await page.textContent('#i-source'), /A1111/);
  assert.equal(await page.locator('#i-pos .pick').count(), 7);
  assert.match(await page.textContent('#i-neg'), /lowres/);
  assert.match(await page.textContent('#i-settings'), /512x768/);
  await page.click('#i-copy-pos');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^masterpiece/);
  await page.click('#i-pos .pick:has-text("1girl")');
  await page.click('#i-add');
  await page.click('.tab[data-view=builder]');
  assert.equal(await page.inputValue('#output'), '1girl, ');
  // 管理で切り出す（①が空ならそのまま入る）
  await page.click('.tab[data-view=image]');
  await page.click('#i-extract');
  assert.match(await page.inputValue('#x-source'), /^masterpiece, 1girl/);
  assert.ok(await page.isVisible('#x-thumb-src'), '元の画像を使える');
  // もう一度 → ①に内容があるので確認が出る
  await page.click('.tab[data-view=image]');
  await page.click('#i-extract');
  await page.waitForSelector('#dlg-source[open]');
  await page.click('#s-add');
  assert.equal((await page.inputValue('#x-source')).split('\n').length, 2);
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('文章形式のプロンプトは「文で分ける」で文ごとのチップになる', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await page.click('.tab[data-view=image]');
  await page.setInputFiles('#i-file', image('A girl with long, black hair, sitting. The scene is white. A note is bright.\nSteps: 1'));
  await page.waitForSelector('#i-result:not([hidden])');
  await page.selectOption('#i-mode', 'sentence');
  assert.equal(await page.locator('#i-pos .pick').count(), 3);
  await page.selectOption('#i-mode', 'whole');
  assert.equal(await page.locator('#i-pos .pick').count(), 1);
  await page.selectOption('#i-mode', 'comma');
  await app.close();
});

test('プロンプトのない画像では案内を出す', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await page.click('.tab[data-view=image]');
  await page.setInputFiles('#i-file', { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(png(tEXt('Software', 'x'))) });
  await page.waitForFunction(() => document.getElementById('i-msg').textContent.includes('プロンプトが入っていません'));
  assert.ok(await page.isVisible('#i-raw'));
  await app.close();
});
