/**
 * sing-box JSON → NormalizedNode[]
 * 模型本身就是 sing-box outbound 形态 → 基本是过滤 + 透传。
 */
import { CONVERTIBLE_TYPES, normalizeType } from '../model.js';

export default function parse(text) {
  const obj = JSON.parse(text);
  const list = extract(obj);
  return list
    .map((ob) => ({ ...ob, type: normalizeType(ob.type) }))
    .filter((ob) => CONVERTIBLE_TYPES.has(ob.type));
}

function extract(obj) {
  if (!obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) return obj.filter((o) => o && o.type && o.server);
  if (obj.type && obj.server) return [obj];
  if (Array.isArray(obj.outbounds)) return obj.outbounds.filter((o) => o && o.type && o.server);
  return [];
}
