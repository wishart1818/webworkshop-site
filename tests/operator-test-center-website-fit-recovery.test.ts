import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Operator Test Center falls back safely when bounded recovery hits stale website-fit evidence", () => {
  const route = readFileSync("app/api/engine/operator-test-center/route.ts", "utf8");

  assert.match(route, /instanceof OutreachWebsiteFitBlockedError/);
  assert.match(route, /payload\.action === "regenerate_unsent_outreach_copy"[\s\S]+regenerateOperatorUnsentOutreachCopyWithRecovery[\s\S]+regenerateOperatorUnsentOutreachCopy/);
  assert.match(route, /payload\.action === "run_safe_readiness_repair"[\s\S]+runSafeReadinessRepairWithRecovery[\s\S]+runSafeReadinessRepair/);
  assert.match(route, /falling back to per-record safe handling/);
});
