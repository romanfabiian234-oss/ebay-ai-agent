const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const background = fs.readFileSync("Extension/background.js", "utf8");

const start = background.indexOf("function queueTicketV8232");
const end = background.indexOf("const QUEUE_DEFAULT_SETTINGS_V710", start);
assert.ok(start >= 0 && end > start, "V8.23.21 queue transition gate must exist");

const sandbox = {
  queueCleanTextV710(value, limit = 500) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
  },
  setTimeout,
  clearTimeout,
  Promise,
  Map,
  Date,
  Math,
  Number,
  String,
  Boolean
};
vm.createContext(sandbox);
vm.runInContext(`${background.slice(start, end)}\nthis.api = { queueTicketV8232, queueTicketMatchesV8232, queueTransitionDecisionV8232 };`, sandbox);
const { queueTicketV8232, queueTicketMatchesV8232, queueTransitionDecisionV8232 } = sandbox.api;

const run = "run-123";
const A = queueTicketV8232(run, "draft-A");
const B = queueTicketV8232(run, "draft-B");
const C = queueTicketV8232(run, "draft-C");

assert.strictEqual(queueTransitionDecisionV8232(A, null, A), "start", "first draft must start");
assert.strictEqual(queueTransitionDecisionV8232(A, A, A), "duplicate", "onUpdated + fallback for the same draft must not create pending work");
assert.strictEqual(queueTransitionDecisionV8232(B, A, A), "stale", "late wake-up from draft A must be ignored after state advanced to B");
assert.strictEqual(queueTransitionDecisionV8232(B, A, B), "pending", "draft B may queue behind the still-finishing A worker");
assert.strictEqual(queueTransitionDecisionV8232(B, null, B), "start", "draft B must start after A releases the tab lock");
assert.strictEqual(queueTransitionDecisionV8232(C, B, B), "stale", "late B event must not start C");
assert.strictEqual(queueTransitionDecisionV8232(C, B, C), "pending", "draft C may queue behind B");
assert.strictEqual(queueTransitionDecisionV8232(C, null, C), "start", "third sequential draft must start exactly on its own ticket");
assert.strictEqual(queueTicketMatchesV8232(A, queueTicketV8232("other-run", "draft-A")), false, "old run events must not wake a new run");

assert.ok(background.includes("QUEUE_PENDING_TICKETS_V8232 = new Map()"), "pending work must keep run+draft identity, not a tab-only Set");
assert.ok(background.includes("QUEUE_ACTIVE_TICKETS_V8232 = new Map()"), "active work must keep run+draft identity");
assert.ok(!background.includes("QUEUE_PENDING_TABS_V801"), "obsolete tab-only pending flag must be removed");
assert.ok(background.includes("queueWaitForExpectedDraftReadyV8232"), "each draft transition must verify page readiness");
assert.ok(background.includes('type: "CONTENT_BRIDGE_PING_V890"'), "readiness must use the lightweight content bridge instead of a blind sleep");
assert.ok(background.includes("actualDraftId === expected.draftId"), "readiness must validate the exact draft URL");
assert.ok(background.includes("bridgeDraftId === expected.draftId"), "readiness must reject an old content script that answers during navigation");
const content = fs.readFileSync("Extension/content.js", "utf8");
assert.ok(content.includes("actualDraftId: PLATFORM === \"ebay\""), "content bridge ping must report the document draft ID");
assert.ok(background.includes("queueScheduleRunnerTabV8232(tab.id, 0, queueTicketV8232(state.runId, next.draftId))"), "advance must explicitly schedule the next draft ticket");
assert.ok(background.includes("queueScheduleCurrentDraftV8232(tabId, draftId, 0)"), "tab-ready events must be scoped to the current draft");
assert.ok(background.includes("if (actualDraftId !== item.draftId)"), "service-worker resume must reopen the persisted expected draft if the reused tab is still on another draft");
assert.ok(!background.includes("QUEUE_START_FALLBACK_DELAY_MS_V801 = 5000"), "fixed five-second start delay must be removed");
assert.ok(background.includes("if (decision === \"stale\" || decision === \"duplicate\") return;"), "stale and duplicate wake-ups must be ignored before analysis");

console.log("PASS V8.23.21 Queue Transition Stability: 3 sequential drafts, duplicate signals, stale prior-draft events, run isolation, and state-based readiness are guarded");
