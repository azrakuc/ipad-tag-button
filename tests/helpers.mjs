// 画面のテスト用の道具：docs/ を配る小さなサーバーと、アプリを開いたページを用意する。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// require 経由で読む（npm install した playwright でも、環境に入っている playwright でも見つかるように）
const require = createRequire(import.meta.url);
export const { chromium, devices } = require('playwright');

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOCS = path.join(ROOT, 'docs');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

export function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(DOCS, decodeURIComponent(url.pathname));
    if (!file.startsWith(DOCS)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r)) })));
}

let browser;
export async function getBrowser() {
  browser ||= await chromium.launch();
  return browser;
}
export async function closeBrowser() {
  await browser?.close();
  browser = undefined;
}

// アプリを開く。Service Worker は止め（再読み込みと重ならないように）、外部（GoatCounter）への通信は遮断する。
// 戻り値の errors には、ページのエラーと CSP 違反がたまる。
export async function openApp(baseUrl, { locale = 'ja-JP', viewport = { width: 1180, height: 820 }, device, initScript, permissions = [] } = {}) {
  const b = await getBrowser();
  const context = await b.newContext({ ...(device || { viewport }), locale, serviceWorkers: 'block', permissions });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) errors.push('csp: ' + m.text()); });
  await page.goto(baseUrl);
  await page.waitForFunction(() => document.querySelector('.tab.active'));
  // .tab.active は、登録データの読み込みが終わる前に付く。読み込みが seed のあとに終わると、空のデータで上書きされるため、
  // 作成画面の一覧（カードまたは「カテゴリーがありません」）が描かれる（＝起動が終わる）まで待つ。
  await page.waitForFunction(() => document.getElementById('cards')?.childElementCount > 0);
  return { page, context, errors, close: () => context.close() };
}

// 登録データを入れて保存する（画面は保存の通知で描き直される）
export async function seed(page, categories) {
  await page.evaluate(async (data) => {
    const m = await import('./js/state.js');
    const s = await import('./js/storage.js');
    m.state.categories = s.normalizeCategories(data).categories;
    await m.commit();
  }, categories);
}

export const tag = (name, content, extra = {}) => ({ id: extra.id || name, name, content, thumbnail: null, ...extra });
