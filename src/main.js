import { detect } from './core/detect.js';
import parseLinks from './core/parsers/links.js';
import parseSingbox from './core/parsers/singbox.js';
import parseMihomo from './core/parsers/mihomo.js';
import serializeLinks, { toBase64Sub, nodeToShareLink } from './core/serializers/links.js';
import serializeSingbox from './core/serializers/singbox.js';
import serializeMihomo from './core/serializers/mihomo.js';
import { splitMultiLink } from './core/split-links.js';
import { initTheme, toggleTheme } from './core/theme.js';
import * as history from './core/history.js';
import { toDataURL, QR_SAFE_LEN } from './core/qrgen.js';

initTheme();

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
const outputSub = $('output-sub');
const subSize = $('sub-size');
const qrGrid = $('qr-grid');
const hint = $('hint');
const detectBadge = $('detect-badge');
const errBox = $('error');

// 转换后的最近一次结果(供历史回填和复制使用)
let lastResult = { text: '', sub: '', target: 'links', nodes: [] };
let activeTab = 'text';

// ─── Theme ───────────────────────────────────────────────────────
$('btn-theme').addEventListener('click', () => {
  toggleTheme();
  // 主题变了,如果已有 QR 重新渲染一遍以更新颜色
  if (lastResult.nodes.length && lastResult.target === 'links') {
    renderQRs(lastResult.nodes);
  }
});

// ─── Convert / Clear / Demo ─────────────────────────────────────
$('btn-convert').addEventListener('click', convert);
$('btn-clear').addEventListener('click', () => {
  input.value = '';
  output.value = '';
  outputSub.value = '';
  subSize.textContent = '';
  resetQRGrid();
  hint.textContent = '';
  hideError();
  updateDetectBadge('');
  lastResult = { text: '', sub: '', target: 'links', nodes: [] };
});
$('btn-demo').addEventListener('click', () => {
  input.value = DEMO;
  hint.textContent = '';
  hideError();
  scheduleDetect();
});

// ─── Copy current tab ───────────────────────────────────────────
$('btn-copy').addEventListener('click', async () => {
  if (activeTab === 'qr') {
    flashHint('右键二维码可保存图片');
    return;
  }
  const value = activeTab === 'sub' ? outputSub.value : output.value;
  if (!value) {
    flashHint('暂无可复制内容');
    return;
  }
  await copyText(value);
  flashHint(activeTab === 'sub' ? '已复制订阅' : '已复制', 'ok');
});

// ─── Ctrl/Cmd+Enter ─────────────────────────────────────────────
input.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    convert();
  }
});

// ─── Live detect (debounced) ────────────────────────────────────
let detectTimer = null;
function scheduleDetect() {
  if (detectTimer) clearTimeout(detectTimer);
  detectTimer = setTimeout(runDetect, 220);
}
input.addEventListener('input', scheduleDetect);

function runDetect() {
  const raw = input.value;
  if (!raw.trim()) {
    updateDetectBadge('');
    return;
  }
  try {
    const src = detect(raw);
    let extra = '';
    if (src === 'links') {
      const parts = splitMultiLink(raw);
      if (parts.length) extra = ` · ${parts.length} 段`;
    }
    updateDetectBadge(`${FORMAT_LABEL[src]}${extra}`, 'ok');
  } catch (e) {
    updateDetectBadge('无法识别', 'bad');
  }
}

function updateDetectBadge(text, kind) {
  if (!text) {
    detectBadge.hidden = true;
    detectBadge.textContent = '';
    detectBadge.className = 'badge';
    return;
  }
  detectBadge.hidden = false;
  detectBadge.textContent = text;
  detectBadge.className = 'badge' + (kind ? ' ' + kind : '');
}

// ─── Tabs ────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === btn));
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.tab === activeTab);
    });
  });
});

function setTabsAvailability(target) {
  const tabSub = document.querySelector('.tab[data-tab="sub"]');
  const tabQr = document.querySelector('.tab[data-tab="qr"]');
  const isLinks = target === 'links';
  tabSub.disabled = !isLinks;
  tabQr.disabled = !isLinks;
  tabSub.title = isLinks ? '' : '仅在目标为「分享链接」时可用';
  tabQr.title = isLinks ? '' : '仅在目标为「分享链接」时可用';
  if (!isLinks && (activeTab === 'sub' || activeTab === 'qr')) {
    document.querySelector('.tab[data-tab="text"]').click();
  }
}

// ─── Main convert ───────────────────────────────────────────────
function convert() {
  hideError();
  const raw = input.value;
  if (!raw.trim()) {
    showError('请先粘贴节点内容');
    return;
  }

  let src;
  try { src = detect(raw); }
  catch (e) { showError(e.message); return; }

  const targetEl = document.querySelector('input[name="target"]:checked');
  const target = targetEl ? targetEl.value : 'links';
  setTabsAvailability(target);

  // 1. 解析 → nodes,逐段收集错误(仅 links 走分隔符切分)
  let nodes = [];
  const segErrors = [];
  if (src === 'links') {
    const parts = splitMultiLink(raw);
    if (!parts.length) {
      showError('未识别到任何分享链接');
      return;
    }
    parts.forEach((seg, i) => {
      try {
        const parsed = parsers.links(seg);
        if (!parsed.length) {
          segErrors.push({ idx: i + 1, msg: '空结果或不支持的协议' });
        } else {
          nodes.push(...parsed);
        }
      } catch (e) {
        segErrors.push({ idx: i + 1, msg: e.message });
      }
    });
  } else {
    try { nodes = parsers[src](raw); }
    catch (e) {
      showError(`${FORMAT_LABEL[src]} 解析失败:${e.message}`);
      return;
    }
  }

  if (!nodes.length) {
    if (segErrors.length) {
      showError([`未发现可转换节点(${FORMAT_LABEL[src]} 中没有支持的协议)`,
        ...segErrors.map((e) => `第 ${e.idx} 段:${e.msg}`)]);
    } else {
      showError(`未发现可转换节点(${FORMAT_LABEL[src]} 中没有支持的协议)`);
    }
    return;
  }

  // 2. 序列化主结果
  let result;
  try { result = serializers[target](nodes); }
  catch (e) {
    showError(`序列化失败:${e.message}`);
    return;
  }
  output.value = result;

  // 3. links 目标:同时生成 base64 订阅 + QR
  if (target === 'links') {
    const sub = toBase64Sub(nodes);
    outputSub.value = sub;
    subSize.textContent = `${sub.length.toLocaleString()} 字符`;
    renderQRs(nodes);
  } else {
    outputSub.value = '';
    subSize.textContent = '';
    resetQRGrid();
  }

  // 4. 提示 + 软错误(部分失败)
  let hintText = `检测到 ${FORMAT_LABEL[src]} · ${nodes.length} 个节点 → ${FORMAT_LABEL[target]}`;
  if (segErrors.length) {
    hintText += ` · ${segErrors.length} 段失败`;
    showError([`${nodes.length} 段成功 · ${segErrors.length} 段失败`,
      ...segErrors.map((e) => `第 ${e.idx} 段:${e.msg}`)]);
  }
  hint.textContent = hintText;
  hint.classList.toggle('ok', segErrors.length === 0);

  // 5. 写历史
  lastResult = { text: result, sub: outputSub.value, target, nodes };
  history.push({
    src, target,
    nodeCount: nodes.length,
    input: raw,
    inputPreview: raw,
    output: result
  });
  renderHistory();
}

// ─── QR rendering ───────────────────────────────────────────────
function resetQRGrid() {
  qrGrid.innerHTML = '<div class="qr-empty">仅在目标为「分享链接」时生成二维码 · 每节点一张 + 全部聚合订阅一张</div>';
  qrGrid.setAttribute('data-empty', 'true');
}

async function renderQRs(nodes) {
  qrGrid.innerHTML = '';
  qrGrid.removeAttribute('data-empty');

  // per-node
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const link = nodeToShareLink(node);
    const name = node.tag || `node-${i + 1}`;
    const type = (node.type || '').toUpperCase();
    const card = document.createElement('div');
    card.className = 'qr-card';
    if (!link) {
      card.classList.add('error');
      card.innerHTML = `
        <div class="qr-placeholder">无法生成链接<br/>(协议:${type || '未知'})</div>
        <div class="qr-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="qr-type">${escapeHtml(type || '—')}</div>`;
      qrGrid.appendChild(card);
      continue;
    }
    card.innerHTML = `
      <img alt="${escapeHtml(name)} 二维码" />
      <div class="qr-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      <div class="qr-type">${escapeHtml(type || '—')}</div>
      <div class="qr-actions">
        <button class="ghost small" data-act="copy">复制链接</button>
        <button class="ghost small" data-act="download">下载 PNG</button>
      </div>`;
    qrGrid.appendChild(card);
    try {
      const url = await toDataURL(link);
      card.querySelector('img').src = url;
      card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        await copyText(link);
        flashHint('已复制单条链接', 'ok');
      });
      card.querySelector('[data-act="download"]').addEventListener('click', () => {
        downloadDataURL(url, `${sanitizeFile(name)}.png`);
      });
    } catch (e) {
      card.classList.add('error');
      card.querySelector('img').remove();
      const ph = document.createElement('div');
      ph.className = 'qr-placeholder';
      ph.textContent = '二维码生成失败';
      card.prepend(ph);
    }
  }

  // aggregated subscription
  const sub = toBase64Sub(nodes);
  const subCard = document.createElement('div');
  subCard.className = 'qr-card qr-sub';
  if (sub.length > QR_SAFE_LEN) {
    subCard.classList.add('error');
    subCard.innerHTML = `
      <div class="qr-placeholder">订阅内容过长(${sub.length} 字符)<br/>建议改用单节点二维码逐个导入</div>
      <div class="qr-name">全部节点 · base64 订阅</div>
      <div class="qr-type">SUBSCRIPTION</div>`;
    qrGrid.appendChild(subCard);
    return;
  }
  subCard.innerHTML = `
    <img alt="聚合订阅二维码" />
    <div class="qr-name">全部节点 · base64 订阅</div>
    <div class="qr-type">SUBSCRIPTION · ${nodes.length} 节点</div>
    <div class="qr-actions">
      <button class="ghost small" data-act="copy">复制订阅</button>
      <button class="ghost small" data-act="download">下载 PNG</button>
    </div>`;
  qrGrid.appendChild(subCard);
  try {
    const url = await toDataURL(sub);
    subCard.querySelector('img').src = url;
    subCard.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      await copyText(sub);
      flashHint('已复制订阅', 'ok');
    });
    subCard.querySelector('[data-act="download"]').addEventListener('click', () => {
      downloadDataURL(url, 'proxvert-subscription.png');
    });
  } catch {
    subCard.classList.add('error');
    subCard.querySelector('img')?.remove();
  }
}

// ─── History ────────────────────────────────────────────────────
const historyList = $('history-list');
const historyCount = $('history-count');

$('btn-history-clear').addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (!history.load().length) return;
  history.clear();
  renderHistory();
});

function renderHistory() {
  const list = history.load();
  historyCount.textContent = list.length;
  if (!list.length) {
    historyList.innerHTML = '<div class="history-empty">暂无记录 · 完成转换后会自动保存,最多保留 10 条</div>';
    historyList.setAttribute('data-empty', 'true');
    return;
  }
  historyList.removeAttribute('data-empty');
  historyList.innerHTML = '';
  list.forEach((e) => {
    const card = document.createElement('div');
    card.className = 'history-item';
    card.innerHTML = `
      <div class="history-item-head">
        <span class="history-flow">${escapeHtml(FORMAT_LABEL[e.src] || e.src)} <span class="arr">→</span> ${escapeHtml(FORMAT_LABEL[e.target] || e.target)}</span>
        <span class="history-time">${formatTime(e.ts)}</span>
      </div>
      <div class="history-item-head">
        <span style="color:var(--text-dim);font-family:var(--font-mono);font-size:11.5px">${e.nodeCount} 节点</span>
      </div>
      <div class="history-preview" title="${escapeHtml(e.inputPreview)}">${escapeHtml(e.inputPreview) || '<空>'}</div>
      <div class="history-item-actions">
        <button class="ghost small" data-act="restore">回填</button>
        <button class="ghost small" data-act="copy">复制输出</button>
        <button class="ghost small" data-act="remove" title="移除此条">×</button>
      </div>`;
    card.querySelector('[data-act="restore"]').addEventListener('click', () => {
      input.value = e.input;
      output.value = e.output;
      // 同步选中 target 的 radio
      const radio = document.querySelector(`input[name="target"][value="${e.target}"]`);
      if (radio) radio.checked = true;
      setTabsAvailability(e.target);
      // 如目标是 links,尝试重新算出 sub + QR
      if (e.target === 'links') {
        try {
          const src = detect(e.input);
          const parts = src === 'links' ? splitMultiLink(e.input) : [e.input];
          let nodes = [];
          parts.forEach((seg) => {
            try { nodes.push(...parsers[src](seg)); } catch {}
          });
          if (nodes.length) {
            const sub = toBase64Sub(nodes);
            outputSub.value = sub;
            subSize.textContent = `${sub.length.toLocaleString()} 字符`;
            renderQRs(nodes);
            lastResult = { text: e.output, sub, target: 'links', nodes };
          } else {
            outputSub.value = ''; subSize.textContent = ''; resetQRGrid();
          }
        } catch {
          outputSub.value = ''; subSize.textContent = ''; resetQRGrid();
        }
      } else {
        outputSub.value = ''; subSize.textContent = ''; resetQRGrid();
      }
      hint.textContent = `已回填:${FORMAT_LABEL[e.src] || e.src} → ${FORMAT_LABEL[e.target] || e.target} · ${e.nodeCount} 节点`;
      hint.classList.add('ok');
      runDetect();
    });
    card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      await copyText(e.output);
      flashHint('已复制历史输出', 'ok');
    });
    card.querySelector('[data-act="remove"]').addEventListener('click', () => {
      history.remove(e.id);
      renderHistory();
    });
    historyList.appendChild(card);
  });
}

renderHistory();

// ─── Helpers ────────────────────────────────────────────────────
function showError(msg) {
  errBox.hidden = false;
  if (Array.isArray(msg)) {
    const [head, ...rest] = msg;
    errBox.innerHTML = `<div class="err-head">${escapeHtml(head)}</div>` +
      (rest.length ? `<ul>${rest.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : '');
  } else {
    errBox.textContent = msg;
  }
}

function hideError() {
  errBox.hidden = true;
  errBox.textContent = '';
  errBox.innerHTML = '';
}

async function copyText(str) {
  try {
    await navigator.clipboard.writeText(str);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = str;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand && document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

function flashHint(text, kind) {
  const old = hint.textContent;
  const oldOk = hint.classList.contains('ok');
  hint.textContent = text;
  hint.classList.toggle('ok', kind === 'ok');
  setTimeout(() => {
    hint.textContent = old;
    hint.classList.toggle('ok', oldOk);
  }, 1400);
}

function downloadDataURL(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function sanitizeFile(name) {
  return String(name).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'node';
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 监听 target 切换,实时同步 Tab 可用性
document.querySelectorAll('input[name="target"]').forEach((el) => {
  el.addEventListener('change', () => setTabsAvailability(el.value));
});
setTabsAvailability('links');
