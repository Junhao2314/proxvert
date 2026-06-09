/**
 * 分享链接（含 base64 订阅）→ NormalizedNode[]
 */
import { base64Decode } from '../detect.js';
import { CONVERTIBLE_TYPES } from '../model.js';
import { isShareLink, normalizeShareLinkScheme } from '../share-link-schemes.js';

export default function parse(text, opts = {}) {
  const raw = String(text || '').trim();
  let lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // base64 订阅：整体能 base64 解码出含链接的多行文本
  if (opts.subscription || (lines.length === 1 && !isShareLink(lines[0]))) {
    try {
      const decoded = base64Decode(raw);
      if (isShareLink(decoded)) {
        lines = decoded.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      }
    } catch {
      /* ignore */
    }
  }

  const out = [];
  for (const line of lines) {
    if (!isShareLink(line)) continue;
    try {
      const node = parseOne(line);
      if (node && CONVERTIBLE_TYPES.has(node.type)) out.push(node);
    } catch (e) {
      console.warn('解析失败:', safeLinkScheme(line), e.message);
    }
  }
  return out;
}

function safeLinkScheme(line) {
  const m = String(line || '').match(/^([a-zA-Z0-9+.-]+):\/\//);
  return m ? `${m[1].toLowerCase()}://` : 'unknown scheme';
}

function parseOne(link) {
  const m = link.match(/^([a-zA-Z0-9]+):\/\/(.*)$/s);
  if (!m) return null;
  const scheme = normalizeShareLinkScheme(m[1]);
  const body = m[2];

  switch (scheme) {
    case 'vmess': return parseVmess(body);
    case 'vless':
    case 'trojan':
    case 'hysteria2':
    case 'tuic':
    case 'anytls':
    case 'socks':
    case 'http':
    case 'wireguard':
      return parseStdLink(scheme, link);
    case 'hysteria':
      return parseStdLink('hysteria', link);
    case 'naive':
      return parseStdLink('naive', link);
    case 'snell':
      return parseStdLink('snell', link);
    case 'ssh':
      return parseStdLink('ssh', link);
    case 'socks5-tls':
      return parseStdLink('socks', link, { tls: true });
    case 'shadowsocks': return parseSS(link);
    case 'shadowsocksr': return parseSSR(body);
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
      insecure: v.allowInsecure === '1' || v.allowInsecure === 'true' || v.allowinsecure === '1' || v.allowinsecure === 'true'
    };
    if (v.alpn) node.tls.alpn = String(v.alpn).split(',').filter(Boolean);
    if (v.fp) node.tls.utls = { fingerprint: v.fp };
    if (v.tls === 'reality') {
      node.tls.reality = {
        enabled: true,
        public_key: v.pbk || v.public_key || '',
        short_id: v.sid || v.short_id || ''
      };
    }
  }
  if (net !== 'tcp') {
    if (net === 'ws') node.transport = { type: 'ws', host: v.host || '', path: v.path || '/' };
    else if (net === 'grpc') node.transport = { type: 'grpc', service_name: v.path || '' };
    else if (net === 'http' || net === 'h2') node.transport = { type: 'http', host: v.host || '', path: v.path || '/' };
    else if (net === 'httpupgrade') node.transport = { type: 'httpupgrade', host: v.host || '', path: v.path || '/' };
  }
  return node;
}

function parseStdLink(type, link, opts = {}) {
  const { url, fragment } = splitFragment(link);
  let u;
  try {
    u = new URL(url);
  } catch {
    u = new URL(url.replace(/[\s]/g, ''));
  }
  const q = Object.fromEntries(u.searchParams.entries());
  const host = normalizeHost(u.hostname);
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
    if (q.obfs) node.obfsObj = { type: q.obfs, password: q['obfs-password'] };
    if (q.upmbps) node.up_mbps = parseMbps(q.upmbps);
    if (q.downmbps) node.down_mbps = parseMbps(q.downmbps);
    node.tls = {
      enabled: true,
      server_name: q.sni,
      insecure: isTruthyQuery(q.insecure) || isTruthyQuery(q.allowinsecure) || isTruthyQuery(q.allow_insecure)
    };
    if (q.alpn && q.alpn !== 'h3') node.tls.alpn = q.alpn.split(',');
  } else if (type === 'hysteria') {
    node.password = q.auth || userInfo;
    if (q.sni) node.server_name = q.sni;
    if (q.insecure === '1' || q.insecure === 'true' || q.allowinsecure === '1') node.insecure = true;
    if (q.obfs) node.obfsObj = { type: q.obfs, password: q['obfs-password'] };
    if (q.alpn) node.alpn = q.alpn.split(',');
    if (q.upmbps) node.up_mbps = parseMbps(q.upmbps);
    if (q.downmbps) node.down_mbps = parseMbps(q.downmbps);
    node.tls = { enabled: true, server_name: q.sni, insecure: !!node.insecure };
  } else if (type === 'tuic') {
    node.uuid = userInfo;
    node.password = userPass;
    if (q.congestion_control) node.congestion_control = q.congestion_control;
    if (q.udp_relay_mode) node.udp_relay_mode = q.udp_relay_mode;
    if (q.disable_sni === '1' || q.disable_sni === 'true') node.disable_sni = true;
    node.tls = {
      enabled: true,
      server_name: q.sni,
      insecure: isTruthyQuery(q.allow_insecure) || isTruthyQuery(q.allowinsecure) || isTruthyQuery(q.insecure)
    };
    if (q.alpn) node.tls.alpn = q.alpn.split(',');
  } else if (type === 'anytls') {
    node.password = userInfo;
    applyTlsQuery(node, q);
    if (!node.tls) node.tls = { enabled: true };
  } else if (type === 'naive') {
    if (userInfo) node.username = userInfo;
    if (userPass) node.password = userPass;
    node.tls = { enabled: true };
    if (q.sni) node.tls.server_name = q.sni;
    if (q.insecure === '1' || q.insecure === 'true') node.tls.insecure = true;
    if (q.alpn) node.tls.alpn = q.alpn.split(',');
  } else if (type === 'snell') {
    if (q.psk) node.password = q.psk;
    if (q.obfs) node.obfs = q.obfs;
    if (q['obfs-opts']) {
      try {
        const obfsOpts = JSON.parse(q['obfs-opts']);
        node.obfs = obfsOpts.type || q.obfs;
        node.obfs_param = JSON.stringify(obfsOpts);
      } catch {
        node.obfs_param = q['obfs-opts'];
      }
    }
    if (q.version) node.version = String(q.version);
  } else if (type === 'ssh') {
    if (userInfo) node.username = userInfo;
    if (userPass) node.password = userPass;
    if (q.private_key) node.private_key = q.private_key;
  } else if (type === 'socks') {
    if (userInfo) node.username = userInfo;
    if (userPass) node.password = userPass;
    node.version = link.toLowerCase().startsWith('socks4') ? '4' : '5';
    if (opts.tls) node.tls = { enabled: true };
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
  if (
    !q.security &&
    !q.sni &&
    !q.alpn &&
    !q.fp &&
    !q.allowInsecure &&
    !q.allowinsecure &&
    !q.allow_insecure &&
    !q.insecure
  ) return;
  const tls = { enabled: !!q.security || node.type === 'trojan' };
  if (q.sni) tls.server_name = q.sni;
  if (q.alpn) tls.alpn = q.alpn.split(',');
  if (q.fp) tls.utls = { enabled: true, fingerprint: q.fp };
  tls.insecure = isTruthyQuery(q.allowInsecure) || isTruthyQuery(q.allowinsecure) || isTruthyQuery(q.allow_insecure) || isTruthyQuery(q.insecure);
  if (q.security === 'reality') {
    tls.enabled = true;
    tls.reality = { enabled: true, public_key: q.pbk, short_id: q.sid };
  }
  node.tls = tls;
}

function isTruthyQuery(value) {
  return value === '1' || value === 'true';
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
  const qIdx = decoded.indexOf('/?');
  const main = qIdx >= 0 ? decoded.slice(0, qIdx) : decoded;
  const query = qIdx >= 0 ? decoded.slice(qIdx + 2) : '';
  const parts = main.split(':');
  if (parts.length < 6) throw new Error('ssr 链接格式不正确');
  const server = normalizeHost(parts.slice(0, -5).join(':'));
  const [port, protocol, method, obfs, passB64] = parts.slice(-5);
  if (!server) throw new Error('ssr 链接格式不正确');
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
  const value = String(s || '');
  if (!value) return ['', undefined];
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end > 0) {
      const host = value.slice(1, end);
      const rawPort = value.slice(end + 2);
      if (value.charAt(end + 1) === ':' && rawPort) {
        return [host, Number(rawPort) || rawPort];
      }
      return [host, undefined];
    }
  }
  const i = value.lastIndexOf(':');
  if (i < 0) return [normalizeHost(value), undefined];
  const rawPort = value.slice(i + 1);
  if (value.indexOf(':') !== i && rawPort && !/^\d+$/.test(rawPort)) {
    return [normalizeHost(value), undefined];
  }
  return [normalizeHost(value.slice(0, i)), Number(rawPort) || rawPort];
}

function parseMbps(s) {
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

function normalizeHost(host) {
  const value = String(host || '');
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1);
  }
  return value;
}
