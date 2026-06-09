/**
 * NormalizedNode[] → sing-box outbound array JSON
 * 中转模型基本贴近 sing-box outbound 形态，少数字段在出口映射后输出。
 */
import { clean } from '../model.js';

export default function serialize(nodes) {
  const outbounds = nodes
    .map((n) => clean(toSingboxOutbound(n)))
    .filter(Boolean);

  return JSON.stringify(outbounds, null, 2);
}

function toSingboxOutbound(node) {
  const outbound = { ...node };

  normalizeTlsFallbackFields(outbound);

  if (outbound.obfsObj && outbound.type === 'hysteria2') {
    outbound.obfs = {
      type: outbound.obfsObj.type,
      password: outbound.obfsObj.password
    };
    delete outbound.obfsObj;
  } else if (outbound.obfsObj && outbound.type === 'hysteria') {
    outbound.obfs = outbound.obfsObj.password || outbound.obfsObj.type;
    delete outbound.obfsObj;
  }

  return outbound;
}

function normalizeTlsFallbackFields(outbound) {
  if (!['hysteria', 'hysteria2', 'tuic'].includes(outbound.type)) return;

  const hasTlsFallback =
    outbound.server_name ||
    outbound.insecure !== undefined ||
    outbound.alpn ||
    outbound.disable_sni !== undefined;

  if (hasTlsFallback) {
    outbound.tls = { ...(outbound.tls || {}) };
    if (outbound.server_name && !outbound.tls.server_name) outbound.tls.server_name = outbound.server_name;
    if (outbound.insecure !== undefined && outbound.tls.insecure === undefined) outbound.tls.insecure = outbound.insecure;
    if (outbound.alpn && !outbound.tls.alpn) outbound.tls.alpn = outbound.alpn;
    if (outbound.disable_sni !== undefined && outbound.tls.disable_sni === undefined) {
      outbound.tls.disable_sni = outbound.disable_sni;
    }
  }

  delete outbound.server_name;
  delete outbound.insecure;
  delete outbound.alpn;
  delete outbound.disable_sni;
}
