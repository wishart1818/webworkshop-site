from pathlib import Path
import re


def replace_exact(text: str, old: str, new: str, label: str, expected: int = 1) -> str:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} occurrence(s), found {count}")
    return text.replace(old, new)


def replace_regex(text: str, pattern: str, replacement: str, label: str, expected: int = 1) -> str:
    updated, count = re.subn(pattern, replacement, text, flags=re.S)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} regex replacement(s), found {count}")
    return updated


autopilot_path = Path("lib/autopilot-campaign.ts")
autopilot = autopilot_path.read_text()

autopilot = replace_exact(
    autopilot,
    '  needsPreviewReview: "Needs Preview Review",',
    '  needsPreviewReview: "Needs Email Review",',
    "rename review queue label",
)
autopilot = replace_exact(
    autopilot,
    '  loomNeeded: "Loom Needed",',
    '  loomNeeded: "Post-interest Preview / Loom",',
    "clarify post-interest queue label",
)
autopilot = replace_exact(autopilot, '  maxPreviewsPerRun: 20,', '  maxPreviewsPerRun: 0,', "retire default preview cap")
autopilot = replace_exact(autopilot, '  requirePreviewQuality85: true,', '  requirePreviewQuality85: false,', "retire default preview requirement")
autopilot = replace_exact(autopilot, '    pauseAfterWeakPreviewCount: 3,', '    pauseAfterWeakPreviewCount: 0,', "retire weak preview stop rule")
autopilot = replace_exact(
    autopilot,
    '    maxPreviewsPerRun: boundedNumber(input.maxPreviewsPerRun, defaults.maxPreviewsPerRun, 0, 50),',
    '    // Legacy persisted field retained for compatibility; pre-interest work no longer uses a preview cap.\n    maxPreviewsPerRun: 0,',
    "ignore legacy preview cap",
)
autopilot = replace_exact(
    autopilot,
    '    requirePreviewQuality85: input.requirePreviewQuality85 !== false,',
    '    // Legacy persisted field retained for compatibility; preview quality is post-interest only.\n    requirePreviewQuality85: false,',
    "ignore legacy preview requirement",
)
autopilot = replace_exact(
    autopilot,
    '      pauseAfterWeakPreviewCount: boundedNumber(stopRules.pauseAfterWeakPreviewCount, defaults.stopRules.pauseAfterWeakPreviewCount, 1, 25),',
    '      // Legacy persisted field retained for compatibility; no pre-interest preview stop rule is applied.\n      pauseAfterWeakPreviewCount: 0,',
    "ignore legacy preview stop rule",
)
autopilot = replace_exact(autopilot, '    maxPreviewsPerRun: 20,', '    maxPreviewsPerRun: 0,', "retire recommended preview cap")
autopilot = replace_exact(autopilot, '    requirePreviewQuality85: true,', '    requirePreviewQuality85: false,', "retire recommended preview requirement")
autopilot = replace_exact(
    autopilot,
    '  const finalProspectsWanted = Math.max(1, Math.min(25, settings.maxPreviewsPerRun || settings.maxProspectsTotal, settings.maxProspectsPerRun));',
    '  const finalProspectsWanted = Math.max(1, Math.min(25, settings.maxProspectsTotal, settings.maxProspectsPerRun));',
    "remove preview cap from handoff",
)

autopilot = replace_regex(
    autopilot,
    r'export function autopilotQueueKeyForItem\(item: Pick<OutreachQueueItem, "status" \| "contactSource" \| "previewQualityScore" \| "blockedReason" \| "email">\): AutopilotQueueKey \{.*?\n\}',
    '''export function autopilotQueueKeyForItem(item: Pick<OutreachQueueItem, "status" | "contactSource" | "previewQualityScore" | "blockedReason" | "email">): AutopilotQueueKey {
  void item.previewQualityScore;
  if (["Bad Fit", "Blocked", "Never Contact", "Opted Out", "Suppressed", "Bounced", "Complained", "Skipped"].includes(item.status) || /bad fit|supplier|institution|duplicate|mismatch/i.test(item.blockedReason)) {
    return "blockedBadFit";
  }
  if (["Prospect Said Yes", "Preview Build Needed", "Preview Needs Polish", "Loom Needed", "Ready for Loom", "Loom Recorded"].includes(item.status)) return "loomNeeded";
  if (!item.email && /phone|manual research/i.test(item.contactSource)) return "needsHumanResearch";
  if (item.status === "Needs Review" || item.status === "Draft") return "needsPreviewReview";
  if (/social|facebook|instagram|dm/i.test(item.contactSource) || item.status === "DM Draft" || item.status === "First DM Sent") return "readyForManualDm";
  return "emailDraftReady";
}''',
    "replace autopilot queue routing",
)
autopilot = replace_exact(
    autopilot,
    '    settings.requirePreviewQuality85 ? "Preview QA threshold is 85+ before review-ready outreach." : "Preview QA threshold is not enforced by this campaign.",',
    '    "Preview generation and preview scoring are not required before interest.",',
    "replace preview safety finding",
)
autopilot = replace_regex(
    autopilot,
    r'function topProspectQueueCounts\(job: TopProspectJob\): AutopilotQueueCounts \{.*?\n\}\n\nfunction packagesGeneratedFromTopProspectJob',
    '''function topProspectQueueCounts(job: TopProspectJob): AutopilotQueueCounts {
  const counts = emptyAutopilotQueueCounts();
  for (const result of job.results) {
    const prospect = result.prospect;
    if (/facebook|instagram/i.test(prospect.profileUrl || "") || prospect.classification === "social_only") {
      counts.readyForManualDm += 1;
    } else if (prospect.email || prospect.contactFormUrl) {
      if (result.emailQuality.ready) counts.emailDraftReady += 1;
      else counts.needsPreviewReview += 1;
    } else if (prospect.phone) {
      counts.needsHumanResearch += 1;
    } else {
      counts.needsHumanResearch += 1;
    }
  }
  counts.blockedBadFit = Math.max(0, job.skippedCount + job.reviewedNotRecommended.length);
  return counts;
}

function packagesGeneratedFromTopProspectJob''',
    "replace top prospect queue counts",
)
autopilot = replace_exact(autopilot, '} as Prospect, { status: "Eligible", previewQualityScore: 91 }),', '} as Prospect, { status: "Eligible", previewQualityScore: 0 }),', "make ready fixture preview-free")
autopilot = replace_exact(autopilot, '      id: "fixture-weak-preview",', '      id: "fixture-email-review",', "rename review fixture")
autopilot = replace_exact(
    autopilot,
    '} as Prospect, { status: "Needs Review", previewQualityScore: 74, detectedIssues: ["Preview quality is below 85."] }),',
    '} as Prospect, { status: "Needs Review", previewQualityScore: 0, detectedIssues: ["First-touch email needs human review."] }),',
    "make review fixture email-based",
)
autopilot = replace_exact(autopilot, '} as Prospect, { status: "Loom Needed", previewQualityScore: 92 }),', '} as Prospect, { status: "Preview Build Needed", previewQualityScore: 0 }),', "make post-interest fixture manual-build based")
autopilot = replace_exact(autopilot, '["fixture-pressure-washing-email", "emailDraftReady", "Public email with strong preview becomes Email Draft Ready."],', '["fixture-pressure-washing-email", "emailDraftReady", "A valid public-email first touch is Email Draft Ready without a preview."],', "update ready fixture expectation")
autopilot = replace_exact(autopilot, '["fixture-weak-preview", "needsPreviewReview", "Weak preview is held for review."],', '["fixture-email-review", "needsPreviewReview", "A first-touch draft needing human review enters Needs Email Review."],', "update review fixture expectation")
autopilot = replace_exact(autopilot, '["fixture-loom-needed", "loomNeeded", "Prospect Said Yes style state stays in Loom Needed."],', '["fixture-loom-needed", "loomNeeded", "Post-interest manual preview work stays in the Preview / Loom queue."],', "update post-interest fixture expectation")
autopilot = replace_regex(
    autopilot,
    r'function countPreviewsPassingQa\(queue: OutreachQueueItem\[\], report: AutopilotRunReport\) \{.*?\n\}',
    '''function countFirstTouchDraftsReady(queue: OutreachQueueItem[], report: AutopilotRunReport) {
  if (!queue.length) return report.queueCounts.emailDraftReady;
  return queue.filter((item) => autopilotQueueKeyForItem(item) === "emailDraftReady").length;
}''',
    "replace preview QA counter",
)
autopilot = autopilot.replace("countPreviewsPassingQa", "countFirstTouchDraftsReady")
autopilot = replace_exact(autopilot, '      detail: report.fakeOnly ? "Fake fixtures are sorted into review queues only." : "Campaign prepared prospects, previews, scripts, and queues. Nothing was sent.",', '      detail: report.fakeOnly ? "Fake fixtures are sorted into review queues only." : "Campaign prepared prospects, permission-first drafts, and review queues. Nothing was sent.",', "update campaign activity copy")
autopilot = replace_exact(autopilot, '      detail: "Website and preview work stayed in review-only queues.",', '      detail: "Website analysis and permission-first outreach stayed in review-only queues.",', "update scan activity copy")
autopilot = replace_regex(
    autopilot,
    r'''    \{
      id: `\$\{report\.id\}-previews`,
      level: "success",
      label: `Generated \$\{report\.packagesGenerated\} previews`,
      detail: `\$\{countFirstTouchDraftsReady\(queue, report\)\} preview\$\{countFirstTouchDraftsReady\(queue, report\) === 1 \? "" : "s"\} passed QA or were routed for review\.`,
      createdAt: report\.completedAt,
    \},''',
    '''    {
      id: `${report.id}-first-touch-packages`,
      level: "success",
      label: `Generated ${report.packagesGenerated} first-touch packages`,
      detail: `${countFirstTouchDraftsReady(queue, report)} email draft${countFirstTouchDraftsReady(queue, report) === 1 ? "" : "s"} ready for human review without requiring a preview.`,
      createdAt: report.completedAt,
    },''',
    "replace preview activity entry",
)
autopilot = replace_exact(autopilot, '        detail: "This panel will show discovery, filtering, preview, script, and queue routing progress.",', '        detail: "This panel will show discovery, filtering, permission-first draft, and queue routing progress.",', "update empty activity copy")
autopilot_path.write_text(autopilot)

workspace_path = Path("components/engine/AutonomousGrowthWorkspace.tsx")
workspace = workspace_path.read_text()
workspace = replace_exact(workspace, '  if (!settings.excludePreviouslyReviewed || !settings.requirePreviewQuality85 || !settings.requireWrittenContact || !settings.manualDmMode) {', '  if (!settings.excludePreviouslyReviewed || !settings.requireWrittenContact || !settings.manualDmMode) {', "remove preview start gate")
workspace = replace_exact(workspace, '<p>Start Autopilot prepares prospects, previews, scripts, and queues. It does not send emails, DMs, forms, phone calls, or Looms automatically.</p>', '<p>Start Autopilot prepares prospects, permission-first drafts, and review queues. It does not build previews before interest or send emails, DMs, forms, phone calls, or Looms automatically.</p>', "update action copy")
workspace = replace_exact(workspace, '["Previews generated", activity.previewsGenerated],', '["First-touch packages generated", activity.previewsGenerated],', "rename package metric")
workspace = replace_exact(workspace, '["Previews passing QA", activity.previewsPassingQa],', '["Email drafts ready", activity.previewsPassingQa],', "rename ready metric")
for old, label in [
    ('        <label>Legacy/post-interest preview cap<input min="0" name="maxPreviewsPerRun" onChange={(event) => updateFormSetting("maxPreviewsPerRun", Number(event.target.value))} type="number" value={formSettings.maxPreviewsPerRun} /></label>\n', "remove preview cap control"),
    ('        <label className="engine-toggle"><input checked={formSettings.requirePreviewQuality85} name="requirePreviewQuality85" onChange={(event) => updateFormSetting("requirePreviewQuality85", event.target.checked)} type="checkbox" />Require preview QA 85+ before a manual Loom</label>\n', "remove preview requirement control"),
    ('        <label>Pause after weak previews<input min="1" name="pauseAfterWeakPreviewCount" onChange={(event) => updateStopRule("pauseAfterWeakPreviewCount", Number(event.target.value))} type="number" value={formSettings.stopRules.pauseAfterWeakPreviewCount} /></label>\n', "remove weak preview stop control"),
]:
    workspace = replace_exact(workspace, old, "", label)
workspace = replace_exact(workspace, '          Queues: Ready for Manual DM, Needs Preview Review, Loom Needed, Email Draft Ready, Blocked / Bad Fit, Needs Human Research. No email, form, social, phone, or Loom outreach is sent automatically.', '          Queues: Ready for Manual DM, Needs Email Review, Post-interest Preview / Loom, Email Draft Ready, Blocked / Bad Fit, Needs Human Research. No email, form, social, phone, or Loom outreach is sent automatically.', "update queue summary")
workspace_path.write_text(workspace)

self_check_path = Path("lib/system-self-check.ts")
self_check = self_check_path.read_text()
self_check = replace_exact(
    self_check,
    '    check("autopilot_defaults_safe", "Autopilot defaults are manual-safe", defaultAutopilotCampaignSettings.duration === "run_once" && defaultAutopilotCampaignSettings.cadence === "manual_only" && defaultAutopilotCampaignSettings.manualDmMode && defaultAutopilotCampaignSettings.requirePreviewQuality85 && defaultAutopilotCampaignSettings.requireWrittenContact && defaultAutopilotCampaignSettings.excludePreviouslyReviewed, "Autopilot defaults to run once, manual/social-safe, preview QA on, written contact required, and exclude previous on.", "Review defaultAutopilotCampaignSettings."),',
    '    check("autopilot_defaults_safe", "Autopilot defaults are manual-safe", defaultAutopilotCampaignSettings.duration === "run_once" && defaultAutopilotCampaignSettings.cadence === "manual_only" && defaultAutopilotCampaignSettings.manualDmMode && !defaultAutopilotCampaignSettings.requirePreviewQuality85 && defaultAutopilotCampaignSettings.requireWrittenContact && defaultAutopilotCampaignSettings.excludePreviouslyReviewed, "Autopilot defaults to run once, manual/social-safe, no pre-interest preview gate, written contact required, and exclude previous on.", "Review defaultAutopilotCampaignSettings."),',
    "update defaults self-check",
)
self_check = replace_exact(
    self_check,
    '    check("autopilot_queue_classification", "Autopilot queue classification works", autopilotQueueKeyForItem({ status: "Loom Needed", contactSource: "Public email", previewQualityScore: 92, blockedReason: "", email: "owner@example.com" }) === "loomNeeded", "Loom-needed items stay in the manual Loom queue.", "Review autopilotQueueKeyForItem."),',
    '    check("autopilot_queue_classification", "Autopilot queue classification works", autopilotQueueKeyForItem({ status: "Eligible", contactSource: "Public email", previewQualityScore: 0, blockedReason: "", email: "owner@example.com" }) === "emailDraftReady" && autopilotQueueKeyForItem({ status: "Preview Build Needed", contactSource: "Public email", previewQualityScore: 0, blockedReason: "", email: "owner@example.com" }) === "loomNeeded", "Preview-free first-touch email stays email-ready, while post-interest build work stays in the manual Preview / Loom queue.", "Review autopilotQueueKeyForItem."),',
    "update routing self-check",
)
self_check_path.write_text(self_check)

repository_path = Path("lib/autonomous-growth-repository.ts")
repository = repository_path.read_text()
repository = replace_regex(
    repository,
    r'function feedbackReview\(item: OutreachQueueItem, feedbackLabels = item\.feedbackLabels\) \{.*?\n\}\n\nasync function recordRunReview',
    '''const postInterestPreviewFeedbackStatuses = new Set<OutreachQueueItem["status"]>([
  "Preview Build Needed",
  "Preview Needs Polish",
  "Loom Needed",
  "Ready for Loom",
  "Loom Recorded",
]);

export function feedbackReview(item: OutreachQueueItem, feedbackLabels = item.feedbackLabels) {
  const previewFeedbackEnabled = postInterestPreviewFeedbackStatuses.has(item.status);
  const effectivePreviewFeedback = previewFeedbackEnabled
    ? feedbackLabels
    : feedbackLabels.filter((label) => !/preview/i.test(label));
  const previewGate = {
    status: item.previewQualityScore >= 85 ? "Eligible" as const : item.previewQualityScore < 70 ? "Blocked" as const : "Needs Review" as const,
    score: item.previewQualityScore,
    checks: [],
    reasons: item.detectedIssues,
  };
  const regenerationPlan = previewFeedbackEnabled ? previewRegenerationPlan(previewGate, effectivePreviewFeedback) : [];
  const rewritePlan = outreachRewritePlan(item.emailBody, feedbackLabels);
  const detectedIssues = new Set(previewFeedbackEnabled ? item.detectedIssues : item.detectedIssues.filter((issue) => !/preview/i.test(issue)));
  if (feedbackLabels.includes("Bad lead")) detectedIssues.add("Manual feedback marked this as a bad lead.");
  if (feedbackLabels.includes("Wrong contact")) detectedIssues.add("Manual feedback marked the contact as wrong.");
  if (feedbackLabels.includes("Never contact")) detectedIssues.add("Manual feedback marked this as never contact.");
  let recommendedNextAction: AutonomousNextAction = !previewFeedbackEnabled && item.recommendedNextAction === "Regenerate Preview" ? "Needs Human Review" : item.recommendedNextAction;
  if (feedbackLabels.includes("Never contact")) recommendedNextAction = "Never Contact";
  else if (feedbackLabels.includes("Bad fit")) recommendedNextAction = "Bad Fit";
  else if (previewFeedbackEnabled && (effectivePreviewFeedback.includes("Preview looked bad") || regenerationPlan.length)) recommendedNextAction = "Regenerate Preview";
  else if (feedbackLabels.includes("Outreach sounded too AI-ish") || rewritePlan.length) recommendedNextAction = "Rewrite Outreach";
  else if (feedbackLabels.includes("Bad lead")) recommendedNextAction = "Skip";
  else if (feedbackLabels.includes("Good lead") || (previewFeedbackEnabled && effectivePreviewFeedback.includes("Preview looked good")) || feedbackLabels.includes("Outreach sounded good")) recommendedNextAction = "Keep";
  const reviewScore = Math.max(0, Math.min(100, item.reviewScore
    + (feedbackLabels.includes("Good lead") ? 8 : 0)
    + (feedbackLabels.includes("Positive reply") ? 12 : 0)
    - (feedbackLabels.includes("Bad lead") ? 18 : 0)
    - (previewFeedbackEnabled && effectivePreviewFeedback.includes("Preview looked bad") ? 10 : 0)
    - (feedbackLabels.includes("Outreach sounded too AI-ish") ? 8 : 0)));
  const existingSuggestions = previewFeedbackEnabled ? item.improvementSuggestions : item.improvementSuggestions.filter((suggestion) => !/preview/i.test(suggestion));
  return {
    reviewScore,
    reviewSummary: `${item.businessName} review: ${recommendedNextAction}. Feedback has been recorded for future recommendations.`,
    improvementSuggestions: [...new Set([...existingSuggestions, ...regenerationPlan, ...rewritePlan])],
    detectedIssues: [...detectedIssues],
    recommendedNextAction,
    regenerationPlan,
    rewritePlan,
  };
}

async function recordRunReview''',
    "restrict preview feedback to post-interest",
)
repository_path.write_text(repository)

test_path = Path("tests/final-preinterest-autopilot.test.ts")
test_path.write_text(r'''import assert from "node:assert/strict";
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
''')

if 'item.previewQualityScore < 85 || item.status === "Needs Review"' in autopilot_path.read_text():
    raise RuntimeError("Autopilot still routes pre-interest leads by preview score")
if '!settings.requirePreviewQuality85' in workspace_path.read_text():
    raise RuntimeError("Autopilot UI still requires preview quality to start")
if re.search(r'else if \(feedbackLabels\.includes\("Preview looked bad"\) \|\| regenerationPlan\.length\)', repository_path.read_text()):
    raise RuntimeError("Feedback review still applies preview regeneration before checking status")
