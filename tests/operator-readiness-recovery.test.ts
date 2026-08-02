import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  readinessRecoveryProtectionReason,
  terminalQueueStatusForProspect,
} from "../lib/operator-readiness-recovery";
import type { OutreachQueueItem } from "../lib/autonomous-growth";

type RecoveryInput = Pick<OutreachQueueItem, "status" | "sentDate" | "replyStatus" | "notes" | "blockedReason">;

function recoveryInput(overrides: Partial<RecoveryInput> = {}): RecoveryInput {
  return {
    status: "Queued",
    sentDate: "",
    replyStatus: "",
    notes: "",
    blockedReason: "",
    ...overrides,
  };
}

test("closed prospect statuses reconcile to historical queue statuses", () => {
  assert.equal(terminalQueueStatusForProspect("Closed Lost"), "Lost");
  assert.equal(terminalQueueStatusForProspect("Closed Won"), "Won");
  assert.equal(terminalQueueStatusForProspect("Reviewed"), "");
});

test("bounded readiness recovery allows an unsent queued draft with empty notes", () => {
  assert.equal(readinessRecoveryProtectionReason(recoveryInput()), "");
});

test("bounded readiness recovery preserves sent, ambiguous, and historical records", () => {
  assert.match(readinessRecoveryProtectionReason(recoveryInput({ sentDate: new Date().toISOString() })), /Sent records/i);
  assert.match(readinessRecoveryProtectionReason(recoveryInput({ notes: "[auto-email-ambiguous]" })), /Ambiguous provider outcomes/i);
  assert.match(readinessRecoveryProtectionReason(recoveryInput({ status: "Sent" })), /protected from readiness recovery/i);
  assert.match(readinessRecoveryProtectionReason(recoveryInput({ notes: "Prospect opted out" })), /history is protected/i);
});

test("Operator Test Center routes copy regeneration and safe repair through bounded recovery", () => {
  const route = readFileSync("app/api/engine/operator-test-center/route.ts", "utf8");
  assert.match(route, /regenerateOperatorUnsentOutreachCopyWithRecovery/);
  assert.match(route, /runSafeReadinessRepairWithRecovery/);
  assert.match(route, /payload\.action === "regenerate_unsent_outreach_copy"[\s\S]+regenerateOperatorUnsentOutreachCopyWithRecovery/);
  assert.match(route, /payload\.action === "run_safe_readiness_repair"[\s\S]+runSafeReadinessRepairWithRecovery/);
});

test("recovery re-reads and revalidates the live row before a serializable guarded update", () => {
  const source = readFileSync("lib/operator-readiness-recovery.ts", "utf8");
  assert.match(source, /outreachQueueItem\.findUnique\(\{ where: \{ id: item\.id \} \}\)/);
  assert.match(source, /const currentItem = currentRecoveryItem\(item, row\)/);
  assert.match(source, /safeReadinessRepairProtectionReason\(currentItem, prospect\.status\)/);
  assert.match(source, /outreachCopyRegenerationEligibility\(currentItem\)/);
  assert.match(source, /outreachQueueItem\.updateMany\(\{[\s\S]{0,240}id: currentItem\.id,[\s\S]{0,120}status: currentItem\.status,[\s\S]{0,120}sentDate: null/);
  assert.doesNotMatch(source, /outreachQueueItem\.updateMany\(\{[\s\S]{0,260}updatedAt:\s*row\.updatedAt/);
  assert.match(source, /isolationLevel:\s*"Serializable"/);
  assert.doesNotMatch(source, /updatedAt: new Date\(item\.updatedAt\)/);
  assert.doesNotMatch(source, /notes:\s*\{\s*contains:\s*ambiguousOutcomeMarker/);
  assert.match(source, /Approval removed when present\. Nothing was sent\./);
});
