/**
 * NormalizedNode[] → sing-box outbound array JSON
 * 中转模型本身就是 sing-box outbound 形态，做一遍 clean 后直接输出数组。
 */
import { clean } from '../model.js';

export default function serialize(nodes) {
  const outbounds = nodes
    .map((n) => clean(n))
    .filter(Boolean);

  return JSON.stringify(outbounds, null, 2);
}
