/**
 * NormalizedNode[] → Mihomo (Clash.Meta) YAML 的 proxies 段。
 */
import yaml from 'js-yaml';

function nodeToMihomo(n) {
  const out = {
    name: n.tag || `${n.type}-${n.server}`,
    type: mapType(n.type),
    server: n.server,
    port: Number(n.server_port) || n.server_port
  };

  const tls = n.tls || {};

  switch (n.type) {
    case 'vmess':
      out.uuid = n.uuid;
      out.alterId = Number(n.alter_id || 0);
      out.cipher = n.security || 'auto';
      if (tls.enabled) {
        out.tls = true;
        if (tls.server_name) out.servername = tls.server_name;
        if (tls.insecure) out['skip-cert-verify'] = true;
      }
      attachTransport(out, n);
      attachClientFingerprint(out, tls);
      break;

    case 'vless':
      out.uuid = n.uuid;
      if (n.flow) out.flow = n.flow;
      if (tls.enabled) {
        out.tls = true;
        if (tls.server_name) out.servername = tls.server_name;
        if (tls.insecure) out['skip-cert-verify'] = true;
        if (tls.reality && tls.reality.enabled) {
          out['reality-opts'] = pruneObj({
            'public-key': tls.reality.public_key,
            'short-id': tls.reality.short_id
          });
        }
      }
      attachTransport(out, n);
      attachClientFingerprint(out, tls);
      break;

    case 'trojan':
      out.password = n.password;
      if (tls.server_name) out.sni = tls.server_name;
      if (tls.insecure) out['skip-cert-verify'] = true;
      if (tls.alpn) out.alpn = Array.isArray(tls.alpn) ? tls.alpn : [tls.alpn];
      attachTransport(out, n);
      attachClientFingerprint(out, tls);
      break;

    case 'shadowsocks':
      out.cipher = n.method;
      out.password = n.password;
      break;

    case 'shadowsocksr':
      out.cipher = n.method;
      out.password = n.password;
      out.protocol = n.protocol;
      if (n.protocol_param) out['protocol-param'] = n.protocol_param;
      out.obfs = n.obfs;
      if (n.obfs_param) out['obfs-param'] = n.obfs_param;
      break;

    case 'hysteria2':
      out.password = n.password || n.auth_str;
      if (tls.server_name || n.server_name) out.sni = tls.server_name || n.server_name;
      if (tls.insecure || n.insecure) out['skip-cert-verify'] = true;
      if (n.up_mbps) out.up = `${n.up_mbps} Mbps`;
      if (n.down_mbps) out.down = `${n.down_mbps} Mbps`;
      if (n.obfsObj) {
        out.obfs = n.obfsObj.type;
        if (n.obfsObj.password) out['obfs-password'] = n.obfsObj.password;
      }
      const hAlpn = n.alpn || tls.alpn;
      if (hAlpn) out.alpn = Array.isArray(hAlpn) ? hAlpn : [hAlpn];
      break;

    case 'tuic':
      out.uuid = n.uuid;
      out.password = n.password;
      if (n.congestion_control) out['congestion-controller'] = n.congestion_control;
      if (n.udp_relay_mode) out['udp-relay-mode'] = n.udp_relay_mode;
      if (tls.server_name || n.server_name) out.sni = tls.server_name || n.server_name;
      if (tls.insecure || n.insecure) out['skip-cert-verify'] = true;
      const tAlpn = n.alpn || tls.alpn;
      if (tAlpn) out.alpn = Array.isArray(tAlpn) ? tAlpn : [tAlpn];
      if (n.disable_sni) out['disable-sni'] = true;
      break;

    case 'wireguard':
      out['private-key'] = n.private_key;
      if (n.peer_public_key) out['public-key'] = n.peer_public_key;
      if (n.pre_shared_key) out['pre-shared-key'] = n.pre_shared_key;
      if (n.address) out.ip = Array.isArray(n.address) ? n.address[0] : n.address;
      if (n.mtu) out.mtu = n.mtu;
      if (n.reserved) out.reserved = Array.isArray(n.reserved) ? n.reserved : String(n.reserved).split(',').map(Number);
      break;

    case 'socks':
      if (n.username) out.username = n.username;
      if (n.password) out.password = n.password;
      break;

    case 'http':
      if (n.username) out.username = n.username;
      if (n.password) out.password = n.password;
      if (tls.enabled) out.tls = true;
      break;
  }

  return pruneObj(out);
}

function mapType(t) {
  if (t === 'shadowsocks') return 'ss';
  if (t === 'shadowsocksr') return 'ssr';
  if (t === 'socks') return 'socks5';
  return t;
}

function attachTransport(out, n) {
  const tr = n.transport;
  if (!tr || !tr.type) return;
  if (tr.type === 'ws') {
    out.network = 'ws';
    out['ws-opts'] = pruneObj({
      path: tr.path,
      headers: tr.host ? { Host: tr.host } : undefined
    });
  } else if (tr.type === 'grpc') {
    out.network = 'grpc';
    if (tr.service_name) out['grpc-opts'] = { 'grpc-service-name': tr.service_name };
  } else if (tr.type === 'http') {
    out.network = 'http';
    out['http-opts'] = pruneObj({
      method: tr.method,
      path: tr.path ? [tr.path] : undefined,
      headers: tr.host ? { Host: Array.isArray(tr.host) ? tr.host : [tr.host] } : undefined
    });
  } else if (tr.type === 'httpupgrade') {
    out.network = 'httpupgrade';
    out['http-upgrade-opts'] = pruneObj({ path: tr.path, host: tr.host });
  }
}

function attachClientFingerprint(out, tls) {
  if (tls && tls.utls && tls.utls.fingerprint) {
    out['client-fingerprint'] = tls.utls.fingerprint;
  }
}

function pruneObj(o) {
  if (!o || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const sub = pruneObj(v);
      if (sub && Object.keys(sub).length) r[k] = sub;
    } else {
      r[k] = v;
    }
  }
  return r;
}

export default function serialize(nodes) {
  const proxies = nodes.map(nodeToMihomo);
  return yaml.dump({ proxies }, { lineWidth: 1000, noRefs: true });
}
