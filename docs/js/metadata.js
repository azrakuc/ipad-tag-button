// 画像（PNG / JPEG / WebP）のメタデータを読み、生成元ごとにプロンプトを取り出す。
// すべてブラウザの中だけで処理し、外部には何も送らない。DOM には依存しない。

import { tr } from './i18n.js';

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_TEXT = 100000; // 1 つのテキスト項目から読む最大の文字数

const utf8 = new TextDecoder('utf-8');
const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const latin1 = new TextDecoder('latin1');

const clip = (s) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s);
const decodeText = (bytes) => {
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return latin1.decode(bytes);
  }
};
const trimNul = (s) => s.replace(/\u0000+$/g, '').replace(/^\u0000+/g, '');

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

// --- PNG ---
async function readPng(bytes) {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    const start = pos + 8;
    const end = start + len;
    if (end > bytes.length) break;
    if (type === 'tEXt' || type === 'zTXt' || type === 'iTXt') {
      const data = bytes.subarray(start, end);
      const nul = data.indexOf(0);
      if (nul > 0) {
        const name = latin1.decode(data.subarray(0, nul));
        let body = null;
        if (type === 'tEXt') {
          body = data.subarray(nul + 1);
        } else if (type === 'zTXt') {
          body = await inflate(data.subarray(nul + 2));
        } else {
          const compressed = data[nul + 1] === 1;
          let p = nul + 3; // 圧縮フラグと圧縮方式の次から
          while (p < data.length && data[p] !== 0) p++; // 言語タグ
          p++;
          while (p < data.length && data[p] !== 0) p++; // 翻訳されたキーワード
          p++;
          body = data.subarray(p);
          if (compressed) body = await inflate(body);
        }
        if (body) {
          const text = trimNul(decodeText(body));
          if (name === 'XML:com.adobe.xmp') out.push(...readXmp(text));
          else out.push({ name, text: clip(text) });
        }
      }
    }
    if (type === 'IEND') break;
    pos = end + 4; // CRC の分
  }
  return out;
}

// --- EXIF ---
// UserComment の先頭 8 バイトは文字コードの種類。
function decodeUserComment(bytes, little) {
  const head = latin1.decode(bytes.subarray(0, 8));
  const rest = bytes.subarray(8);
  if (head.startsWith('UNICODE')) {
    const tryDecode = (le) => new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(rest);
    let s = tryDecode(little);
    if (s.includes('\u0000')) s = tryDecode(!little);
    return s;
  }
  if (head.startsWith('ASCII') || head.startsWith('\u0000\u0000\u0000\u0000')) return decodeText(rest);
  return decodeText(bytes);
}

function readExif(bytes) {
  const out = [];
  if (bytes.length < 12) return out;
  const little = bytes[0] === 0x49;
  if (!little && bytes[0] !== 0x4d) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);

  const readIfd = (offset, handler) => {
    if (offset < 8 || offset + 2 > bytes.length) return;
    const n = Math.min(u16(offset), 500);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > bytes.length) return;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = count * (type === 3 ? 2 : type === 4 ? 4 : 1);
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (at + size > bytes.length || size > MAX_TEXT * 4) {
        handler(tag, type, null, e);
        continue;
      }
      handler(tag, type, bytes.subarray(at, at + size), e);
    }
  };

  let exifIfd = 0;
  readIfd(u32(4), (tag, type, data, e) => {
    if (tag === 0x8769) exifIfd = u32(e + 8);
    if (tag === 0x010e && data) out.push({ name: 'ImageDescription', text: clip(trimNul(decodeText(data))) });
  });
  if (exifIfd) {
    readIfd(exifIfd, (tag, type, data) => {
      if (tag === 0x9286 && data) out.push({ name: 'UserComment', text: clip(trimNul(decodeUserComment(data, little))) });
    });
  }
  return out;
}

// --- XMP ---
const unescapeXml = (s) =>
  s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[0-9a-fA-F]+);/g, (m, g) => {
    if (g === 'lt') return '<';
    if (g === 'gt') return '>';
    if (g === 'quot') return '"';
    if (g === 'apos') return "'";
    if (g === 'amp') return '&';
    const code = g[1] === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return m;
    }
  });

// 中に別のタグを持たない要素の文字と、長い属性の値を取り出す。
function readXmp(text) {
  const out = [];
  const body = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, g) => g.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  for (const m of body.matchAll(/<([\w:.-]+)(?:\s[^>]*)?>([^<]+)<\/\1>/g)) {
    const t = unescapeXml(m[2]).trim();
    if (t) out.push({ name: `XMP ${m[1]}`, text: clip(t) });
  }
  for (const m of body.matchAll(/\s([\w.-]+:[\w.-]+)="([^"]{21,})"/g)) {
    if (m[1].startsWith('xmlns')) continue;
    out.push({ name: `XMP ${m[1]}`, text: clip(unescapeXml(m[2]).trim()) });
  }
  return out;
}

// --- JPEG ---
function readJpeg(bytes) {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) break;
    const marker = bytes[pos + 1];
    if (marker === 0xda || marker === 0xd9) break; // 画像データの手前まで
    if (marker === 0xff) { pos++; continue; }
    const len = view.getUint16(pos + 2);
    const start = pos + 4;
    const end = pos + 2 + len;
    if (len < 2 || end > bytes.length) break;
    const seg = bytes.subarray(start, end);
    if (marker === 0xe1) {
      const head = latin1.decode(seg.subarray(0, 29));
      if (head.startsWith('Exif\u0000\u0000')) out.push(...readExif(seg.subarray(6)));
      else if (head.startsWith('http://ns.adobe.com/xap/1.0/')) out.push(...readXmp(utf8.decode(seg.subarray(29))));
    } else if (marker === 0xfe) {
      out.push({ name: 'Comment', text: clip(trimNul(decodeText(seg))) });
    }
    pos = end;
  }
  return out;
}

// --- WebP ---
function readWebp(bytes) {
  const out = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(pos, pos + 4));
    const len = view.getUint32(pos + 4, true);
    const start = pos + 8;
    const end = start + len;
    if (end > bytes.length) break;
    const data = bytes.subarray(start, end);
    if (type === 'EXIF') {
      const hasPrefix = latin1.decode(data.subarray(0, 6)) === 'Exif\u0000\u0000';
      out.push(...readExif(hasPrefix ? data.subarray(6) : data));
    } else if (type === 'XMP ') {
      out.push(...readXmp(utf8.decode(data)));
    }
    pos = end + (len % 2);
  }
  return out;
}

// 画像のバイト列から、見つかったテキストのメタデータを [{ name, text }] で返す。
export async function readEntries(bytes) {
  const is = (...sig) => sig.every((b, i) => bytes[i] === b);
  let entries = [];
  if (is(0x89, 0x50, 0x4e, 0x47)) entries = await readPng(bytes);
  else if (is(0xff, 0xd8)) entries = readJpeg(bytes);
  else if (is(0x52, 0x49, 0x46, 0x46) && latin1.decode(bytes.subarray(8, 12)) === 'WEBP') entries = readWebp(bytes);
  else throw new Error(tr('PNG、JPEG、WebP の画像を選んでください。', 'Please choose a PNG, JPEG or WebP image.'));
  return entries.filter((e) => e.text);
}

// --- プロンプトの取り出し ---
const tryJson = (text) => {
  const t = text.trim();
  if (!t.startsWith('{')) return null;
  try {
    const v = JSON.parse(t);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

const str = (v) => (typeof v === 'string' ? v : '');
const pairs = (list) => list.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)]);

// Draw Things：{"c": ポジティブ, "uc": ネガティブ, "seed":…, "steps":…, "scale":…, "size":…, …}
function fromDrawThings(obj) {
  if (typeof obj.c !== 'string') return null;
  return {
    source: 'Draw Things',
    positive: obj.c,
    negative: str(obj.uc),
    settings: pairs([
      ['Seed', obj.seed], ['Steps', obj.steps], ['CFG', obj.scale], ['Sampler', obj.sampler],
      ['Size', obj.size], ['Model', obj.model],
    ]),
  };
}

// NovelAI：Comment に {"prompt":…, "uc":…, "steps":…, …}
function fromNovelAI(obj) {
  if (typeof obj.prompt !== 'string' || !('uc' in obj || 'steps' in obj || 'scale' in obj)) return null;
  return {
    source: 'NovelAI',
    positive: obj.prompt,
    negative: str(obj.uc) || str(obj.negative_prompt),
    settings: pairs([
      ['Seed', obj.seed], ['Steps', obj.steps], ['CFG', obj.scale], ['Sampler', obj.sampler],
      ['Size', obj.width && obj.height ? `${obj.width}x${obj.height}` : ''],
    ]),
  };
}

// A1111 / Forge：「ポジティブ\nNegative prompt: ネガティブ\nSteps: 20, Sampler: …」
function fromA1111(text) {
  const stepsAt = text.search(/(^|\n)Steps: /);
  if (stepsAt < 0) return null;
  const head = text.slice(0, stepsAt);
  const tail = text.slice(stepsAt).replace(/^\n/, '');
  const negMark = head.search(/(^|\n)Negative prompt: /);
  const positive = (negMark < 0 ? head : head.slice(0, negMark)).trim();
  const negative = negMark < 0 ? '' : head.slice(negMark).replace(/^\n?Negative prompt: /, '').trim();
  const kv = {};
  for (const m of tail.matchAll(/([A-Za-z][\w \/.-]*?): ("(?:\\.|[^"\\])*"|[^,]*)(?:, |$)/g)) kv[m[1].trim()] = m[2].trim();
  return {
    source: 'A1111 / Forge',
    positive,
    negative,
    settings: pairs([
      ['Seed', kv.Seed], ['Steps', kv.Steps], ['CFG', kv['CFG scale']], ['Sampler', kv.Sampler],
      ['Size', kv.Size], ['Model', kv.Model],
    ]),
  };
}

// ComfyUI：prompt（ノードの JSON）から、サンプラーの positive / negative をたどる。
function fromComfy(nodes) {
  const isRef = (v) => Array.isArray(v) && v.length === 2 && (typeof v[0] === 'string' || typeof v[0] === 'number');
  const resolve = (ref, depth = 0) => {
    if (depth > 8 || !isRef(ref)) return '';
    const node = nodes[String(ref[0])];
    const inputs = node?.inputs;
    if (!inputs) return '';
    for (const key of ['text', 'text_g', 'prompt', 'string', 'value']) {
      if (typeof inputs[key] === 'string') {
        const extra = typeof inputs.text_l === 'string' && key === 'text_g' ? `, ${inputs.text_l}` : '';
        return inputs[key] + extra;
      }
      if (isRef(inputs[key])) {
        const t = resolve(inputs[key], depth + 1);
        if (t) return t;
      }
    }
    const parts = Object.keys(inputs).filter((k) => k.startsWith('conditioning') && isRef(inputs[k]))
      .map((k) => resolve(inputs[k], depth + 1)).filter(Boolean);
    return parts.join(', ');
  };
  const sampler = Object.values(nodes).find((n) => n?.inputs && isRef(n.inputs.positive) && isRef(n.inputs.negative));
  if (!sampler) return null;
  const i = sampler.inputs;
  return {
    source: 'ComfyUI',
    positive: resolve(i.positive),
    negative: resolve(i.negative),
    settings: pairs([
      ['Seed', i.seed ?? i.noise_seed], ['Steps', i.steps], ['CFG', i.cfg], ['Sampler', i.sampler_name],
    ]),
  };
}

export function extractPrompt(entries) {
  const found = [];
  for (const e of entries) {
    const obj = tryJson(e.text);
    if (obj) {
      const hit = fromDrawThings(obj) || fromNovelAI(obj);
      if (hit) found.push(hit);
      else if (e.name === 'prompt' && Object.values(obj).some((n) => n && typeof n === 'object' && 'class_type' in n)) {
        const comfy = fromComfy(obj);
        if (comfy) found.push(comfy);
      }
      continue;
    }
    const a1111 = fromA1111(e.text);
    if (a1111) found.push(a1111);
  }
  const best = found.find((f) => f.positive || f.negative) || null;
  return { ...(best || { source: '', positive: '', negative: '', settings: [] }), raw: entries };
}

// ファイルを読んで { source, positive, negative, settings, raw } を返す。
export async function readPrompt(file) {
  if (file.size > MAX_IMAGE_BYTES) throw new Error(tr('画像が大きすぎます（50MB まで）。', 'The image is too large (up to 50 MB).'));
  const bytes = new Uint8Array(await file.arrayBuffer());
  return extractPrompt(await readEntries(bytes));
}

export const noPromptMessage = () =>
  tr(
    'この画像にはプロンプトが入っていません。写真アプリを経由すると消えることがあります。「ファイル」アプリに保存した元の画像を選んでください。',
    'This image has no prompt in it. The information can be lost when an image goes through the Photos app. Please choose the original image saved in the Files app.',
  );
