/**
 * Detect the source format of pasted text.
 * Returns one of: 'singbox' | 'mihomo' | 'links' | 'links-sub'
 * Throws when nothing matches.
 */

const LINK_SCHEME = /^(vmess|vless|trojan|ss|ssr|hysteria2?|hy2|tuic|socks5?|http|https|wg):\/\//i;

export function detect(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('输入为空');

  // 1) sing-box JSON (single outbound or full config)
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const obj = JSON.parse(text);
      if (looksLikeSingbox(obj)) return 'singbox';
    } catch {
      // fall through
    }
  }

  // 2) Direct share links (single or multi-line)
  if (LINK_SCHEME.test(text)) return 'links';
  const firstNonEmpty = text.split(/\r?\n/).find((l) => l.trim());
  if (firstNonEmpty && LINK_SCHEME.test(firstNonEmpty.trim())) return 'links';

  // 3) base64 subscription (whole blob is base64 of newline-joined links)
  if (looksLikeBase64(text)) {
    try {
      const decoded = base64Decode(text);
      if (decoded && LINK_SCHEME.test(decoded.trim())) return 'links-sub';
    } catch {
      // fall through
    }
  }

  // 4) Mihomo / Clash YAML
  if (/^\s*proxies\s*:/m.test(text) || /^\s*-\s*name\s*:/m.test(text)) {
    return 'mihomo';
  }

  throw new Error('无法识别输入格式（不是 sing-box JSON / Mihomo YAML / 分享链接 / base64 订阅）');
}

function looksLikeSingbox(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) {
    return obj.some((o) => o && typeof o === 'object' && o.type && o.server);
  }
  if (obj.type && obj.server) return true;
  if (Array.isArray(obj.outbounds)) return true;
  return false;
}

function looksLikeBase64(s) {
  const compact = s.replace(/\s+/g, '');
  if (compact.length < 16) return false;
  return /^[A-Za-z0-9+/=_-]+$/.test(compact);
}

export function base64Decode(s) {
  let v = s.replace(/\s+/g, '');
  // urlsafe → standard
  v = v.replace(/-/g, '+').replace(/_/g, '/');
  // pad
  const pad = v.length % 4;
  if (pad) v += '='.repeat(4 - pad);
  const bin = atob(v);
  // UTF-8 decode
  try {
    return decodeURIComponent(escape(bin));
  } catch {
    return bin;
  }
}
