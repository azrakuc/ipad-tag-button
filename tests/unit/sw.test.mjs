import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { RECORD, appFiles, assets, cacheName, contentHash } from '../sw-files.mjs';

test('Service Worker がキャッシュするファイルと、docs/ のファイルが一致する', () => {
  const list = assets();
  const files = appFiles();
  assert.deepEqual(files.filter((f) => !list.includes(f)), [], 'sw.js の ASSETS に足りないファイル');
  assert.deepEqual(list.filter((f) => !files.includes(f)), [], 'ASSETS にあるが存在しないファイル');
});

test('アプリのファイルを変えたら、キャッシュ版を上げている（npm run bump）', () => {
  const rec = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
  const changed = rec.hash !== contentHash();
  assert.ok(!changed || rec.cache !== cacheName(), 'docs/ のファイルが変わっています。npm run bump でキャッシュ版を上げてください');
  assert.ok(!changed, 'tests/sw-version.json が古いままです。npm run bump を実行してください');
});
