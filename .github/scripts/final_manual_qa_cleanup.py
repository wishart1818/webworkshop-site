from __future__ import annotations

from pathlib import Path
from textwrap import dedent
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str, label: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise SystemExit(f"Expected one {label} target in {path}, found {count}: {old[:140]!r}")
    write(path, content.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str, label: str) -> None:
    content = read(path)
    updated, count = re.subn(pattern, lambda _: replacement, content, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"Expected one {label} target in {path}, found {count}.")
    write(path, updated)


# Manual Lovable QA must not depend on a score produced by the abandoned preview generator.
replace_regex(
    "lib/autonomous-growth.ts",
    r'''export function loomReadinessChecklist\(item: OutreachQueueItem\): LoomReadinessCheck\[\] \{[\s\S]*?\n}\n\nfunction hasUsableManualContactForLoom''',
    dedent('''
    export function loomReadinessChecklist(item: OutreachQueueItem): LoomReadinessCheck[] {
      const previewReady = publicPreviewReady(item.previewLink);
      const manualQaClear = previewReady
        && item.status !== "Preview Needs Polish"
        && item.regenerationPlan.length === 0;
      return [
        {
          key: "public_preview_link",
          label: "Public Lovable preview link exists",
          passed: previewReady,
          fix: "Build the preview manually in Lovable, QA it, then save its public HTTPS link.",
        },
        {
          key: "manual_preview_qa",
          label: "Manual desktop, mobile, form, and factual QA is clear",
          passed: manualQaClear,
          fix: "Review desktop and mobile, test every button and form, verify imagery and facts, and use Preview Needs Polish when anything still needs work.",
        },
        {
          key: "business_context",
          label: "Business, trade, and city are clear",
          passed: Boolean(item.businessName && item.trade && item.city),
          fix: "Add the missing business context before recording a personal Loom.",
        },
        {
          key: "manual_only",
          label: "Manual build and outreach only",
          passed: true,
          fix: "Do not automate Lovable building, Facebook, Instagram, contact forms, Loom recording, or Loom sending.",
        },
      ];
    }

    function hasUsableManualContactForLoom
    ''').lstrip(),
    "manual Lovable readiness checklist",
)

replace_regex(
    "lib/autonomous-growth.ts",
    r'''export function loomRecommendationForQueueItem\(item: OutreachQueueItem\): LoomRecommendation \{[\s\S]*?\n}\n\nexport function loomNeededTaskForQueueItem''',
    dedent('''
    export function loomRecommendationForQueueItem(item: OutreachQueueItem): LoomRecommendation {
      const visualIssue = visualIssueForLoom(item);
      const highValue = item.reviewScore >= 70;
      const publicPreview = publicPreviewReady(item.previewLink);
      const manualQaClear = publicPreview
        && item.status !== "Preview Needs Polish"
        && item.regenerationPlan.length === 0;
      const usableContact = hasUsableManualContactForLoom(item);
      const recommended = highValue && manualQaClear && usableContact && Boolean(visualIssue);
      const currentSiteIssue = visualIssue || "No specific visual website issue has been recorded yet.";
      const previewImprovement = item.improvementSuggestions.find((suggestion) => /preview|quote|contact|layout|service/i.test(suggestion))
        ?? "Show how the public preview makes services and quote requests easier to find.";
      return {
        recommended,
        title: recommended ? `Loom walkthrough for ${item.businessName}` : "Loom not recommended yet",
        talkingPoints: [
          `Show the current-site issue: ${currentSiteIssue}`,
          `Show the preview improvement: ${previewImprovement}`,
          "End by asking whether they want the finished version set up manually.",
        ],
        currentSiteIssue,
        previewImprovement,
        previewLink: publicPreview ? item.previewLink : "",
        whyRecommended: recommended
          ? "High-value prospect with a manually QA'd public preview, usable manual contact path, and a visual issue worth showing."
          : "Wait until the public preview is manually QA'd, the contact path is usable, and there is a clear visual issue to show.",
      };
    }

    export function loomNeededTaskForQueueItem
    ''').lstrip(),
    "manual Lovable Loom recommendation",
)

replace_once(
    "lib/autonomous-growth.ts",
    '''    previewQuality: `${item.previewQualityScore || item.reviewScore || 0}/100`,''',
    '''    previewQuality: !publicPreviewReady(item.previewLink)
      ? "Manual QA pending"
      : item.status === "Preview Needs Polish" || item.regenerationPlan.length
        ? "Manual QA needs polish"
        : "Manual QA ready",''',
    "manual QA display",
)

replace_once(
    "lib/autonomous-growth.ts",
    '''      `Preview quality: ${item.previewQualityScore || item.reviewScore || 0}/100`,''',
    '''      `Manual QA: ${!publicPreviewReady(item.previewLink) ? "pending" : item.status === "Preview Needs Polish" || item.regenerationPlan.length ? "needs polish" : "ready"}`,''',
    "manual QA notification",
)

# Learning metrics must not count bounces/complaints as replies or rank trades only by review score.
replace_regex(
    "lib/autonomous-growth.ts",
    r'''function tradePerformance\(queue: OutreachQueueItem\[\]\) \{[\s\S]*?\n}\n\nexport function generateAutonomousRunReview''',
    dedent('''
    const actualReplyLearningStatuses = new Set<OutreachQueueStatus>([
      "Replied",
      "Positive Reply",
      "Prospect Said Yes",
      "Preview Build Needed",
      "Preview Needs Polish",
      "Loom Needed",
      "Ready for Loom",
      "Loom Recorded",
      "Loom Sent",
      "Pricing Requested",
      "Pricing Sent",
      "Won",
      "Not Interested",
    ]);

    const positiveReplyLearningStatuses = new Set<OutreachQueueStatus>([
      "Positive Reply",
      "Prospect Said Yes",
      "Preview Build Needed",
      "Preview Needs Polish",
      "Loom Needed",
      "Ready for Loom",
      "Loom Recorded",
      "Loom Sent",
      "Pricing Requested",
      "Pricing Sent",
      "Won",
    ]);

    function learningReplyStatusIsActual(value: string) {
      return /\b(?:replied|reply|positive|negative|interested|not[_ -]?interested|prospect[_ -]?said[_ -]?yes|pricing[_ -]?requested)\b/i.test(value)
        && !/\b(?:bounce|bounced|complaint|complained|spam|unsubscribe|unsubscribed|opt[_ -]?out|suppressed)\b/i.test(value);
    }

    function learningReplyStatusIsPositive(value: string) {
      return /\b(?:positive|interested|prospect[_ -]?said[_ -]?yes|pricing[_ -]?requested)\b/i.test(value)
        && !/\b(?:not[_ -]?interested|negative|bounce|complaint|spam|unsubscribe|opt[_ -]?out|suppressed)\b/i.test(value);
    }

    function tradePerformance(queue: OutreachQueueItem[]) {
      const grouped = queue.reduce<Record<string, OutreachQueueItem[]>>((accumulator, item) => {
        const trade = item.trade || "Unknown";
        accumulator[trade] = [...(accumulator[trade] ?? []), item];
        return accumulator;
      }, {});
      return Object.entries(grouped)
        .map(([trade, items]) => {
          const emailSends = items.filter((item) => Boolean(item.sentDate) && item.contactSource === "Public email");
          const replies = emailSends.filter((item) => actualReplyLearningStatuses.has(item.status) || learningReplyStatusIsActual(item.replyStatus)).length;
          const positiveReplies = emailSends.filter((item) => positiveReplyLearningStatuses.has(item.status) || learningReplyStatusIsPositive(item.replyStatus)).length;
          return {
            trade,
            averageScore: average(items.map((item) => item.reviewScore || item.previewQualityScore)),
            replies,
            positiveReplies,
            sent: emailSends.length,
            replyRate: emailSends.length ? Math.round((replies / emailSends.length) * 100) : 0,
            positiveReplyRate: emailSends.length ? Math.round((positiveReplies / emailSends.length) * 100) : 0,
          };
        })
        .sort((left, right) =>
          right.positiveReplyRate - left.positiveReplyRate
          || right.positiveReplies - left.positiveReplies
          || right.replyRate - left.replyRate
          || right.replies - left.replies
          || right.averageScore - left.averageScore
          || left.trade.localeCompare(right.trade));
    }

    export function generateAutonomousRunReview
    ''').lstrip(),
    "honest trade learning metrics",
)

replace_once(
    "lib/autonomous-growth.ts",
    '''  const keptStatuses: OutreachQueueStatus[] = ["Eligible", "DM Draft", "First DM Sent", "Prospect Said Yes", "Loom Needed", "Ready for Loom", "Loom Recorded", "Loom Sent", "Pricing Requested", "Pricing Sent", "Queued", "Sent", "Follow-up Needed", "Follow-up Sent", "Replied", "Positive Reply", "Won"];
  const blockedStatuses: OutreachQueueStatus[] = ["Blocked", "Preview Needs Polish", "Bad Fit", "Never Contact", "Opted Out", "Skipped", "Lost", "No Response", "Not Interested"];''',
    '''  const keptStatuses: OutreachQueueStatus[] = ["Eligible", "DM Draft", "First DM Sent", "Prospect Said Yes", "Preview Build Needed", "Loom Needed", "Ready for Loom", "Loom Recorded", "Loom Sent", "Pricing Requested", "Pricing Sent", "Queued", "Sent", "Follow-up Needed", "Follow-up Sent", "Replied", "Positive Reply", "Won"];
  const blockedStatuses: OutreachQueueStatus[] = ["Blocked", "Preview Needs Polish", "Bad Fit", "Never Contact", "Opted Out", "Skipped", "Lost", "No Response", "Not Interested"];''',
    "manual build review classification",
)

replace_once(
    "lib/autonomous-growth.ts",
    '''  const previewsGenerated = queue.filter((item) => item.previewLink).length;
  const previewsPassed = queue.filter((item) => item.previewQualityScore >= 85 && item.regenerationPlan.length === 0).length;''',
    '''  const previewsGenerated = queue.filter((item) => item.previewLink).length;
  const previewPassedStatuses = new Set<OutreachQueueStatus>(["Ready for Loom", "Loom Recorded", "Loom Sent", "Pricing Requested", "Pricing Sent", "Won"]);
  const previewsPassed = queue.filter((item) => item.previewLink && item.regenerationPlan.length === 0 && (item.previewQualityScore >= 85 || previewPassedStatuses.has(item.status))).length;
  const previewsFailed = queue.filter((item) => item.previewLink && (item.status === "Preview Needs Polish" || item.regenerationPlan.length > 0)).length;''',
    "manual preview review metrics",
)
replace_once(
    "lib/autonomous-growth.ts",
    '''    previewsFailed: Math.max(0, previewsGenerated - previewsPassed),''',
    '''    previewsFailed,''',
    "manual preview failure count",
)

replace_once(
    "lib/autonomous-growth.ts",
    '''  const replyRateByTrade = performance.map((entry) => ({
    trade: entry.trade,
    replyRate: entry.sent ? Math.round((entry.replies / entry.sent) * 100) : 0,
    positiveReplyRate: entry.sent ? Math.round((entry.positiveReplies / entry.sent) * 100) : 0,
  }));''',
    '''  const replyRateByTrade = performance.map((entry) => ({
    trade: entry.trade,
    replyRate: entry.replyRate,
    positiveReplyRate: entry.positiveReplyRate,
  }));''',
    "learning reply-rate projection",
)

# The manual build UI should show only transitions the backend actually accepts.
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''            const task = loomNeededTaskForQueueItem(item);
            return (''',
    '''            const task = loomNeededTaskForQueueItem(item);
            const statusTargets = manualQueueStatusTargets(item.status);
            return (''',
    "manual status targets",
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''                  <div><b>Preview quality</b><span>{task.previewQuality}</span></div>''',
    '''                  <div><b>Manual QA</b><span>{task.previewQuality}</span></div>''',
    "manual QA label",
)
replace_once(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    '''                    <div><dt>Public preview link</dt><dd>{task.recommendation.previewLink ? <a href={task.recommendation.previewLink} rel="noreferrer" target="_blank">{task.recommendation.previewLink}</a> : "Generate a public /p/ preview first."}</dd></div>''',
    '''                    <div><dt>Public preview link</dt><dd>{task.recommendation.previewLink ? <a href={task.recommendation.previewLink} rel="noreferrer" target="_blank">{task.recommendation.previewLink}</a> : "Save a legitimate public Lovable preview link first."}</dd></div>''',
    "Lovable preview wording",
)
replace_regex(
    "components/engine/AutonomousGrowthWorkspace.tsx",
    r'''                <footer className="engine-loom-actions">[\s\S]*?\n                </footer>''',
    dedent('''
                    <footer className="engine-loom-actions">
                      <button className="engine-button" onClick={() => void onSavePreview(item)} type="button">Add Lovable preview link</button>
                      {statusTargets.includes("Preview Build Needed") ? <button className="engine-button" onClick={() => void onStatus(item, "Preview Build Needed")} type="button">Back to Preview Build</button> : null}
                      {statusTargets.includes("Preview Needs Polish") ? <button className="engine-button" onClick={() => void onStatus(item, "Preview Needs Polish")} type="button">Preview Needs Polish</button> : null}
                      {statusTargets.includes("Ready for Loom") ? <button className="engine-button engine-button--primary" disabled={!task.canMarkReadyForLoom} onClick={() => void onStatus(item, "Ready for Loom")} type="button">Ready for Loom</button> : null}
                      {statusTargets.includes("Loom Recorded") ? <button className="engine-button" onClick={() => void onStatus(item, "Loom Recorded")} type="button">Loom Recorded</button> : null}
                      {statusTargets.includes("Loom Sent") ? <button className="engine-button" onClick={() => void onStatus(item, "Loom Sent")} type="button">Loom Sent</button> : null}
                      {statusTargets.includes("Follow-up Needed") ? <button className="engine-button" onClick={() => void onStatus(item, "Follow-up Needed")} type="button">Follow-up Needed</button> : null}
                      {statusTargets.includes("Pricing Requested") ? <button className="engine-button" onClick={() => void onStatus(item, "Pricing Requested")} type="button">Pricing Requested</button> : null}
                      {statusTargets.includes("Not Interested") ? <button className="engine-button" onClick={() => void onStatus(item, "Not Interested")} type="button">Not Interested</button> : null}
                      {statusTargets.includes("Lost") ? <button className="engine-button" onClick={() => void onStatus(item, "Lost")} type="button">Lost</button> : null}
                    </footer>
    ''').strip(),
    "valid manual action buttons",
)

Path("tests/manual-preview-qa.test.ts").write_text(dedent('''
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
''').lstrip(), encoding="utf-8")

print("Manual Lovable QA and learning cleanup applied.")
