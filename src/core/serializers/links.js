/**
 * NormalizedNode → 分享链接（vmess:// vless:// trojan:// ss:// ssr://
 * hysteria2:// tuic:// wg:// socks(5)://、http://）
 *
 * 移植自 F:\迅雷下载\singbox_to_share_local.js（Node CLI 版）：
 * - Buffer.from(s).toString('base64') 替换为 b64Utf8（UTF-8 安全的 btoa）
 * - 删除 fs/process 相关分支
 * - 改成 ES Module 导出
 */

function b64Utf8(str) {
  const bytes = new TextEncoder().encode(String(str));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function enc(v) {
  return encodeURIComponent(v == null ? '' : String(v));
}

function addKV(q, k, v) {
  if (v === undefined || v === null || v === '') return;
  q.push(`${k}=${enc(v)}`);
}

function formatHost(host) {
  const value = String(host || '');
  if (value.includes(':') && !(value.startsWith('[') && value.endsWith(']'))) {
    return `[${value}]`;
  }
  return value;
}

function formatHostPort(host, port) {
  const value = formatHost(host);
  if (port === undefined || port === null || port === '') return value;
  return `${value}:${port}`;
}

function mapTransportParams(t, q) {
  if (!t || !t.type) return;
  addKV(q, 'type', t.type);
  if (t.type === 'ws') {
    addKV(q, 'host', t.host);
    addKV(q, 'path', t.path);
    addKV(q, 'eh', t.early_data_header_name);
    addKV(q, 'ed', t.max_early_data);
    return;
  }
  if (t.type === 'grpc') {
    addKV(q, 'serviceName', t.service_name);
    addKV(q, 'mode', t.grpc_mode);
    return;
  }
  if (t.type === 'http') {
    addKV(q, 'host', Array.isArray(t.host) ? t.host.join(',') : t.host);
    addKV(q, 'path', t.path);
    addKV(q, 'method', t.method);
    return;
  }
  if (t.type === 'httpupgrade') {
    addKV(q, 'host', t.host);
    addKV(q, 'path', t.path);
  }
}

function mapTlsAndRealityParams(tls, q) {
  if (!tls || !tls.enabled) return;
  if (tls.reality && tls.reality.enabled) {
    addKV(q, 'security', 'reality');
    addKV(q, 'pbk', tls.reality.public_key);
    addKV(q, 'sid', tls.reality.short_id);
  } else {
    addKV(q, 'security', 'tls');
  }
  addKV(q, 'sni', tls.server_name);
  if (tls.alpn) addKV(q, 'alpn', Array.isArray(tls.alpn) ? tls.alpn.join(',') : tls.alpn);
  if (tls.utls && tls.utls.fingerprint) addKV(q, 'fp', tls.utls.fingerprint);
  if (tls.insecure) addKV(q, 'allowInsecure', '1');
}

function vmessFrom(ob, name) {
  const t = ob.transport || {};
  const tls = ob.tls || {};
  const net = t.type || 'tcp';
  let host = '';
  let path = '';

  if (net === 'ws' || net === 'http' || net === 'httpupgrade') {
    host = t.host || '';
    path = t.path || '';
  } else if (net === 'grpc') {
    path = t.service_name || '';
  }

  const isReality = tls.reality && tls.reality.enabled;
  const vmessObj = {
    v: '2',
    ps: name || ob.tag || '',
    add: ob.server || '',
    port: String(ob.server_port || ''),
    id: ob.uuid || '',
    aid: String(ob.alter_id || 0),
    scy: ob.security || 'auto',
    net,
    type: 'none',
    host,
    path,
    tls: isReality ? 'reality' : (tls.enabled ? 'tls' : ''),
    sni: tls.server_name || '',
    alpn: Array.isArray(tls.alpn) ? tls.alpn.join(',') : (tls.alpn || ''),
    fp: tls.utls ? (tls.utls.fingerprint || '') : '',
    allowInsecure: tls.insecure ? '1' : ''
  };
  if (isReality) {
    vmessObj.pbk = tls.reality.public_key || '';
    vmessObj.sid = tls.reality.short_id || '';
  }

  return 'vmess://' + b64Utf8(JSON.stringify(vmessObj));
}

function vlessFrom(ob, name) {
  const q = [];
  addKV(q, 'encryption', 'none');
  if (ob.flow) addKV(q, 'flow', ob.flow);
  mapTransportParams(ob.transport || {}, q);
  mapTlsAndRealityParams(ob.tls || {}, q);
  const qs = q.length ? `?${q.join('&')}` : '';
  return `vless://${enc(ob.uuid || '')}@${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function trojanFrom(ob, name) {
  const q = [];
  mapTransportParams(ob.transport || {}, q);
  mapTlsAndRealityParams(ob.tls || {}, q);
  const qs = q.length ? `?${q.join('&')}` : '';
  return `trojan://${enc(ob.password || '')}@${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function ssFrom(ob, name) {
  const method = ob.method || '';
  const password = ob.password || '';
  const userinfo = b64Utf8(`${method}:${password}`);
  return `ss://${userinfo}@${formatHostPort(ob.server, ob.server_port)}#${enc(name || ob.tag || '')}`;
}

function ssrFrom(ob, name) {
  // ssr://base64( server:port:protocol:method:obfs:base64(password)/?params )
  const passB64 = b64Utf8(ob.password || '').replace(/=+$/, '');
  const params = [];
  if (ob.obfs_param) params.push('obfsparam=' + b64Utf8(ob.obfs_param).replace(/=+$/, ''));
  if (ob.protocol_param) params.push('protoparam=' + b64Utf8(ob.protocol_param).replace(/=+$/, ''));
  if (name || ob.tag) params.push('remarks=' + b64Utf8(name || ob.tag).replace(/=+$/, ''));
  const tail = params.length ? '/?' + params.join('&') : '';
  const body = `${formatHost(ob.server)}:${ob.server_port || ''}:${ob.protocol || 'origin'}:${ob.method || 'aes-256-cfb'}:${ob.obfs || 'plain'}:${passB64}${tail}`;
  return 'ssr://' + b64Utf8(body).replace(/=+$/, '');
}

function wireguardFrom(ob, name) {
  const q = [];
  addKV(q, 'pk', ob.private_key);
  if (ob.address) addKV(q, 'ip', Array.isArray(ob.address) ? ob.address.join(',') : ob.address);
  if (ob.peer_public_key) addKV(q, 'bpk', ob.peer_public_key);
  if (ob.pre_shared_key) addKV(q, 'psk', ob.pre_shared_key);
  if (ob.mtu) addKV(q, 'mtu', ob.mtu);
  if (ob.reserved) addKV(q, 'reserved', Array.isArray(ob.reserved) ? ob.reserved.join(',') : ob.reserved);
  const qs = q.length ? `?${q.join('&')}` : '';
  return `wg://${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function socksFrom(ob, name) {
  const version = String(ob.version) === '4' ? 'socks4' : 'socks5';
  const hasTls = ob.tls && ob.tls.enabled;
  const scheme = hasTls ? 'socks5+tls' : version;
  const auth = ob.username ? `${enc(ob.username)}:${enc(ob.password || '')}@` : '';
  return `${scheme}://${auth}${formatHostPort(ob.server, ob.server_port)}#${enc(name || ob.tag || '')}`;
}

function httpFrom(ob, name) {
  const auth = ob.username ? `${enc(ob.username)}:${enc(ob.password || '')}@` : '';
  const scheme = ob.tls && ob.tls.enabled ? 'https' : 'http';
  return `${scheme}://${auth}${formatHostPort(ob.server, ob.server_port)}#${enc(name || ob.tag || '')}`;
}

function naiveFrom(ob, name) {
  const q = [];
  const tls = ob.tls || {};
  addKV(q, 'sni', tls.server_name);
  if (tls.insecure) addKV(q, 'insecure', '1');
  const alpn = tls.alpn;
  if (alpn) addKV(q, 'alpn', Array.isArray(alpn) ? alpn.join(',') : alpn);
  const auth = ob.username ? `${enc(ob.username)}:${enc(ob.password || '')}@` : '';
  const qs = q.length ? `?${q.join('&')}` : '';
  return `naive://${auth}${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function snellFrom(ob, name) {
  const q = [];
  addKV(q, 'psk', ob.password);
  if (ob.version) addKV(q, 'version', ob.version);
  if (ob.obfs) addKV(q, 'obfs', ob.obfs);
  if (ob.obfs_param) addKV(q, 'obfs-opts', ob.obfs_param);
  const qs = q.length ? `?${q.join('&')}` : '';
  return `snell://${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function sshFrom(ob, name) {
  const q = [];
  if (ob.private_key) addKV(q, 'private_key', ob.private_key);
  const auth = ob.username ? `${enc(ob.username)}:${enc(ob.password || '')}@` : '';
  const qs = q.length ? `?${q.join('&')}` : '';
  return `ssh://${auth}${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function hysteria2From(ob, name) {
  const q = [];
  const tls = ob.tls || {};
  addKV(q, 'sni', ob.server_name || tls.server_name);
  if (ob.insecure || tls.insecure) addKV(q, 'insecure', '1');
  if (ob.obfsObj) {
    addKV(q, 'obfs', ob.obfsObj.type);
    addKV(q, 'obfs-password', ob.obfsObj.password);
  }
  const alpn = ob.alpn || tls.alpn;
  if (alpn) addKV(q, 'alpn', Array.isArray(alpn) ? alpn.join(',') : alpn);
  addKV(q, 'upmbps', ob.up_mbps);
  addKV(q, 'downmbps', ob.down_mbps);
  const auth = ob.password || ob.auth_str || '';
  const qs = q.length ? `?${q.join('&')}` : '';
  return `hysteria2://${enc(auth)}@${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function hysteriaFrom(ob, name) {
  const q = [];
  const tls = ob.tls || {};
  addKV(q, 'sni', ob.server_name || tls.server_name);
  if (ob.insecure || tls.insecure) addKV(q, 'insecure', '1');
  if (ob.obfsObj) {
    addKV(q, 'obfs', ob.obfsObj.type);
    addKV(q, 'obfs-password', ob.obfsObj.password);
  }
  const alpn = ob.alpn || tls.alpn;
  if (alpn) addKV(q, 'alpn', Array.isArray(alpn) ? alpn.join(',') : alpn);
  addKV(q, 'upmbps', ob.up_mbps);
  addKV(q, 'downmbps', ob.down_mbps);
  const auth = ob.password || ob.auth_str || '';
  const userInfo = auth ? `${enc(auth)}@` : '';
  const qs = q.length ? `?${q.join('&')}` : '';
  return `hysteria://${userInfo}${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

function tuicFrom(ob, name) {
  const q = [];
  const tls = ob.tls || {};
  addKV(q, 'congestion_control', ob.congestion_control);
  addKV(q, 'udp_relay_mode', ob.udp_relay_mode);
  const alpn = ob.alpn || tls.alpn;
  if (alpn) addKV(q, 'alpn', Array.isArray(alpn) ? alpn.join(',') : alpn);
  addKV(q, 'sni', ob.server_name || tls.server_name);
  if (ob.insecure || tls.insecure) addKV(q, 'allow_insecure', '1');
  if (ob.disable_sni) addKV(q, 'disable_sni', '1');
  const qs = q.length ? `?${q.join('&')}` : '';
  return `tuic://${enc(ob.uuid || '')}:${enc(ob.password || '')}@${formatHostPort(ob.server, ob.server_port)}${qs}#${enc(name || ob.tag || '')}`;
}

export function nodeToLink(ob, name) {
  if (!ob || typeof ob !== 'object') return '';
  const tag = name || ob.tag || '';
  switch (ob.type) {
    case 'vmess': return vmessFrom(ob, tag);
    case 'vless': return vlessFrom(ob, tag);
    case 'trojan': return trojanFrom(ob, tag);
    case 'shadowsocks': return ssFrom(ob, tag);
    case 'shadowsocksr': return ssrFrom(ob, tag);
    case 'socks': return socksFrom(ob, tag);
    case 'http': return httpFrom(ob, tag);
    case 'naive': return naiveFrom(ob, tag);
    case 'snell': return snellFrom(ob, tag);
    case 'ssh': return sshFrom(ob, tag);
    case 'hysteria': return hysteriaFrom(ob, tag);
    case 'hysteria2': return hysteria2From(ob, tag);
    case 'tuic': return tuicFrom(ob, tag);
    case 'wireguard': return wireguardFrom(ob, tag);
    default: return '';
  }
}

/**
 * 多节点 → 每行一条分享链接。
 * @param {Array} nodes
 * @returns {string}
 */
export default function serialize(nodes) {
  const lines = nodes.map((n) => nodeToLink(n)).filter(Boolean);
  return lines.join('\n');
}

/**
 * 多节点 → 单条 base64 订阅文本(URL-safe 兼容)。
 */
export function toBase64Sub(nodes) {
  return b64Utf8(serialize(nodes));
}

/** 单节点导出为分享链接,UI 层做 per-node QR 用。 */
export function nodeToShareLink(node) {
  return nodeToLink(node);
}
