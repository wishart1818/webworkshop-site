import assert from "node:assert/strict";
import test from "node:test";
import { currentOutreachCopyVersion } from "../lib/autonomous-growth";
import {
  prepareReadinessRepairCandidates,
  type ReadinessRepairCandidate,
  type ReadinessRepairRecoveryDependencies,
} from "../lib/readiness-repair-recovery";

function candidate(overrides: Partial<ReadinessRepairCandidate> = {}): ReadinessRepairCandidate {
  return {
    id: "queue-candidate",
    prospectId: "prospect-candidate",
    status: "Needs Review",
    updatedAt: new Date("2026-07-28T22:00:00.000Z"),
    sentDate: null,
    replyStatus: null,
    notes: null,
    outreachCopyVersion: "standardized_permission_first_v2",
    ...overrides,
  };
}

test("readiness recovery normalizes legacy null notes and aligns a linked Closed Lost record", async () => {
  const candidates = [
    candidate({ id: "pinnacle", prospectId: "pinnacle-prospect" }),
    candidate({ id: "roger", prospectId: "roger-prospect", notes: "Bad fit — established website." }),
    candidate({ id: "current", prospectId: "current-prospect", outreachCopyVersion: currentOutreachCopyVersion }),
    candidate({ id: "ambiguous", prospectId: "ambiguous-prospect", notes: "[auto-email-ambiguous] provider result" }),
  ];
  const normalized: string[] = [];
  const badFit: string[] = [];
  const statuses = new Map([
    ["pinnacle-prospect", "REVIEWED"],
    ["roger-prospect", "CLOSED_LOST"],
    ["current-prospect", "REVIEWED"],
    ["ambiguous-prospect", "REVIEWED"],
  ]);

  const dependencies: ReadinessRepairRecoveryDependencies = {
    listCandidates: async () => structuredClone(candidates),
    readProspectStatus: async (prospectId) => statuses.get(prospectId) ?? "",
    normalizeNullNotes: async (item) => {
      normalized.push(item.id);
      return true;
    },
    markBadFit: async (queueItemId) => {
      badFit.push(queueItemId);
      return true;
    },
  };

  const result = await prepareReadinessRepairCandidates(dependencies);

  assert.deepEqual(normalized, ["pinnacle"]);
  assert.deepEqual(badFit, ["roger"]);
  assert.equal(result.inspected, 3);
  assert.equal(result.normalizedNullNotes, 1);
  assert.equal(result.alignedClosedLost, 1);
  assert.equal(result.skipped, 1);
});

test("readiness recovery leaves non-reviewable prospect statuses unchanged", async () => {
  let normalized = false;
  let badFit = false;
  const dependencies: ReadinessRepairRecoveryDependencies = {
    listCandidates: async () => [candidate()],
    readProspectStatus: async () => "CONTACTED",
    normalizeNullNotes: async () => {
      normalized = true;
      return true;
    },
    markBadFit: async () => {
      badFit = true;
      return true;
    },
  };

  const result = await prepareReadinessRepairCandidates(dependencies);

  assert.equal(normalized, false);
  assert.equal(badFit, false);
  assert.equal(result.inspected, 1);
  assert.equal(result.skipped, 1);
});
