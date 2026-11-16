// Run with: node Tests/QUEUE_PANEL_DEFAULT_HIDDEN.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'Extension');

class Element {
  constructor(tag, document) { this.tag = tag; this.document = document; this.children = []; this.listeners = {}; this.id = ''; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  appendChild(node) { this.append(node); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  click() { this.listeners.click?.({ target: this }); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  closest(selector) {
    const ids = selector.split(',').map(s => s.trim().replace(/^#/, ''));
    let node = this;
    while (node) { if (ids.includes(node.id)) return node; node = node.parent; }
    return null;
  }
}
function createDocument() {
  const doc = { readyState: 'complete', addEventListener() {} };
  doc.body = new Element('body', doc);
  doc.createElement = tag => new Element(tag, doc);
  doc.getElementById = id => {
    const search = node => node.id === id ? node : node.children.map(search).find(Boolean);
    return search(doc.body);
  };
  return doc;
}
function load(file, context) { vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file }); }
function tick() { return new Promise(resolve => setImmediate(resolve)); }

(async () => {
  // Actual DOM rendering of the collapsed launcher, open/close, and teardown.
  const document = createDocument();
  const components = {};
  const ui = { version: '8.23.24', register: (name, value) => { components[name] = value; }, has: name => Boolean(components[name]) };
  const ctx = { document, EbayUI: ui };
  ctx.globalThis = ctx;
  load('ui/queue-panel/queue-panel.js', ctx);
  const panel = components.queuePanel;
  assert.ok(panel);
  let hidden = true;
  const actions = {
    show() { hidden = false; panel.render({ hidden, queue: [], runner: {} }, actions); },
    hide() { hidden = true; panel.render({ hidden, queue: [], runner: {} }, actions); }
  };
  panel.render({ hidden, queue: [], runner: {} }, actions);
  assert.equal(Boolean(document.getElementById(panel.id)), false, 'panel hidden initially');
  const launcherId = 'ebay-ai-queue-launcher-v700';
  assert.ok(document.getElementById(launcherId), 'opener visible initially');
  document.getElementById(launcherId).click();
  assert.ok(document.getElementById(panel.id), 'opener shows panel');
  assert.equal(document.getElementById(launcherId), undefined, 'opener hidden while panel open');
  const closeButton = document.getElementById(panel.id).children[0].children[1];
  closeButton.click();
  assert.equal(Boolean(document.getElementById(panel.id)), false, 'close hides panel');
  assert.ok(document.getElementById(launcherId), 'close restores opener');
  panel.remove();
  assert.equal(Boolean(document.getElementById(launcherId)), false, 'teardown removes opener');

  // Real queue page controller: no implicit reopen from selection, clear, or load.
  const events = {};
  const renders = [];
  const queueView = { id: panel.id, render: (model, callbacks) => renders.push({ model, callbacks }), remove() {}, contains: () => false };
  const pageContext = {
    window: { addEventListener: (name, callback) => events[name] = callback },
    location: { pathname: '/sh/lst/active' },
    document: { ...createDocument(), addEventListener: (name, callback) => events[name] = callback, removeEventListener() {}, body: {} },
    EbayQueueDom: { collectVisibleRecords: () => [], selectionControlFromEvent: () => true, sanitizeStoredItem: x => x },
    EbayUI: { queuePanel: queueView },
    EbayAiStorageV790: { get: async () => ({}), set: async () => {} },
    chrome: { storage: { onChanged: { addListener() {}, removeListener() {} } } },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout, clearTimeout, Date, Promise
  };
  pageContext.window.top = pageContext.window;
  pageContext.globalThis = pageContext;
  load('modes/queue_page.js', pageContext);
  await tick(); await tick();
  assert.equal(renders.at(-1).model.hidden, true, 'fresh page is hidden');
  events.change({ target: {} });
  assert.equal(renders.at(-1).model.hidden, true, 'selecting a draft cannot show panel');
  await new Promise(resolve => setTimeout(resolve, 275));
  assert.equal(renders.at(-1).model.hidden, true, 'selection sync does not show panel');
  renders.at(-1).callbacks.show();
  assert.equal(renders.at(-1).model.hidden, false, 'explicit click shows panel');
  renders.at(-1).callbacks.hide();
  assert.equal(renders.at(-1).model.hidden, true, 'close hides panel');
  await pageContext.EbayQueuePage.handleMessage({ type: 'AI_QUEUE_CLEAR_V701' });
  assert.equal(renders.at(-1).model.hidden, true, 'clearing queue does not show panel');
  events.pageshow();
  await tick(); await tick();
  assert.equal(renders.at(-1).model.hidden, true, 'page reload restoration stays hidden');
  console.log('PASS: AI Queue hidden by default, explicit open, close, selection, clear, restore and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
