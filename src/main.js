import { detect } from './core/detect.js';
import parseLinks from './core/parsers/links.js';
import parseSingbox from './core/parsers/singbox.js';
import parseMihomo from './core/parsers/mihomo.js';
import serializeLinks from './core/serializers/links.js';
import serializeSingbox from './core/serializers/singbox.js';
import serializeMihomo from './core/serializers/mihomo.js';

const parsers = {
  links: (t) => parseLinks(t),
  'links-sub': (t) => parseLinks(t, { subscription: true }),
  singbox: parseSingbox,
  mihomo: parseMihomo
};

const serializers = {
  links: serializeLinks,
  singbox: serializeSingbox,
  mihomo: serializeMihomo
};

const FORMAT_LABEL = {
  links: '分享链接',
  'links-sub': 'base64 订阅',
  singbox: 'sing-box JSON',
  mihomo: 'Mihomo YAML'
};

const DEMO = `{
  "tag": "hy2-France",
  "type": "hysteria2",
  "server": "149.202.79.99",
  "server_port": 41231,
  "password": "CDBI2NDUdZQEc4MCoEBKVg==",
  "tls": {
    "enabled": true,
    "server_name": "www.bing.com",
    "insecure": true
  }
}`;

const $ = (id) => document.getElementById(id);
const input = $('input');
const output = $('output');
const hint = $('hint');
const errBox = $('error');

$('btn-convert').addEventListener('click', convert);
$('btn-clear').addEventListener('click', () => {
  input.value = '';
  output.value = '';
  hint.textContent = '';
  hideError();
});
$('btn-demo').addEventListener('click', () => {
  input.value = DEMO;
  hint.textContent = '';
  hideError();
});
$('btn-copy').addEventListener('click', async () => {
  if (!output.value) return;
  try {
    await navigator.clipboard.writeText(output.value);
    const old = hint.textContent;
    hint.textContent = '已复制';
    hint.classList.add('ok');
    setTimeout(() => {
      hint.textContent = old;
      hint.classList.remove('ok');
    }, 1200);
  } catch {
    output.select();
    document.execCommand && document.execCommand('copy');
  }
});

// Ctrl/Cmd+Enter 触发转换
input.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    convert();
  }
});

function convert() {
  hideError();
  const raw = input.value;
  if (!raw.trim()) {
    showError('请先粘贴节点内容');
    return;
  }

  let src;
  try {
    src = detect(raw);
  } catch (e) {
    showError(e.message);
    return;
  }

  const targetEl = document.querySelector('input[name="target"]:checked');
  const target = targetEl ? targetEl.value : 'links';

  let nodes;
  try {
    nodes = parsers[src](raw);
  } catch (e) {
    showError(`${FORMAT_LABEL[src]} 解析失败：${e.message}`);
    return;
  }

  if (!nodes.length) {
    showError(`未发现可转换节点（${FORMAT_LABEL[src]} 中没有支持的协议类型）`);
    return;
  }

  let result;
  try {
    result = serializers[target](nodes);
  } catch (e) {
    showError(`序列化失败：${e.message}`);
    return;
  }

  output.value = result;
  hint.textContent = `检测到 ${FORMAT_LABEL[src]} · ${nodes.length} 个节点 → ${FORMAT_LABEL[target]}`;
}

function showError(msg) {
  errBox.textContent = msg;
  errBox.hidden = false;
}

function hideError() {
  errBox.hidden = true;
  errBox.textContent = '';
}
