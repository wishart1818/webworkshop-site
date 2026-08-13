import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  attemptOutreachCopyRegeneration,
  genericOutreachRegenerationReason,
  staleWebsiteFitRegenerationReason,
} from "../lib/outreach-regeneration-guard";

test("stale website-fit regeneration fails closed without exposing private error text", () => {
  const warnings: Array<{ message: string; details: Record<string, string> }> = [];
  const result = attemptOutreachCopyRegeneration({
    queueItemId: "queue-stale-1",
    prospectId: "prospect-stale-1",
    regenerate: () => {
      throw new Error("The current evidence does not support website-rebuild outreach. Review and save an eligible website-fit decision before generating a draft.");
    },
    warn: (message, details) => warnings.push({ message, details }),
  });

  assert.deepEqual(result, { ok: false, reason: staleWebsiteFitRegenerationReason });
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0]?.details, {
    queueItemId: "queue-stale-1",
    prospectId: "prospect-stale-1",
    error: "Error",
  });
  assert.doesNotMatch(JSON.stringify(warnings), /website-rebuild outreach|eligible website-fit decision/i);
});

test("unexpected regeneration failures also fail closed and successful regeneration returns its value", () => {
  const failed = attemptOutreachCopyRegeneration({
    queueItemId: "queue-generic-1",
    regenerate: () => {
      throw new TypeError("unexpected fixture failure");
    },
    warn: () => undefined,
  });
  assert.deepEqual(failed, { ok: false, reason: genericOutreachRegenerationReason });

  const succeeded = attemptOutreachCopyRegeneration({
    queueItemId: "queue-good-1",
    prospectId: "prospect-good-1",
    regenerate: () => ({ subjectLine: "safe regenerated copy" }),
    warn: () => undefined,
  });
  assert.deepEqual(succeeded, { ok: true, value: { subjectLine: "safe regenerated copy" } });
});

test("Autopilot start awaits the handoff and both regeneration loops use the fail-closed guard", () => {
  const route = readFileSync("app/api/engine/autonomous-growth/route.ts", "utf8");
  const repository = readFileSync("lib/autonomous-growth-repository.ts", "utf8");

  assert.match(route, /return await startAutopilotTopProspectsHandoff\(request, settings\);/);
  const guardUses = repository.match(/attemptOutreachCopyRegeneration\(/g) ?? [];
  assert.ok(guardUses.length >= 2, "expected memory and database regeneration paths to use the guard");
});
