# PATCH NOTES — V8.23.6

## Fast Strict Verification

### Root cause confirmed
Real V8.23.5 Queue runs showed strict verification still consuming roughly 11–14 seconds while Fill/Save were already fast. Static inspection confirmed that Balanced recovery was still using MEDIUM reasoning even though the recovery task is a bounded re-read of direct evidence.

### Change
- Balanced/Cheap strict-verification recovery: MEDIUM -> LOW reasoning.
- Quality strict verification remains HIGH.

### Deliberately unchanged
- strict-field selection / smart verification policy;
- 40-field hard verification cap;
- one bounded recovery GPT request;
- evidence-aware repair photo selection;
- HIGH-detail recovery images;
- normal 3/4 repair-photo selection and hard cap of 5;
- recovery timeout;
- output-token headroom;
- strict verifier does not receive the primary candidate value;
- Fill Engine, Queue transition, Show More readiness, photo transfer and protected-field policy.

### Why output tokens were NOT reduced
Reasoning tokens share the generated-token/output budget for reasoning models. Shrinking the recovery output limit in the same patch could create incomplete responses and would mix two latency variables. V8.23.6 therefore keeps the existing recovery output headroom and changes reasoning effort only.

### Acceptance test
Run Queue on 3–5 representative real drafts and compare against V8.23.5:
- strict-verification seconds;
- AI total seconds;
- strict field count / photo count;
- Filled / Review counts;
- any disagreement or missed strict facts.
