/**
 * NormalizedNode[] → sing-box config JSON
 * 中转模型本身就是 sing-box outbound 形态，做一遍 clean + 包一层 outbounds。
 */
import { clean } from '../model.js';

export default function serialize(nodes) {
  const outbounds = nodes
    .map((n) => clean(n))
    .filter(Boolean);

  return JSON.stringify({ outbounds }, null, 2);
}
