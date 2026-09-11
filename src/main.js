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

// ─── Platform-aware shortcut label ───────────────────────────────
(function () {
  const kbd = document.querySelector('#btn-convert .kbd');
  if (!kbd) return;
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  kbd.textContent = isMac ? '⌘↵' : 'Ctrl+↵';
})();

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
  "server": "demo.example.com",
  "server_port": 41231,
  "password": "demo-password",
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
const qrViewer = $('qr-viewer');
const hint = $('hint');
const detectBadge = $('detect-badge');
const errBox = $('error');

// 转换后的最近一次结果(供历史回填和复制使用)
let lastResult = { text: '', sub: '', target: 'links', nodes: [] };
let activeTab = 'text';
// 「载入示例看看」写进去的示例内容是否还没被用户改动过
let demoLoaded = false;

// QR viewer state
let qrItems = [];   // { name, type, link, url, isError, isSub }
let qrIndex = 0;
let qrRenderToken = null;
let qrUpdateView = null;

if (qrViewer) {
  qrViewer.addEventListener('keydown', (e) => {
    if (!qrUpdateView) return;
    if (e.key === 'ArrowLeft' && qrUpdateView(-1)) e.preventDefault();
    if (e.key === 'ArrowRight' && qrUpdateView(1)) e.preventDefault();
  });
}

// ─── Theme ───────────────────────────────────────────────────────
// core/theme.js 只负责主题状态,监听器统一在这里注册一次:
// 切换主题后若已有二维码,顺带重渲染一次以适配新配色。
$('btn-theme').addEventListener('click', () => {
  toggleTheme();
  // 主题变了,如果已有 QR 重新渲染一遍以更新颜色
  if (lastResult.nodes.length && lastResult.target === 'links') {
    renderQRs(lastResult.nodes);
  }
});

// ─── History drawer ──────────────────────────────────────────────
const drawer = $('history');
const drawerBackdrop = $('history-backdrop');
const btnHistoryOpen = $('btn-history-open');
const btnHistoryClose = $('btn-history-close');

function openHistory() {
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.classList.add('show');
  btnHistoryOpen.setAttribute('aria-expanded', 'true');
  btnHistoryClose.focus();
}

function closeHistory() {
  if (!drawer.classList.contains('open')) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.classList.remove('show');
  btnHistoryOpen.setAttribute('aria-expanded', 'false');
  btnHistoryOpen.focus();
}

btnHistoryOpen.addEventListener('click', () => {
  if (drawer.classList.contains('open')) closeHistory();
  else openHistory();
});
btnHistoryClose.addEventListener('click', closeHistory);
drawerBackdrop.addEventListener('click', closeHistory);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeHistory();
});

// ─── Convert / Clear / Demo ─────────────────────────────────────
$('btn-convert').addEventListener('click', convert);
$('btn-clear').addEventListener('click', () => {
  input.value = '';
  demoLoaded = false;
  output.value = '';
  outputSub.value = '';
  subSize.textContent = '';
  resetQRViewer();
  hint.textContent = '';
  hideError();
  updateDetectBadge('');
  lastResult = { text: '', sub: '', target: 'links', nodes: [] };
  history.clear();
  renderHistory();
});
$('btn-demo').addEventListener('click', loadDemo);

// 首屏展示态的「载入示例看看」也复用这段,所以抽成具名函数
function loadDemo() {
  input.value = DEMO;
  demoLoaded = true;
  hint.textContent = '';
  hideError();
  scheduleDetect();
}

// 从展示态点「开始转换」进入工作区时,若输入框里还留着没被改动过的示例内容,
// 就清掉它 —— 那是「载入示例看看」留下的,不该被当成用户自己的输入。
function clearLeftoverDemo() {
  if (!demoLoaded && input.value.trim() !== DEMO.trim()) return;
  demoLoaded = false;
  input.value = '';
  output.value = '';
  outputSub.value = '';
  subSize.textContent = '';
  resetQRViewer();
  hint.textContent = '';
  hideError();
  updateDetectBadge('');
  lastResult = { text: '', sub: '', target: 'links', nodes: [] };
}

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
  const copied = await copyText(value);
  flashHint(
    copied ? (activeTab === 'sub' ? '已复制订阅' : '已复制') : '复制失败',
    copied ? 'ok' : undefined
  );
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
input.addEventListener('input', () => {
  demoLoaded = false;
  scheduleDetect();
});

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
  } catch {
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
    document.querySelectorAll('.tab').forEach((t) => {
      const selected = t === btn;
      t.classList.toggle('active', selected);
      t.setAttribute('aria-selected', String(selected));
    });
    document.querySelectorAll('.tab-panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.tab === activeTab);
    });
  });
});

function setTabsAvailability(target) {
  const tabsEl = document.querySelector('.pane-head-tabs .tabs');
  const note = document.querySelector('.text-only-note');
  const isLinks = target === 'links';
  // 仅「分享链接」有多种输出形态(文本/订阅/二维码);
  // sing-box / Mihomo 只有纯文本,直接隐藏整条 tab 栏。
  if (tabsEl) tabsEl.hidden = !isLinks;
  if (note) note.hidden = isLinks;
  if (!isLinks && activeTab !== 'text') {
    const textTab = document.querySelector('.tab[data-tab="text"]');
    if (textTab) textTab.click();
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
  catch { showError('无法识别输入格式，请检查输入内容'); return; }

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
    } catch {
      segErrors.push({ idx: i + 1, msg: '解析失败，请检查输入格式' });
    }
    });
  } else {
    try { nodes = parsers[src](raw); }
    catch {
      showError(`${FORMAT_LABEL[src]} 解析失败，请检查输入格式`);
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
  catch {
    showError('序列化失败，请检查节点数据');
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
    resetQRViewer();
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
function resetQRViewer() {
  qrRenderToken = null;
  qrUpdateView = null;
  qrItems = [];
  qrIndex = 0;
  qrViewer.innerHTML = '<div class="qr-empty">仅在目标为「分享链接」时生成二维码</div>';
  qrViewer.setAttribute('data-empty', 'true');
}

async function renderQRs(nodes) {
  const renderToken = {};
  qrRenderToken = renderToken;
  const isStale = () => renderToken !== qrRenderToken;
  qrViewer.innerHTML = '';
  qrViewer.removeAttribute('data-empty');
  qrItems = [];
  qrIndex = 0;

  // 1. Build item list (per-node + aggregated sub)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const link = nodeToShareLink(node);
    const name = node.tag || `node-${i + 1}`;
    const type = (node.type || '').toUpperCase();
    qrItems.push({ name, type, link, url: null, isError: !link, isSub: false });
  }

  // aggregated subscription
  const sub = toBase64Sub(nodes);
  const subTooLong = sub.length > QR_SAFE_LEN;
  qrItems.push({
    name: '全部节点 · base64 订阅',
    type: subTooLong ? 'SUBSCRIPTION' : `SUBSCRIPTION · ${nodes.length} 节点`,
    link: subTooLong ? null : sub,
    url: null,
    isError: subTooLong,
    isSub: true,
    subLen: sub.length
  });

  // 2. Build nav bar
  const nav = document.createElement('div');
  nav.className = 'qr-nav';

  const btnPrev = document.createElement('button');
  btnPrev.className = 'ghost small qr-nav-btn';
  btnPrev.type = 'button';
  btnPrev.title = '上一个';
  btnPrev.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const selector = document.createElement('select');
  selector.className = 'qr-selector';
  qrItems.forEach((item, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = item.isSub ? `[订阅] ${item.name}` : `[${i + 1}] ${item.name} (${item.type})`;
    selector.appendChild(opt);
  });

  const counter = document.createElement('span');
  counter.className = 'qr-counter';

  const btnNext = document.createElement('button');
  btnNext.className = 'ghost small qr-nav-btn';
  btnNext.type = 'button';
  btnNext.title = '下一个';
  btnNext.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  nav.append(btnPrev, selector, counter, btnNext);
  qrViewer.appendChild(nav);

  // 3. Display area (single card)
  const display = document.createElement('div');
  display.className = 'qr-display';
  qrViewer.appendChild(display);

  // 4. Navigation logic
  function updateView() {
    if (isStale()) return;
    const total = qrItems.length;
    const item = qrItems[qrIndex];
    counter.textContent = `${qrIndex + 1} / ${total}`;
    selector.value = String(qrIndex);
    btnPrev.disabled = qrIndex === 0;
    btnNext.disabled = qrIndex === total - 1;
    renderCurrentCard(display, item);
  }

  qrUpdateView = (delta) => {
    const nextIndex = qrIndex + delta;
    if (nextIndex < 0 || nextIndex >= qrItems.length) return false;
    qrIndex = nextIndex;
    updateView();
    return true;
  };

  btnPrev.addEventListener('click', () => { if (qrIndex > 0) { qrIndex--; updateView(); } });
  btnNext.addEventListener('click', () => { if (qrIndex < qrItems.length - 1) { qrIndex++; updateView(); } });
  selector.addEventListener('change', () => { qrIndex = Number(selector.value); updateView(); });

  // 5. Render first card + async generate QR images
  updateView();
  asyncGenerateAll(qrItems, renderToken);
}

function renderCurrentCard(container, item) {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'qr-card' + (item.isSub ? ' qr-sub' : '') + (item.isError ? ' error' : '');
  card.tabIndex = 0;

  if (item.isError) {
    const msg = item.isSub
      ? `订阅内容过长(${item.subLen} 字符)<br/>建议改用单节点二维码逐个导入`
      : `无法生成链接<br/>(协议:${escapeHtml(item.type || '未知')})`;
    card.innerHTML = `
      <div class="qr-placeholder">${msg}</div>
      <div class="qr-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
      <div class="qr-type">${escapeHtml(item.type || '—')}</div>`;
  } else if (item.url) {
    fillCardWithImage(card, item);
  } else {
    // Not yet generated — show spinner
    card.innerHTML = `
      <div class="qr-placeholder" style="display:grid;place-items:center;flex:1 1 auto;min-height:0;color:var(--faint)">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="42 42" stroke-linecap="round"/></svg>
      </div>
      <div class="qr-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
      <div class="qr-type">${escapeHtml(item.type || '—')}</div>`;
    card.dataset.pending = 'true';
  }
  container.appendChild(card);
}

function fillCardWithImage(card, item) {
  card.innerHTML = `
    <div class="qr-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
    <div class="qr-type">${escapeHtml(item.type || '—')}</div>
    <div class="qr-actions">
      <button class="ghost small" data-act="copy">${item.isSub ? '复制订阅' : '复制链接'}</button>
      <button class="ghost small" data-act="download">下载 PNG</button>
    </div>`;
  const image = document.createElement('img');
  image.alt = `${item.name} 二维码`;
  image.src = item.url;
  card.prepend(image);
  card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    const copied = await copyText(item.link);
    flashHint(
      copied ? (item.isSub ? '已复制订阅' : '已复制单条链接') : '复制失败',
      copied ? 'ok' : undefined
    );
  });
  card.querySelector('[data-act="download"]').addEventListener('click', () => {
    downloadDataURL(item.url, `${sanitizeFile(item.name)}.png`);
  });
}

async function asyncGenerateAll(items, renderToken) {
  const isStale = () => renderToken !== qrRenderToken;
  for (let i = 0; i < items.length; i++) {
    if (isStale()) return;
    const item = items[i];
    if (item.isError || item.url) continue;
    try {
      item.url = await toDataURL(item.link);
    } catch {
      item.isError = true;
    }
    if (isStale()) return;
    // If this card is currently displayed, refresh it
    if (i === qrIndex) {
      const display = qrViewer.querySelector('.qr-display');
      if (display) renderCurrentCard(display, item);
    }
  }
}

// ─── History ────────────────────────────────────────────────────
const historyList = $('history-list');
const historyCount = $('history-count');
const historyBadge = $('history-badge');

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
  if (historyBadge) historyBadge.textContent = list.length;
  if (!list.length) {
    historyList.innerHTML = '<div class="history-empty">暂无记录，本次会话自动保存</div>';
    historyList.setAttribute('data-empty', 'true');
    return;
  }
  historyList.removeAttribute('data-empty');
  historyList.innerHTML = '';
  list.forEach((e) => {
    const src = FORMAT_LABEL[e.src] ? e.src : 'links';
    const target = serializers[e.target] ? e.target : 'links';
    const nodeCount = Number.isFinite(Number(e.nodeCount)) ? Math.max(0, Math.floor(Number(e.nodeCount))) : 0;
    const card = document.createElement('div');
    card.className = 'history-item';
    card.title = e.inputPreview || '';
    card.innerHTML = `
      <span class="history-flow">${escapeHtml(FORMAT_LABEL[src])} <span class="arr">→</span> ${escapeHtml(FORMAT_LABEL[target])}</span>
      <span class="history-badge">${nodeCount} 节点</span>
      <span class="history-time">${formatTime(e.ts)}</span>
      <span class="history-item-actions">
        <button class="ghost small" data-act="restore">回填</button>
        <button class="ghost small" data-act="copy">复制</button>
        <button class="ghost small" data-act="remove" title="移除此条">×</button>
      </span>`;
    card.querySelector('[data-act="restore"]').addEventListener('click', () => {
      input.value = e.input;
      output.value = e.output;
      // 同步选中 target 的 radio
      const radio = document.querySelector(`input[name="target"][value="${target}"]`);
      if (radio) radio.checked = true;
      setTabsAvailability(target);
      // 如目标是 links,尝试重新算出 sub + QR
      if (target === 'links') {
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
            outputSub.value = ''; subSize.textContent = ''; resetQRViewer();
          }
        } catch {
          outputSub.value = ''; subSize.textContent = ''; resetQRViewer();
        }
      } else {
        outputSub.value = ''; subSize.textContent = ''; resetQRViewer();
      }
      hint.textContent = `已回填:${FORMAT_LABEL[src]} → ${FORMAT_LABEL[target]} · ${nodeCount} 节点`;
      hint.classList.add('ok');
      runDetect();
    });
    card.querySelector('[data-act="copy"]').addEventListener('click', async () => {
      const copied = await copyText(e.output);
      flashHint(copied ? '已复制历史输出' : '复制失败', copied ? 'ok' : undefined);
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
// 错误提示改为浮层 Toast:不再向下推挤布局,因此单屏不会被撑出滚动条。
let errTimer = null;

function showError(msg) {
  clearTimeout(errTimer);
  if (Array.isArray(msg)) {
    const [head, ...rest] = msg;
    errBox.innerHTML = `<div class="err-head">${escapeHtml(head)}</div>` +
      (rest.length ? `<ul>${rest.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : '');
  } else {
    errBox.textContent = msg;
  }
  errBox.classList.add('show');
}

function hideError() {
  errBox.classList.remove('show');
  clearTimeout(errTimer);
  errTimer = setTimeout(() => {
    errBox.textContent = '';
    errBox.innerHTML = '';
  }, 220);
}

errBox.addEventListener('click', hideError);

async function copyText(str) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(str);
      return true;
    } catch {
      // Fall through to the legacy clipboard path.
    }
  }

  const ta = document.createElement('textarea');
  ta.value = String(str == null ? '' : str);
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  try {
    return Boolean(document.execCommand?.('copy'));
  } catch {
    return false;
  } finally {
    ta.remove();
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

// ─── View routing: 展示态 ⇄ 工作区 ───────────────────────────────
// data-view 已由 <head> 内联脚本按 location.hash 预置(防闪屏),
// 这里只补无障碍状态与按钮跳转。注意:本文件的 `history` 是 core/history.js
// 的模块命名空间,操作浏览器历史必须走 window.history。
const VIEW_HASH = '#app';
const showcaseEl = document.querySelector('.showcase');
const workspaceEl = document.querySelector('.workspace');

function currentView() {
  return location.hash === VIEW_HASH ? 'app' : 'showcase';
}

function setView(view, focusInput = false) {
  const isApp = view === 'app';
  document.documentElement.setAttribute('data-view', isApp ? 'app' : 'showcase');
  // inert 让隐藏的那一半彻底退出 Tab 序列,避免键盘焦点落到看不见的控件上
  if (showcaseEl) {
    showcaseEl.inert = isApp;
    showcaseEl.setAttribute('aria-hidden', String(isApp));
  }
  if (workspaceEl) {
    workspaceEl.inert = !isApp;
    workspaceEl.setAttribute('aria-hidden', String(!isApp));
  }
  if (isApp && focusInput) input.focus();
}

function syncView(focusInput) {
  setView(currentView(), focusInput);
}

document.querySelectorAll('[data-goto]').forEach((el) => {
  el.addEventListener('click', (event) => {
    event.preventDefault();
    if (el.dataset.goto === 'app') {
      // 「载入示例看看」写示例;「开始转换」则把残留示例清干净,给出空白工作区
      if (el.hasAttribute('data-load-demo')) loadDemo();
      else clearLeftoverDemo();
      // 改 hash 会触发 hashchange → syncView,不必重复调用
      if (currentView() !== 'app') location.hash = VIEW_HASH;
      else setView('app', true);
    } else if (location.hash) {
      window.history.replaceState(null, '', location.pathname + location.search);
      setView('showcase');
    } else {
      setView('showcase');
    }
  });
});

window.addEventListener('hashchange', () => syncView(true));
syncView(false);
