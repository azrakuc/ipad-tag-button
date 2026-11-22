// Service Worker（docs/sw.js）がキャッシュするファイルの一覧と、アプリのファイルの中身のハッシュを求める。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DOCS = path.join(ROOT, 'docs');
export const SW = path.join(DOCS, 'sw.js');
export const RECORD = path.join(ROOT, 'tests', 'sw-version.json');

// docs/ のファイル（sw.js と隠しファイルを除く）を、相対パスで返す
export function appFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else out.push(path.relative(DOCS, full).split(path.sep).join('/'));
    }
  };
  walk(DOCS);
  return out.filter((f) => f !== 'sw.js').sort();
}

export const cacheName = () => fs.readFileSync(SW, 'utf8').match(/const CACHE = '([^']+)'/)[1];
export const assets = () => [...fs.readFileSync(SW, 'utf8').matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);

export function contentHash() {
  const h = crypto.createHash('sha256');
  for (const f of appFiles()) h.update(f + '\0').update(fs.readFileSync(path.join(DOCS, f)));
  return h.digest('hex');
}
