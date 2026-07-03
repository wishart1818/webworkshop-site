import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluatePreviewQualityGate,
  evaluateSelfReview,
  learningSummaryForQueue,
  normalizeAutonomousGrowthMode,
  normalizeAutonomousGrowthSettings,
  outreachEnvironment,
  outreachRewritePlan,
  previewRegenerationPlan,
  queueStatusForPackage,
  rewriteOutreachWithFixes,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";
import { evaluateOutreachEmailQuality, prepareTopProspectArtifacts, publicProspectPreviewLink } from "../lib/top-prospects";
import { seedProspects, withAnalysis, type Prospect } from "../lib/prospect-engine";

const publicLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    OUTREACH_AUTO_SEND_ENABLED: "true",
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "test-key",
    OUTREACH_FROM_EMAIL: "hello@webworkshop.dev",
    OUTREACH_REPLY_TO_EMAIL: "reply@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "123 Main St, Toledo, OH",
    OUTREACH_DAILY_CAP: "5",
    ...overrides,
  };
}

function eligibleProspect() {
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    email: "owner@example.com",
    publicEmail: undefined,
    contactFormUrl: "",
    recommendedContactMethod: "send_email",
    classification: "website_redesign",
  } as Prospect);
  return prepareTopProspectArtifacts(prospect, publicLink).prospect;
}

function eligibilityFor(prospect: Prospect, overrides: Partial<Parameters<typeof evaluateAutoSendEligibility>[0]> = {}) {
  const previewGate = overrides.previewGate ?? evaluatePreviewQualityGate(prospect);
  const emailQuality = overrides.emailQuality ?? evaluateOutreachEmailQuality(prospect, overrides.previewLink ?? publicLink);
  return evaluateAutoSendEligibility({
    emailQuality,
    environment: env(),
    previewGate,
    previewLink: publicLink,
    prospect,
    settings: { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false },
    ...overrides,
  });
}

test("Autonomous Growth defaults to Off with conservative caps and kill switch enabled", () => {
  const settings = normalizeAutonomousGrowthSettings();
  assert.equal(settings.mode, "off");
  assert.equal(settings.killSwitch, true);
  assert.equal(settings.maxProspectsScannedPerDay, 25);
  assert.equal(settings.maxPreviewsGeneratedPerDay, 10);
  assert.equal(settings.maxEmailsSentPerDay, 5);
  assert.equal(settings.emailCooldownMinutes, 7);
  assert.equal(normalizeAutonomousGrowthMode("surprise_send"), "off");
});

test("Dry Run and Manual Approval never auto-send", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  for (const mode of ["dry_run", "manual_approval"] as const) {
    const result = evaluateAutoSendEligibility({
      emailQuality,
      environment: env(),
      previewGate,
      previewLink: publicLink,
      prospect,
      settings: { ...defaultAutonomousGrowthSettings, mode, killSwitch: false },
    });
    assert.equal(result.eligible, false);
    assert.match(result.blockedReasons.join(" "), /sends nothing automatically/);
  }
});

test("self-review runs for Dry Run and Manual Approval without changing send status", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  const selfReview = evaluateSelfReview({ emailQuality, previewGate, prospect });

  assert.ok(selfReview.reviewScore > 0);
  assert.match(selfReview.reviewSummary, /review:/);
  assert.ok(["Keep", "Rewrite Outreach", "Needs Human Review", "Regenerate Preview"].includes(selfReview.recommendedNextAction));

  for (const mode of ["dry_run", "manual_approval"] as const) {
    const autoEligibility = evaluateAutoSendEligibility({
      emailQuality,
      environment: env(),
      previewGate,
      previewLink: publicLink,
      prospect,
      settings: { ...defaultAutonomousGrowthSettings, mode, killSwitch: false },
    });
    assert.equal(autoEligibility.eligible, false);
    assert.notEqual(queueStatusForPackage({
      autoEligibility,
      emailQuality,
      previewGate,
      settings: { ...defaultAutonomousGrowthSettings, mode, killSwitch: false },
    }), "Queued");
  }
});

test("Auto Email Pilot only passes for eligible email leads with all sender gates configured", () => {
  const prospect = eligibleProspect();
  const result = eligibilityFor(prospect);
  assert.equal(result.eligible, true);
  assert.equal(queueStatusForPackage({
    autoEligibility: result,
    emailQuality: evaluateOutreachEmailQuality(prospect, publicLink),
    previewGate: evaluatePreviewQualityGate(prospect),
    settings: { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false },
  }), "Queued");
});

test("phone-only, social-only, contact-form-only, and bad-fit leads never auto-send", () => {
  const base = eligibleProspect();
  const cases: Array<[string, Prospect]> = [
    ["phone-only", { ...base, email: "", recommendedContactMethod: "call_first", classification: "phone_only" }],
    ["social-only", { ...base, email: "", profileUrl: "https://facebook.com/example", recommendedContactMethod: "message_on_social", classification: "social_only" }],
    ["contact-form-only", { ...base, email: "", contactFormUrl: "https://example.com/contact", recommendedContactMethod: "submit_contact_form" }],
    ["bad-fit", { ...base, classification: "national_large_brand", businessName: "Erie Home" }],
  ];
  for (const [label, prospect] of cases) {
    assert.equal(eligibilityFor(prospect).eligible, false, label);
  }
});

test("missing public preview, protected engine links, and weak previews block send readiness", () => {
  const prospect = eligibleProspect();
  assert.equal(eligibilityFor({ ...prospect, preview: undefined }).eligible, false);
  assert.equal(eligibilityFor(prospect, { previewLink: "https://webworkshop.dev/engine/previews/prospect-1" }).eligible, false);
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
      heroHeadline: "hvac help in toledo",
      qualityScore: {
        visualPolish: 60,
        businessSpecificity: 70,
        clarity: 70,
        mobileResponsiveness: 70,
        conversionStrength: 70,
        safetyTruthfulness: 90,
        overall: 70,
        notes: ["Needs stronger layout."],
      },
    },
  };
  const gate = evaluatePreviewQualityGate(weak);
  assert.equal(gate.status, "Blocked");
  assert.equal(eligibilityFor(weak).eligible, false);
});

test("preview below 85 creates a regeneration plan and remains not send-ready", () => {
  const prospect = eligibleProspect();
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
      heroHeadline: "hvac help in toledo",
      qualityScore: {
        visualPolish: 78,
        businessSpecificity: 72,
        clarity: 80,
        mobileResponsiveness: 82,
        conversionStrength: 74,
        safetyTruthfulness: 92,
        overall: 78,
        notes: ["Needs stronger layout."],
      },
    },
  };
  const previewGate = evaluatePreviewQualityGate(weak);
  const emailQuality = evaluateOutreachEmailQuality(weak, publicLink);
  const review = evaluateSelfReview({ emailQuality, previewGate, prospect: weak });
  assert.notEqual(previewGate.status, "Eligible");
  assert.equal(review.recommendedNextAction, "Regenerate Preview");
  assert.ok(review.regenerationPlan.includes("fix image relevance") || review.regenerationPlan.includes("improve CTA section"));
  assert.equal(eligibilityFor(weak, { previewGate, emailQuality }).eligible, false);
});

test("missing sender settings, missing postal address, disabled env flag, and daily cap block Auto Email Pilot", () => {
  const prospect = eligibleProspect();
  assert.equal(eligibilityFor(prospect, { environment: env({ OUTREACH_AUTO_SEND_ENABLED: "false" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { environment: env({ RESEND_API_KEY: "" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { environment: env({ OUTREACH_POSTAL_ADDRESS: "" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { emailsSentToday: 5 }).eligible, false);
  assert.equal(outreachEnvironment(env({ OUTREACH_DAILY_CAP: "2" })).dailyCap, 2);
});

test("opt-out and duplicate style statuses can stay blocked in the durable queue model", () => {
  const prospect = eligibleProspect();
  const blocked = eligibilityFor({ ...prospect, recommendedContactMethod: "do_not_contact" });
  assert.equal(blocked.eligible, false);
  assert.match(blocked.blockedReasons.join(" "), /Do-not-contact/);
  const duplicate = eligibilityFor({ ...prospect, classification: "duplicate_bad_fit" });
  assert.equal(duplicate.eligible, false);
  assert.match(duplicate.blockedReasons.join(" "), /duplicate/i);
  const alreadyContacted = eligibilityFor({ ...prospect, status: "Contacted" });
  assert.equal(alreadyContacted.eligible, false);
  assert.match(alreadyContacted.blockedReasons.join(" "), /already been contacted/i);
  const noSolicitation = eligibilityFor({ ...prospect, activitySignals: ["No solicitation language detected on contact page."] });
  assert.equal(noSolicitation.eligible, false);
  assert.match(noSolicitation.blockedReasons.join(" "), /No-solicitation/i);
});

test("learning feedback cannot bypass opt-out or bad-fit hard blockers", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  const optOut = { ...prospect, recommendedContactMethod: "do_not_contact" as const };
  const badFit = { ...prospect, classification: "national_large_brand" as const };
  const positiveOptOutReview = evaluateSelfReview({
    emailQuality,
    feedbackLabels: ["Good lead", "Preview looked good", "Outreach sounded good"],
    previewGate,
    prospect: optOut,
  });
  const positiveBadFitReview = evaluateSelfReview({
    emailQuality,
    feedbackLabels: ["Good lead", "Preview looked good", "Outreach sounded good"],
    previewGate,
    prospect: badFit,
  });

  assert.equal(positiveOptOutReview.recommendedNextAction, "Never Contact");
  assert.equal(positiveBadFitReview.recommendedNextAction, "Bad Fit");
  assert.equal(eligibilityFor(optOut).eligible, false);
  assert.equal(eligibilityFor(badFit).eligible, false);
});

test("feedback labels create preview and outreach self-fix suggestions", () => {
  const prospect = eligibleProspect();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const previewPlan = previewRegenerationPlan(previewGate, ["Preview looked bad"]);
  const rewritePlan = outreachRewritePlan(
    "Hi, this free audit will transform your seamless next-generation web presence.",
    ["Outreach sounded too AI-ish"],
  );

  assert.ok(previewPlan.includes("make sections flow better"));
  assert.ok(previewPlan.includes("make it more specific to the trade/city"));
  assert.ok(rewritePlan.includes("make the email shorter"));
  assert.ok(rewritePlan.includes("make it more human"));
  assert.ok(rewritePlan.includes("remove free audit language"));
});

test("rewrite outreach preserves opt-out language and removes hype posture", () => {
  const rewritten = rewriteOutreachWithFixes([
    "Hi Rick,",
    "",
    "This free audit could transform your seamless web presence.",
    "",
    "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
    "",
    "WebWorkshop",
    "[Add your business postal address before sending]",
    "If you would rather not receive another note, reply and I will close the loop.",
  ].join("\n"));

  assert.match(rewritten, /If you would rather not receive another note/);
  assert.match(rewritten, /https:\/\/webworkshop\.dev\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.doesNotMatch(rewritten, /free audit|transform your seamless/i);
});

function queueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  return {
    id: "queue-1",
    prospectId: "prospect-1",
    topProspectResultId: "result-1",
    businessName: "Sample Roofing",
    trade: "Roofing",
    city: "Toledo, OH",
    website: "https://example.com",
    email: "owner@example.com",
    contactSource: "Public email",
    contactConfidence: 85,
    previewLink: publicLink,
    previewQualityScore: 88,
    subjectLine: "A clearer estimate path",
    emailBody: "Hi there,\n\nOne thing that already works well: customers can find your services.\n\nIf you would rather not receive another note, reply and I will close the loop.",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Send-safe package.",
    blockedReason: "",
    reviewScore: 82,
    reviewSummary: "Keep.",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Eligible",
    sourceProvider: "Top Prospects",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("feedback updates learning summary and dashboard empty states can be represented", () => {
  const empty = learningSummaryForQueue([]);
  assert.equal(empty.latestReview, null);
  assert.deepEqual(empty.commonFailureReasons, []);

  const summary = learningSummaryForQueue([
    queueItem({ feedbackLabels: ["Good lead", "Positive reply"], status: "Positive Reply", replyStatus: "positive" }),
    queueItem({
      id: "queue-2",
      trade: "HVAC",
      reviewScore: 46,
      status: "Needs Review",
      detectedIssues: ["Preview copy is generic."],
      regenerationPlan: ["reduce AI-sounding copy"],
      rewritePlan: ["make the email shorter"],
    }),
  ]);
  assert.equal(summary.bestPerformingTrades[0], "Roofing");
  assert.ok(summary.commonFailureReasons.includes("Preview copy is generic."));
  assert.ok(summary.recommendedPreviewImprovements.includes("reduce AI-sounding copy"));
  assert.ok(summary.recommendedWordingImprovements.includes("make the email shorter"));
});
