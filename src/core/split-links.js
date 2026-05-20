// proxvert · 分享链接多节点输入预切分
// 支持:换行 / 空行 / 逗号 / 分号
// 仅用于 links 输入;JSON / YAML / 单段 base64 订阅不应经过此函数
export function splitMultiLink(raw) {
  if (!raw) return [];
  return raw
    .split(/[\s,;]*[\r\n]+[\s,;]*|[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
