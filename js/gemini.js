/* Gemini API：照片或文字 → 食物清單（共用同一個 JSON schema）
 * 預設使用 Interactions API（/v1beta/interactions + response_format），
 * 失敗時退回 generateContent（generationConfig.responseJsonSchema）。 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const num = d => ({ type: 'number', description: d });

export const FOOD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: '辨識到的每一道食物或飲料',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '食物名稱（繁體中文、台灣常用說法）' },
          servings: num('畫面中或描述中大約吃了幾份'),
          servingGrams: num('一份大約幾克（飲料用毫升約等於克）'),
          fistsPerServing: { type: ['number', 'null'], description: '一份大約幾個拳頭大小；一顆蛋、一杯飲料、一片吐司等不適合用拳頭估的填 null' },
          kcal: num('一份的熱量 kcal'),
          protein: num('一份的蛋白質 g'),
          carb: num('一份的碳水化合物 g'),
          fat: num('一份的脂肪 g'),
          fiber: num('一份的膳食纖維 g'),
        },
        required: ['name', 'servings', 'servingGrams', 'fistsPerServing', 'kcal', 'protein', 'carb', 'fat', 'fiber'],
      },
    },
    note: { type: 'string', description: '簡短說明估算的不確定處，可為空字串' },
  },
  required: ['items'],
};

const INSTRUCTIONS = `你是營養估算助手。請辨識使用者的餐點，列出每一道食物或飲料。
規則：
1. 名稱用繁體中文、台灣常用說法。同一盤裡明顯不同的食物分開列（例如「牛肉麵」與「滷蛋」）。
2. 營養素一律填「一份」的數值；servings 填實際吃了幾份。
3. 份量依台灣常見份量估計；不確定時取中間值，不要誇大。
4. fistsPerServing：一般成人拳頭大小約 1 杯（約 240 ml）。顆、片、杯、瓶這類以個數計的食物填 null。
5. 看不出是食物時，items 回傳空陣列，並在 note 說明。`;

function parseJSON(t) {
  const s = String(t || '').replace(/```(json)?/g, '').trim();
  return JSON.parse(s);
}

function clean(out) {
  const items = (out && Array.isArray(out.items) ? out.items : []).map(x => ({
    name: String(x.name || '未命名').trim(),
    servings: +x.servings > 0 ? +x.servings : 1,
    servingGrams: +x.servingGrams > 0 ? +x.servingGrams : 0,
    fistsPerServing: +x.fistsPerServing > 0 ? +x.fistsPerServing : null,
    per: { kcal: +x.kcal || 0, protein: +x.protein || 0, carb: +x.carb || 0, fat: +x.fat || 0, fiber: +x.fiber || 0 },
  }));
  return { items, note: String(out?.note || '') };
}

async function post(url, key, body, signal) {
  const r = await fetch(url, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { /* 非 JSON */ }
  if (!r.ok) {
    const msg = j?.error?.message || txt.slice(0, 200) || ('HTTP ' + r.status);
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return j;
}

async function viaInteractions({ key, model, text, image, signal }) {
  const input = [{ type: 'text', text: INSTRUCTIONS + '\n\n' + text }];
  if (image) input.push({ type: 'image', data: image.data, mime_type: image.mime });
  const j = await post(BASE + '/interactions', key, {
    model, input,
    response_format: { type: 'text', mime_type: 'application/json', schema: FOOD_SCHEMA },
  }, signal);
  if (j?.errors?.length) throw new Error(j.errors[0].message || 'Gemini 回傳錯誤');
  let out = j?.output_text;
  if (!out) for (const s of j?.steps || []) if (s.type === 'model_output') for (const c of s.content || []) if (c.type === 'text') out = (out || '') + c.text;
  if (!out) throw new Error('Gemini 沒有回傳內容');
  return out;
}

async function viaGenerateContent({ key, model, text, image, signal }) {
  const parts = [{ text: INSTRUCTIONS + '\n\n' + text }];
  if (image) parts.push({ inline_data: { mime_type: image.mime, data: image.data } });
  const j = await post(BASE + '/models/' + encodeURIComponent(model) + ':generateContent', key, {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: FOOD_SCHEMA },
  }, signal);
  const out = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  if (!out) throw new Error('Gemini 沒有回傳內容' + (j?.promptFeedback?.blockReason ? '（' + j.promptFeedback.blockReason + '）' : ''));
  return out;
}

/**
 * @param {{key, model, api:'auto'|'interactions'|'generateContent', text?:string, image?:{data:string(base64), mime:string}, signal?}} o
 * @returns {Promise<{items, note, raw, api}>}
 */
export async function analyzeMeal(o) {
  if (!o.key) throw new Error('請先在「設定」輸入 Gemini API key');
  if (!o.model) throw new Error('請先在「設定」輸入模型名稱');
  const text = o.image
    ? '請辨識這張照片中的餐點。' + (o.text ? '補充說明：' + o.text : '')
    : '使用者描述的餐點：' + o.text;
  const api = o.api || 'auto';
  let raw, used;
  if (api === 'generateContent') { raw = await viaGenerateContent({ ...o, text }); used = 'generateContent'; }
  else {
    try { raw = await viaInteractions({ ...o, text }); used = 'interactions'; }
    catch (e) {
      if (api !== 'auto' || e.name === 'AbortError' || e.status === 401 || e.status === 403 || e.status === 429) throw e;
      raw = await viaGenerateContent({ ...o, text }); used = 'generateContent';
    }
  }
  let parsed;
  try { parsed = parseJSON(raw); } catch (e) { throw new Error('Gemini 回傳的不是有效 JSON'); }
  return { ...clean(parsed), raw, api: used };
}

/** 把照片縮小成 JPEG（送 API 用 maxW≈1024；縮圖用 200） */
export function shrinkImage(file, maxW = 1024, quality = 0.85, byWidth = false) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maxW / (byWidth ? img.width : Math.max(img.width, img.height)));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const dataUrl = c.toDataURL('image/jpeg', quality);
      resolve({ dataUrl, data: dataUrl.split(',')[1], mime: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取這張圖片')); };
    img.src = url;
  });
}
