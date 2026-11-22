// 英語表示（日本語が残っていないか）、言語の保存、画面の幅（横にはみ出さないか）、CSP
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, closeBrowser, openApp, seed, tag, getBrowser } from '../helpers.mjs';
import { png, tEXt, A1111 } from '../pngs.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await closeBrowser(); await server.close(); });

const DATA = [{ id: 'c', categoryName: 'Cat', random: { mode: 'random', count: 1 }, groups: [{ id: 'g', name: 'Grp', random: { mode: 'off' }, tags: [tag('T1', '1girl, ' + 'very_long_tag_name_'.repeat(8))] }] }];

// 見えている要素の文字・属性に、日本語が含まれていないか
const japaneseOnScreen = (page) => page.evaluate(() => {
  const JA = /[　-ヿ一-鿿＀-￯]/;
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.checkVisibility() || el.id === 'lang-toggle' || el.closest('#lang-toggle')) continue;
    for (const n of el.childNodes) if (n.nodeType === 3 && JA.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 40));
    for (const a of ['placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && JA.test(v)) out.push(`${a}: ${v.slice(0, 40)}`); }
  }
  return out;
});

test('英語表示：どの画面・ダイアログにも日本語が残らない。言語は保存される', async () => {
  const app = await openApp(server.url, { locale: 'en-US' });
  const { page } = app;
  await seed(page, DATA);
  const check = async (where) => assert.deepEqual(await japaneseOnScreen(page), [], where);
  await check('build');
  await page.click('.card'); await check('build (selected)');
  await page.click('.tab[data-view=manager]'); await check('manage');
  for (const [open, close] of [['#m-cats .btn', '#c-cancel'], ['#m-groups .btn', '#g-cancel'], ['#m-tags .m-main', '#t-cancel']]) {
    await page.click(open); await check(open); await page.click(close);
  }
  await page.fill('#x-source', 'a, b'); await page.waitForSelector('#x-chips .pick'); await check('extract');
  await page.click('.tab[data-view=image]'); await check('image');
  await page.setInputFiles('#i-file', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png(tEXt('parameters', A1111))) });
  await page.waitForSelector('#i-result:not([hidden])'); await check('image (result)');
  await page.click('.tab[data-view=help]'); await check('help');
  await page.click('#lang-toggle');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'ja');
  await page.reload(); await page.waitForFunction(() => document.querySelector('.tab.active'));
  assert.equal(await page.textContent('.tab[data-view=builder]'), '作成', '選んだ言語を覚えている');
  assert.deepEqual(app.errors, []);
  await app.close();
});

test('どの幅・どの画面でも、横にはみ出さない', async () => {
  for (const width of [320, 375, 390, 430, 720, 721, 1180]) {
    for (const locale of ['ja-JP', 'en-US']) {
      const app = await openApp(server.url, { locale, viewport: { width, height: 800 } });
      const { page } = app;
      await seed(page, DATA);
      await page.click('.card');
      for (const view of ['builder', 'manager', 'image', 'help']) {
        await page.click(`.tab[data-view=${view}]`);
        const r = await page.evaluate(() => ({
          doc: document.documentElement.scrollWidth,
          view: document.querySelector('main > section:not([hidden])').scrollWidth,
          inner: innerWidth,
        }));
        assert.ok(r.doc <= r.inner && r.view <= r.inner, `${width}px ${locale} ${view}: ${JSON.stringify(r)}`);
      }
      // ヘッダー：Ko-fi・言語ボタンとタブの間があいている
      const gap = await page.evaluate(() => {
        const box = (s) => document.querySelector(s).getBoundingClientRect();
        const t = box('.tabs'); const k = box('.kofi'); const l = box('#lang-toggle');
        return t.top >= Math.max(k.bottom, l.bottom) ? t.top - Math.max(k.bottom, l.bottom) : t.left - l.right;
      });
      assert.ok(gap >= 12, `${width}px ${locale} header gap ${gap}`);
      await app.close();
    }
  }
});

test('CSP：GoatCounter への通信だけ許可し、それ以外の外部へは送れない', async () => {
  const b = await getBrowser();
  const context = await b.newContext({ serviceWorkers: 'block' });
  const violations = [];
  await context.route('https://gc.zgo.at/count.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.__gc = 1; new Image().src = 'https://azrakuc.goatcounter.com/count?p=/';" }));
  await context.route('https://azrakuc.goatcounter.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/gif', body: '' }));
  const page = await context.newPage();
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await page.goto(server.url);
  await page.waitForFunction(() => window.__gc === 1);
  assert.deepEqual(violations, []);
  const blocked = await page.evaluate(() => fetch('https://example.com/').then(() => 'sent', () => 'blocked'));
  assert.equal(blocked, 'blocked');
  await context.close();
});
