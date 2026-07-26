import assert from "node:assert/strict";
import test from "node:test";
import {
  learningSummaryForQueue,
  loomNeededTaskForQueueItem,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";

function queueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  return {
    id: "item-1",
    prospectId: "prospect-1",
    topProspectResultId: "result-1",
    businessName: "Sample Roofing",
    trade: "Roofing",
    city: "Toledo, OH",
    website: "",
    email: "hello@example.com",
    contactSource: "Public email",
    contactConfidence: 90,
    previewLink: "https://sample-roofing.lovable.app",
    previewQualityScore: 0,
    subjectLine: "Quick website idea",
    emailBody: "Permission-first email",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Verified public email and website opportunity.",
    blockedReason: "",
    reviewScore: 82,
    reviewSummary: "Strong lead with a clear quote-path opportunity.",
    improvementSuggestions: ["Preview shows a clearer quote path."],
    detectedIssues: ["Current site has a weak quote path."],
    recommendedNextAction: "Needs Human Review",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Preview Build Needed",
    sourceProvider: "Top Prospects",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "prospect_said_yes",
    notes: "",
    outreachCopyVersion: "manual_lovable_permission_first_v3",
    outreachCopyGeneratedAt: new Date(0).toISOString(),
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test("a manually QA'd Lovable link can advance without an engine preview score", () => {
  const task = loomNeededTaskForQueueItem(queueItem());
  assert.equal(task.canMarkReadyForLoom, true);
  assert.equal(task.previewQuality, "Manual QA ready");

  const polish = loomNeededTaskForQueueItem(queueItem({ status: "Preview Needs Polish" }));
  assert.equal(polish.canMarkReadyForLoom, false);
  assert.equal(polish.previewQuality, "Manual QA needs polish");

  const missing = loomNeededTaskForQueueItem(queueItem({ previewLink: "" }));
  assert.equal(missing.canMarkReadyForLoom, false);
  assert.equal(missing.previewQuality, "Manual QA pending");
});

test("learning reply rates exclude bounces and prioritize real positive replies", () => {
  const queue = [
    queueItem({ id: "roof-positive", status: "Positive Reply", sentDate: new Date(1).toISOString(), replyStatus: "positive", reviewScore: 70 }),
    queueItem({ id: "roof-bounce", status: "Bounced", sentDate: new Date(2).toISOString(), replyStatus: "bounce", reviewScore: 95 }),
    queueItem({ id: "hvac-sent", trade: "HVAC", status: "Sent", sentDate: new Date(3).toISOString(), replyStatus: "", reviewScore: 100 }),
  ];
  const summary = learningSummaryForQueue(queue);
  const roofing = summary.replyRateByTrade.find((entry) => entry.trade === "Roofing");
  assert.deepEqual(roofing, { trade: "Roofing", replyRate: 50, positiveReplyRate: 50 });
  assert.equal(summary.bestPerformingTrades[0], "Roofing");
});
