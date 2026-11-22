// アプリのファイルを変えたあとに実行する：npm run bump
// docs/sw.js のキャッシュ版（itb-vN）を 1 つ上げ、README の表記と tests/sw-version.json を更新する。
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SW, RECORD, cacheName, contentHash } from './sw-files.mjs';

const old = cacheName();
const n = Number(old.match(/(\d+)$/)[1]) + 1;
const next = old.replace(/\d+$/, String(n));
fs.writeFileSync(SW, fs.readFileSync(SW, 'utf8').replace(`'${old}'`, `'${next}'`));
const readme = path.join(ROOT, 'README.md');
fs.writeFileSync(readme, fs.readFileSync(readme, 'utf8').replaceAll(`\`${old}\``, `\`${next}\``));
fs.writeFileSync(RECORD, JSON.stringify({ cache: next, hash: contentHash() }, null, 2) + '\n');
console.log(`${old} → ${next}`);
