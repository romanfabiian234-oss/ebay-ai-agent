"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const extension = path.resolve(__dirname, "../../Extension");

let pageListener = null;
const runtimeListeners = [];
const documentListeners = {};
const savedNode = {
  isConnected: true,
  textContent: "Saved",
  getAttribute() { return ""; },
  getBoundingClientRect() { return { width: 10, height: 10 }; }
};
const documentMock = {
  querySelectorAll(selector) { return selector.includes("aria-live") ? [savedNode] : []; },
  getElementById() { return null; },
  createElement() { return { style: {}, dataset: {}, innerHTML: "", querySelector(){return null;}, remove(){}, appendChild(){} }; },
  documentElement: { appendChild() {}, clientHeight: 900 },
  addEventListener(type, fn) { documentListeners[type] = fn; }
};
const chromeMock = {
  runtime: {
    id: "test-extension",
    lastError: null,
    sendMessage(_message, callback) { if (callback) callback({ ok: true }); },
    onMessage: {
      addListener(fn) { runtimeListeners.push(fn); pageListener = fn; }
    }
  }
};
const context = vm.createContext({
  console, setTimeout, clearTimeout, Promise, Map, Set, Object, Array, String, Number, Boolean, Math, Date,
  document: documentMock,
  chrome: chromeMock,
  getComputedStyle: () => ({ display: "block", visibility: "visible", opacity: "1" })
});
context.globalThis = context;
context.top = context;
context.window = context;

vm.runInContext(fs.readFileSync(path.join(extension, "core/policy.js"), "utf8"), context, { filename: "item_specifics.js" });
let color = "Black";
const map = new Map([
  ["color", {
    name: "Color", label: "Color", type: "dropdown",
    async read() { return color; },
    async clear() { color = ""; return { ok: true, changed: true, reason: "row_clear_control" }; },
    async close() { return true; }
  }],
  ["mpn", {
    name: "MPN", label: "MPN", type: "text",
    async read() { return "SECRET-MPN"; },
    async clear() { throw new Error("MPN must never be cleared"); },
    async close() { return true; }
  }]
]);
context.EbayPageFieldsV810 = {
  draftIdFromUrl: () => "draft-96",
  collectFieldMap: async () => map,
  collectListing: async () => ({ ok: true, routeQuestions: ["Color"], fields: [] })
};
let currentOperation = null;
context.EbayAiFillEngineV790 = {
  adaptersRegistered: false,
  registerAdapters(adapters) { this.adapters = adapters; this.adaptersRegistered = true; return adapters; },
  operationStatus() { return currentOperation; },
  async withOperation(kind, task) {
    if (currentOperation) return { ok: false, busy: true, message: "busy", operation: currentOperation };
    currentOperation = { kind };
    try { return await task(); } finally { currentOperation = null; }
  },
  async fillAll() { return { ok: true, filled: 0 }; }
};

vm.runInContext(fs.readFileSync(path.join(extension, "content.js"), "utf8"), context, { filename: "content.js" });
assert.strictEqual(runtimeListeners.length, 1, "content.js must own exactly one page message router");
assert.ok(pageListener, "page message router was not registered");

function send(message) {
  return new Promise((resolve, reject) => {
    let returned;
    const timer = setTimeout(() => reject(new Error(`no response for ${message.type}`)), 3000);
    try {
      returned = pageListener(message, { tab: { id: 7 } }, response => { clearTimeout(timer); resolve({ response, returned }); });
      if (returned === false && message.type === "UNHANDLED") { clearTimeout(timer); resolve({ response: null, returned }); }
    } catch (error) { clearTimeout(timer); reject(error); }
  });
}

(async () => {
  const clear = (await send({ type: "CORE_EBAY_CLEAR_ALL_ITEM_SPECIFICS_V920", payload: { expectedDraftId: "draft-96" } })).response;
  assert.strictEqual(clear.cleared, 1, JSON.stringify(clear));
  assert.strictEqual(clear.protectedSkipped, 1, JSON.stringify(clear));
  assert.strictEqual(clear.review, 0, JSON.stringify(clear));
  assert.strictEqual(color, "");
  assert.ok(clear.details.some(item => item.label === "MPN" && item.status === "protected"));

  let queueCalls = 0;
  context.EbayQueuePage = {
    handles: type => type === "AI_QUEUE_GET_STATUS_V701",
    async handleMessage() { queueCalls += 1; return { ok: true, message: "queue delegated" }; }
  };
  const queue = (await send({ type: "AI_QUEUE_GET_STATUS_V701" })).response;
  assert.strictEqual(queue.ok, true);
  assert.strictEqual(queue.message, "queue delegated");
  assert.strictEqual(queueCalls, 1);

  let helperCalls = 0;
  context.EbayHelperRuntimeV8130 = {
    handleMessage(message, _sender, sendResponse) {
      if (message.type !== "READ_EBAY_PHOTOS_V5") return false;
      helperCalls += 1;
      sendResponse({ ok: true, message: "helper delegated" });
      return false;
    },
    requestStop() {}
  };
  const helper = (await send({ type: "READ_EBAY_PHOTOS_V5" })).response;
  assert.strictEqual(helper.ok, true);
  assert.strictEqual(helper.message, "helper delegated");
  assert.strictEqual(helperCalls, 1);

  assert.strictEqual(context.EbayAiFillEngineV790.operationStatus(), null, "operation lock must release after Clear All");
  console.log("PASS V8.23.21 single page router: core Clear All + Queue + Helper delegation with UPC/MPN protection");
})().catch(error => { console.error(error); process.exit(1); });
