// 作成画面：並び順・重複の整理・末尾のカンマ・選択中の表示・折りたたみ・ランダム
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, openApp, seed, tag, devices } from '../helpers.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await closeBrowser(); await server.close(); });

const DATA = [
  { id: 'q', categoryName: '品質', groups: [{ id: 'gq', name: '品質', tags: [tag('高品質', 'masterpiece, best quality')] }] },
  { id: 'c', categoryName: 'キャラ', groups: [
    { id: 'g1', name: '人数', tags: [tag('1人', '1girl, solo')] },
    { id: 'g2', name: '衣装', tags: [tag('メイド', 'maid, apron'), tag('ナース', 'nurse, apron')] },
    { id: 'g3', name: '表情', tags: [tag('笑顔', 'smile')] },
  ] },
];
const out = (page) => page.inputValue('#output');
const tap = async (page, cat, name) => { await page.click(`.cat-btn:has-text("${cat}")`); await page.click(`.card:has-text("${name}")`); };

test('押した順ではなく、管理画面の並び（グループの順）で並び、末尾にカンマが付く', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, DATA);
  await tap(page, 'キャラ', '笑顔'); await tap(page, 'キャラ', 'ナース'); await tap(page, 'キャラ', '1人'); await tap(page, '品質', '高品質');
  assert.equal(await out(page), 'masterpiece, best quality, 1girl, solo, nurse, apron, smile, ');
  await tap(page, 'キャラ', 'メイド');
  assert.equal(await out(page), 'masterpiece, best quality, 1girl, solo, maid, apron, nurse, smile, ', '共通のタグは先に来るカードの位置');
  assert.equal(await page.textContent('#sel-cards'), '選択中：高品質1人メイドナース笑顔');
  // 設定を「押した順」にする
  await page.click('.tab[data-view=manager]'); await page.selectOption('#s-order', 'tap'); await page.click('.tab[data-view=builder]');
  await page.click('#clear-btn');
  await tap(page, 'キャラ', '笑顔'); await tap(page, '品質', '高品質');
  assert.equal(await out(page), 'smile, masterpiece, best quality, ');
  // 区切り文字がカンマ以外なら、末尾に付けない
  await page.click('.tab[data-view=manager]'); await page.selectOption('#s-separator', 'space'); await page.click('.tab[data-view=builder]');
  assert.equal(await out(page), 'smile masterpiece best quality');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('アンダースコアとスペースの違いも重複として整理する（保存済みの作業欄も）', async () => {
  const app = await openApp(server.url, {
    initScript: () => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('smart-tag-button:work', JSON.stringify({ tags: [{ key: 'long_hair', text: 'long_hair' }, { key: 'long hair', text: 'long hair' }], selected: [] })); } },
  });
  const { page } = app;
  assert.equal(await out(page), 'long_hair, ');
  await page.click('#clear-btn');
  await seed(page, [{ id: 'c', categoryName: 'C', groups: [{ id: 'g', name: 'G', tags: [tag('キャラ', 'reimu, long hair, hair bow'), tag('衣装', 'white_shirt, long_hair, Hair_Bow')] }] }]);
  await page.click('.card:has-text("キャラ")'); await page.click('.card:has-text("衣装")');
  assert.equal(await out(page), 'reimu, long hair, hair bow, white_shirt, ');
  await page.click('.card:has-text("衣装")');
  assert.equal(await out(page), 'reimu, long hair, hair bow, ', '外したカードと共通のタグは残る');
  await app.close();
});

test('クリアと元に戻す', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, DATA);
  await tap(page, '品質', '高品質');
  await page.click('#clear-btn');
  assert.equal(await out(page), '');
  await page.click('.toast-btn');
  assert.equal(await out(page), 'masterpiece, best quality, ');
  await app.close();
});

test('スマホ：選択中のタグ欄の折りたたみ、選択中の名前の 1 行表示（長い名前は省略）', async () => {
  const app = await openApp(server.url, { device: devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
  const { page } = app;
  const many = Array.from({ length: 8 }, (_, i) => tag(i === 1 ? '騎乗位（とても長い名前のカードがある場合の表示確認）' : `カード${i}`, `t${i}`));
  await seed(page, [{ id: 'c', categoryName: 'C', groups: [{ id: 'g', name: 'G', tags: many }] }]);
  for (let i = 0; i < 8; i++) await page.click(`.card >> nth=${i}`);
  const h = () => page.evaluate(() => document.getElementById('cards').getBoundingClientRect().height);
  const open = await h();
  await page.tap('#sel-toggle');
  assert.ok((await h()) > open + 100, 'カード欄が広がる');
  assert.ok(await page.isVisible('#copy-mini'));
  await page.tap('#copy-mini');
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /^t0, t1, /);
  const strip = await page.evaluate(() => {
    const e = document.getElementById('sel-cards');
    const long = [...e.querySelectorAll('.sel-card-name')][1];
    return { scroll: e.scrollWidth > e.clientWidth, docW: document.documentElement.scrollWidth, innerW: innerWidth, ellipsis: long.scrollWidth > long.clientWidth };
  });
  assert.ok(strip.scroll, '名前の行だけが横にスクロールする');
  assert.equal(strip.docW, strip.innerW, '画面全体ははみ出さない');
  assert.ok(strip.ellipsis, '長い名前は省略される');
  await page.reload(); await page.waitForFunction(() => document.querySelector('.tab.active'));
  assert.ok(await page.evaluate(() => document.getElementById('sel-panel').classList.contains('collapsed')), '折りたたみを覚えている');
  await app.close();
});

test('ランダム：カテゴリー全体から 1 個、固定は残す、対象外は外す、元に戻す', async () => {
  const app = await openApp(server.url);
  const { page } = app;
  await seed(page, [
    { id: 'q', categoryName: '品質', groups: [{ id: 'gq', name: '品質', tags: [tag('高品質', 'masterpiece')] }] },
    { id: 'c', categoryName: 'キャラ', random: { mode: 'random', count: 1 }, groups: [
      { id: 'g1', name: '東方', tags: [tag('霊夢', 'reimu'), tag('魔理沙', 'marisa')] },
      { id: 'g2', name: '使わない', random: { mode: 'off' }, tags: [tag('除外', 'excluded_chara')] },
    ] },
    { id: 'n', categoryName: 'NSFW', random: { mode: 'off' }, groups: [{ id: 'n1', name: '体位', tags: [tag('立ち', 'standing')] }] },
  ]);
  await tap(page, '品質', '高品質'); await tap(page, 'NSFW', '立ち');
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    await page.click('#random-btn');
    const o = (await out(page)).split(', ').filter(Boolean);
    assert.equal(o[0], 'masterpiece');
    assert.equal(o.length, 2, o.join());
    assert.ok(['reimu', 'marisa'].includes(o[1]));
    seen.add(o[1]);
  }
  assert.equal(seen.size, 2, 'どちらも選ばれる');
  const last = await out(page);
  await page.click('#random-btn'); await page.click('.toast-btn');
  assert.equal(await out(page), last, '元に戻す');
  await seed(page, DATA); // ランダムの設定なし
  await page.click('#random-btn');
  assert.match(await page.textContent('#toast'), /ランダムにするものがありません/);
  await app.close();
});

test('選んだカードがあるカテゴリーのボタンに、色付きの枠と枚数が付く', async () => {
  const app = await openApp(server.url, { device: devices['iPhone 13'] });
  const { page } = app;
  await seed(page, DATA);
  const marks = () => page.$$eval('.cat-btn', (b) => b.map((x) => `${x.querySelector('.cat-name').textContent}:${x.classList.contains('has-sel') ? x.querySelector('.cat-count').textContent : '-'}`).join(' '));
  assert.equal(await marks(), '品質:- キャラ:-');
  await page.click('.cat-btn:has-text("キャラ")');
  await page.click('.card:has-text("メイド")'); await page.click('.card:has-text("笑顔")');
  assert.equal(await marks(), '品質:- キャラ:2');
  // 別のカテゴリーを開いても、選んだカテゴリーの印は残る
  await page.click('.cat-btn:has-text("品質")');
  assert.equal(await marks(), '品質:- キャラ:2');
  const border = await page.$eval('.cat-btn:has-text("キャラ")', (b) => getComputedStyle(b).borderTopColor);
  assert.equal(border, 'rgb(255, 149, 0)');
  assert.equal(await page.getAttribute('.cat-btn:has-text("キャラ")', 'aria-label'), 'キャラ（選択中 2 枚）');
  // グループ見出しにも枚数が出る
  await page.click('.cat-btn:has-text("キャラ")');
  assert.deepEqual(await page.$$eval('.group-head', (h) => h.map((x) => (x.classList.contains('has-sel') ? x.querySelector('.group-sel').textContent : '-'))), ['-', '選択 1', '選択 1']);
  // 外すと印が消える
  await page.click('.card:has-text("メイド")'); await page.click('.card:has-text("笑顔")');
  assert.equal(await marks(), '品質:- キャラ:-');
  // 横にはみ出さない（印の分だけ幅が増えても）
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(app.errors, []);
  await app.close();
});

