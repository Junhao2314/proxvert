/**
 * 规范化模型（NormalizedNode）—— 三种格式互转的中间形态。
 * 字段命名贴近 sing-box outbound，方便和参考代码对齐。
 *
 * @typedef {Object} NormalizedNode
 * @property {string} tag
 * @property {string} type   one of CONVERTIBLE_TYPES
 * @property {string} server
 * @property {number|string} server_port
 * @property {string} [uuid]
 * @property {string} [password]
 * @property {string} [method]      ss/ssr cipher
 * @property {number|string} [alter_id]
 * @property {string} [security]    vmess scy
 * @property {string} [flow]        vless xtls flow
 * @property {string} [username]    socks/http
 * @property {string} [version]     socks "4" | "5"
 * @property {string} [protocol]    ssr
 * @property {string} [protocol_param]
 * @property {string} [obfs]
 * @property {string} [obfs_param]
 * @property {string} [congestion_control] tuic
 * @property {string} [udp_relay_mode]
 * @property {string|string[]} [alpn]
 * @property {string} [server_name]
 * @property {boolean} [insecure]
 * @property {boolean} [disable_sni]
 * @property {number} [up_mbps]
 * @property {number} [down_mbps]
 * @property {string} [auth_str]
 * @property {string} [private_key]
 * @property {string} [peer_public_key]
 * @property {string} [pre_shared_key]
 * @property {string|string[]} [address]
 * @property {number} [mtu]
 * @property {string|number[]} [reserved]
 * @property {{type?:string, password?:string}} [obfsObj]
 * @property {TlsLike} [tls]
 * @property {TransportLike} [transport]
 *
 * @typedef {Object} TlsLike
 * @property {boolean} [enabled]
 * @property {string} [server_name]
 * @property {boolean} [insecure]
 * @property {string|string[]} [alpn]
 * @property {{fingerprint?: string}} [utls]
 * @property {{enabled?: boolean, public_key?: string, short_id?: string}} [reality]
 *
 * @typedef {Object} TransportLike
 * @property {string} [type]            'ws' | 'grpc' | 'http' | 'httpupgrade'
 * @property {string} [host]
 * @property {string} [path]
 * @property {string} [service_name]
 * @property {string} [grpc_mode]
 * @property {string} [method]
 * @property {string} [early_data_header_name]
 * @property {number} [max_early_data]
 */

export const CONVERTIBLE_TYPES = new Set([
  'vmess',
  'vless',
  'trojan',
  'shadowsocks',
  'shadowsocksr',
  'hysteria2',
  'tuic',
  'wireguard',
  'socks',
  'http'
]);

/** Normalize aliases coming from various dialects. */
export function normalizeType(t) {
  if (!t) return '';
  const s = String(t).toLowerCase();
  if (s === 'ss') return 'shadowsocks';
  if (s === 'ssr') return 'shadowsocksr';
  if (s === 'hy2') return 'hysteria2';
  if (s === 'socks5' || s === 'socks4') return 'socks';
  if (s === 'wg') return 'wireguard';
  return s;
}

/** Drop empty / undefined entries for clean serialization. */
export function clean(obj) {
  if (Array.isArray(obj)) {
    const arr = obj.map(clean).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = clean(v);
      if (cleaned !== undefined && cleaned !== '' && !(Array.isArray(cleaned) && cleaned.length === 0)) {
        if (typeof cleaned === 'object' && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
        out[k] = cleaned;
      }
    }
    return out;
  }
  if (obj === null || obj === undefined || obj === '') return undefined;
  return obj;
}
