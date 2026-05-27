/**
 * Mihomo (Clash.Meta) YAML → NormalizedNode[]
 */
import yaml from 'js-yaml';
import { CONVERTIBLE_TYPES, normalizeType } from '../model.js';

export default function parse(text) {
  const doc = yaml.load(text);
  let arr;
  if (Array.isArray(doc)) arr = doc;
  else if (doc && Array.isArray(doc.proxies)) arr = doc.proxies;
  else throw new Error('Mihomo YAML 中找不到 proxies 数组');

  return arr.map(fromMihomo).filter((n) => n && CONVERTIBLE_TYPES.has(n.type));
}

function fromMihomo(p) {
  if (!p || typeof p !== 'object') return null;
  const type = normalizeType(p.type);
  const node = {
    tag: p.name,
    type,
    server: p.server,
    server_port: Number(p.port) || p.port
  };

  switch (type) {
    case 'vmess':
      node.uuid = p.uuid;
      node.alter_id = Number(p.alterId || 0);
      node.security = p.cipher || 'auto';
      if (p.tls) node.tls = buildTls(p);
      attachTransport(node, p);
      break;

    case 'vless':
      node.uuid = p.uuid;
      if (p.flow) node.flow = p.flow;
      if (p.tls || p['reality-opts']) {
        node.tls = buildTls(p);
        if (p['reality-opts']) {
          node.tls.reality = {
            enabled: true,
            public_key: p['reality-opts']['public-key'],
            short_id: p['reality-opts']['short-id']
          };
        }
      }
      attachTransport(node, p);
      break;

    case 'trojan':
      node.password = p.password;
      node.tls = buildTls(p, true);
      attachTransport(node, p);
      break;

    case 'shadowsocks':
      node.method = p.cipher;
      node.password = p.password;
      break;

    case 'shadowsocksr':
      node.method = p.cipher;
      node.password = p.password;
      node.protocol = p.protocol;
      node.protocol_param = p['protocol-param'];
      node.obfs = p.obfs;
      node.obfs_param = p['obfs-param'];
      break;

    case 'hysteria':
      node.password = p.password;
      node.server_name = p.sni;
      if (p['skip-cert-verify']) node.insecure = true;
      if (p.up) node.up_mbps = parseMbps(p.up);
      if (p.down) node.down_mbps = parseMbps(p.down);
      if (p.obfs) node.obfsObj = { type: p.obfs, password: p['obfs-password'] };
      if (p.alpn) node.alpn = p.alpn;
      node.tls = { enabled: true, server_name: p.sni, insecure: !!p['skip-cert-verify'] };
      break;

    case 'hysteria2':
      node.password = p.password;
      node.server_name = p.sni;
      if (p['skip-cert-verify']) node.insecure = true;
      if (p.up) node.up_mbps = parseMbps(p.up);
      if (p.down) node.down_mbps = parseMbps(p.down);
      if (p.obfs) node.obfsObj = { type: p.obfs, password: p['obfs-password'] };
      if (p.alpn) node.alpn = p.alpn;
      node.tls = { enabled: true, server_name: p.sni, insecure: !!p['skip-cert-verify'] };
      break;

    case 'tuic':
      node.uuid = p.uuid;
      node.password = p.password;
      node.congestion_control = p['congestion-controller'];
      node.udp_relay_mode = p['udp-relay-mode'];
      node.server_name = p.sni;
      if (p['skip-cert-verify']) node.insecure = true;
      if (p['disable-sni']) node.disable_sni = true;
      if (p.alpn) node.alpn = p.alpn;
      node.tls = { enabled: true, server_name: p.sni, insecure: !!p['skip-cert-verify'] };
      break;

    case 'wireguard':
      node.private_key = p['private-key'];
      node.peer_public_key = p['public-key'];
      node.pre_shared_key = p['pre-shared-key'];
      node.address = p.ip;
      node.mtu = p.mtu;
      node.reserved = p.reserved;
      break;

    case 'socks':
      node.version = '5';
      if (p.username) node.username = p.username;
      if (p.password) node.password = p.password;
      if (p.tls) node.tls = buildTls(p);
      break;

    case 'http':
      if (p.username) node.username = p.username;
      if (p.password) node.password = p.password;
      if (p.tls) node.tls = { enabled: true };
      break;

    case 'naive':
      if (p.username) node.username = p.username;
      if (p.password) node.password = p.password;
      node.tls = buildTls(p, true);
      break;

    case 'snell':
      if (p.psk) node.password = p.psk;
      if (p.obfs) node.obfs = p.obfs;
      if (p['obfs-opts']) node.obfs_param = JSON.stringify(p['obfs-opts']);
      if (p.version) node.version = String(p.version);
      break;

    case 'ssh':
      if (p.username) node.username = p.username;
      if (p.password) node.password = p.password;
      if (p['private-key']) node.private_key = p['private-key'];
      break;
  }

  if (p['client-fingerprint']) {
    node.tls = node.tls || {};
    node.tls.utls = { fingerprint: p['client-fingerprint'] };
    if (!('enabled' in node.tls)) node.tls.enabled = true;
  }

  if (p.udp) node.udp = true;
  if (p.tfo) node.tfo = true;

  return node;
}

function buildTls(p, trojanDefault = false) {
  const tls = {
    enabled: !!p.tls || trojanDefault,
    server_name: p.sni || p.servername,
    insecure: !!p['skip-cert-verify']
  };
  if (p.alpn) tls.alpn = p.alpn;
  return tls;
}

function attachTransport(node, p) {
  const net = p.network;
  if (!net || net === 'tcp') return;
  if (net === 'ws') {
    const opts = p['ws-opts'] || {};
    node.transport = {
      type: 'ws',
      path: opts.path,
      host: opts.headers && (opts.headers.Host || opts.headers.host)
    };
  } else if (net === 'grpc') {
    const opts = p['grpc-opts'] || {};
    node.transport = {
      type: 'grpc',
      service_name: opts['grpc-service-name']
    };
  } else if (net === 'http') {
    const opts = p['http-opts'] || {};
    const host = opts.headers && (opts.headers.Host || opts.headers.host);
    node.transport = {
      type: 'http',
      method: opts.method,
      path: Array.isArray(opts.path) ? opts.path[0] : opts.path,
      host
    };
  } else if (net === 'httpupgrade') {
    const opts = p['http-upgrade-opts'] || {};
    node.transport = { type: 'httpupgrade', path: opts.path, host: opts.host };
  }
}

function parseMbps(s) {
  const m = String(s).match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}
