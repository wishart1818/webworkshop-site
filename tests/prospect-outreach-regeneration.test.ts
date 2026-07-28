import assert from "node:assert/strict";
import test from "node:test";
import type { OutreachQueueItem } from "../lib/autonomous-growth";
import {
  regenerateProspectOutreachWithConflictRecovery,
  type ProspectOutreachRegenerationDependencies,
} from "../lib/prospect-outreach-regeneration";
import { OUTREACH_COPY_VERSION, seedProspects, type Prospect } from "../lib/prospect-engine";

function testProspect(): Prospect {
  return {
    ...structuredClone(seedProspects[0]),
    id: "prospect-conflict-recovery",
    businessName: "Pinnacle Pressure Washing of Toledo",
    email: "nick@pinnacle419.com",
    website: "https://pinnacle419.com",
    recommendedContactMethod: "send_email",
    bestManualContactMethod: "email",
    status: "Reviewed",
    outreach: undefined,
  };
}

function testQueueItem(prospectId: string): OutreachQueueItem {
  return {
    id: "queue-conflict-recovery",
    prospectId,
    topProspectResultId: "legacy-package-conflict-recovery",
    businessName: "Stale Pinnacle Name",
    trade: "Pressure Washing",
    city: "Toledo, OH",
    website: "https://old.example.com",
    email: "old-recipient@example.com",
    contactSource: "Public email",
    contactConfidence: 90,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: "Old subject",
    emailBody: "Old body",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Legacy package",
    blockedReason: "",
    reviewScore: 70,
    reviewSummary: "Legacy review",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Needs Human Review",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Needs Review",
    sourceProvider: "Legacy Outreach Backfill",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "Nothing was sent.",
    outreachCopyVersion: "standardized_permission_first_v2",
    outreachCopyGeneratedAt: new Date(0).toISOString(),
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

test("outreach regeneration recovers from a linked-package conflict and refreshes the queue from the latest prospect", async () => {
  const prospect = testProspect();
  const queueItem = testQueueItem(prospect.id);
  let repairAttempts = 0;
  let refreshAttempts = 0;
  let savedProspect: Prospect | null = null;
  let refreshedFromProspect: Prospect | null = null;

  const dependencies: ProspectOutreachRegenerationDependencies = {
    regenerate: async () => {
      throw new Error("The review package changed before refresh completed. Refresh and try again.");
    },
    getProspect: async () => structuredClone(prospect),
    saveProspect: async (nextProspect) => {
      savedProspect = structuredClone(nextProspect);
      return structuredClone(nextProspect);
    },
    listQueueItems: async () => [structuredClone(queueItem)],
    repairQueueItem: async () => {
      repairAttempts += 1;
      if (repairAttempts === 1) {
        return {
          item: structuredClone(queueItem),
          changed: false,
          action: "regenerate_current_copy" as const,
          blockedReason: "The record changed before the safe repair completed.",
        };
      }
      return {
        item: {
          ...structuredClone(queueItem),
          outreachCopyVersion: OUTREACH_COPY_VERSION,
          emailBody: "Current permission-first body generated from the stale queue snapshot",
        },
        changed: true,
        action: "regenerate_current_copy" as const,
        blockedReason: "",
      };
    },
    refreshQueueItem: async (latestProspect) => {
      refreshAttempts += 1;
      refreshedFromProspect = structuredClone(latestProspect);
      return {
        ...structuredClone(queueItem),
        businessName: latestProspect.businessName,
        email: latestProspect.email,
        website: latestProspect.website,
        subjectLine: latestProspect.outreach?.subjects[0] ?? "",
        emailBody: latestProspect.outreach?.concise ?? "",
        outreachCopyVersion: latestProspect.outreach?.outreachCopyVersion ?? "",
      };
    },
  };

  const result = await regenerateProspectOutreachWithConflictRecovery(prospect.id, {}, dependencies);

  assert.equal(repairAttempts, 2);
  assert.equal(refreshAttempts, 1);
  assert.equal(result?.queueItem?.outreachCopyVersion, OUTREACH_COPY_VERSION);
  assert.equal(result?.queueItem?.businessName, prospect.businessName);
  assert.equal(result?.queueItem?.email, prospect.email);
  assert.equal(result?.queueItem?.website, prospect.website);
  assert.equal(result?.updatedProspect.outreach?.outreachCopyVersion, OUTREACH_COPY_VERSION);
  assert.equal(result?.updatedProspect.outreach?.approved, false);
  assert.match(result?.updatedProspect.activities[0]?.label ?? "", /Nothing was sent/);
  assert.equal(savedProspect?.outreach?.outreachCopyVersion, OUTREACH_COPY_VERSION);
  assert.equal(refreshedFromProspect?.email, prospect.email);
  assert.equal(result?.queueItem?.emailBody, refreshedFromProspect?.outreach?.concise);
});

test("protected prospect regeneration errors are not bypassed by conflict recovery", async () => {
  const prospect = testProspect();
  let repairCalled = false;
  let refreshCalled = false;

  const dependencies: ProspectOutreachRegenerationDependencies = {
    regenerate: async () => {
      throw new Error("Outreach cannot be regenerated after approval, sending, contact, or suppression.");
    },
    getProspect: async () => structuredClone(prospect),
    saveProspect: async (nextProspect) => structuredClone(nextProspect),
    listQueueItems: async () => [],
    repairQueueItem: async () => {
      repairCalled = true;
      return {
        item: null,
        changed: false,
        action: "regenerate_current_copy" as const,
        blockedReason: "Protected",
      };
    },
    refreshQueueItem: async () => {
      refreshCalled = true;
      return null;
    },
  };

  await assert.rejects(
    regenerateProspectOutreachWithConflictRecovery(prospect.id, {}, dependencies),
    /cannot be regenerated after approval/i,
  );
  assert.equal(repairCalled, false);
  assert.equal(refreshCalled, false);
});

test("preview-only regeneration never mutates records through conflict recovery", async () => {
  const prospect = testProspect();
  let saved = false;
  let refreshCalled = false;

  const dependencies: ProspectOutreachRegenerationDependencies = {
    regenerate: async () => {
      throw new Error("Preview failed.");
    },
    getProspect: async () => structuredClone(prospect),
    saveProspect: async (nextProspect) => {
      saved = true;
      return structuredClone(nextProspect);
    },
    listQueueItems: async () => [],
    repairQueueItem: async () => ({
      item: null,
      changed: false,
      action: "regenerate_current_copy" as const,
      blockedReason: "",
    }),
    refreshQueueItem: async () => {
      refreshCalled = true;
      return null;
    },
  };

  await assert.rejects(
    regenerateProspectOutreachWithConflictRecovery(prospect.id, { previewOnly: true }, dependencies),
    /Preview failed/,
  );
  assert.equal(saved, false);
  assert.equal(refreshCalled, false);
});
