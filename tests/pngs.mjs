// テスト用の画像（メタデータ入り）をその場で作る。
import zlib from 'node:zlib';

const enc = (s) => new TextEncoder().encode(s);
export const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const u32 = (n, le = false) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, le); return b; };
export const chunk = (t, d) => cat(u32(d.length), enc(t), d, u32(0));
export const tEXt = (kw, text) => chunk('tEXt', cat(enc(kw + '\0'), enc(text)));
export const iTXt = (kw, text, compress = false) => chunk('iTXt', cat(enc(kw + '\0'), new Uint8Array([compress ? 1 : 0, 0]), enc('\0\0'), compress ? zlib.deflateSync(enc(text)) : enc(text)));
export const zTXt = (kw, text) => chunk('zTXt', cat(enc(kw + '\0\0'), zlib.deflateSync(enc(text))));

// 本物の 1x1 PNG にテキストのチャンクを差し込む（ブラウザでも表示できる）
const BASE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export function png(...chunks) {
  const at = BASE.indexOf('IDAT') - 4;
  return cat(new Uint8Array(BASE.subarray(0, at)), ...chunks, new Uint8Array(BASE.subarray(at)));
}

// EXIF（ビッグエンディアン）の UserComment を UNICODE で持つ TIFF
export function exifUserComment(text) {
  const b = Buffer.from(text, 'utf16le'); b.swap16();
  const uc = cat(enc('UNICODE\0'), new Uint8Array(b));
  const t = new Uint8Array(44 + uc.length); const v = new DataView(t.buffer);
  t.set(enc('MM'), 0); v.setUint16(2, 42); v.setUint32(4, 8);
  v.setUint16(8, 1); v.setUint16(10, 0x8769); v.setUint16(12, 4); v.setUint32(14, 1); v.setUint32(18, 26);
  v.setUint16(26, 1); v.setUint16(28, 0x9286); v.setUint16(30, 7); v.setUint32(32, uc.length); v.setUint32(36, 44);
  t.set(uc, 44);
  return t;
}
const seg = (m, d) => { const l = new Uint8Array(2); new DataView(l.buffer).setUint16(0, d.length + 2); return cat(new Uint8Array([0xff, m]), l, d); };
export const jpeg = (...segs) => cat(new Uint8Array([0xff, 0xd8]), ...segs, seg(0xda, new Uint8Array(4)));
export const app1Exif = (tiff) => seg(0xe1, cat(enc('Exif\0\0'), tiff));
export const app1Xmp = (xml) => seg(0xe1, cat(enc('http://ns.adobe.com/xap/1.0/\0'), enc(xml)));
const wchunk = (t, d) => cat(enc(t), u32(d.length, true), d, d.length % 2 ? new Uint8Array(1) : new Uint8Array(0));
export function webp(...chunks) {
  const body = cat(enc('WEBP'), wchunk('VP8 ', new Uint8Array(3)), ...chunks.map(([t, d]) => wchunk(t, d)));
  return cat(enc('RIFF'), u32(body.length, true), body);
}
export const xmpWithUserComment = (json) =>
  `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description rdf:about=""><exif:UserComment><rdf:Alt><rdf:li xml:lang="x-default">${json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</rdf:li></rdf:Alt></exif:UserComment></rdf:Description></rdf:RDF></x:xmpmeta>`;

export const A1111 = 'masterpiece, 1girl, long hair, red eyes, waitress, pink dress, apron\nNegative prompt: lowres, bad anatomy\nSteps: 28, Sampler: Euler a, CFG scale: 7, Seed: 99, Size: 512x768, Model: foo';
