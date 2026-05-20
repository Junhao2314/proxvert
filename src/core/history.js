// proxvert · 转换历史(最多 10 条,localStorage 持久化)
const KEY = 'proxvert.history';
const MAX = 10;

function safeParse(raw) {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((e) => e && typeof e === 'object');
  } catch {}
  return [];
}

export function load() {
  try {
    return safeParse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function push(entry) {
  const list = load();
  const id = entry.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const item = {
    id,
    ts: entry.ts || Date.now(),
    src: entry.src,
    target: entry.target,
    nodeCount: entry.nodeCount || 0,
    inputPreview: (entry.inputPreview || entry.input || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    input: entry.input || '',
    output: entry.output || ''
  };
  list.unshift(item);
  while (list.length > MAX) list.pop();
  save(list);
  return list;
}

export function remove(id) {
  const list = load().filter((e) => e.id !== id);
  save(list);
  return list;
}

export function clear() {
  save([]);
  return [];
}

export const LIMIT = MAX;
