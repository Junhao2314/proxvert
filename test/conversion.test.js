import test from 'node:test';
import assert from 'node:assert/strict';

import { detect } from '../src/core/detect.js';
import parseLinks from '../src/core/parsers/links.js';
import serializeLinks, { toBase64Sub } from '../src/core/serializers/links.js';
import parseMihomo from '../src/core/parsers/mihomo.js';
import serializeMihomo from '../src/core/serializers/mihomo.js';
import parseSingbox from '../src/core/parsers/singbox.js';
import serializeSingbox from '../src/core/serializers/singbox.js';
import { splitMultiLink } from '../src/core/split-links.js';

test('preserves VLESS Reality and WebSocket parameters through share links', () => {
  const source = 'vless://uuid@example.com:443?security=reality&pbk=pubkey&sid=abcd&type=ws&host=edge.example.com&path=%2Fws#edge';
  const [node] = parseLinks(source);

  assert.equal(node.type, 'vless');
  assert.equal(node.transport.type, 'ws');
  assert.equal(node.tls.reality.public_key, 'pubkey');

  const [roundTripped] = parseLinks(serializeLinks([node]));
  assert.deepEqual(roundTripped.transport, node.transport);
  assert.deepEqual(roundTripped.tls, node.tls);
});

const providedShareLinkCases = [
  {
    name: 'Shadowsocks SIP002 escaped userinfo',
    source: 'ss://2022-blake3-aes-128-gcm%3ASyPaW7%2BmuihiHivABsgcbg%3D%3D@104.234.0.88:36641#ss-WACUS',
    expected: {
      tag: 'ss-WACUS',
      type: 'shadowsocks',
      server: '104.234.0.88',
      server_port: 36641,
      method: '2022-blake3-aes-128-gcm',
      password: 'SyPaW7+muihiHivABsgcbg=='
    }
  },
  {
    name: 'Shadowsocks base64 userinfo',
    source: 'ss://MjAyMi1ibGFrZTMtYWVzLTEyOC1nY206U3lQYVc3K211aWhpSGl2QUJzZ2NiZz09@104.234.0.88:36641#ss-WACUS',
    expected: {
      tag: 'ss-WACUS',
      type: 'shadowsocks',
      server: '104.234.0.88',
      server_port: 36641,
      method: '2022-blake3-aes-128-gcm',
      password: 'SyPaW7+muihiHivABsgcbg=='
    }
  },
  {
    name: 'Hysteria2 TLS params',
    source: 'hy2://M7Oplyy%2F%2FdRhFEN2TtjKFQ%3D%3D@104.234.0.88:17539/?sni=www.bing.com&alpn=h3&insecure=1#hy2-WACUS',
    expected: {
      tag: 'hy2-WACUS',
      type: 'hysteria2',
      server: '104.234.0.88',
      server_port: 17539,
      password: 'M7Oplyy//dRhFEN2TtjKFQ==',
      tls: {
        enabled: true,
        server_name: 'www.bing.com',
        insecure: true
      }
    }
  },
  {
    name: 'TUIC TLS params',
    source: 'tuic://d658a185-faef-4dca-b15d-8d3f1727dc4c:fQtbYYvGj8NZF28hrIrXXg%3D%3D@104.234.0.88:55287/?congestion_control=bbr&alpn=h3&sni=www.bing.com&insecure=1#tuic-WACUS',
    expected: {
      tag: 'tuic-WACUS',
      type: 'tuic',
      server: '104.234.0.88',
      server_port: 55287,
      uuid: 'd658a185-faef-4dca-b15d-8d3f1727dc4c',
      password: 'fQtbYYvGj8NZF28hrIrXXg==',
      tls: {
        enabled: true,
        server_name: 'www.bing.com',
        insecure: true,
        alpn: ['h3']
      },
      congestion_control: 'bbr'
    }
  },
  {
    name: 'VLESS Reality',
    source: 'vless://20edb783-8c6f-427d-a011-e7fac2c613a7@104.234.0.88:51604?encryption=none&flow=xtls-rprx-vision&security=reality&sni=addons.mozilla.org&fp=chrome&pbk=9JeUM_BJwx8kG-V6WFmwmRM_iouffixpnQ3oPC6vvAU&sid=bed36dec4e161701#reality-WACUS',
    expected: {
      tag: 'reality-WACUS',
      type: 'vless',
      server: '104.234.0.88',
      server_port: 51604,
      uuid: '20edb783-8c6f-427d-a011-e7fac2c613a7',
      tls: {
        enabled: true,
        server_name: 'addons.mozilla.org',
        insecure: false,
        reality: {
          enabled: true,
          public_key: '9JeUM_BJwx8kG-V6WFmwmRM_iouffixpnQ3oPC6vvAU',
          short_id: 'bed36dec4e161701'
        },
        utls: {
          enabled: true,
          fingerprint: 'chrome'
        }
      },
      flow: 'xtls-rprx-vision'
    }
  },
  {
    name: 'AnyTLS Reality',
    source: 'anytls://2C2V9tG5DrYS1iBs9y83WA%3D%3D@104.234.0.88:56000/?security=reality&sni=addons.mozilla.org&fp=chrome&pbk=9JeUM_BJwx8kG-V6WFmwmRM_iouffixpnQ3oPC6vvAU&sid=bed36dec4e161701#anytls-WACUS',
    expected: {
      tag: 'anytls-WACUS',
      type: 'anytls',
      server: '104.234.0.88',
      server_port: 56000,
      password: '2C2V9tG5DrYS1iBs9y83WA==',
      tls: {
        enabled: true,
        server_name: 'addons.mozilla.org',
        insecure: false,
        reality: {
          enabled: true,
          public_key: '9JeUM_BJwx8kG-V6WFmwmRM_iouffixpnQ3oPC6vvAU',
          short_id: 'bed36dec4e161701'
        },
        utls: {
          enabled: true,
          fingerprint: 'chrome'
        }
      }
    }
  }
];

for (const { name, source, expected } of providedShareLinkCases) {
  test(`converts ${name} share links to bare sing-box outbound arrays and back`, () => {
    const expectedArray = [expected];
    const nodes = parseLinks(source);
    assert.deepEqual(JSON.parse(serializeSingbox(nodes)), expectedArray);

    const reparsed = parseLinks(serializeLinks(parseSingbox(JSON.stringify(expectedArray))));
    assert.deepEqual(JSON.parse(serializeSingbox(reparsed)), expectedArray);
  });
}

test('parses base64 subscriptions generated from multiple share links', () => {
  const nodes = parseLinks([
    'ss://YWVzLTI1Ni1nY206cGFzcw==@example.com:8388#ss',
    'trojan://secret@example.com:443?security=tls&sni=example.com#trojan'
  ].join('\n'));

  const subscription = toBase64Sub(nodes);
  const parsed = parseLinks(subscription, { subscription: true });

  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((node) => node.type), ['shadowsocks', 'trojan']);
});

test('keeps IPv6 hosts bracketed only at share-link boundaries', () => {
  const [node] = parseLinks('ss://YWVzLTI1Ni1nY206cGFzcw==@[2001:db8::1]:8388#ipv6');

  assert.equal(node.server, '2001:db8::1');
  assert.match(serializeLinks([node]), /@\[2001:db8::1\]:8388/);
});

test('accepts wireguard and socks4 URI aliases consistently across detect split and parse', () => {
  const input = [
    'wireguard://vpn.example.com:51820?pk=priv&bpk=peer&ip=10.0.0.2/32#wg',
    'socks4://user:pass@example.com:1080#legacy'
  ].join(';');

  assert.equal(detect(input), 'links');
  assert.equal(splitMultiLink(input).length, 2);

  const nodes = parseLinks(input.replace(';', '\n'));
  assert.deepEqual(nodes.map((node) => node.type), ['wireguard', 'socks']);
  assert.equal(nodes[1].version, '4');
});

test('serializes hysteria v1 auth in userinfo and keeps links parseable', () => {
  const source = [{
    tag: 'legacy',
    type: 'hysteria',
    server: 'example.com',
    server_port: 443,
    password: 'secret',
    server_name: 'example.com',
    tls: { enabled: true, server_name: 'example.com' }
  }];

  const [link] = serializeLinks(source).split('\n');
  assert.match(link, /^hysteria:\/\/secret@example\.com:443\?sni=example\.com#legacy$/);

  const [parsed] = parseLinks(link);
  assert.equal(parsed.type, 'hysteria');
  assert.equal(parsed.password, 'secret');
  assert.equal(parsed.server_name, 'example.com');
});

test('normalizes Mihomo hy1 aliases into convertible hysteria nodes', () => {
  const yaml = [
    'proxies:',
    '  - name: hy1',
    '    type: hy1',
    '    server: example.com',
    '    port: 443',
    '    password: secret',
    '    sni: example.com'
  ].join('\n');

  const [node] = parseMihomo(yaml);

  assert.equal(node.type, 'hysteria');
  assert.equal(node.password, 'secret');
  assert.equal(node.server_name, 'example.com');
});

test('round-trips simple Mihomo Shadowsocks nodes through normalized model', () => {
  const yaml = [
    'proxies:',
    '  - name: ss',
    '    type: ss',
    '    server: example.com',
    '    port: 8388',
    '    cipher: aes-256-gcm',
    '    password: pass'
  ].join('\n');

  const [node] = parseMihomo(yaml);
  const output = serializeMihomo([node]);

  assert.equal(node.type, 'shadowsocks');
  assert.match(output, /type: ss/);
  assert.match(output, /cipher: aes-256-gcm/);
});

test('filters unsupported sing-box outbounds without failing serialization', () => {
  const input = JSON.stringify({
    outbounds: [
      { type: 'direct', tag: 'direct' },
      { type: 'vless', tag: 'vless', server: 'example.com', server_port: 443, uuid: 'uuid' }
    ]
  });

  const nodes = parseSingbox(input);
  const output = JSON.parse(serializeSingbox(nodes));

  assert.equal(nodes.length, 1);
  assert.equal(output[0].type, 'vless');
});
