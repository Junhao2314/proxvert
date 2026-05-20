/**
 * 分享链接（含 base64 订阅）→ NormalizedNode[]
 */
import { base64Decode } from '../detect.js';
import { CONVERTIBLE_TYPES } from '../model.js';

const SCHEMES = /^(vmess|vless|trojan|ss|ssr|hysteria2|hy2|tuic|socks5?|http|https|wg):\/\//i;

export default function parse(text, opts = {}) {
  const raw = String(text || '').trim();
  let lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // base64 订阅：整体能 base64 解码出含链接的多行文本
  if (opts.subscription || (lines.length === 1 && !SCHEMES.test(lines[0]))) {
    try {
      const decoded = base64Decode(raw);
      if (SCHEMES.test(decoded.trim())) {
        lines = decoded.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }

  const out = [];
  for (const line of lines) {
    if (!SCHEMES.test(line)) continue;
    try {
      const node = parseOne(line);
      if (node && CONVERTIBLE_TYPES.has(node.type)) out.push(node);
    } catch (e) {
      console.warn('解析失败:', line.slice(0, 40), e.message);
    }
  }
  return out;
}

function parseOne(link) {
  const m = link.match(/^([a-zA-Z0-9]+):\/\/(.*)$/s);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  const body = m[2];

  switch (scheme) {
    case 'vmess': return parseVmess(body);
    case 'vless': return parseStdLink('vless', link);
    case 'trojan': return parseStdLink('trojan', link);
    case 'ss': return parseSS(link);
    case 'ssr': return parseSSR(body);
    case 'hysteria2':
    case 'hy2': return parseStdLink('hysteria2', link);
    case 'tuic': return parseStdLink('tuic', link);
    case 'socks5':
    case 'socks': return parseStdLink('socks', link);
    case 'http':
    case 'https': return parseStdLink('http', link);
    case 'wg': return parseStdLink('wireguard', link);
    default: return null;
  }
}

function parseVmess(body) {
  const json = base64Decode(body);
  const v = JSON.parse(json);
  const net = v.net || 'tcp';
  const tlsEnabled = v.tls === 'tls' || v.tls === 'reality';
  const node = {
    tag: v.ps || '',
    type: 'vmess',
    server: v.add || '',
    server_port: Number(v.port) || v.port,
    uuid: v.id || '',
    alter_id: Number(v.aid || 0),
    security: v.scy || 'auto'
  };
  if (tlsEnabled) {
    node.tls = {
      enabled: true,
      server_name: v.sni || v.host || '',
      insecure: false
    };
    if (v.alpn) node.tls.alpn = String(v.alpn).split(',').filter(Boolean);
    if (v.fp) node.tls.utls = { fingerprint: v.fp };
  }
  if (net !== 'tcp') {
    if (net === 'ws') node.transport = { type: 'ws', host: v.host || '', path: v.path || '/' };
    else if (net === 'grpc') node.transport = { type: 'grpc', service_name: v.path || '' };
    else if (net === 'http' || net === 'h2') node.transport = { type: 'http', host: v.host || '', path: v.path || '/' };
    else if (net === 'httpupgrade') node.transport = { type: 'httpupgrade', host: v.host || '', path: v.path || '/' };
  }
  return node;
}

function parseStdLink(type, link) {
  const { url, fragment } = splitFragment(link);
  let u;
  try {
    u = new URL(url);
  } catch {
    u = new URL(url.replace(/[\s]/g, ''));
  }
  const q = Object.fromEntries(u.searchParams.entries());
  const host = decodeURIComponent(u.hostname);
  const port = u.port ? Number(u.port) : undefined;
  const userInfo = decodeURIComponent(u.username || '');
  const userPass = decodeURIComponent(u.password || '');

  const node = {
    tag: fragment || '',
    type,
    server: host,
    server_port: port
  };

  if (type === 'vless') {
    node.uuid = userInfo;
    if (q.flow) node.flow = q.flow;
    applyTransportQuery(node, q);
    applyTlsQuery(node, q);
  } else if (type === 'trojan') {
    node.password = userInfo;
    applyTransportQuery(node, q);
    applyTlsQuery(node, q);
    if (!node.tls) node.tls = { enabled: true };
  } else if (type === 'hysteria2') {
    node.password = userInfo;
    if (q.sni) node.server_name = q.sni;
    if (q.insecure === '1' || q.insecure === 'true') node.insecure = true;
    if (q.obfs) node.obfsObj = { type: q.obfs, password: q['obfs-password'] };
    if (q.alpn) node.alpn = q.alpn.split(',');
    if (q.upmbps) node.up_mbps = Number(q.upmbps);
    if (q.downmbps) node.down_mbps = Number(q.downmbps);
    node.tls = { enabled: true, server_name: q.sni, insecure: !!node.insecure };
  } else if (type === 'tuic') {
    node.uuid = userInfo;
    node.password = userPass;
    if (q.congestion_control) node.congestion_control = q.congestion_control;
    if (q.udp_relay_mode) node.udp_relay_mode = q.udp_relay_mode;
    if (q.sni) node.server_name = q.sni;
    if (q.allow_insecure === '1' || q.allow_insecure === 'true') node.insecure = true;
    if (q.disable_sni === '1' || q.disable_sni === 'true') node.disable_sni = true;
    if (q.alpn) node.alpn = q.alpn.split(',');
    node.tls = { enabled: true, server_name: q.sni, insecure: !!node.insecure };
  } else if (type === 'socks') {
    if (userInfo) node.username = userInfo;
    if (userPass) node.password = userPass;
    node.version = link.toLowerCase().startsWith('socks4') ? '4' : '5';
  } else if (type === 'http') {
    if (userInfo) node.username = userInfo;
    if (userPass) node.password = userPass;
    if (link.toLowerCase().startsWith('https://')) node.tls = { enabled: true };
  } else if (type === 'wireguard') {
    if (q.pk) node.private_key = q.pk;
    if (q.bpk) node.peer_public_key = q.bpk;
    if (q.psk) node.pre_shared_key = q.psk;
    if (q.ip) node.address = q.ip.split(',');
    if (q.mtu) node.mtu = Number(q.mtu);
    if (q.reserved) node.reserved = q.reserved.split(',').map(Number);
  }

  return node;
}

function splitFragment(link) {
  const hashIdx = link.indexOf('#');
  if (hashIdx < 0) return { url: link, fragment: '' };
  return {
    url: link.slice(0, hashIdx),
    fragment: decodeURIComponent(link.slice(hashIdx + 1))
  };
}

function applyTransportQuery(node, q) {
  const t = q.type;
  if (!t || t === 'tcp') return;
  if (t === 'ws') {
    node.transport = { type: 'ws', host: q.host, path: q.path };
    if (q.eh) node.transport.early_data_header_name = q.eh;
    if (q.ed) node.transport.max_early_data = Number(q.ed);
  } else if (t === 'grpc') {
    node.transport = { type: 'grpc', service_name: q.serviceName || q.servicename, grpc_mode: q.mode };
  } else if (t === 'http' || t === 'h2') {
    node.transport = { type: 'http', host: q.host, path: q.path, method: q.method };
  } else if (t === 'httpupgrade') {
    node.transport = { type: 'httpupgrade', host: q.host, path: q.path };
  }
}

function applyTlsQuery(node, q) {
  if (!q.security && !q.sni && !q.alpn && !q.fp && !q.allowInsecure) return;
  const tls = { enabled: !!q.security || node.type === 'trojan' };
  if (q.sni) tls.server_name = q.sni;
  if (q.alpn) tls.alpn = q.alpn.split(',');
  if (q.fp) tls.utls = { fingerprint: q.fp };
  if (q.allowInsecure === '1' || q.allowInsecure === 'true' || q.allowinsecure === '1') tls.insecure = true;
  if (q.security === 'reality') {
    tls.enabled = true;
    tls.reality = { enabled: true, public_key: q.pbk, short_id: q.sid };
  }
  node.tls = tls;
}

function parseSS(fullLink) {
  const { url, fragment } = splitFragment(fullLink);
  const after = url.slice(5); // 去掉 'ss://'
  let methodPass = '';
  let hostPort = '';

  if (after.includes('@')) {
    const atIdx = after.lastIndexOf('@');
    const userPart = after.slice(0, atIdx);
    hostPort = after.slice(atIdx + 1);
    if (/^[A-Za-z0-9+/=_-]+$/.test(userPart)) {
      try {
        methodPass = base64Decode(userPart);
      } catch {
        methodPass = userPart;
      }
    } else {
      methodPass = decodeURIComponent(userPart);
    }
  } else {
    const decoded = base64Decode(after);
    const at = decoded.lastIndexOf('@');
    methodPass = decoded.slice(0, at);
    hostPort = decoded.slice(at + 1);
  }

  const qIdx = hostPort.indexOf('?');
  if (qIdx >= 0) hostPort = hostPort.slice(0, qIdx);
  const slashIdx = hostPort.indexOf('/');
  if (slashIdx >= 0) hostPort = hostPort.slice(0, slashIdx);

  const [host, port] = splitHostPort(hostPort);
  const colon = methodPass.indexOf(':');
  const method = colon >= 0 ? methodPass.slice(0, colon) : methodPass;
  const password = colon >= 0 ? methodPass.slice(colon + 1) : '';

  return {
    tag: fragment || '',
    type: 'shadowsocks',
    server: host,
    server_port: port,
    method,
    password
  };
}

function parseSSR(body) {
  const decoded = base64Decode(body);
  const [main, query = ''] = decoded.split('/?');
  const parts = main.split(':');
  if (parts.length < 6) throw new Error('ssr 链接格式不正确');
  const [server, port, protocol, method, obfs, passB64] = parts;
  const params = new URLSearchParams(query);
  return {
    tag: tryB64Decode(params.get('remarks') || ''),
    type: 'shadowsocksr',
    server,
    server_port: Number(port) || port,
    password: tryB64Decode(passB64),
    method,
    protocol,
    obfs,
    protocol_param: tryB64Decode(params.get('protoparam') || ''),
    obfs_param: tryB64Decode(params.get('obfsparam') || '')
  };
}

function tryB64Decode(s) {
  if (!s) return '';
  try {
    return base64Decode(s);
  } catch {
    return s;
  }
}

function splitHostPort(s) {
  const i = s.lastIndexOf(':');
  if (i < 0) return [s, undefined];
  return [s.slice(0, i), Number(s.slice(i + 1)) || s.slice(i + 1)];
}
