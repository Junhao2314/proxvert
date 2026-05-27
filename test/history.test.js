import test from 'node:test';
import assert from 'node:assert/strict';

const KEY = 'proxvert.history';

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

async function loadFreshHistoryModule() {
  return import(`../src/core/history.js?case=${Date.now()}-${Math.random()}`);
}

test('history stores sensitive restore data in sessionStorage only', async () => {
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage = new MemoryStorage();
  globalThis.localStorage.setItem(KEY, 'legacy-secret');

  const history = await loadFreshHistoryModule();
  history.push({
    src: 'links',
    target: 'links',
    nodeCount: 1,
    input: 'trojan://secret@example.com:443#node',
    output: 'trojan://secret@example.com:443#node'
  });

  assert.equal(globalThis.localStorage.getItem(KEY), null);
  assert.ok(globalThis.sessionStorage.getItem(KEY));
  assert.equal(history.load()[0].input, 'trojan://secret@example.com:443#node');
  assert.equal(history.load()[0].inputPreview, 'trojan://••••@example.com:443#node');
});

test('history normalizes polluted stored entries before rendering', async () => {
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.localStorage = new MemoryStorage();

  const history = await loadFreshHistoryModule();
  globalThis.sessionStorage.setItem(KEY, JSON.stringify([{
    id: 'x',
    ts: 'bad',
    src: '<img src=x onerror=alert(1)>',
    target: 'javascript:alert(1)',
    nodeCount: '<svg onload=alert(1)>',
    inputPreview: 'password: super-secret',
    input: 'in',
    output: 'out'
  }]));

  const [entry] = history.load();

  assert.equal(entry.src, 'links');
  assert.equal(entry.target, 'links');
  assert.equal(entry.nodeCount, 0);
  assert.equal(entry.inputPreview, 'password: ••••');
  assert.equal(entry.input, 'in');
  assert.equal(entry.output, 'out');
});
