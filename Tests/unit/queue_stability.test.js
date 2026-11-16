const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const background = fs.readFileSync("Extension/background.js", "utf8");
const queueControls = fs.readFileSync("Extension/ui/queue-controls/queue-controls.js", "utf8");
const queueUi = fs.readFileSync("Extension/ui/queue-panel/queue-panel.js", "utf8");

const start = background.indexOf("function queueCleanTextV710");
const end = background.indexOf("function queueTodayKeyV710", start);
assert.ok(start >= 0 && end > start, "queue failure helper block must exist");

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${background.slice(start, end)}\nthis.api = { queueRunnerErrorV8231, queueFailureInfoV8231, queueResultFailureMessageV8231 };`, sandbox);
const { queueRunnerErrorV8231, queueFailureInfoV8231, queueResultFailureMessageV8231 } = sandbox.api;

const daily = queueRunnerErrorV8231("DAILY_BUDGET_BLOCKED", "Daily API budget would be exceeded.", "queue");
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(queueFailureInfoV8231(daily))),
  { scope: "queue", code: "DAILY_BUDGET_BLOCKED", message: "Daily API budget would be exceeded." }
);
assert.strictEqual(queueFailureInfoV8231(new Error("OpenAI HTTP 401 Unauthorized")).scope, "queue");
assert.strictEqual(queueFailureInfoV8231(new Error("HTTP 429 rate limit exceeded")).code, "API_RATE_LIMIT");
assert.strictEqual(queueFailureInfoV8231(new Error("Field menu did not open.")).scope, "item");
assert.strictEqual(
  queueResultFailureMessageV8231({ fill: { ok: false, message: "Exact dropdown value was not verified." }, message: "generic" }, "summary"),
  "Exact dropdown value was not verified."
);

const blockStart = background.indexOf("async function queueBlockRunnerV8231");
const blockEnd = background.indexOf("function queueSameSelectionV8231", blockStart);
assert.ok(blockStart >= 0 && blockEnd > blockStart, "queue blocker function must exist");
vm.runInContext(`this.queueSetRunnerStateV710 = async state => state; ${background.slice(blockStart, blockEnd)} this.block = queueBlockRunnerV8231;`, sandbox);

(async () => {
  const state = {
    status: "running", currentIndex: 1, processingLease: { draftId: "B" },
    items: [
      { draftId: "A", processStatus: "completed", message: "done" },
      { draftId: "B", processStatus: "analyzing", message: "working" },
      { draftId: "C", processStatus: "pending", message: "waiting" }
    ]
  };
  const blocked = await sandbox.block(state, state.items[1], daily);
  assert.strictEqual(blocked.status, "blocked");
  assert.strictEqual(blocked.currentIndex, 1, "queue blocker must not advance to the next draft");
  assert.strictEqual(blocked.items[1].processStatus, "pending");
  assert.strictEqual(blocked.items[2].processStatus, "pending");
  assert.strictEqual(blocked.items.filter(item => item.processStatus === "error").length, 0, "queue blocker must not create per-draft errors");
  assert.ok(blocked.lastMessage.includes("2 draft(s) remain pending"));

  assert.ok(background.includes('throw queueRunnerErrorV8231("DAILY_BUDGET_BLOCKED"'), "daily budget must be a structured queue blocker");
assert.ok(background.includes('throw queueRunnerErrorV8231("MONTHLY_BUDGET_BLOCKED"'), "monthly budget must be a structured queue blocker");
assert.ok(background.includes('state.status = "blocked"'), "queue-level blocker must have a distinct blocked runner state");
assert.ok(background.includes('item.processStatus = "pending"'), "blocked current draft must remain pending instead of becoming an error");
assert.ok(background.includes('if (failure.scope === "queue")'), "catch path must distinguish queue-level blockers from per-item failures");
assert.ok(background.includes('queueSameSelectionV8231(existing.items, items)'), "Start must resume an unchanged blocked queue instead of restarting completed drafts");
assert.ok(queueControls.includes('queuePopupMessage'), "Queue controls must show the exact per-draft failure message");
assert.ok(queueUi.includes('aiq-item-message'), "in-page queue must show the exact per-draft failure message");
  assert.ok(/===\s*\"blocked\"\s*\?\s*\"Blocked\"/.test(queueUi), "in-page queue must visibly distinguish blocked from ready");

  console.log("PASS V8.23.21 Queue Stability: global blockers stop once, drafts remain pending, resume is preserved, and per-draft reasons are visible");
})().catch(error => { console.error(error); process.exitCode = 1; });
