import assert from "node:assert/strict";
import test from "node:test";
import { currentOutreachCopyVersion, evaluateQueuedEmailSendReadiness, type OutreachQueueItem } from "../lib/autonomous-growth";
import {
  getAutonomousGrowthSettings,
  listOutreachQueueItemsForBackfill,
  resetAutonomousGrowthMemoryForTests,
  setOutreachQueueMemoryForTests,
  updateAutonomousGrowthSettings,
} from "../lib/autonomous-growth-repository";
import { executeOperatorCommand } from "../lib/operator-command-center";
import { resetOperationalMemoryForTests } from "../lib/operational-controls";
import { listProspects, resetProspectMemoryForTests, setProspectMemoryForTests } from "../lib/prospect-repository";
import { applyLegacyOutreachBackfill, previewLegacyOutreachBackfill, prospectOutreachNeedsCurrentScript } from "../lib/legacy-outreach-backfill";
import { seedProspects, withAnalysis, withOutreach, withPreview, type Prospect } from "../lib/prospect-engine";
import { publicProspectPreviewLink } from "../lib/top-prospects";

process.env.WEBWORKSHOP_POSTAL_ADDRESS ??= "123 Main St, Toledo, OH";

const publicLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");

function legacyProspect(overrides: Partial<Prospect> = {}): Prospect {
  const generatedAt = new Date(1).toISOString();
  const prospect = withPreview(withAnalysis(structuredClone(seedProspects[0])));
  return {
    ...prospect,
    id: "legacy-prospect",
    businessName: "Legacy Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa",
    state: "FL",
    email: "owner@legacypressurewashing.com",
    recommendedContactMethod: "send_email",
    outreach: {
      subjects: ["Old website idea"],
      concise: `Hi Legacy Pressure Washing team,\n\nHere is the preview: ${publicLink}\n\nWould you be open to a quick 10-minute call?\n\nThanks,\nBrendan\nWebWorkshop\n[Add your business postal address before sending]`,
      detailed: `Old detailed draft with ${publicLink}`,
      followUps: ["Old follow-up"],
      approved: true,
      generatedAt,
      outreachCopyVersion: "old_audit_copy_v0",
      outreachCopyGeneratedAt: generatedAt,
    },
    ...overrides,
  };
}

function queueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  const now = new Date(2).toISOString();
  return {
    id: "queue-legacy",
    prospectId: "legacy-prospect",
    topProspectResultId: "legacy-result",
    businessName: "Legacy Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa, FL",
    website: "https://legacypressurewashing.com",
    email: "owner@legacypressurewashing.com",
    contactSource: "Public email",
    contactConfidence: 90,
    previewLink: publicLink,
    previewQualityScore: 90,
    subjectLine: "Old website idea",
    emailBody: `Hi Legacy Pressure Washing team,\n\nHere is the preview: ${publicLink}\n\nWould you be open to a quick 10-minute call?`,
    dmScript: "Old DM",
    loomTalkingPoints: "Old Loom",
    eligibilityReason: "Old eligible reason",
    blockedReason: "",
    reviewScore: 90,
    reviewSummary: "",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Needs Human Review",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Eligible",
    sourceProvider: "Legacy test",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    outreachCopyVersion: "old_audit_copy_v0",
    outreachCopyGeneratedAt: now,
    previewVersion: "preview-v1",
    lastRegeneratedAt: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("legacy Prospect drafts are detected and preview backfill makes no changes", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  setProspectMemoryForTests([legacyProspect()]);
  setOutreachQueueMemoryForTests([]);

  const before = await listProspects();
  const preview = await previewLegacyOutreachBackfill();
  const after = await listProspects();

  assert.equal(prospectOutreachNeedsCurrentScript(before[0]).needsUpdate, true);
  assert.equal(preview.updated.prospectDrafts, 1);
  assert.equal(preview.updated.newReviewPackagesCreated, 1);
  assert.deepEqual(after, before);
  assert.equal((await listOutreachQueueItemsForBackfill()).length, 0);
});

test("legacy backfill apply requires confirmation and never sends outreach", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  setProspectMemoryForTests([legacyProspect()]);
  setOutreachQueueMemoryForTests([]);

  const blocked = await applyLegacyOutreachBackfill();

  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.safety.emailsSent, 0);
  assert.match(blocked.copyForChatGPT, /Emails sent: 0/);
  assert.equal((await listProspects())[0].outreach?.outreachCopyVersion, "old_audit_copy_v0");
});

test("confirmed legacy backfill syncs Prospect and queue copy from the current generator", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  setProspectMemoryForTests([legacyProspect()]);
  setOutreachQueueMemoryForTests([queueItem()]);

  const applied = await applyLegacyOutreachBackfill({ confirmed: true });
  const [prospect] = await listProspects();
  const [queue] = await listOutreachQueueItemsForBackfill();

  assert.equal(applied.status, "completed");
  assert.equal(prospect.outreach?.outreachCopyVersion, currentOutreachCopyVersion);
  assert.equal(prospect.outreach?.approved, false);
  assert.equal(queue.outreachCopyVersion, currentOutreachCopyVersion);
  assert.equal(queue.emailBody, prospect.outreach?.concise);
  assert.doesNotMatch(queue.emailBody, /https:\/\/webworkshop\.dev\/p\/|10-minute call|\[Add your business postal address/i);
  assert.match(prospect.outreach?.detailed ?? "", /https:\/\/webworkshop\.dev\/p\//);
  assert.equal(applied.safety.dmsSent, 0);
});

test("qualified Prospect missing queue item receives review-only package without duplicate queue items", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const prospect = {
    ...withOutreach(withPreview(withAnalysis(structuredClone(seedProspects[0])))),
    id: "missing-queue-prospect",
    website: "https://missingqueue.com",
    email: "owner@missingqueue.com",
    recommendedContactMethod: "send_email" as const,
  };
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([]);

  await applyLegacyOutreachBackfill({ confirmed: true });
  await applyLegacyOutreachBackfill({ confirmed: true });
  const queue = await listOutreachQueueItemsForBackfill();

  assert.equal(queue.length, 1);
  assert.equal(queue[0].prospectId, "missing-queue-prospect");
  assert.notEqual(queue[0].status, "Queued");
  assert.equal(queue[0].sentDate, "");
});

test("outdated queue copy cannot be moved to Queued and current copy can use normal gates", async () => {
  resetAutonomousGrowthMemoryForTests();
  await updateAutonomousGrowthSettings({
    mode: "auto_email_pilot",
    killSwitch: false,
    targetCities: [],
    targetServiceAreas: [],
    targetTrades: [],
    excludedTrades: [],
    maxProspectsScannedPerDay: 25,
    maxPreviewsGeneratedPerDay: 10,
    maxEmailsQueuedPerDay: 5,
    maxEmailsSentPerDay: 5,
    emailCooldownMinutes: 7,
    followUpsEnabled: false,
    styleProfiles: {},
    updatedAt: new Date().toISOString(),
  });
  const old = queueItem({ status: "Queued", queuedDate: new Date().toISOString() });
  const blocked = evaluateQueuedEmailSendReadiness({
    environment: {
      WEBWORKSHOP_POSTAL_ADDRESS: "123 Main St, Toledo, OH",
      OUTREACH_SEND_PROVIDER: "resend",
      RESEND_API_KEY: "test",
      OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
      OUTREACH_REPLY_TO_EMAIL: "hello@webworkshop.dev",
      OUTREACH_EMAIL_DISABLED: "false",
      OUTREACH_AUTO_SEND_ENABLED: "true",
    } as NodeJS.ProcessEnv,
    item: old,
    queue: [old],
    settings: await getAutonomousGrowthSettings(),
  });

  assert.equal(blocked.ready, false);
  assert.match(blocked.blockedReasons.join(" "), /outdated|permission before sending|10-minute call|placeholder/i);
});

test("operator commands preview legacy backfill with secret-safe no-send receipt", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  process.env.RESEND_API_KEY = "sk-secret-legacy-backfill";
  setProspectMemoryForTests([legacyProspect()]);
  setOutreachQueueMemoryForTests([]);

  const result = await executeOperatorCommand("COMMAND: PREVIEW_LEGACY_OUTREACH_BACKFILL\nACTION: EXECUTE", { mode: "command" });

  assert.equal(result.receipt.status, "completed");
  assert.match(result.receipt.copyForChatGPT, /Legacy Outreach Backfill Result/);
  assert.equal(result.receipt.outreachSent.emails, 0);
  assert.doesNotMatch(JSON.stringify(result.receipt), /sk-secret-legacy-backfill/);
  delete process.env.RESEND_API_KEY;
});
