import test from 'node:test';
import assert from 'node:assert/strict';
import { readEntries, extractPrompt } from '../../docs/js/metadata.js';
import * as P from '../pngs.mjs';

const read = async (bytes) => extractPrompt(await readEntries(bytes));

test('A1111：PNG の tEXt からポジティブ・ネガティブ・設定を取り出す', async () => {
  const r = await read(P.png(P.tEXt('parameters', P.A1111 + ', Lora hashes: "a: 1, b: 2"')));
  assert.equal(r.source, 'A1111 / Forge');
  assert.equal(r.positive, 'masterpiece, 1girl, long hair, red eyes, waitress, pink dress, apron');
  assert.equal(r.negative, 'lowres, bad anatomy');
  assert.deepEqual(r.settings.find((s) => s[0] === 'Size'), ['Size', '512x768']);
  assert.deepEqual(r.settings.find((s) => s[0] === 'Seed'), ['Seed', '99']);
});

test('A1111：ネガティブなし・iTXt（圧縮・日本語）・zTXt', async () => {
  assert.equal((await read(P.png(P.tEXt('parameters', 'a cat\nSteps: 10')))).negative, '');
  const r = await read(P.png(P.iTXt('parameters', 'ウェイトレス, 1girl\nNegative prompt: ひどい\nSteps: 5', true)));
  assert.equal(r.positive, 'ウェイトレス, 1girl');
  assert.equal(r.negative, 'ひどい');
  assert.equal((await read(P.png(P.zTXt('parameters', 'zz\nSteps: 1')))).positive, 'zz');
});

test('Draw Things：XMP（PNG / JPEG）の JSON', async () => {
  const dt = JSON.stringify({ c: 'waitress, <b>pink</b> & dress', uc: 'ugly', seed: 42, steps: 20, scale: 5, size: '512x768', model: 'm.ckpt' });
  for (const bytes of [P.png(P.iTXt('XML:com.adobe.xmp', P.xmpWithUserComment(dt))), P.jpeg(P.app1Xmp(P.xmpWithUserComment(dt)))]) {
    const r = await read(bytes);
    assert.equal(r.source, 'Draw Things');
    assert.equal(r.positive, 'waitress, <b>pink</b> & dress');
    assert.equal(r.negative, 'ugly');
  }
});

test('NovelAI と ComfyUI', async () => {
  const nai = await read(P.png(P.tEXt('Comment', JSON.stringify({ prompt: 'nai p', uc: 'nai n', steps: 28 }))));
  assert.equal(nai.source, 'NovelAI');
  assert.equal(nai.negative, 'nai n');
  const wf = { 3: { class_type: 'KSampler', inputs: { seed: 5, positive: ['6', 0], negative: ['7', 0] } }, 6: { class_type: 'CLIPTextEncode', inputs: { text: 'comfy pos' } }, 7: { class_type: 'CLIPTextEncode', inputs: { text: 'comfy neg' } } };
  const comfy = await read(P.png(P.tEXt('prompt', JSON.stringify(wf))));
  assert.equal(comfy.source, 'ComfyUI');
  assert.equal(comfy.positive, 'comfy pos');
  assert.equal(comfy.negative, 'comfy neg');
});

test('JPEG・WebP の EXIF UserComment（UNICODE）', async () => {
  const j = await read(P.jpeg(P.app1Exif(P.exifUserComment(P.A1111))));
  assert.equal(j.source, 'A1111 / Forge');
  const w = await read(P.webp(['EXIF', P.exifUserComment(P.A1111)]));
  assert.ok(w.positive.startsWith('masterpiece'));
});

test('プロンプトがない画像・画像でないファイル', async () => {
  const r = await read(P.png(P.tEXt('Software', 'x')));
  assert.equal(r.source, '');
  assert.equal(r.raw.length, 1);
  await assert.rejects(() => readEntries(new TextEncoder().encode('hello world!!')));
});
