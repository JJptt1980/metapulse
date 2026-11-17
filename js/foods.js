/* 常用食物庫的篩選與排序（純函數） */

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

/** 最近吃過、最常吃的排前面：使用次數 + 最近 14 天內的新近加權 */
export function scoreFood(f, now = Date.now()) {
  const days = f.lastUsed ? (now - f.lastUsed) / 864e5 : Infinity;
  const recency = days === Infinity ? 0 : Math.max(0, 14 - days) * 1.5;
  return (+f.uses || 0) + recency;
}

export function searchFoods(lib, q, now = Date.now()) {
  const k = norm(q);
  const hit = k ? lib.filter(f => norm(f.name).includes(k)) : lib.slice();
  return hit.sort((a, b) => {
    if (k) { // 開頭相符的優先
      const sa = norm(a.name).startsWith(k), sb = norm(b.name).startsWith(k);
      if (sa !== sb) return sa ? -1 : 1;
    }
    return scoreFood(b, now) - scoreFood(a, now) || String(a.name).localeCompare(String(b.name), 'zh-Hant');
  });
}

/** 依名稱（不分大小寫與空白）找既有食物 */
export function findByName(lib, name) {
  const k = norm(name);
  return lib.find(f => norm(f.name) === k) || null;
}
