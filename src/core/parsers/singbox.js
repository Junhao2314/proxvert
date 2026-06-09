/**
 * sing-box JSON → NormalizedNode[]
 * 模型本身就是 sing-box outbound 形态 → 基本是过滤 + 透传。
 */
import { CONVERTIBLE_TYPES, normalizeType } from '../model.js';

export default function parse(text) {
  const obj = JSON.parse(text);
  const list = extract(obj);
  return list
    .map(normalizeOutbound)
    .filter((ob) => CONVERTIBLE_TYPES.has(ob.type));
}

function normalizeOutbound(ob) {
  const node = { ...ob, type: normalizeType(ob.type) };

  if ((node.type === 'hysteria' || node.type === 'hysteria2') && node.obfs !== undefined && !node.obfsObj) {
    node.obfsObj = normalizeHysteriaObfs(node.type, node.obfs);
    delete node.obfs;
  }

  return node;
}

function normalizeHysteriaObfs(type, obfs) {
  if (obfs && typeof obfs === 'object' && !Array.isArray(obfs)) {
    return {
      type: obfs.type,
      password: obfs.password
    };
  }

  if (type === 'hysteria') {
    return {
      type: 'salamander',
      password: String(obfs)
    };
  }

  return {
    type: String(obfs)
  };
}

function extract(obj) {
  if (!obj || typeof obj !== 'object') return [];
  if (Array.isArray(obj)) return obj.filter((o) => o && o.type && o.server);
  if (obj.type && obj.server) return [obj];
  if (Array.isArray(obj.outbounds)) return obj.outbounds.filter((o) => o && o.type && o.server);
  return [];
}
