import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMeal, FOOD_SCHEMA } from '../js/gemini.js';

const answer = JSON.stringify({ items: [{ name: '牛肉麵', servings: 1, servingGrams: 600, fistsPerServing: 2, kcal: 550, protein: 30, carb: 70, fat: 15, fiber: 4 }], note: '' });
const res = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

test('Interactions API：請求格式與回應解析', async () => {
  let req;
  globalThis.fetch = async (url, o) => { req = { url, body: JSON.parse(o.body), headers: o.headers }; return res(200, { status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: answer }] }] }); };
  const r = await analyzeMeal({ key: 'k', model: 'm', text: '牛肉麵', image: { data: 'AAA', mime: 'image/jpeg' } });
  assert.match(req.url, /\/v1beta\/interactions$/);
  assert.equal(req.headers['x-goog-api-key'], 'k');
  assert.equal(req.body.response_format.mime_type, 'application/json');
  assert.deepEqual(req.body.response_format.schema, FOOD_SCHEMA);
  assert.equal(req.body.input[1].type, 'image');
  assert.equal(r.api, 'interactions');
  assert.equal(r.items[0].name, '牛肉麵');
  assert.equal(r.items[0].per.kcal, 550);
  assert.equal(r.items[0].fistsPerServing, 2);
});

test('自動模式：Interactions 失敗時改用 generateContent', async () => {
  const urls = [];
  globalThis.fetch = async (url, o) => {
    urls.push(url);
    if (url.endsWith('/interactions')) return res(404, { error: { message: 'not found' } });
    const b = JSON.parse(o.body);
    assert.equal(b.generationConfig.responseMimeType, 'application/json');
    assert.ok(b.generationConfig.responseJsonSchema);
    return res(200, { candidates: [{ content: { parts: [{ text: '```json\n' + answer.replace('"fistsPerServing":2', '"fistsPerServing":null') + '\n```' }] } }] });
  };
  const r = await analyzeMeal({ key: 'k', model: 'gemini-x', text: '牛肉麵' });
  assert.equal(urls.length, 2);
  assert.match(urls[1], /models\/gemini-x:generateContent$/);
  assert.equal(r.api, 'generateContent');
  assert.equal(r.items[0].fistsPerServing, null);
});

test('金鑰錯誤（403）不重試，直接回報', async () => {
  let n = 0;
  globalThis.fetch = async () => { n++; return res(403, { error: { message: 'API key not valid' } }); };
  await assert.rejects(analyzeMeal({ key: 'bad', model: 'm', text: 'x' }), /API key not valid/);
  assert.equal(n, 1);
});

test('沒有 key 時提示', async () => {
  await assert.rejects(analyzeMeal({ key: '', model: 'm', text: 'x' }), /API key/);
});
