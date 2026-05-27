// proxvert · 转换历史(最多 10 条,仅本次浏览器会话持久化)
const KEY = 'proxvert.history';
const MAX = 10;
const FORMATS = new Set(['links', 'links-sub', 'singbox', 'mihomo']);

function getStore() {
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

function dropLegacyPersistentHistory() {
  try { globalThis.localStorage?.removeItem(KEY); } catch {}
}

dropLegacyPersistentHistory();

function safeString(value) {
  return String(value == null ? '' : value);
}

function safeFormat(value, fallback = 'links') {
  const format = safeString(value);
  return FORMATS.has(format) ? format : fallback;
}

function safeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function safeTimestamp(value) {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now();
}

function redactPreview(value) {
  return safeString(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\/\/([^@\s]+)@/g, '//••••@')
    .replace(/((?:password|passwd|pwd|private[-_ ]?key|pre[-_ ]?shared[-_ ]?key)\s*[:=]\s*)[^\s,;"'}]+/gi, '$1••••')
    .replace(/("(?:password|private_key|pre_shared_key|uuid)"\s*:\s*)"[^"]*"/gi, '$1"••••"')
    .slice(0, 80);
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const input = safeString(entry.input);
  const output = safeString(entry.output);
  return {
    id: safeString(entry.id) || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)),
    ts: safeTimestamp(entry.ts),
    src: safeFormat(entry.src),
    target: safeFormat(entry.target),
    nodeCount: safeCount(entry.nodeCount),
    inputPreview: redactPreview(entry.inputPreview || input),
    input,
    output
  };
}

function safeParse(raw) {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(normalizeEntry).filter(Boolean);
  } catch {}
  return [];
}

export function load() {
  const store = getStore();
  if (!store) return [];
  try { return safeParse(store.getItem(KEY) || '[]'); } catch { return []; }
}

function save(list) {
  const store = getStore();
  if (!store) return;
  try { store.setItem(KEY, JSON.stringify(list)); } catch {}
}

export function push(entry) {
  const list = load();
  const item = normalizeEntry(entry);
  if (!item) return list;
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
