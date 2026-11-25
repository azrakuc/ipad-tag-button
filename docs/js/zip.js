// zip の中の .json を取り出す（インポート用）。外部ライブラリは使わず、ブラウザ標準の DecompressionStream で展開する。
// 対応：無圧縮（stored）と deflate。暗号化と zip64 には対応しない。
import { tr } from './i18n.js';

export const ZIP_MAX_ENTRIES = 200;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const FLAG_ENCRYPTED = 0x1;

const bad = () => new Error(tr('zip ファイルとして読めません。', 'Could not read it as a zip file.'));

// 先頭が zip の印（PK\x03\x04）か、ファイル名が .zip なら zip として扱う。
export async function isZip(file) {
  if (/\.zip$/i.test(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

function findEnd(view) {
  const last = view.byteLength - END_RECORD_BYTES;
  const first = Math.max(0, last - MAX_COMMENT_BYTES);
  for (let i = last; i >= first; i--) {
    if (view.getUint32(i, true) === SIG_END) return i;
  }
  throw bad();
}

// 取り込む対象か：フォルダ、macOS の __MACOSX、「.」で始まるファイルは除く。.json だけを読む。
function isJsonEntry(name) {
  if (name.endsWith('/') || name.startsWith('__MACOSX/')) return false;
  const base = name.slice(name.lastIndexOf('/') + 1);
  return !base.startsWith('.') && /\.json$/i.test(base);
}

function listEntries(view, bytes) {
  const end = findEnd(view);
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const offset = view.getUint32(end + 16, true);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
    throw new Error(tr('zip64 形式には対応していません。', 'The zip64 format is not supported.'));
  }
  if (count > ZIP_MAX_ENTRIES) {
    throw new Error(tr(`zip の中のファイルが多すぎます（${ZIP_MAX_ENTRIES} 件まで）。`, `The zip has too many files (up to ${ZIP_MAX_ENTRIES}).`));
  }
  const decoder = new TextDecoder();
  const entries = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CENTRAL) throw bad();
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    if (p + 46 + nameLen > bytes.length) throw bad();
    entries.push({
      name: decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen)),
      flags: view.getUint16(p + 8, true),
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      size: view.getUint32(p + 24, true),
      localOffset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function entryData(view, bytes, entry) {
  const p = entry.localOffset;
  if (p + 30 > bytes.length || view.getUint32(p, true) !== SIG_LOCAL) throw bad();
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
  const end = start + entry.compressedSize;
  if (end > bytes.length) throw bad();
  return bytes.subarray(start, end);
}

// deflate を展開する。展開後の大きさが limit を超えたら、途中でやめて例外を投げる。
async function inflate(data, limit) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(tr('このブラウザは zip の展開に対応していません（iPadOS 16.4 以降が必要です）。', 'This browser cannot unzip files (iPadOS 16.4 or later is required).'));
  }
  const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel();
        throw new Error(tr('zip を展開した大きさが上限を超えています。', 'The unzipped size is over the limit.'));
      }
      chunks.push(value);
    }
  } catch (e) {
    if (e instanceof TypeError || e.name === 'TypeError') throw bad(); // 壊れた圧縮データ
    throw e;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

// zip の中の .json を、[{ name, text }] で返す。展開後の合計が maxBytes を超えたら例外を投げる。
export async function readZipJsons(file, maxBytes) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < END_RECORD_BYTES) throw bad();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const result = [];
  let budget = maxBytes;
  for (const entry of listEntries(view, bytes).filter((e) => isJsonEntry(e.name))) {
    if (entry.flags & FLAG_ENCRYPTED) {
      throw new Error(tr(`${entry.name}：暗号化された zip には対応していません。`, `${entry.name}: encrypted zip files are not supported.`));
    }
    if (entry.method !== METHOD_STORED && entry.method !== METHOD_DEFLATE) {
      throw new Error(tr(`${entry.name}：対応していない圧縮方式です。`, `${entry.name}: unsupported compression method.`));
    }
    if (entry.size > budget) throw new Error(tr('zip を展開した大きさが上限を超えています。', 'The unzipped size is over the limit.'));
    const raw = entryData(view, bytes, entry);
    const data = entry.method === METHOD_STORED ? raw : await inflate(raw, budget);
    if (data.length > budget) throw new Error(tr('zip を展開した大きさが上限を超えています。', 'The unzipped size is over the limit.'));
    budget -= data.length;
    result.push({ name: entry.name, text: decoder.decode(data) });
  }
  return result;
}
