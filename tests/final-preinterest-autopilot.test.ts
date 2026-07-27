import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  autopilotQueueKeyForItem,
  autopilotQueueLabels,
  autopilotTopProspectInput,
  defaultAutopilotCampaignSettings,
  normalizeAutopilotCampaignSettings,
  runFakeAutopilotSmokeTest,
  createAutopilotCampaign,
} from "../lib/autopilot-campaign";
import { feedbackReview } from "../lib/autonomous-growth-repository";
import type { OutreachQueueItem } from "../lib/autonomous-growth";

function queueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  return {
    id: "preinterest-item", prospectId: "prospect-1", topProspectResultId: "result-1", businessName: "Sample Roofing", trade: "Roofing", city: "Toledo, OH", website: "https://example.com", email: "owner@example.com", contactSource: "Public email", contactConfidence: 90,
    previewLink: "", previewQualityScore: 0, subjectLine: "Quick website idea", emailBody: "Permission-first email", dmScript: "", loomTalkingPoints: "", eligibilityReason: "Verified public email and truthful first-touch draft.", blockedReason: "", reviewScore: 82, reviewSummary: "Ready for human email review.",
    improvementSuggestions: ["Preview needs stronger imagery."], detectedIssues: ["Preview quality is below 85."], recommendedNextAction: "Regenerate Preview", regenerationPlan: ["regenerate preview"], rewritePlan: [], feedbackLabels: [], status: "Eligible", sourceProvider: "Top Prospects", queuedDate: "", sentDate: "", followUpDate: "", replyStatus: "", notes: "", outreachCopyVersion: "manual_lovable_permission_first_v3", outreachCopyGeneratedAt: new Date(0).toISOString(), previewVersion: "", lastRegeneratedAt: "", createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test("preview-free first-touch records route by email readiness rather than preview score", () => {
  assert.equal(autopilotQueueKeyForItem({ status: "Eligible", contactSource: "Public email", previewQualityScore: 0, blockedReason: "", email: "owner@example.com" }), "emailDraftReady");
  assert.equal(autopilotQueueKeyForItem({ status: "Needs Review", contactSource: "Public email", previewQualityScore: 0, blockedReason: "", email: "owner@example.com" }), "needsPreviewReview");
  assert.equal(autopilotQueueLabels.needsPreviewReview, "Needs Email Review");
  assert.equal(autopilotQueueKeyForItem({ status: "Preview Build Needed", contactSource: "Public email", previewQualityScore: 0, blockedReason: "", email: "owner@example.com" }), "loomNeeded");
});

test("legacy preview settings are normalized away and do not limit first-touch handoff", () => {
  const normalized = normalizeAutopilotCampaignSettings({ ...defaultAutopilotCampaignSettings, maxProspectsPerRun: 50, maxProspectsTotal: 7, maxPreviewsPerRun: 1, requirePreviewQuality85: true, stopRules: { ...defaultAutopilotCampaignSettings.stopRules, pauseAfterWeakPreviewCount: 9 } });
  assert.equal(normalized.maxPreviewsPerRun, 0);
  assert.equal(normalized.requirePreviewQuality85, false);
  assert.equal(normalized.stopRules.pauseAfterWeakPreviewCount, 0);
  assert.equal(autopilotTopProspectInput(normalized).finalProspectsWanted, 7);
});

test("fake Autopilot smoke test proves score-zero email readiness and manual post-interest routing", () => {
  const smoke = runFakeAutopilotSmokeTest(createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0)), new Date(1));
  assert.equal(smoke.passed, true);
  assert.equal(smoke.fixtureResults.find((item) => item.businessName === "Glass City Pressure Washing")?.actualQueue, "emailDraftReady");
  assert.equal(smoke.fixtureResults.find((item) => item.businessName === "Bowling Green Cleaning")?.actualQueue, "loomNeeded");
});

test("pre-interest feedback ignores preview score and preview feedback", () => {
  const reviewed = feedbackReview(queueItem(), ["Preview looked bad"]);
  assert.notEqual(reviewed.recommendedNextAction, "Regenerate Preview");
  assert.deepEqual(reviewed.regenerationPlan, []);
  assert.equal(reviewed.detectedIssues.some((issue) => /preview/i.test(issue)), false);
  assert.equal(reviewed.improvementSuggestions.some((suggestion) => /preview/i.test(suggestion)), false);
  assert.equal(reviewed.reviewScore, 82);
});

test("post-interest feedback can still request preview polish", () => {
  const reviewed = feedbackReview(queueItem({ status: "Preview Build Needed" }), ["Preview looked bad"]);
  assert.equal(reviewed.recommendedNextAction, "Regenerate Preview");
  assert.ok(reviewed.regenerationPlan.length > 0);
});

test("Autopilot UI no longer exposes pre-interest preview controls or preview-first wording", () => {
  const workspace = readFileSync("components/engine/AutonomousGrowthWorkspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /!settings\.requirePreviewQuality85/);
  assert.doesNotMatch(workspace, /Previews generated|Previews passing QA|Needs Preview Review|prepares prospects, previews|Pause after weak previews|Require preview QA|Legacy\/post-interest preview cap/);
  assert.match(workspace, /First-touch packages generated/);
  assert.match(workspace, /Needs Email Review/);
});
