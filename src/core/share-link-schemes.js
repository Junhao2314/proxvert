const SHARE_LINK_SCHEME_ALIASES = Object.freeze({
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  ss: 'shadowsocks',
  ssr: 'shadowsocksr',
  hysteria2: 'hysteria2',
  hy2: 'hysteria2',
  hysteria: 'hysteria',
  hy1: 'hysteria',
  tuic: 'tuic',
  socks: 'socks',
  socks4: 'socks',
  socks5: 'socks',
  'socks5+tls': 'socks5-tls',
  http: 'http',
  https: 'http',
  wg: 'wireguard',
  wireguard: 'wireguard',
  naive: 'naive',
  snell: 'snell',
  ssh: 'ssh'
});

const schemePattern = Object.keys(SHARE_LINK_SCHEME_ALIASES)
  .sort((left, right) => right.length - left.length)
  .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

export const SHARE_LINK_SCHEME_RE = new RegExp(`^(?:${schemePattern}):\\/\\/`, 'i');
export const SHARE_LINK_SPLIT_RE = new RegExp(`[;,]+(?=\\s*(?:${schemePattern}):\\/\\/)`, 'i');

export function isShareLink(value) {
  return SHARE_LINK_SCHEME_RE.test(String(value || '').trim());
}

export function normalizeShareLinkScheme(value) {
  return SHARE_LINK_SCHEME_ALIASES[String(value || '').toLowerCase()] || '';
}
