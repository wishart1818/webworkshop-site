import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  casualDmPlaybook,
  buildMarketScoutDryRun,
  buildSmartAutonomousGrowthSnapshot,
  currentOutreachCopyVersion,
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluatePreviewQualityGate,
  evaluateQueuedEmailSendReadiness,
  evaluateSelfReview,
  learningSummaryForQueue,
  loomRecommendationForQueueItem,
  loomNeededNotificationDraft,
  loomNeededTaskForQueueItem,
  normalizeAutonomousGrowthMode,
  normalizeAutonomousGrowthSettings,
  outreachEnvironment,
  outreachQueueStatuses,
  outreachRewritePlan,
  previewRegenerationPlan,
  queueStatusAfterManualAction,
  queueStatusForPackage,
  rewriteOutreachWithFixes,
  smartQueueKeyForItem,
  summarizeExistingQualifiedUnsent,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";
import {
  approveAndQueueEmail,
  getAutonomousGrowthDashboard,
  normalizeRecipientEmailDomain,
  processExistingQualifiedProspects,
  prospectInitialEmailIdempotencyKey,
  resetAutonomousGrowthMemoryForTests,
  recordEmailSuppression,
  regenerateUnsentOutreachCopy,
  saveVerifiedContactFirstNameAndRegenerate,
  outreachQueueMemoryForTests,
  runFullAutoEmailBatch,
  runAutoEmailPilotCycle,
  runMarketScoutDryRunForDashboard,
  runSmartAutonomousDryRun,
  sendQueuedEmailQueueItem,
  setOutreachQueueMemoryForTests,
  updateAutonomousGrowthSettings,
  updateOutreachQueueStatus,
  upsertAutonomousQueueItemFromPackage,
} from "../lib/autonomous-growth-repository";
import { memoryAuditEventsForTests, resetOperationalMemoryForTests } from "../lib/operational-controls";
import {
  autopilotActionLabels,
  autopilotDraftFromRecommendedMarket,
  autopilotMarketMismatchWarning,
  autopilotPresetFields,
  autopilotProviderGuardrailWarnings,
  autopilotProviderRequestEstimate,
  autopilotQueueKeyForItem,
  autopilotStartConfirmation,
  autopilotTopProspectInput,
  attachAutopilotRunReport,
  buildAutopilotDashboard,
  buildAutopilotTopProspectJobReport,
  createAutopilotCampaign,
  defaultAutopilotCampaignSettings,
  recommendedFirstAutopilotRunSettings,
  runFakeAutopilotSmokeTest,
  transitionAutopilotCampaign,
} from "../lib/autopilot-campaign";
import { evaluateOutreachEmailQuality, prepareTopProspectArtifacts, prepareTopProspectOutreachArtifacts, publicProspectPreviewLink, recommendedMarketPresets, type TopProspectJob, type TopProspectResult } from "../lib/top-prospects";
import { generateOutreach, reconcileProspectContactRouting, seedProspects, withAnalysis, type Prospect } from "../lib/prospect-engine";
import {
  getProspect,
  resetProspectMemoryForTests,
  saveProspect,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import { prospectCurrentBucket } from "../lib/prospect-funnel";

process.env.WEBWORKSHOP_POSTAL_ADDRESS ??= "123 Main St, Toledo, OH";

const publicLink = publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");

function jobProviderDiagnostics(overrides: Partial<NonNullable<TopProspectJob["discoveryDiagnostics"]>["providerDiagnostics"]> = {}) {
  return {
    osm: { configured: null, queryExecuted: false, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
    azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 25, withinRadiusCount: 21, afterDeduplicationCount: 18, usableWebsiteCount: 9 },
    googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
    yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
    ...overrides,
  } as NonNullable<TopProspectJob["discoveryDiagnostics"]>["providerDiagnostics"];
}

function topProspectJobFixture(campaign: ReturnType<typeof createAutopilotCampaign>, overrides: Partial<TopProspectJob> = {}): TopProspectJob {
  const providerDiagnostics = jobProviderDiagnostics();
  const job = {
    id: "top-job-123",
    input: autopilotTopProspectInput(campaign.settings),
    status: "RUNNING",
    stage: "DISCOVER",
    discoveredCount: 25,
    scannedCount: 8,
    qualifiedCount: 3,
    skippedCount: 4,
    skipSummary: { supplier_distributor: 2, phone_only_written_outreach_blocked: 2 },
    results: [],
    reviewedNotRecommended: [],
    failureClassification: null,
    errorMessage: "",
    completedAt: null,
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(2).toISOString(),
    nextRunRecommendations: ["Wait for this Top Prospects job to finish."],
    discoveryDiagnostics: {
      rawProviderCount: 25,
      afterDistanceFilteringCount: 21,
      afterDuplicateFilteringCount: 18,
      afterQualificationFilteringCount: 9,
      returnedCount: 9,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 0, bing: 25, yelp: 0, yellowPages: 0 },
      finalMergedCount: 18,
      providerDiagnostics,
      cityDiagnostics: [{
        city: "Tampa",
        state: "FL",
        label: "Tampa, FL",
        status: "completed",
        requestedCount: 100,
        rawProviderCount: 25,
        withinRadiusCount: 21,
        afterDeduplicationCount: 18,
        usableWebsiteCount: 9,
        returnedCount: 9,
        qualifiedCount: 3,
        skippedCount: 4,
        providersAttempted: ["azureMaps"],
        providerDiagnostics,
      }],
    },
  } as TopProspectJob;
  return { ...job, ...overrides };
}

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    AUTOPILOT_DISABLED: "false",
    INTERNAL_NOTIFICATIONS_ENABLED: "false",
    OUTREACH_EMAIL_DISABLED: "false",
    OUTREACH_AUTO_SEND_ENABLED: "true",
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "test-key",
    OUTREACH_FROM_EMAIL: "hello@webworkshop.dev",
    OUTREACH_REPLY_TO_EMAIL: "reply@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "123 Main St, Toledo, OH",
    OUTREACH_DAILY_CAP: "5",
    SMS_NOTIFICATIONS_ENABLED: "false",
    ...overrides,
  };
}

function eligibleProspect() {
  const checkedAt = new Date().toISOString();
  const prospect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    id: "auto-email-eligible-prospect",
    email: "owner@example.com",
    publicEmail: undefined,
    contactFormUrl: "",
    recommendedContactMethod: "send_email",
    bestManualContactMethod: "email",
    contactConfidence: "high",
    websiteStatus: "usable",
    websiteVerification: {
      version: "website-verification-v2",
      status: "usable",
      confidence: "high",
      canonicalUrl: "https://example.com/summit-roofing",
      attempts: [],
      usableSignals: ["meaningful page title", "business name", "navigation", "service content", "public email"],
      explanation: "A meaningful public business website was verified.",
      checkedAt,
      ownershipDecision: "owned",
      identityEvidence: ["The business name and website host match."],
      fit: {
        disposition: "clearly_weak_or_outdated_website",
        reason: "Rendered fixture review found that the quote request is difficult to reach.",
        supportingEvidence: ["The primary customer path does not expose the quote action."],
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: checkedAt,
        observation: {
          kind: "quote_path",
          statement: "I noticed the quote request is difficult to reach on the current website.",
          rebuildSentence: "I can rebuild your current website with a more modern design that makes requesting a quote easier while presenting your verified services and contact information more clearly.",
          evidence: ["Rendered fixture review found no quote action in the primary customer path."],
          demoChecklist: ["Show the quote action on desktop", "Show the quote action on mobile"],
        },
      },
    },
    fitDisposition: "clearly_weak_or_outdated_website",
    contactEvidence: [{
      kind: "email",
      value: "owner@example.com",
      sourceUrl: "https://example.com/contact",
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: checkedAt,
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
    }],
    classification: "website_redesign",
  } as Prospect);
  return prepareTopProspectArtifacts(prospect, publicLink).prospect;
}

function eligibleProspectFor(input: {
  businessName: string;
  email: string;
  id: string;
  website: string;
}) {
  const checkedAt = new Date().toISOString();
  return prepareTopProspectArtifacts(withAnalysis({
    ...structuredClone(seedProspects[0]),
    ...input,
    publicEmail: undefined,
    contactFormUrl: "",
    recommendedContactMethod: "send_email",
    bestManualContactMethod: "email",
    classification: "website_redesign",
    websiteStatus: "usable",
    websiteVerification: {
      version: "website-verification-v2",
      status: "usable",
      confidence: "high",
      canonicalUrl: input.website,
      attempts: [],
      usableSignals: ["meaningful page title", "business name", "navigation", "service content", "public email"],
      explanation: "A meaningful public business website was verified.",
      checkedAt,
      ownershipDecision: "owned",
      identityEvidence: ["The business name and website host match."],
      fit: {
        disposition: "clearly_weak_or_outdated_website",
        reason: "Rendered fixture review found that the quote request is difficult to reach.",
        supportingEvidence: ["The primary customer path does not expose the quote action."],
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: checkedAt,
        observation: {
          kind: "quote_path",
          statement: "I noticed the quote request is difficult to reach on the current website.",
          rebuildSentence: "I can rebuild your current website with a more modern design that makes requesting a quote easier while presenting your verified services and contact information more clearly.",
          evidence: ["Rendered fixture review found no quote action in the primary customer path."],
          demoChecklist: ["Show the quote action on desktop", "Show the quote action on mobile"],
        },
      },
    },
    fitDisposition: "clearly_weak_or_outdated_website",
    contactEvidence: [{
      kind: "email",
      value: input.email,
      sourceUrl: new URL("/contact", input.website).href,
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: checkedAt,
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
    }],
  } as Prospect), publicLink).prospect;
}

function topProspectResultFixture(prospect: Prospect, overrides: Partial<TopProspectResult> = {}): TopProspectResult {
  const prepared = prepareTopProspectArtifacts(prospect, overrides.previewLink ?? publicLink);
  return {
    id: "result-smart-1",
    rank: 1,
    selected: true,
    rejectionReason: null,
    resultBucket: "ranked_top_prospect",
    opportunityScore: prepared.assessment.opportunityScore,
    salesScores: prepared.assessment.salesScores,
    presenceScores: prepared.assessment.presenceScores,
    mainWeakness: prepared.assessment.mainWeakness,
    whyMayBuy: prepared.assessment.whyMayBuy,
    pitchAngle: prepared.assessment.pitchAngle,
    buildPrompt: prepared.buildPrompt,
    previewLink: prepared.previewLink,
    packageStatus: "PACKAGE_GENERATED",
    packageGeneratedAt: new Date(1).toISOString(),
    packageReviewedAt: null,
    packageApprovedAt: null,
    packageSentAt: null,
    packageSkippedAt: null,
    emailQuality: prepared.emailQuality,
    prospect: prepared.prospect,
    ...overrides,
  };
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

test("queued email send readiness enforces suppression, truthful first touch, compliance, and review state", () => {
  const safeBody = [
    "Hi Ready Pressure Washing team,",
    "",
    "I came across your pressure washing business while looking at companies around Tampa, FL.",
    "",
    "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",
    "",
    "Would you like me to put together a quick preview?",
    "",
    "Thanks,",
    "",
    "Brendan",
    "WebWorkshop",
    "123 Main St, Toledo, OH",
    "",
    "If you'd rather not hear from me again, just let me know.",
  ].join("\n");
  const item = {
    id: "queued-email",
    prospectId: "prospect-1",
    topProspectResultId: "result-1",
    businessName: "Ready Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa, FL",
    website: "https://example.com",
    email: "owner@readypressurewashing.com",
    contactSource: "Public email",
    contactConfidence: 90,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: "Quick website idea for Ready Pressure Washing",
    emailBody: safeBody,
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Ready",
    blockedReason: "",
    reviewScore: 92,
    reviewSummary: "",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Queued",
    sourceProvider: "Top Prospects",
    queuedDate: new Date(0).toISOString(),
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: new Date(0).toISOString(),
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  } satisfies OutreachQueueItem;
  const settings = { ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot" as const, killSwitch: false };
  const ready = evaluateQueuedEmailSendReadiness({ environment: env(), item, queue: [item], settings });
  assert.equal(ready.ready, true, ready.blockedReasons.join("; "));

  const builtClaim = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: {
      ...item,
      emailBody: safeBody.replace(
        "I had an idea for a simpler website direction that could make it easier for people to see what you do and call or request a quote.",
        "I put together a quick website preview for you.",
      ),
    },
    queue: [item],
    settings,
  });
  assert.equal(builtClaim.ready, false);
  assert.match(builtClaim.blockedReasons.join(" "), /cannot imply that a preview is already built/i);

  const suppressed = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item,
    queue: [item, { ...item, id: "bounced", status: "Bounced", email: "owner@readypressurewashing.com" }],
    settings,
  });
  assert.equal(suppressed.ready, false);
  assert.match(suppressed.blockedReasons.join(" "), /suppressed/i);

  const notQueued = evaluateQueuedEmailSendReadiness({ environment: env(), item: { ...item, status: "Eligible" }, queue: [item], settings });
  assert.equal(notQueued.ready, false);
  assert.match(notQueued.blockedReasons.join(" "), /Only Queued email items/i);

  const contactedDomain = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, email: "sales@readypressurewashing.com" },
    queue: [item, { ...item, id: "sent-domain", status: "Sent", email: "owner@readypressurewashing.com", sentDate: new Date(0).toISOString() }],
    settings,
  });
  assert.equal(contactedDomain.ready, false);
  assert.match(contactedDomain.blockedReasons.join(" "), /business email domain was already contacted/i);

  const sharedMailboxDomain = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, email: "second@gmail.com" },
    queue: [item, { ...item, id: "sent-gmail", status: "Sent", email: "first@gmail.com", sentDate: new Date(0).toISOString() }],
    settings,
  });
  assert.equal(sharedMailboxDomain.blockedReasons.some((reason) => /business email domain|domain is suppressed/i.test(reason)), false);

  const suspiciousEmail = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, email: "admin@totalwptheme.com" },
    queue: [item],
    settings,
  });
  assert.equal(suspiciousEmail.ready, false);
  assert.match(suspiciousEmail.blockedReasons.join(" "), /needs manual verification/i);

  const staleBusinessCopy = evaluateQueuedEmailSendReadiness({
    environment: env(),
    item: { ...item, businessName: "Different Business" },
    queue: [item],
    settings,
  });
  assert.equal(staleBusinessCopy.ready, false);
  assert.match(staleBusinessCopy.blockedReasons.join(" "), /does not match the current business identity/i);
});

test("human-approved queued email sends through Resend only after every gate passes", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({
    RESEND_API_KEY: "test-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
  }));
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  let providerCalls = 0;
  let providerHeaders = new Headers();
  let providerBody: { to?: string[]; text?: string } = {};
  try {
    globalThis.fetch = async (_input, init) => {
      providerCalls += 1;
      providerHeaders = new Headers(init?.headers);
      providerBody = JSON.parse(String(init?.body ?? "{}")) as { to?: string[]; text?: string };
      return new Response(JSON.stringify({ id: "resend-message-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "send-ready-result",
    });
    assert.equal(eligible.status, "Eligible");
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true, approval.blockedReasons.join("; "));
    const queued = approval.item!;

    const result = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(result.sent, true, result.blockedReasons.join("; "));
    assert.equal(result.item?.status, "Sent");
    assert.ok(result.item?.sentDate);
    assert.match(result.item?.notes ?? "", /Resend message ID: resend-message-1/);
    assert.equal(providerCalls, 1);
    assert.equal(providerHeaders.get("Idempotency-Key"), "auto-email-pilot-initial-prospect-auto-email-eligible-prospect");
    assert.deepEqual(providerBody.to, [queued.email]);
    assert.doesNotMatch(providerBody.text ?? "", /\/engine\/|https:\/\/webworkshop\.dev\/p\//i);
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "autonomous_email_send" && event.outcome === "success"));

    const duplicate = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(duplicate.sent, false);
    assert.match(duplicate.blockedReasons.join(" "), /Only Queued email items|already has a sent date/i);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Resend receives the exact recipient snapshot that was approved and queued", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerRecipient = "";
  const prospect = eligibleProspectFor({
    id: "approved-recipient-prospect",
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    email: "approved@clearflowplumbing.com",
  });
  try {
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { to?: string[] };
      providerRecipient = body.to?.[0] ?? "";
      return new Response(JSON.stringify({ id: "approved-recipient-message" }), { status: 200 });
    };
    setProspectMemoryForTests([prospect]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect,
      topProspectResultId: "approved-recipient-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    assert.equal(approval.item?.email, "approved@clearflowplumbing.com");

    const result = await sendQueuedEmailQueueItem(eligible.id);

    assert.equal(result.sent, true, result.blockedReasons.join("; "));
    assert.equal(providerRecipient, "approved@clearflowplumbing.com");
    assert.equal(result.item?.email, "approved@clearflowplumbing.com");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Auto Email Pilot ignores unapproved inventory, then sends one approved item without the full-auto gate", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    OUTREACH_DAILY_CAP: "1",
  }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "pilot-message-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 1,
    });
    const firstProspect = eligibleProspect();
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: firstProspect,
      topProspectResultId: "pilot-explicit-approval",
    });
    assert.equal(eligible.status, "Eligible");

    const beforeApproval = await runAutoEmailPilotCycle();
    assert.equal(beforeApproval.attempted, 0);
    assert.equal(beforeApproval.sent, 0);
    assert.equal(providerCalls, 0);

    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    assert.equal(approval.item?.status, "Queued");
    const secondProspect = eligibleProspectFor({
      id: "pilot-second-prospect",
      businessName: "Summit Roofing Care",
      website: "https://summitroofingcare.com",
      email: "hello@summitroofingcare.com",
    });
    const secondEligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: secondProspect,
      topProspectResultId: "pilot-second-approval",
    });
    assert.equal((await approveAndQueueEmail(secondEligible.id)).queued, true);
    const cycle = await runAutoEmailPilotCycle();
    assert.equal(cycle.approvedQueued, 2);
    assert.equal(cycle.attempted, 1);
    assert.equal(cycle.sent, 1);
    assert.equal(providerCalls, 1);
    assert.equal(outreachQueueMemoryForTests().filter((item) => item.status === "Sent").length, 1);
    const capped = await runAutoEmailPilotCycle();
    assert.equal(capped.sent, 0);
    assert.match(capped.blockedReasons.flatMap((item) => item.reasons).join(" "), /Daily email cap has been reached/);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("processing existing qualified prospects runs the guarded Auto Email Pilot cycle", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ OUTREACH_FULL_AUTO_SEND_ENABLED: "false" }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "pilot-existing-inventory-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const prospect = eligibleProspectFor({
      id: "pilot-existing-inventory-prospect",
      businessName: "Summit Roofing Care",
      website: "https://summitroofingcare.com",
      email: "hello@summitroofingcare.com",
    });
    setProspectMemoryForTests([prospect]);
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect,
      topProspectResultId: "pilot-existing-inventory-result",
    });
    assert.equal((await approveAndQueueEmail(eligible.id)).queued, true);

    const processed = await processExistingQualifiedProspects({ dryRun: false });
    assert.equal(processed.autoEmailPilot.attempted, 1);
    assert.equal(processed.autoEmailPilot.sent, 1);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Start, Resume, and next batch production actions invoke existing-inventory Pilot processing", () => {
  const route = readFileSync(new URL("../app/api/engine/autonomous-growth/route.ts", import.meta.url), "utf8");
  assert.match(route, /startAutopilotTopProspectsHandoff[\s\S]*processExistingQualifiedProspects\(\{ dryRun: false \}\)/);
  assert.match(route, /payload\.action === "resume_autopilot"[\s\S]*processExistingQualifiedProspects\(\{ dryRun: false \}\)/);
  assert.match(route, /payload\.action === "run_autopilot_batch"[\s\S]*processExistingQualifiedProspects\(\{ dryRun: false \}\)/);
});

test("concurrent direct sends use one repository claim and one guarded provider attempt", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ OUTREACH_FULL_AUTO_SEND_ENABLED: "false" }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ id: "pilot-concurrent-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "pilot-concurrent-approval",
    });
    assert.equal((await approveAndQueueEmail(eligible.id)).queued, true);

    const [first, second] = await Promise.all([
      sendQueuedEmailQueueItem(eligible.id),
      sendQueuedEmailQueueItem(eligible.id),
    ]);
    assert.equal([first.sent, second.sent].filter(Boolean).length, 1);
    assert.equal([first.item?.status, second.item?.status].includes("Sent"), true);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("concurrent initial emails to different addresses on one business domain dispatch once", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ OUTREACH_DAILY_CAP: "5" }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ id: `same-domain-message-${providerCalls}` }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 5,
    });
    const first = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "same-domain-prospect-1",
        businessName: "Clear Flow Plumbing North",
        website: "https://clearflowplumbing.com/north",
        email: "Info@ClearFlowPlumbing.COM",
      }),
      topProspectResultId: "same-domain-result-1",
    });
    const second = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "same-domain-prospect-2",
        businessName: "Clear Flow Plumbing South",
        website: "https://clearflowplumbing.com/south",
        email: "sales@clearflowplumbing.com",
      }),
      topProspectResultId: "same-domain-result-2",
    });
    assert.equal(normalizeRecipientEmailDomain(first.email), "clearflowplumbing.com");
    assert.equal(normalizeRecipientEmailDomain(second.email), "clearflowplumbing.com");
    assert.equal((await approveAndQueueEmail(first.id)).queued, true);
    assert.equal((await approveAndQueueEmail(second.id)).queued, true);

    const results = await Promise.all([
      sendQueuedEmailQueueItem(first.id),
      sendQueuedEmailQueueItem(second.id),
    ]);

    assert.equal(providerCalls, 1);
    assert.equal(results.filter((result) => result.sent).length, 1);
    assert.equal(outreachQueueMemoryForTests().filter((item) => item.status === "Sent").length, 1);
    assert.equal(outreachQueueMemoryForTests().filter((item) => item.status === "Queued").length, 1);
    assert.match(results.flatMap((result) => result.blockedReasons).join(" "), /Rate limit reached/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("concurrent initial emails to unrelated business domains may both dispatch within the daily cap", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ OUTREACH_DAILY_CAP: "5" }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ id: `different-domain-message-${providerCalls}` }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 5,
    });
    const first = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "different-domain-prospect-1",
        businessName: "Clear Flow Plumbing",
        website: "https://clearflowplumbing.com",
        email: "info@clearflowplumbing.com",
      }),
      topProspectResultId: "different-domain-result-1",
    });
    const second = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "different-domain-prospect-2",
        businessName: "Summit Roofing Care",
        website: "https://summitroofingcare.com",
        email: "sales@summitroofingcare.com",
      }),
      topProspectResultId: "different-domain-result-2",
    });
    assert.equal((await approveAndQueueEmail(first.id)).queued, true);
    assert.equal((await approveAndQueueEmail(second.id)).queued, true);

    const results = await Promise.all([
      sendQueuedEmailQueueItem(first.id),
      sendQueuedEmailQueueItem(second.id),
    ]);

    assert.equal(providerCalls, 2);
    assert.equal(results.filter((result) => result.sent).length, 2);
    assert.equal(outreachQueueMemoryForTests().filter((item) => item.status === "Sent").length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("concurrent Pilot cycles with one daily slot create one provider call", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ OUTREACH_DAILY_CAP: "1" }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ id: "pilot-cycle-race-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 1,
    });
    const first = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "pilot-cycle-race-prospect-1",
        businessName: "Clear Flow Plumbing",
        website: "https://clearflowplumbing.com",
        email: "hello@clearflowplumbing.com",
      }),
      topProspectResultId: "pilot-cycle-race-result-1",
    });
    const second = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "pilot-cycle-race-prospect-2",
        businessName: "Summit Roofing Care",
        website: "https://summitroofingcare.com",
        email: "hello@summitroofingcare.com",
      }),
      topProspectResultId: "pilot-cycle-race-result-2",
    });
    assert.equal((await approveAndQueueEmail(first.id)).queued, true);
    assert.equal((await approveAndQueueEmail(second.id)).queued, true);

    await Promise.all([runAutoEmailPilotCycle(), runAutoEmailPilotCycle()]);

    assert.equal(providerCalls, 1);
    assert.equal(outreachQueueMemoryForTests().filter((item) => item.status === "Sent").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("two distinct claimed emails competing for one daily slot dispatch only once and release the loser", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ OUTREACH_DAILY_CAP: "1" }));
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ id: "daily-cap-race-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({
      ...defaultAutonomousGrowthSettings,
      mode: "auto_email_pilot",
      killSwitch: false,
      maxEmailsSentPerDay: 1,
    });
    const queueItems = await Promise.all([
      upsertAutonomousQueueItemFromPackage({
        outreachPreference: "written_only",
        previewLink: publicLink,
        prospect: eligibleProspectFor({
          id: "daily-cap-prospect-1",
          businessName: "Clear Flow Plumbing",
          website: "https://clearflowplumbing.com",
          email: "hello@clearflowplumbing.com",
        }),
        topProspectResultId: "daily-cap-result-1",
      }),
      upsertAutonomousQueueItemFromPackage({
        outreachPreference: "written_only",
        previewLink: publicLink,
        prospect: eligibleProspectFor({
          id: "daily-cap-prospect-2",
          businessName: "Summit Roofing Care",
          website: "https://summitroofingcare.com",
          email: "hello@summitroofingcare.com",
        }),
        topProspectResultId: "daily-cap-result-2",
      }),
    ]);
    for (const item of queueItems) assert.equal((await approveAndQueueEmail(item.id)).queued, true);

    const results = await Promise.all(queueItems.map((item) => sendQueuedEmailQueueItem(item.id)));

    assert.equal(providerCalls, 1);
    assert.equal(results.filter((result) => result.sent).length, 1);
    const current = outreachQueueMemoryForTests();
    assert.equal(current.filter((item) => item.status === "Sent").length, 1);
    assert.equal(current.filter((item) => item.status === "Queued").length, 1);
    assert.match(results.flatMap((result) => result.blockedReasons).join(" "), /Rate limit reached/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Auto Email Pilot cycle honors the auto-send gate and global kill switch", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "must-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "pilot-gate-approval",
    });
    assert.equal((await approveAndQueueEmail(eligible.id)).queued, true);

    process.env.OUTREACH_AUTO_SEND_ENABLED = "false";
    const autoDisabled = await runAutoEmailPilotCycle();
    assert.match(autoDisabled.blockedReasons.flatMap((item) => item.reasons).join(" "), /OUTREACH_AUTO_SEND_ENABLED is not true/);

    process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: true });
    const killed = await runAutoEmailPilotCycle();
    assert.match(killed.blockedReasons.flatMap((item) => item.reasons).join(" "), /Global kill switch is on/);

    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    process.env.AUTOPILOT_DISABLED = "true";
    const environmentKilled = await runAutoEmailPilotCycle();
    assert.match(environmentKilled.blockedReasons.flatMap((item) => item.reasons).join(" "), /environment kill switch/i);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("contact routing prefers a validated business email over stale form or social routing", () => {
  const eligible = eligibleProspect();
  const stale = {
    ...eligible,
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    websiteVerification: {
      ...eligible.websiteVerification!,
      canonicalUrl: "https://clearflowplumbing.com",
    },
    email: "admin@totalwptheme.com",
    contactFormUrl: "https://clearflowplumbing.com/contact",
    recommendedContactMethod: "submit_contact_form",
    bestManualContactMethod: "contact_form",
    contactEvidence: [{
      kind: "email",
      value: "hello@clearflowplumbing.com",
      sourceUrl: "https://clearflowplumbing.com/contact",
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: new Date().toISOString(),
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
    }, {
      kind: "email",
      value: "clearflowplumbing@gmail.com",
      sourceUrl: "https://clearflowplumbing.com/contact",
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: false,
      discoveredAt: new Date().toISOString(),
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The free-domain address is explicitly published as a business contact on the verified owned website.",
    }],
  } as Prospect;
  const reconciled = reconcileProspectContactRouting(stale, ["hello@clearflowplumbing.com"]);
  assert.equal(reconciled.email, "hello@clearflowplumbing.com");
  assert.equal(reconciled.recommendedContactMethod, "send_email");
  assert.equal(reconciled.bestManualContactMethod, "email");

  const websiteDiscoveredSharedMailbox = reconcileProspectContactRouting(stale, ["clearflowplumbing@gmail.com"]);
  assert.equal(websiteDiscoveredSharedMailbox.email, "clearflowplumbing@gmail.com");
  assert.equal(websiteDiscoveredSharedMailbox.recommendedContactMethod, "send_email");

  const suspicious = reconcileProspectContactRouting(stale);
  assert.equal(suspicious.email, "admin@totalwptheme.com");
  assert.equal(suspicious.recommendedContactMethod, "submit_contact_form");
  assert.equal(suspicious.bestManualContactMethod, "contact_form");
});

test("existing qualified inventory refreshes stale queue contact snapshots without duplicates", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const eligible = eligibleProspect();
  const prospect = {
    ...eligible,
    id: "reconcile-existing-prospect",
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    email: "hello@clearflowplumbing.com",
    contactFormUrl: "https://clearflowplumbing.com/contact",
    recommendedContactMethod: "submit_contact_form",
    bestManualContactMethod: "contact_form",
    websiteVerification: {
      ...eligible.websiteVerification!,
      canonicalUrl: "https://clearflowplumbing.com/",
    },
    contactEvidence: [{
      kind: "email",
      value: "hello@clearflowplumbing.com",
      sourceUrl: "https://clearflowplumbing.com/contact",
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: new Date().toISOString(),
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
    }],
  } as Prospect;
  try {
    setProspectMemoryForTests([prospect]);
    setOutreachQueueMemoryForTests([queueItem({
      id: "reconcile-existing-queue",
      prospectId: prospect.id,
      topProspectResultId: "reconcile-existing-result",
      businessName: prospect.businessName,
      website: prospect.website,
      email: "",
      contactSource: "Contact form",
      status: "Needs Review",
    })]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });

    const result = await processExistingQualifiedProspects({ dryRun: false });
    const queue = outreachQueueMemoryForTests();
    assert.equal(result.autoEmailPilot.sent, 0);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].email, "hello@clearflowplumbing.com");
    assert.equal(queue[0].contactSource, "Public email");
    assert.ok(["Eligible", "Needs Review"].includes(queue[0].status));
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Queued reconciliation preserves the approved recipient snapshot", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  const originalProspect = eligibleProspectFor({
    id: "queued-snapshot-prospect",
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    email: "approved@clearflowplumbing.com",
  });
  try {
    setProspectMemoryForTests([originalProspect]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: originalProspect,
      topProspectResultId: "queued-snapshot-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    const approved = approval.item!;
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });

    setProspectMemoryForTests([{
      ...originalProspect,
      email: "changed@clearflowplumbing.com",
    }]);
    await processExistingQualifiedProspects({ dryRun: false });

    const current = outreachQueueMemoryForTests().find((item) => item.id === approved.id)!;
    assert.equal(current.status, "Queued");
    assert.equal(current.email, approved.email);
    assert.equal(current.contactSource, approved.contactSource);
    assert.match(current.notes, /\[auto-email-approved\]/);
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Sending reconciliation preserves the claimed recipient snapshot", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  const originalProspect = eligibleProspectFor({
    id: "sending-snapshot-prospect",
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    email: "approved@clearflowplumbing.com",
  });
  try {
    setProspectMemoryForTests([originalProspect]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: originalProspect,
      topProspectResultId: "sending-snapshot-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    const approved = approval.item!;
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });
    setOutreachQueueMemoryForTests([{
      ...approved,
      status: "Sending",
      notes: `${approved.notes}\n[auto-email-claim:snapshot-test]`,
    }]);
    setProspectMemoryForTests([{
      ...originalProspect,
      email: "changed@clearflowplumbing.com",
    }]);

    await processExistingQualifiedProspects({ dryRun: false });

    const current = outreachQueueMemoryForTests().find((item) => item.id === approved.id)!;
    assert.equal(current.status, "Sending");
    assert.equal(current.email, approved.email);
    assert.equal(current.contactSource, approved.contactSource);
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("recipient changes before queueing revoke approval and require fresh approval", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerCalls = 0;
  const originalProspect = eligibleProspectFor({
    id: "recipient-change-prospect",
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    email: "first@clearflowplumbing.com",
  });
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "must-not-send" }), { status: 200 });
    };
    setProspectMemoryForTests([originalProspect]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: originalProspect,
      topProspectResultId: "recipient-change-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });
    setOutreachQueueMemoryForTests([{
      ...approval.item!,
      status: "Eligible",
      queuedDate: "",
    }]);
    setProspectMemoryForTests([{
      ...originalProspect,
      email: "second@clearflowplumbing.com",
      contactEvidence: [{
        kind: "email",
        value: "second@clearflowplumbing.com",
        sourceUrl: "https://clearflowplumbing.com/contact",
        extractionMethod: "mailto",
        confidence: "high",
        domainMatchesBusiness: true,
        discoveredAt: new Date().toISOString(),
        sourceType: "owned_website",
        firstParty: true,
        decision: "autonomous_eligible",
        decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
      }],
    }]);

    await processExistingQualifiedProspects({ dryRun: false });

    const reconciled = outreachQueueMemoryForTests().find((item) => item.id === eligible.id)!;
    assert.equal(reconciled.email, "second@clearflowplumbing.com");
    assert.notEqual(reconciled.status, "Queued");
    assert.doesNotMatch(reconciled.notes, /\[auto-email-approved\]/);

    setOutreachQueueMemoryForTests([{ ...reconciled, status: "Queued", queuedDate: new Date().toISOString() }]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const attempted = await sendQueuedEmailQueueItem(reconciled.id);
    assert.equal(attempted.sent, false);
    assert.match(attempted.blockedReasons.join(" "), /Persisted email approval is missing/);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("inventory reconciliation cannot overwrite Queued, Sending, or terminal queue states", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  const prospect = eligibleProspectFor({
    id: "protected-reconcile-prospect",
    businessName: "Clear Flow Plumbing",
    website: "https://clearflowplumbing.com",
    email: "changed@clearflowplumbing.com",
  });
  try {
    setProspectMemoryForTests([prospect]);
    const protectedItems = [
      queueItem({
        id: "protected-queued",
        prospectId: prospect.id,
        businessName: prospect.businessName,
        website: prospect.website,
        email: "approved@clearflowplumbing.com",
        contactSource: "Approved public email",
        status: "Queued",
        notes: "[auto-email-approved]",
      }),
      queueItem({
        id: "protected-sending",
        prospectId: prospect.id,
        businessName: prospect.businessName,
        website: prospect.website,
        email: "approved@clearflowplumbing.com",
        contactSource: "Approved public email",
        status: "Sending",
        notes: "[auto-email-claim:test]",
      }),
      queueItem({
        id: "protected-sent",
        prospectId: prospect.id,
        businessName: prospect.businessName,
        website: prospect.website,
        email: prospect.email,
        status: "Sent",
        sentDate: new Date().toISOString(),
      }),
      queueItem({
        id: "protected-suppressed",
        prospectId: prospect.id,
        businessName: prospect.businessName,
        website: prospect.website,
        email: prospect.email,
        status: "Suppressed",
      }),
      queueItem({ id: "protected-bounced", prospectId: prospect.id, email: prospect.email, status: "Bounced" }),
      queueItem({ id: "protected-complained", prospectId: prospect.id, email: prospect.email, status: "Complained" }),
      queueItem({ id: "protected-not-interested", prospectId: prospect.id, email: prospect.email, status: "Not Interested" }),
      queueItem({ id: "protected-opted-out", prospectId: prospect.id, email: prospect.email, status: "Opted Out" }),
      queueItem({ id: "protected-never-contact", prospectId: prospect.id, email: prospect.email, status: "Never Contact" }),
      queueItem({
        id: "protected-ambiguous",
        prospectId: prospect.id,
        email: prospect.email,
        status: "Blocked",
        notes: "[auto-email-ambiguous]",
      }),
    ];
    setOutreachQueueMemoryForTests(protectedItems);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });

    await processExistingQualifiedProspects({ dryRun: false });

    const current = outreachQueueMemoryForTests();
    for (const item of protectedItems) {
      const persisted = current.find((entry) => entry.id === item.id);
      assert.equal(persisted?.status, item.status);
      assert.equal(persisted?.email, item.email);
      assert.equal(persisted?.contactSource, item.contactSource);
    }
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("manual status updates cannot force an unsafe item into the email queue", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  delete process.env.OUTREACH_AUTO_SEND_ENABLED;
  delete process.env.RESEND_API_KEY;
  delete process.env.OUTREACH_FROM_EMAIL;
  delete process.env.OUTREACH_REPLY_TO_EMAIL;
  delete process.env.OUTREACH_POSTAL_ADDRESS;
  delete process.env.WEBWORKSHOP_POSTAL_ADDRESS;
  try {
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const unsafe = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "manual-queue-bypass-result",
    });
    assert.notEqual(unsafe.status, "Queued");

    await assert.rejects(
      updateOutreachQueueStatus(unsafe.id, "Queued"),
      /cannot change from .* to Queued through the general queue action/i,
    );
    const unchanged = outreachQueueMemoryForTests().find((item) => item.id === unsafe.id);
    assert.equal(unchanged?.status, unsafe.status);
  } finally {
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("general client status writes cannot revive Sent or suppression records", async () => {
  resetAutonomousGrowthMemoryForTests();
  try {
    setOutreachQueueMemoryForTests([
      queueItem({ id: "client-sent", status: "Sent", sentDate: new Date().toISOString() }),
      queueItem({ id: "client-suppressed", status: "Suppressed" }),
    ]);

    await assert.rejects(updateOutreachQueueStatus("client-sent", "Eligible"), /cannot change from Sent to Eligible/i);
    await assert.rejects(updateOutreachQueueStatus("client-suppressed", "Eligible"), /cannot change from Suppressed to Eligible/i);
    assert.equal(outreachQueueMemoryForTests().find((item) => item.id === "client-sent")?.status, "Sent");
    assert.equal(outreachQueueMemoryForTests().find((item) => item.id === "client-suppressed")?.status, "Suppressed");
  } finally {
    resetAutonomousGrowthMemoryForTests();
  }
});

test("email provider failures return secret-safe send errors and audit metadata", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
  }));
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      throw new Error("Network failure using secret-resend-key");
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "send-failure-secret-safe-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    const queued = approval.item!;

    const result = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(result.sent, false);
    assert.equal(result.item?.status, "Blocked");
    assert.match(result.item?.notes ?? "", /\[auto-email-ambiguous\]/);
    assert.match(result.blockedReasons.join(" "), /outcome is uncertain|manual reconciliation/i);
    assert.doesNotMatch(result.blockedReasons.join(" "), /secret-resend-key/);
    const failureAudit = memoryAuditEventsForTests().find((event) => event.action === "autonomous_email_send" && event.outcome === "failure");
    assert.ok(failureAudit);
    assert.doesNotMatch(JSON.stringify(failureAudit), /secret-resend-key/);

    const retry = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(retry.sent, false);
    assert.match(retry.blockedReasons.join(" "), /Only Queued email items/i);
    assert.equal(providerCalls, 1);

    const batch = await runFullAutoEmailBatch();
    assert.equal(batch.sent, 0);
    assert.equal(batch.attempted, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("suppression taking the claim before provider dispatch prevents outreach", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "must-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "suppression-race-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true, approval.blockedReasons.join("; "));

    const result = await sendQueuedEmailQueueItem(eligible.id, {
      beforeProviderDispatch: async () => {
        await recordEmailSuppression(approval.item!.email, "bounce", "race_test");
      },
    });

    assert.equal(result.sent, false);
    assert.equal(providerCalls, 0);
    assert.equal(result.item?.status, "Bounced");
    assert.match(result.blockedReasons.join(" "), /claim was cancelled|protected state/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("a prospect eligibility change after claim is rechecked before provider dispatch", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "must-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const prospect = eligibleProspect();
    setProspectMemoryForTests([prospect]);
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect,
      topProspectResultId: "prospect-state-race-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true, approval.blockedReasons.join("; "));

    const result = await sendQueuedEmailQueueItem(eligible.id, {
      beforeProviderDispatch: async () => {
        const current = await getProspect(prospect.id);
        assert.ok(current);
        await saveProspect({
          ...current,
          fitDisposition: "confirmed_usable_not_fit",
        });
      },
    });

    assert.equal(result.sent, false);
    assert.equal(providerCalls, 0);
    assert.equal(result.item?.status, "Needs Review", result.blockedReasons.join("; "));
    assert.match(result.blockedReasons.join(" "), /not a fit/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("a stale Queued row without persisted approval cannot reach Resend", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "must-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "stale-unapproved-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true, approval.blockedReasons.join("; "));
    const staleQueued = approval.item!;

    resetAutonomousGrowthMemoryForTests();
    setOutreachQueueMemoryForTests([staleQueued]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const result = await sendQueuedEmailQueueItem(staleQueued.id);

    assert.equal(result.sent, false);
    assert.match(result.blockedReasons.join(" "), /Persisted email approval is missing/i);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("successful provider response without an ID is blocked for reconciliation and never marked Sent", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  try {
    globalThis.fetch = async () => new Response("{}", { status: 200 });
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "missing-provider-id-result",
    });
    assert.equal((await approveAndQueueEmail(eligible.id)).queued, true);

    const result = await sendQueuedEmailQueueItem(eligible.id);

    assert.equal(result.sent, false);
    assert.equal(result.item?.status, "Blocked");
    assert.equal(result.item?.sentDate, "");
    assert.match(result.item?.notes ?? "", /\[auto-email-ambiguous\]/);
    assert.match(result.blockedReasons.join(" "), /without a valid message ID/i);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("confirmed provider rejection returns to review and revokes automatic retry approval", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ message: "invalid recipient" }), { status: 422 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "confirmed-rejection-result",
    });
    assert.equal((await approveAndQueueEmail(eligible.id)).queued, true);

    const first = await sendQueuedEmailQueueItem(eligible.id);
    const retry = await sendQueuedEmailQueueItem(eligible.id);

    assert.equal(first.sent, false);
    assert.equal(first.item?.status, "Needs Review");
    assert.match(first.blockedReasons.join(" "), /rejected.*HTTP 422/i);
    assert.equal(retry.sent, false);
    assert.equal(providerCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("fully automatic email batches are off by default and require the separate env flag", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
  process.env.OUTREACH_FULL_AUTO_SEND_ENABLED = "false";
  process.env.OUTREACH_SEND_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
  process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
  process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "full-auto-off-result",
    });
    assert.equal(queued.status, "Eligible");

    const result = await runFullAutoEmailBatch();
    assert.equal(result.fullAutoEnabled, false);
    assert.equal(result.sent, 0);
    assert.equal(providerCalls, 0);
    assert.match(result.blockedReasons.flatMap((entry) => entry.reasons).join(" "), /OUTREACH_FULL_AUTO_SEND_ENABLED is not true/);
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "autonomous_email_batch" && event.outcome === "rejected"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("OUTREACH_EMAIL_DISABLED blocks human-approved and full-auto email sends", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  process.env.OUTREACH_EMAIL_DISABLED = "false";
  process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
  process.env.OUTREACH_FULL_AUTO_SEND_ENABLED = "true";
  process.env.OUTREACH_SEND_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
  process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
  process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "email-disabled-result",
    });
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);
    const queued = approval.item!;

    process.env.OUTREACH_EMAIL_DISABLED = "true";
    const manual = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(manual.sent, false);
    assert.match(manual.blockedReasons.join(" "), /OUTREACH_EMAIL_DISABLED is true/);

    const batch = await runFullAutoEmailBatch();
    assert.equal(batch.fullAutoEnabled, true);
    assert.equal(batch.sent, 0);
    assert.match(batch.blockedReasons.flatMap((entry) => entry.reasons).join(" "), /OUTREACH_EMAIL_DISABLED is true/);
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("fully automatic email batch sends only queued public-email items through existing gates", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({
    OUTREACH_FULL_AUTO_SEND_ENABLED: "true",
    RESEND_API_KEY: "test-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
  }));
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "resend-full-auto-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "full-auto-send-result",
    });
    assert.equal(eligible.status, "Eligible");
    const approval = await approveAndQueueEmail(eligible.id);
    assert.equal(approval.queued, true);

    const result = await runFullAutoEmailBatch();
    assert.equal(result.fullAutoEnabled, true);
    assert.equal(result.attempted, 1);
    assert.equal(result.sent, 1, result.blockedReasons.flatMap((item) => item.reasons).join("; "));
    assert.equal(result.blocked, 0);
    assert.equal(providerCalls, 1);
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "autonomous_email_batch" && event.outcome === "success"));
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "autonomous_email_send" && event.outcome === "success"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("email suppression records bounces and prevents future Auto Email Pilot sends", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
  process.env.OUTREACH_SEND_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
  process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
  process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  try {
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "bounce-ready-result",
    });
    assert.notEqual(queued.status, "Queued");

    const suppression = await recordEmailSuppression(queued.email, "bounce", "resend_webhook");
    assert.equal(suppression.matched, 1);
    assert.equal(suppression.updated, 1);
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "email_suppression_record" && event.outcome === "success"));

    const send = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(send.sent, false);
    assert.match(send.blockedReasons.join(" "), /Only Queued email items|suppressed/i);
  } finally {
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("unknown suppression events create durable blockers for future queued emails", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
  process.env.OUTREACH_SEND_PROVIDER = "resend";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
  process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
  process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
  let providerCalls = 0;
  try {
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response(JSON.stringify({ id: "should-not-send" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const suppression = await recordEmailSuppression("future@suppression-test.com", "complaint", "resend_webhook");
    assert.equal(suppression.matched, 0);
    assert.equal(suppression.updated, 1);

    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspectFor({
        id: "future-suppressed-prospect",
        businessName: "Suppression Test Services",
        website: "https://suppression-test.com",
        email: "future@suppression-test.com",
      }),
      topProspectResultId: "future-suppressed-result",
    });
    assert.notEqual(queued.status, "Queued");

    const send = await sendQueuedEmailQueueItem(queued.id);
    assert.equal(send.sent, false);
    assert.match(send.blockedReasons.join(" "), /suppressed/i);
    assert.equal(providerCalls, 0);
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "email_suppression_record" && event.outcome === "success"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("duplicate queue rows for one prospect use the same stable initial-outreach idempotency key", () => {
  const first = prospectInitialEmailIdempotencyKey({
    id: "queue-a",
    prospectId: "prospect-shared",
    email: "owner@shared-business.com",
  });
  const duplicate = prospectInitialEmailIdempotencyKey({
    id: "queue-b",
    prospectId: "prospect-shared",
    email: "owner@shared-business.com",
  });
  const unrelated = prospectInitialEmailIdempotencyKey({
    id: "queue-c",
    prospectId: "prospect-other",
    email: "owner@other-business.com",
  });
  assert.equal(first, duplicate);
  assert.notEqual(first, unrelated);
  assert.match(first, /^auto-email-pilot-initial-prospect-/);
});

test("database send and approval paths use conditional serializable claims", () => {
  const repository = readFileSync(new URL("../lib/autonomous-growth-repository.ts", import.meta.url), "utf8");
  const operationalControls = readFileSync(new URL("../lib/operational-controls.ts", import.meta.url), "utf8");
  assert.match(repository, /claimQueuedEmailForSend[\s\S]*\$transaction[\s\S]*status:\s*"Queued"[\s\S]*sentDate:\s*null[\s\S]*status:\s*"Sending"/);
  assert.match(repository, /claimQueuedEmailForSend[\s\S]*queueItemHasPersistedApproval\(domain,\s*transaction\)/);
  assert.match(repository, /claimQueuedEmailForSend[\s\S]*updatedAt:\s*current\.updatedAt[\s\S]*claimed\.count\s*!==\s*1/);
  assert.match(repository, /action:\s*"autonomous_email_send_domain"[\s\S]*subject:\s*recipientDomain[\s\S]*sendWithResend\(claim\.item\)/);
  assert.match(operationalControls, /rateLimitBucket\.upsert[\s\S]*action_subject_windowStart[\s\S]*count:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(repository, /approveAndQueueEmail[\s\S]*packageStatus\s*===\s*"SENT"[\s\S]*packageSentAt[\s\S]*throw new ApprovalBlockedError/);
  assert.match(repository, /approveAndQueueEmail[\s\S]*outreachDraft\.updateMany[\s\S]*outreachQueueItem\.updateMany[\s\S]*isolationLevel:\s*"Serializable"/);
  assert.match(repository, /applySelectedWebsiteRepairsAtomically[\s\S]*\$transaction[\s\S]*assertAtomicRepairSnapshot[\s\S]*clearPersistedApproval\(transaction[\s\S]*persistProspectInTransaction\(transaction[\s\S]*isolationLevel:\s*"Serializable"/);
  assert.doesNotMatch(repository, /autoEmailPilotCyclePromise/);
});

test("Auto Email Pilot success notifications never invoke Twilio SMS", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({
    INTERNAL_NOTIFICATIONS_ENABLED: "false",
    SMS_NOTIFICATIONS_ENABLED: "false",
    INTERNAL_NOTIFY_PHONE: "+14195551234",
    TWILIO_ACCOUNT_SID: "ACtest",
    TWILIO_AUTH_TOKEN: "twilio-secret",
    TWILIO_FROM_PHONE: "+14195550000",
  }));
  const requestedUrls: string[] = [];
  try {
    globalThis.fetch = async (input) => {
      requestedUrls.push(String(input));
      return new Response(JSON.stringify({ id: "pilot-no-sms-1" }), { status: 200 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "pilot-no-sms-result",
    });
    assert.equal((await approveAndQueueEmail(eligible.id)).queued, true);
    process.env.SMS_NOTIFICATIONS_ENABLED = "true";
    assert.equal((await sendQueuedEmailQueueItem(eligible.id)).sent, true);

    assert.equal(requestedUrls.filter((url) => /api\.resend\.com\/emails/.test(url)).length, 1);
    assert.equal(requestedUrls.some((url) => /api\.twilio\.com/i.test(url)), false);
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("AUTOPILOT_DISABLED is shared by backend send readiness and the Pilot UI", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env({ AUTOPILOT_DISABLED: "true" }));
  try {
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "autopilot-disabled-result",
    });
    assert.notEqual(eligible.status, "Queued");
    assert.match(eligible.blockedReason, /Autopilot is disabled by environment kill switch/i);

    const workspace = readFileSync(new URL("../components/engine/AutonomousGrowthWorkspace.tsx", import.meta.url), "utf8");
    assert.match(workspace, /autoEmailPilotGateReasons\(\{[\s\S]*environment:\s*env/);
    assert.match(workspace, /env\.autopilotDisabled[\s\S]*Autopilot disabled by environment/);
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
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

test("phone-only prospects are blocked for written outreach queues, not sent to review", () => {
  const prospect = { ...eligibleProspect(), email: "", recommendedContactMethod: "call_first", classification: "phone_only" } as Prospect;
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
  const autoEligibility = evaluateAutoSendEligibility({
    emailQuality,
    environment: env(),
    previewGate,
    previewLink: publicLink,
    prospect,
    settings: { ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false },
  });

  assert.equal(queueStatusForPackage({
    autoEligibility,
    emailQuality,
    previewGate,
    settings: { ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false },
  }), "Blocked");
});

test("social or form prospects remain manual reviewable instead of phone-only blocked", () => {
  const base = eligibleProspect();
  for (const prospect of [
    { ...base, email: "", contactFormUrl: "https://example.com/contact", recommendedContactMethod: "submit_contact_form" },
    { ...base, email: "", facebookUrl: "https://facebook.com/example", recommendedContactMethod: "message_on_social", classification: "social_only" },
  ] as Prospect[]) {
    const previewGate = evaluatePreviewQualityGate(prospect);
    const emailQuality = evaluateOutreachEmailQuality(prospect, publicLink);
    const autoEligibility = evaluateAutoSendEligibility({
      emailQuality,
      environment: env(),
      previewGate,
      previewLink: publicLink,
      prospect,
      settings: { ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false },
    });
    assert.notEqual(queueStatusForPackage({
      autoEligibility,
      emailQuality,
      previewGate,
      settings: { ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false },
    }), "Blocked");
  }
});

test("missing or weak previews do not block truthful first-touch eligibility", () => {
  const prospect = eligibleProspect();
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
  const weakGate = evaluatePreviewQualityGate(weak);
  assert.notEqual(weakGate.status, "Eligible");
  assert.equal(eligibilityFor({ ...prospect, preview: undefined }, { previewLink: "", previewGate: weakGate }).eligible, true);
  assert.equal(eligibilityFor(weak, { previewLink: "", previewGate: weakGate }).eligible, true);

  const unsafeCopy = {
    ...prospect,
    outreach: {
      ...prospect.outreach!,
      concise: `${prospect.outreach!.concise}\nhttps://webworkshop.dev/engine/previews/prospect-1`,
    },
  };
  const quality = evaluateOutreachEmailQuality(unsafeCopy, "");
  assert.equal(quality.ready, false);
  assert.match(quality.issues.join(" "), /first touch|link/i);
});

test("preview quality does not create a pre-interest regeneration requirement", () => {
  const prospect = eligibleProspect();
  const weak = {
    ...prospect,
    preview: {
      ...prospect.preview!,
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
  const emailQuality = evaluateOutreachEmailQuality(weak, "");
  const review = evaluateSelfReview({ emailQuality, previewGate, prospect: weak });
  assert.notEqual(previewGate.status, "Eligible");
  assert.notEqual(review.recommendedNextAction, "Regenerate Preview");
  assert.deepEqual(review.regenerationPlan, []);
  assert.equal(eligibilityFor(weak, { previewLink: "", previewGate, emailQuality }).eligible, true);
});

test("missing sender settings, missing postal address, disabled env flag, and daily cap block Auto Email Pilot", () => {
  const prospect = eligibleProspect();
  assert.equal(eligibilityFor(prospect, { environment: env({ OUTREACH_AUTO_SEND_ENABLED: "false" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { environment: env({ RESEND_API_KEY: "" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { environment: env({ OUTREACH_POSTAL_ADDRESS: "" }) }).eligible, false);
  assert.equal(eligibilityFor(prospect, { emailsSentToday: 5 }).eligible, false);
  assert.equal(outreachEnvironment(env({ OUTREACH_DAILY_CAP: "2" })).dailyCap, 2);
});

test("Autopilot defaults to one-trade manual-safe review mode", () => {
  assert.equal(defaultAutopilotCampaignSettings.duration, "run_once");
  assert.equal(defaultAutopilotCampaignSettings.cadence, "manual_only");
  assert.equal(defaultAutopilotCampaignSettings.manualDmMode, true);
  assert.equal(defaultAutopilotCampaignSettings.excludePreviouslyReviewed, true);
  assert.equal(defaultAutopilotCampaignSettings.requirePreviewQuality85, false);
  assert.equal(defaultAutopilotCampaignSettings.requireWrittenContact, true);
  assert.notEqual(defaultAutopilotCampaignSettings.trade, "All Core Service Trades");
  assert.ok(autopilotActionLabels.includes("Start Autopilot"));
  assert.ok(autopilotActionLabels.includes("Run Fake Smoke Test"));
  assert.ok(autopilotProviderRequestEstimate(defaultAutopilotCampaignSettings) > 0);
});

test("Autopilot campaign transitions pause, resume, and stop without sending", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const paused = transitionAutopilotCampaign(campaign, "pause", new Date(1));
  const resumed = transitionAutopilotCampaign(paused, "resume", new Date(2));
  const stopped = transitionAutopilotCampaign(resumed, "stop", new Date(3));

  assert.equal(campaign.status, "running");
  assert.equal(paused.status, "paused");
  assert.equal(resumed.status, "running");
  assert.equal(stopped.status, "stopped");
  assert.match(stopped.notifications[0].body, /No outreach was sent/);
});

test("Autopilot translates campaign settings into a safe Top Prospects run input", () => {
  const input = autopilotTopProspectInput({
    ...defaultAutopilotCampaignSettings,
    customCities: "Toledo, OH; Tampa, FL",
    state: "OH",
    trade: "Pressure Washing",
    maxProspectsPerRun: 100,
    maxPreviewsPerRun: 20,
    requireWrittenContact: true,
  });

  assert.equal(input.trade, "Pressure Washing");
  assert.equal(input.radiusKm, 50);
  assert.equal(input.businessesToScan, 100);
  assert.equal(input.finalProspectsWanted, 20);
  assert.equal(input.outreachPreference, "written_only");
  assert.equal(input.excludePreviouslyReviewed, true);
  assert.deepEqual(input.cityTargets.map((target) => target.label), ["Toledo, OH", "Tampa, FL"]);
});

test("Autopilot market preset syncing fills Florida cities, fallback state, and estimates without running", () => {
  const floridaFields = autopilotPresetFields("florida");

  assert.ok(floridaFields);
  assert.equal(floridaFields.state, "FL");
  assert.equal(floridaFields.customCities, "Tampa, FL; St. Petersburg, FL; Clearwater, FL; Lakeland, FL; Orlando, FL; Kissimmee, FL; Jacksonville, FL; St. Augustine, FL; Sarasota, FL; Fort Myers, FL");

  const settings = {
    ...defaultAutopilotCampaignSettings,
    ...floridaFields,
    trade: "Pressure Washing" as const,
  };
  const input = autopilotTopProspectInput(settings);

  assert.equal(input.cityTargets.length, 10);
  assert.equal(input.cityTargets[0].label, "Tampa, FL");
  assert.equal(input.trade, "Pressure Washing");
  assert.equal(autopilotProviderRequestEstimate(settings), 40);
});

test("Recommended Market trade selection can hand off selected cities and trade to Autopilot", () => {
  const florida = recommendedMarketPresets.find((preset) => preset.id === "florida");

  assert.ok(florida);
  const draft = autopilotDraftFromRecommendedMarket(florida, "Pressure Washing");

  assert.equal(draft.marketPresetId, "florida");
  assert.equal(draft.state, "FL");
  assert.equal(draft.trade, "Pressure Washing");
  assert.match(draft.customCities ?? "", /Tampa, FL; St\. Petersburg, FL/);
});

test("Autopilot warns when preset and custom cities do not match", () => {
  const warning = autopilotMarketMismatchWarning({
    ...defaultAutopilotCampaignSettings,
    marketPresetId: "florida",
    customCities: "Toledo, OH; Sylvania, OH",
    state: "OH",
  });

  assert.equal(warning, "Market preset is Florida, but Custom cities look like Northwest Ohio. Update cities before starting.");
  assert.equal(autopilotMarketMismatchWarning({
    ...defaultAutopilotCampaignSettings,
    marketPresetId: "florida",
    customCities: "Tampa, FL; St. Petersburg, FL; Clearwater, FL; Lakeland, FL; Orlando, FL; Kissimmee, FL; Jacksonville, FL; St. Augustine, FL; Sarasota, FL; Fort Myers, FL",
    state: "FL",
  }), "");
});

test("recommended first real Autopilot run selects Florida Pressure Washing with safe defaults", () => {
  const settings = recommendedFirstAutopilotRunSettings();

  assert.equal(settings.marketPresetId, "florida");
  assert.match(settings.customCities, /Tampa, FL; St\. Petersburg, FL/);
  assert.equal(settings.state, "FL");
  assert.equal(settings.trade, "Pressure Washing");
  assert.equal(settings.duration, "run_once");
  assert.equal(settings.cadence, "manual_only");
  assert.equal(settings.maxProspectsPerRun, 100);
  assert.equal(settings.maxPreviewsPerRun, 0);
  assert.equal(settings.maxProspectsTotal, 20);
  assert.equal(settings.outreachStyle, "manual_social_safe");
  assert.equal(settings.excludePreviouslyReviewed, true);
  assert.equal(settings.requirePreviewQuality85, false);
  assert.equal(settings.requireWrittenContact, true);
  assert.equal(settings.manualDmMode, true);
  assert.equal(settings.loomNotifications, true);
  assert.equal(settings.stopRules.pauseOnProviderFailure, false);
});

test("Autopilot provider guardrail warns for limited live runs without blocking fake smoke tests", () => {
  const settings = recommendedFirstAutopilotRunSettings();
  const warnings = autopilotProviderGuardrailWarnings(
    settings,
    {
      level: "limited",
      label: "Limited provider setup",
      summary: "Only Azure Maps/Bing and OpenStreetMap-style coverage are available.",
      recommendation: "Configure Google Places before increasing scan count.",
      googleConfigured: false,
      yelpConfigured: false,
      azureOrBingConfigured: true,
    },
    {
      providerDiagnostics: [
        { provider: "OpenStreetMap", status: "timed_out", rawRecords: 0, withinRadius: 0, afterDeduplication: 0, usableWebsites: 0, detail: "Timed out" },
        { provider: "Azure Maps", status: "zero_results", rawRecords: 0, withinRadius: 0, afterDeduplication: 0, usableWebsites: 0, detail: "No usable records" },
      ],
    },
    { prospectsDiscovered: 0, fakeOnly: false },
  );

  assert.match(warnings.join(" "), /Google Places is missing/);
  assert.match(warnings.join(" "), /Provider Smoke Test has not passed/);
  assert.match(warnings.join(" "), /10\+ cities/);
  assert.match(warnings.join(" "), /0 discovered/);
  assert.match(warnings.join(" "), /no working discovery source/);
  assert.ok(runFakeAutopilotSmokeTest(createAutopilotCampaign(settings, new Date(0)), new Date(1)).report.fakeOnly);
});

test("Autopilot start confirmation uses the selected market, trade, duration, and no-send safety", () => {
  const confirmation = autopilotStartConfirmation({
    ...defaultAutopilotCampaignSettings,
    ...(autopilotPresetFields("florida") ?? {}),
    trade: "Pressure Washing",
    duration: "run_once",
  });

  assert.equal(confirmation.market, "Florida");
  assert.match(confirmation.citySummary, /Tampa, FL/);
  assert.equal(confirmation.trade, "Pressure Washing");
  assert.equal(confirmation.duration, "Run once");
  assert.equal(confirmation.safety, "No outreach will be sent automatically.");
});

test("fake Autopilot smoke test routes fixtures into safe queues", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const result = runFakeAutopilotSmokeTest(campaign, new Date(1));

  assert.equal(result.passed, true);
  assert.ok(result.report.fakeOnly);
  assert.ok(result.report.safetyFindings.some((finding) => /Automatic email, social DM, contact form, phone, and Loom sending stayed disabled/.test(finding)));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Glass City Pressure Washing" && fixture.actualQueue === "emailDraftReady"));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Sylvania Lawn Care" && fixture.actualQueue === "readyForManualDm"));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Toledo HVAC Equipment Supply" && fixture.actualQueue === "blockedBadFit"));
  assert.ok(result.fixtureResults.some((fixture) => fixture.businessName === "Maumee Concrete Repair" && fixture.actualQueue === "blockedBadFit"));
});

test("Autopilot dashboard shows latest run queue counts when fake smoke test does not save queue items", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const smoke = runFakeAutopilotSmokeTest(campaign, new Date(1));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, smoke.report, new Date(2)), [], true);

  assert.equal(dashboard.campaign.status, "finished");
  assert.equal(dashboard.queueCountsSource, "latest_run_report");
  assert.equal(dashboard.campaign.queueCounts.emailDraftReady, 1);
  assert.equal(dashboard.campaign.queueCounts.readyForManualDm, 1);
  assert.equal(dashboard.campaign.queueCounts.needsPreviewReview, 1);
  assert.equal(dashboard.campaign.queueCounts.loomNeeded, 1);
  assert.equal(dashboard.campaign.queueCounts.blockedBadFit, 2);
  assert.equal(dashboard.exportRows.length, 0);
});

test("Autopilot dashboard exposes the environment kill switch without blocking saved review queues", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const queueItem = {
    id: "saved-review-item",
    prospectId: "prospect-1",
    topProspectResultId: "result-1",
    businessName: "Saved Review Lead",
    trade: "Pressure Washing",
    city: "Tampa, FL",
    website: "https://example.com",
    email: "",
    contactSource: "Contact form",
    contactConfidence: 70,
    previewLink: publicLink,
    previewQualityScore: 88,
    subjectLine: "Quick website idea",
    emailBody: "",
    dmScript: "Manual draft only.",
    loomTalkingPoints: "",
    eligibilityReason: "Saved package is ready for human review.",
    blockedReason: "",
    reviewScore: 86,
    reviewSummary: "Manual review remains available.",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Needs Review",
    sourceProvider: "Top Prospects",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: new Date(1).toISOString(),
    previewVersion: "preview-v1",
    lastRegeneratedAt: "",
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(1).toISOString(),
  } satisfies OutreachQueueItem;
  const dashboard = buildAutopilotDashboard(campaign, [queueItem], true, undefined, true);

  assert.equal(dashboard.environmentKillSwitchEnabled, true);
  assert.equal(dashboard.queues.needsPreviewReview.length, 1);
  assert.ok(dashboard.safeModeSummary.includes("Autopilot is disabled by environment kill switch."));
});

test("Autopilot Live Activity shows a clear empty state before the first run", () => {
  const campaign = { ...createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0)), status: "draft" as const };
  const dashboard = buildAutopilotDashboard(campaign, [], true);

  assert.equal(dashboard.activity.status, "not_started");
  assert.equal(dashboard.activity.progressPercent, 0);
  assert.equal(dashboard.activity.currentStep, "No Autopilot run has started");
  assert.match(dashboard.activity.entries[0].label, /No Autopilot activity yet/);
  assert.equal(dashboard.activity.queueRouting.length, 6);
});

test("Autopilot Live Activity tracks a real Top Prospects job instead of fake-completing", () => {
  const campaign = createAutopilotCampaign({
    ...defaultAutopilotCampaignSettings,
    customCities: "Tampa, FL",
    state: "FL",
    trade: "Pressure Washing",
  }, new Date(0));
  const job = {
    id: "top-job-123",
    input: autopilotTopProspectInput(campaign.settings),
    status: "RUNNING",
    stage: "DISCOVER",
    discoveredCount: 25,
    scannedCount: 8,
    qualifiedCount: 3,
    skippedCount: 4,
    skipSummary: { supplier_distributor: 2, phone_only_written_outreach_blocked: 2 },
    results: [],
    reviewedNotRecommended: [],
    failureClassification: null,
    errorMessage: "",
    completedAt: null,
    createdAt: new Date(1).toISOString(),
    updatedAt: new Date(2).toISOString(),
    nextRunRecommendations: ["Wait for this Top Prospects job to finish."],
    discoveryDiagnostics: {
      rawProviderCount: 25,
      afterDistanceFilteringCount: 21,
      afterDuplicateFilteringCount: 18,
      afterQualificationFilteringCount: 9,
      returnedCount: 9,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 0, bing: 25, yelp: 0, yellowPages: 0 },
      finalMergedCount: 18,
      providerDiagnostics: {
        osm: { configured: null, queryExecuted: false, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 25, withinRadiusCount: 21, afterDeduplicationCount: 18, usableWebsiteCount: 9 },
        googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      },
      cityDiagnostics: [{
        city: "Tampa",
        state: "FL",
        label: "Tampa, FL",
        status: "completed",
        requestedCount: 100,
        rawProviderCount: 25,
        withinRadiusCount: 21,
        afterDeduplicationCount: 18,
        usableWebsiteCount: 9,
        returnedCount: 9,
        qualifiedCount: 3,
        skippedCount: 4,
        providerDiagnostics: {
          osm: { configured: null, queryExecuted: false, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          azureMaps: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 25, withinRadiusCount: 21, afterDeduplicationCount: 18, usableWebsiteCount: 9 },
          googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
          yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        },
      }],
    },
  } as TopProspectJob;
  const report = buildAutopilotTopProspectJobReport(campaign, job, new Date(3));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, report, new Date(4)), [], true);

  assert.equal(dashboard.activity.status, "top_prospects_running");
  assert.equal(dashboard.activity.topProspectJobId, "top-job-123");
  assert.equal(dashboard.activity.rawRecordsFound, 25);
  assert.equal(dashboard.activity.currentStep, "Top Prospects job running");
  assert.ok(dashboard.activity.providerDiagnostics.some((provider) => provider.provider === "Azure Maps" && provider.rawRecords === 25));
  assert.ok(dashboard.activity.cityBreakdown.some((city) => city.city === "Tampa, FL" && city.qualified === 3));
  assert.ok(dashboard.activity.entries.some((entry) => /still running/.test(entry.label)));
});

test("running Top Prospects jobs stay running and never show completed warnings", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const job = topProspectJobFixture(campaign, {
    discoveredCount: 0,
    scannedCount: 0,
    qualifiedCount: 0,
    skippedCount: 0,
    skipSummary: {},
    discoveryDiagnostics: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(30_000).toISOString(),
  });
  const report = buildAutopilotTopProspectJobReport(campaign, job, new Date(60_000));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, report, new Date(60_001)), [], true);

  assert.equal(dashboard.activity.status, "top_prospects_running");
  assert.equal(dashboard.activity.currentStep, "Top Prospects job running");
  assert.doesNotMatch(dashboard.activity.warnings.join(" "), /completed with warnings|needs review/i);
  assert.equal(dashboard.activity.rawRecordsFound, 0);
});

test("stale Top Prospects jobs show expected timeout ladder", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const job = topProspectJobFixture(campaign, {
    discoveredCount: 0,
    scannedCount: 0,
    qualifiedCount: 0,
    skippedCount: 0,
    skipSummary: {},
    discoveryDiagnostics: {
      rawProviderCount: 0,
      afterDistanceFilteringCount: 0,
      afterDuplicateFilteringCount: 0,
      afterQualificationFilteringCount: 0,
      returnedCount: 0,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
      finalMergedCount: 0,
      providerDiagnostics: jobProviderDiagnostics({
        osm: { configured: null, queryExecuted: null, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        azureMaps: { configured: true, queryExecuted: null, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      }),
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
  const fiveMinuteDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, buildAutopilotTopProspectJobReport(campaign, job, new Date(5 * 60_000)), new Date(5 * 60_000)), [], true);
  const tenMinuteDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, buildAutopilotTopProspectJobReport(campaign, job, new Date(10 * 60_000)), new Date(10 * 60_000)), [], true);
  const fifteenMinuteDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, buildAutopilotTopProspectJobReport(campaign, job, new Date(15 * 60_000)), new Date(15 * 60_000)), [], true);

  assert.equal(fiveMinuteDashboard.activity.status, "top_prospects_running");
  assert.match(fiveMinuteDashboard.activity.warnings.join(" "), /Still running longer than expected/);
  assert.equal(tenMinuteDashboard.activity.status, "top_prospects_running");
  assert.match(tenMinuteDashboard.activity.warnings.join(" "), /Possibly stuck/);
  assert.equal(fifteenMinuteDashboard.activity.status, "timed_out_needs_attention");
  assert.match(fifteenMinuteDashboard.activity.errors.join(" "), /timed out/i);
});

test("provider diagnostics map operational states clearly", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const runningJob = topProspectJobFixture(campaign, {
    discoveryDiagnostics: {
      rawProviderCount: 0,
      afterDistanceFilteringCount: 0,
      afterDuplicateFilteringCount: 0,
      afterQualificationFilteringCount: 0,
      returnedCount: 0,
      radiusKm: 50,
      categorySignals: [],
      sourceCounts: { osm: 0, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
      finalMergedCount: 0,
      providerDiagnostics: jobProviderDiagnostics({
        osm: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        azureMaps: { configured: true, queryExecuted: null, status: "not_recorded", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        googlePlaces: { configured: true, queryExecuted: true, status: "timed_out", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        yelp: { configured: true, queryExecuted: true, status: "zero_results", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      }),
    },
  });
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, buildAutopilotTopProspectJobReport(campaign, runningJob, new Date(3)), new Date(4)), [], true);
  const statusByProvider = Object.fromEntries(dashboard.activity.providerDiagnostics.map((provider) => [provider.provider, provider.status]));

  assert.equal(statusByProvider.OpenStreetMap, "not_configured");
  assert.equal(statusByProvider["Azure Maps"], "running");
  assert.equal(statusByProvider["Google Places"], "timed_out");
  assert.equal(statusByProvider.Yelp, "no_records");
});

test("completed and failed Top Prospects jobs sync real counts into Autopilot", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const completedJob = topProspectJobFixture(campaign, {
    status: "COMPLETED",
    stage: "COMPLETE",
    discoveredCount: 25,
    scannedCount: 21,
    qualifiedCount: 3,
    skippedCount: 4,
    completedAt: new Date(10).toISOString(),
  });
  const completedDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, buildAutopilotTopProspectJobReport(campaign, completedJob, new Date(11)), new Date(12)), [], true);

  assert.equal(completedDashboard.activity.status, "completed");
  assert.equal(completedDashboard.activity.rawRecordsFound, 25);
  assert.equal(completedDashboard.activity.websitesScanned, 21);
  assert.equal(completedDashboard.activity.badFitLeadsBlocked, 4);
  assert.equal(completedDashboard.activity.providerDiagnostics.find((provider) => provider.provider === "Azure Maps")?.status, "completed");

  const failedJob = topProspectJobFixture(campaign, {
    status: "FAILED",
    stage: "DISCOVER",
    discoveredCount: 0,
    scannedCount: 0,
    qualifiedCount: 0,
    skippedCount: 0,
    errorMessage: "Discovery provider error",
    completedAt: new Date(15).toISOString(),
  });
  const failedDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, buildAutopilotTopProspectJobReport(campaign, failedJob, new Date(16)), new Date(17)), [], true);

  assert.equal(failedDashboard.activity.status, "failed_during_discovery");
  assert.equal(failedDashboard.activity.currentStep, "Top Prospects job failed during discovery");
  assert.ok(failedDashboard.activity.errors.length > 0);
});

test("stopping Autopilot stops polling without claiming provider cancellation", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const report = buildAutopilotTopProspectJobReport(campaign, topProspectJobFixture(campaign), new Date(3));
  const runningCampaign = attachAutopilotRunReport(campaign, report, new Date(4));
  const stopped = transitionAutopilotCampaign(runningCampaign, "stop", new Date(5));
  const dashboard = buildAutopilotDashboard(stopped, [], true);

  assert.equal(dashboard.activity.status, "cancelled");
  assert.match(dashboard.activity.warnings.join(" "), /underlying Top Prospects job may still be running/);
  assert.doesNotMatch(dashboard.activity.warnings.join(" "), /provider job was cancelled/i);
});

test("fake Autopilot smoke activity records fake provider, blocked reasons, and queue routing without sending", () => {
  const campaign = createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0));
  const smoke = runFakeAutopilotSmokeTest(campaign, new Date(1));
  const dashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, smoke.report, new Date(2)), [], true);
  const labels = dashboard.activity.entries.map((entry) => entry.label).join(" | ");

  assert.equal(dashboard.activity.fakeOnly, true);
  assert.equal(dashboard.activity.status, "completed");
  assert.match(labels, /Fake Smoke Test Activity — no providers, no outreach/);
  assert.match(labels, /Estimated \d+ provider requests/);
  assert.match(labels, /Blocked 2 bad-fit or unsafe leads/);
  assert.match(labels, /Created 1 manual DM scripts and 1 email drafts/);
  assert.equal(dashboard.activity.providerDiagnostics[0].provider, "Fake Smoke Test");
  assert.equal(dashboard.activity.providerDiagnostics[0].status, "fake_only");
  assert.ok(dashboard.activity.blockedReasons.some((blocked) => blocked.count === 2));
  assert.ok(dashboard.activity.queueRouting.some((queue) => queue.queue === "emailDraftReady" && queue.count === 1));
  assert.ok(dashboard.activity.entries.every((entry) => !/sent automatically/i.test(entry.detail) || /Nothing was sent|No outreach was sent/i.test(entry.detail)));
});

test("Autopilot Live Activity surfaces provider, city, warning, and failed status details", () => {
  const campaign = createAutopilotCampaign({
    ...defaultAutopilotCampaignSettings,
    customCities: "Toledo, OH; Tampa, FL",
    trade: "Pressure Washing",
  }, new Date(0));
  const reportCampaign = attachAutopilotRunReport(campaign, {
    id: "run-warning",
    campaignId: campaign.id,
    status: "needs_review",
    startedAt: new Date(1).toISOString(),
    completedAt: new Date(2).toISOString(),
    marketTargets: ["Toledo, OH", "Tampa, FL"],
    providerRequestEstimate: 8,
    prospectsDiscovered: 3,
    prospectsQualified: 1,
    packagesGenerated: 1,
    queueCounts: {
      readyForManualDm: 0,
      needsPreviewReview: 0,
      loomNeeded: 0,
      emailDraftReady: 1,
      blockedBadFit: 2,
      needsHumanResearch: 0,
    },
    failedCities: [{ city: "Tampa, FL", reason: "Azure Maps timed out" }],
    safetyFindings: ["No outreach was sent."],
    recommendations: ["Try Toledo next."],
    nextRunRecommendation: "Try Toledo next.",
  }, new Date(3));
  const dashboard = buildAutopilotDashboard(reportCampaign, [
    queueItem({ id: "queue-provider", sourceProvider: "Azure Maps", city: "Toledo, OH", status: "Eligible", emailBody: "Draft", previewQualityScore: 91 }),
    queueItem({ id: "queue-phone", sourceProvider: "Azure Maps", city: "Tampa, FL", status: "Blocked", contactSource: "Phone", blockedReason: "Phone-only lead blocked by written outreach rules.", email: "" }),
  ], true);

  assert.equal(dashboard.activity.status, "completed_with_warnings");
  assert.match(dashboard.activity.warnings.join(" "), /Azure Maps timed out/);
  assert.equal(dashboard.activity.currentCity, "Tampa, FL");
  assert.equal(dashboard.activity.currentProvider, "Azure Maps");
  assert.equal(dashboard.activity.phoneOnlyLeadsBlocked, 1);
  assert.ok(dashboard.activity.cityBreakdown.some((city) => city.city === "Tampa, FL" && city.status === "failed"));
  assert.ok(dashboard.activity.providerDiagnostics.some((provider) => provider.provider === "Azure Maps" && provider.rawRecords === 2));

  const failedDashboard = buildAutopilotDashboard(attachAutopilotRunReport(campaign, { ...reportCampaign.latestRunReport!, status: "blocked" }, new Date(4)), [], true);
  assert.equal(failedDashboard.activity.status, "failed");
  assert.match(failedDashboard.activity.errors.join(" "), /blocking rule/);
});

test("Autopilot queue classification keeps Loom and weak preview items manual", () => {
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "Loom Needed", previewQualityScore: 92 })), "loomNeeded");
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "Needs Review", previewQualityScore: 74 })), "needsPreviewReview");
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "DM Draft", contactSource: "Social profile", email: "" })), "readyForManualDm");
  assert.equal(autopilotQueueKeyForItem(queueItem({ status: "Blocked", contactSource: "Phone", email: "", blockedReason: "Phone-only lead blocked by written outreach rules." })), "blockedBadFit");
});

test("opt-out and duplicate style statuses can stay blocked in the durable queue model", () => {
  assert.ok(outreachQueueStatuses.includes("Opted Out"));
  assert.ok(outreachQueueStatuses.includes("Bounced"));
  assert.ok(outreachQueueStatuses.includes("Complained"));
  assert.ok(outreachQueueStatuses.includes("Suppressed"));
  assert.ok(outreachQueueStatuses.includes("Never Contact"));
  assert.ok(outreachQueueStatuses.includes("Bad Fit"));
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
    "Hi Admin,",
    "",
    "I came across your roofing business while looking at companies around Toledo.",
    "",
    "This free audit could transform your seamless web presence.",
    "",
    "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
    "",
    "WebWorkshop",
    "[Add your business postal address before sending]",
    "If you would rather not receive another note, reply and I will close the loop.",
  ].join("\n"), "Clear Flow Plumbing LLC");

  assert.match(rewritten, /^Hi Clear Flow Plumbing team,/);
  assert.doesNotMatch(rewritten, /^Hi Admin,/);
  assert.match(rewritten, /rather not hear from me again/);
  assert.match(rewritten, /rebuild your current website with a more modern design/i);
  assert.match(rewritten, /roofing business while looking at companies around Toledo/i);
  assert.match(rewritten, /Would you be interested in seeing what that could look like\?/);
  assert.doesNotMatch(rewritten, /https:\/\/webworkshop\.dev\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.doesNotMatch(rewritten, /free audit|transform your seamless/i);
});

test("generated autonomous queue packages store the current outreach copy version", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  try {
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect: eligibleProspect(),
      topProspectResultId: "copy-version-result",
    });

    assert.equal(queued.outreachCopyVersion, currentOutreachCopyVersion);
    assert.match(queued.outreachCopyGeneratedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(queued.previewVersion, "preview-v1");
    assert.equal(queued.lastRegeneratedAt, "");
  } finally {
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("regeneration updates only unsent uncontacted packages and preserves sent or suppressed records", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const eligibleOld = queueItem({
    id: "eligible-old",
    businessName: "Eligible Pressure Washing",
    trade: "Pressure Washing",
    city: "Orlando, FL",
    outreachCopyVersion: "old_audit_copy_v0",
    emailBody: "Old audit-style copy with One missed opportunity.",
  });
  const missingPreview = queueItem({
    id: "missing-preview",
    businessName: "Missing Preview Cleaning",
    trade: "Cleaning",
    city: "Tampa, FL",
    previewLink: "",
    outreachCopyVersion: "old_audit_copy_v0",
  });
  const sent = queueItem({
    id: "already-sent",
    businessName: "Already Sent Roofing",
    status: "Sent",
    sentDate: new Date(2).toISOString(),
    outreachCopyVersion: "old_audit_copy_v0",
  });
  const suppressed = queueItem({
    id: "suppressed",
    businessName: "Suppressed HVAC",
    status: "Suppressed",
    replyStatus: "complaint",
    notes: "suppressed",
    outreachCopyVersion: "old_audit_copy_v0",
  });
  const phoneOnly = queueItem({
    id: "phone-only",
    businessName: "Phone Only Plumbing",
    contactSource: "Phone",
    blockedReason: "Phone-only / written outreach blocked",
    outreachCopyVersion: "old_audit_copy_v0",
  });
  try {
    setOutreachQueueMemoryForTests([eligibleOld, missingPreview, sent, suppressed, phoneOnly]);
    const summary = await regenerateUnsentOutreachCopy();
    const queue = outreachQueueMemoryForTests();
    const regenerated = queue.find((item) => item.id === "eligible-old");
    const regeneratedMissingPreview = queue.find((item) => item.id === "missing-preview");
    const untouchedSent = queue.find((item) => item.id === "already-sent");
    const untouchedSuppressed = queue.find((item) => item.id === "suppressed");
    const untouchedPhoneOnly = queue.find((item) => item.id === "phone-only");

    assert.equal(summary.updated, 2);
    assert.equal(summary.oldUnsentPackagesNeedingRegeneration, 2);
    assert.equal(regenerated?.outreachCopyVersion, currentOutreachCopyVersion);
    assert.match(regenerated?.emailBody ?? "", /rebuild your current website with a more modern design/i);
    assert.doesNotMatch(regenerated?.emailBody ?? "", /One missed opportunity|https:\/\/webworkshop\.dev\/p\//i);
    assert.equal(regeneratedMissingPreview?.outreachCopyVersion, currentOutreachCopyVersion);
    assert.match(regeneratedMissingPreview?.loomTalkingPoints ?? "", /Preview missing - generate\/review preview before sending yes-reply/);
    assert.equal(untouchedSent?.outreachCopyVersion, "old_audit_copy_v0");
    assert.equal(untouchedSent?.sentDate, sent.sentDate);
    assert.equal(untouchedSuppressed?.outreachCopyVersion, "old_audit_copy_v0");
    assert.equal(untouchedSuppressed?.replyStatus, "complaint");
    assert.equal(untouchedPhoneOnly?.outreachCopyVersion, "old_audit_copy_v0");
    assert.ok((summary.skippedReasons["already contacted"] ?? 0) >= 1);
    assert.ok((summary.skippedReasons["reply or suppression recorded"] ?? 0) >= 1);
    assert.ok((summary.skippedReasons["phone-only"] ?? 0) >= 1);
  } finally {
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Smart Growth summarizes existing qualified unsent prospects across queue items and saved Top Prospects results", () => {
  const queued = queueItem({
    id: "queue-smart-old",
    topProspectResultId: "result-queued",
    businessName: "Queued Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa, FL",
    outreachCopyVersion: "old_copy_v0",
  });
  const socialProspect = {
    ...eligibleProspect(),
    id: "current-social-first-landscaping",
    businessName: "Social First Landscaping",
    trade: "Landscaping",
    city: "Orlando",
    state: "FL",
    email: "",
    contactEvidence: [],
    facebookUrl: "https://facebook.com/socialfirstlandscaping",
    recommendedContactMethod: "message_on_facebook" as const,
    bestManualContactMethod: "facebook" as const,
  } satisfies Prospect;
  const topResult = topProspectResultFixture(socialProspect, {
    id: "result-social-only",
    packageStatus: "PACKAGE_GENERATED",
    resultBucket: "ranked_top_prospect",
  });
  const job = topProspectJobFixture(createAutopilotCampaign(defaultAutopilotCampaignSettings), {
    results: [topResult],
    reviewedNotRecommended: [],
  });
  const currentQueuedProspect = { ...eligibleProspect(), id: queued.prospectId };
  const summary = summarizeExistingQualifiedUnsent([queued], [job], new Date(10), [currentQueuedProspect, socialProspect]);

  assert.equal(summary.total, 2);
  assert.equal(summary.informationalOutdatedPackages, 1);
  assert.equal(summary.needsRefreshedCopy, 1);
  assert.equal(summary.alreadySavedAsQueuePackage, 1);
  assert.equal(summary.foundOnlyInTopProspectsResults, 1);
  assert.equal(summary.readyForEmailReview, 1);
  assert.equal(summary.readyForFacebookInstagramManualDm, 1);
  assert.equal(prospectCurrentBucket(socialProspect), "ready_facebook");
  assert.equal(summary.queueCounts.readyForFacebookDm, 1);
  assert.equal(summary.sourceCounts.outreachQueueItems, 1);
  assert.equal(summary.sourceCounts.rankedProspects, 1);
  assert.equal(summary.checkedSources.some((source) => /Top Prospects/i.test(source)), true);
  assert.equal(smartQueueKeyForItem(queued), "readyForEmailReview");
});

test("Smart Growth does not recommend copy refresh for legacy, strong-site, or protected records", () => {
  const currentWeak = eligibleProspect();
  const strongSite = {
    ...currentWeak,
    id: "strong-site-copy-refresh",
    fitDisposition: "strong_existing_website" as const,
    websiteVerification: {
      ...currentWeak.websiteVerification!,
      fit: {
        disposition: "strong_existing_website" as const,
        reason: "Rendered review confirms a complete professional website.",
        supportingEvidence: ["Branding, mobile layout, services, and quote paths are complete."],
        confidence: "high" as const,
        analysisOrigin: "rendered_review" as const,
        evaluatedAt: new Date().toISOString(),
      },
    },
  } satisfies Prospect;
  const legacy = {
    ...currentWeak,
    id: "legacy-copy-refresh",
    websiteVerification: undefined,
    fitDisposition: "inconclusive_requires_review" as const,
  } satisfies Prospect;
  const strongItem = queueItem({
    id: "strong-old-copy",
    prospectId: strongSite.id,
    outreachCopyVersion: "old_copy_v0",
  });
  const legacyItem = queueItem({
    id: "legacy-old-copy",
    prospectId: legacy.id,
    outreachCopyVersion: "old_copy_v0",
  });
  const suppressed = queueItem({
    id: "suppressed-old-copy",
    prospectId: "suppressed-prospect",
    outreachCopyVersion: "old_copy_v0",
    status: "Suppressed",
    replyStatus: "complaint",
  });

  const snapshot = buildSmartAutonomousGrowthSnapshot({
    queue: [strongItem, legacyItem, suppressed],
    prospects: [strongSite, legacy],
    environment: { OUTREACH_EMAIL_DISABLED: "true" } as NodeJS.ProcessEnv,
  });

  assert.equal(snapshot.existingQualifiedUnsent.needsRefreshedCopy, 0);
  assert.equal(snapshot.existingQualifiedUnsent.informationalOutdatedPackages, 2);
  assert.equal(snapshot.existingQualifiedUnsent.total, 0);
  assert.doesNotMatch(snapshot.recommendation.nextBestMove, /copy refresh/i);
  assert.doesNotMatch(snapshot.recommendation.nextBestMove, /Use existing qualified unsent/i);
  assert.match(snapshot.copySummaries.blockedReasons, /Website Adequate|Other \/ Not Currently Actionable/i);
  assert.equal(snapshot.existingQualifiedUnsent.queueCounts.suppressedDoNotContact, 1);
});

test("stale public-email queue packages cannot override adequate or strong current website evidence", () => {
  const base = eligibleProspect();
  const prospects = (["adequate_existing_website", "strong_existing_website"] as const).map((disposition, index) => ({
    ...base,
    id: `current-fit-${index}`,
    fitDisposition: disposition,
    websiteVerification: {
      ...base.websiteVerification!,
      fit: {
        ...base.websiteVerification!.fit!,
        disposition,
        reason: "Rendered review confirms the existing website is already suitable.",
        supportingEvidence: ["Branding, service content, and contact paths are complete."],
      },
    },
  } satisfies Prospect));
  const queue = prospects.map((prospect, index) => queueItem({
    id: `stale-current-fit-${index}`,
    prospectId: prospect.id,
    topProspectResultId: `stale-current-fit-result-${index}`,
    email: prospect.email,
    contactSource: "Public email",
    outreachCopyVersion: "old_copy_v0",
    status: "Needs Review",
  }));

  const summary = summarizeExistingQualifiedUnsent(queue, [], new Date(), prospects);

  assert.equal(summary.total, 0);
  assert.equal(summary.readyForEmailReview, 0);
  assert.equal(summary.readyForFacebookInstagramManualDm, 0);
  assert.equal(summary.readyForContactFormManualResearch, 0);
  assert.equal(summary.informationalOutdatedPackages, 2);
  assert.equal(summary.needsRefreshedCopy, 0);
  assert.equal(summary.queueCounts.badFitBlocked, 2);
  assert.match(JSON.stringify(summary.blockedSkippedReasons), /Website Adequate \/ Strong/);
});

test("saved Top Prospect results use the current prospect rather than stale embedded fit evidence", () => {
  const staleEmbedded = eligibleProspect();
  const current = {
    ...staleEmbedded,
    fitDisposition: "strong_existing_website" as const,
    websiteVerification: {
      ...staleEmbedded.websiteVerification!,
      fit: {
        ...staleEmbedded.websiteVerification!.fit!,
        disposition: "strong_existing_website" as const,
      },
    },
  } satisfies Prospect;
  const result = topProspectResultFixture(staleEmbedded, {
    id: "stale-saved-result",
    packageStatus: "PACKAGE_GENERATED",
  });
  const job = topProspectJobFixture(createAutopilotCampaign(defaultAutopilotCampaignSettings), {
    results: [result],
    reviewedNotRecommended: [],
  });

  const summary = summarizeExistingQualifiedUnsent([], [job], new Date(), [current]);

  assert.equal(summary.total, 0);
  assert.equal(summary.readyForEmailReview, 0);
  assert.equal(summary.foundOnlyInTopProspectsResults, 0);
  assert.equal(summary.queueCounts.badFitBlocked, 1);
});

test("legacy, inconclusive, and missing current prospect evidence fail conservative", () => {
  const base = eligibleProspect();
  const inconclusive = {
    ...base,
    id: "current-inconclusive",
    fitDisposition: "inconclusive_requires_review" as const,
    websiteVerification: {
      ...base.websiteVerification!,
      status: "inconclusive" as const,
      confidence: "low" as const,
      ownershipDecision: "unresolved" as const,
      fit: {
        disposition: "inconclusive_requires_review" as const,
        reason: "Current ownership and website-fit evidence is incomplete.",
        supportingEvidence: [],
        confidence: "low" as const,
        analysisOrigin: "metadata" as const,
        evaluatedAt: new Date().toISOString(),
      },
    },
  } satisfies Prospect;
  const queue = [
    queueItem({ id: "inconclusive-old-email", prospectId: inconclusive.id, topProspectResultId: "inconclusive-result", outreachCopyVersion: "old_copy_v0" }),
    queueItem({ id: "missing-current-old-email", prospectId: "missing-current", topProspectResultId: "missing-current-result", outreachCopyVersion: "old_copy_v0" }),
  ];

  const snapshot = buildSmartAutonomousGrowthSnapshot({
    queue,
    prospects: [inconclusive],
    environment: { OUTREACH_EMAIL_DISABLED: "true" } as NodeJS.ProcessEnv,
  });

  assert.equal(snapshot.existingQualifiedUnsent.total, 0);
  assert.equal(snapshot.existingQualifiedUnsent.readyForEmailReview, 0);
  assert.equal(snapshot.existingQualifiedUnsent.informationalOutdatedPackages, 2);
  assert.equal(snapshot.existingQualifiedUnsent.needsRefreshedCopy, 0);
  assert.equal(snapshot.existingQualifiedUnsent.queueCounts.needsManualResearch, 1);
  assert.equal(snapshot.existingQualifiedUnsent.queueCounts.badFitBlocked, 1);
  assert.match(snapshot.copySummaries.blockedReasons, /Current prospect evidence unavailable|Other \/ Not Currently Actionable/i);
  assert.doesNotMatch(snapshot.recommendation.nextBestMove, /Use existing qualified unsent|copy refresh/i);
});

test("Smart inventory requires current website-fit evidence before every written contact route", () => {
  const base = eligibleProspect();
  const manualBase = {
    ...base,
    email: "",
    contactEvidence: [],
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    profileUrl: "",
    contactFormUrl: "",
    quoteFormUrl: "",
    contactFormDetected: false,
    quoteFormDetected: false,
    recommendedContactMethod: "verify_email_manually" as const,
    bestManualContactMethod: "unknown" as const,
  } satisfies Prospect;
  const inconclusiveBase = {
    ...manualBase,
    fitDisposition: "inconclusive_requires_review" as const,
    websiteStatus: "inconclusive" as const,
    websiteVerification: {
      ...manualBase.websiteVerification!,
      status: "inconclusive" as const,
      confidence: "low" as const,
      ownershipDecision: "unresolved" as const,
      fit: {
        disposition: "inconclusive_requires_review" as const,
        reason: "Current evidence is incomplete.",
        supportingEvidence: [],
        confidence: "low" as const,
        analysisOrigin: "metadata" as const,
        evaluatedAt: new Date().toISOString(),
      },
    },
  } satisfies Prospect;
  const blockedProspects: Prospect[] = [
    { ...inconclusiveBase, id: "smart-inconclusive-facebook", facebookUrl: "https://facebook.com/inconclusive", recommendedContactMethod: "message_on_facebook" },
    { ...inconclusiveBase, id: "smart-inconclusive-instagram", instagramUrl: "https://instagram.com/inconclusive", profileUrl: "https://instagram.com/inconclusive", recommendedContactMethod: "message_on_social" },
    { ...inconclusiveBase, id: "smart-inconclusive-form", contactFormUrl: "https://example.com/contact", contactFormDetected: true, recommendedContactMethod: "submit_contact_form" },
    { ...manualBase, id: "smart-legacy-form", websiteVerification: undefined, fitDisposition: "inconclusive_requires_review", contactFormUrl: "https://example.com/legacy-contact", contactFormDetected: true, recommendedContactMethod: "submit_contact_form" },
  ];
  const verifiedWeakFacebook = {
    ...manualBase,
    id: "smart-verified-weak-facebook",
    facebookUrl: "https://facebook.com/verified-weak",
    recommendedContactMethod: "message_on_facebook" as const,
    bestManualContactMethod: "facebook" as const,
  } satisfies Prospect;
  const verifiedNoOwnedForm = {
    ...manualBase,
    id: "smart-verified-no-owned-form",
    website: "",
    websiteStatus: "no_owned_website" as const,
    fitDisposition: "no_owned_website" as const,
    contactFormUrl: "https://facebook.com/verified-business/contact",
    contactFormDetected: true,
    recommendedContactMethod: "submit_contact_form" as const,
    bestManualContactMethod: "contact_form" as const,
    websiteVerification: {
      ...manualBase.websiteVerification!,
      status: "no_owned_website" as const,
      canonicalUrl: "",
      ownershipDecision: "not_owned" as const,
      fit: {
        ...manualBase.websiteVerification!.fit!,
        disposition: "no_owned_website" as const,
      },
    },
  } satisfies Prospect;
  const prospects = [...blockedProspects, verifiedWeakFacebook, verifiedNoOwnedForm];
  const queue = [
    queueItem({ id: "smart-inconclusive-facebook-item", prospectId: blockedProspects[0]!.id, contactSource: "Facebook", email: "" }),
    queueItem({ id: "smart-inconclusive-instagram-item", prospectId: blockedProspects[1]!.id, contactSource: "Instagram", email: "" }),
    queueItem({ id: "smart-inconclusive-form-item", prospectId: blockedProspects[2]!.id, contactSource: "Contact form", email: "" }),
    queueItem({ id: "smart-legacy-form-item", prospectId: blockedProspects[3]!.id, contactSource: "Contact form", email: "" }),
    queueItem({ id: "smart-verified-weak-facebook-item", prospectId: verifiedWeakFacebook.id, contactSource: "Facebook", email: "" }),
    queueItem({ id: "smart-verified-no-owned-form-item", prospectId: verifiedNoOwnedForm.id, contactSource: "Contact form", email: "" }),
  ];
  const before = structuredClone({ prospects, queue });

  const summary = summarizeExistingQualifiedUnsent(queue, [], new Date(), prospects);

  assert.equal(summary.total, 2);
  assert.equal(summary.readyForFacebookInstagramManualDm, 1);
  assert.equal(summary.readyForContactFormManualResearch, 1);
  assert.equal(summary.queueCounts.readyForFacebookDm, 1);
  assert.equal(summary.queueCounts.readyForContactFormReview, 1);
  assert.equal(summary.queueCounts.badFitBlocked, 4);
  for (const prospect of blockedProspects) assert.equal(prospectCurrentBucket(prospect), "other_not_actionable");
  assert.equal(prospectCurrentBucket(verifiedWeakFacebook), "ready_facebook");
  assert.equal(prospectCurrentBucket(verifiedNoOwnedForm), "ready_contact_form");
  assert.deepEqual({ prospects, queue }, before);
});

test("current prospect and queue protections can only make Smart inventory more restrictive", () => {
  const currentSuppressed = {
    ...eligibleProspect(),
    id: "current-suppressed",
    recommendedContactMethod: "do_not_contact" as const,
    notes: ["Suppressed by operator."],
  } satisfies Prospect;
  const currentContacted = {
    ...eligibleProspect(),
    id: "current-contacted",
    status: "Contacted" as const,
  } satisfies Prospect;
  const queueSuppressedProspect = { ...eligibleProspect(), id: "queue-suppressed-current-eligible" } satisfies Prospect;
  const queueContactedProspect = { ...eligibleProspect(), id: "queue-contacted-current-eligible" } satisfies Prospect;
  const queueProviderAmbiguousProspect = { ...eligibleProspect(), id: "queue-provider-ambiguous-current-eligible" } satisfies Prospect;
  const routeConflictProspect = { ...eligibleProspect(), id: "queue-route-conflict" } satisfies Prospect;
  const prospects = [currentSuppressed, currentContacted, queueSuppressedProspect, queueContactedProspect, queueProviderAmbiguousProspect, routeConflictProspect];
  const queue = [
    queueItem({ id: "current-suppressed-item", prospectId: currentSuppressed.id, topProspectResultId: "current-suppressed-result" }),
    queueItem({ id: "current-contacted-item", prospectId: currentContacted.id, topProspectResultId: "current-contacted-result" }),
    queueItem({ id: "queue-suppressed-item", prospectId: queueSuppressedProspect.id, topProspectResultId: "queue-suppressed-result", status: "Suppressed", notes: "Complaint suppression." }),
    queueItem({ id: "queue-contacted-item", prospectId: queueContactedProspect.id, topProspectResultId: "queue-contacted-result", status: "Sent", sentDate: new Date().toISOString() }),
    queueItem({ id: "queue-provider-ambiguous-item", prospectId: queueProviderAmbiguousProspect.id, topProspectResultId: "queue-provider-ambiguous-result", status: "Sending", notes: "[auto-email-ambiguous] Provider outcome requires reconciliation." }),
    queueItem({ id: "route-conflict-item", prospectId: routeConflictProspect.id, topProspectResultId: "route-conflict-result", contactSource: "Social profile", email: "" }),
  ];

  const summary = summarizeExistingQualifiedUnsent(queue, [], new Date(), prospects);

  assert.equal(summary.total, 0);
  assert.equal(summary.readyForEmailReview, 0);
  assert.equal(summary.queueCounts.suppressedDoNotContact, 2);
  assert.equal(summary.queueCounts.alreadyContacted, 3);
  assert.equal(summary.queueCounts.needsManualResearch, 1);
  assert.equal(summary.skippedCount, 6);
});

test("Smart Growth still recommends copy refresh for a current grounded weak-site candidate", () => {
  const prospect = eligibleProspect();
  const oldCopy = queueItem({
    id: "current-weak-old-copy",
    prospectId: prospect.id,
    website: prospect.website,
    email: prospect.email,
    outreachCopyVersion: "old_copy_v0",
  });

  const snapshot = buildSmartAutonomousGrowthSnapshot({
    queue: [oldCopy],
    prospects: [prospect],
    environment: { OUTREACH_EMAIL_DISABLED: "true" } as NodeJS.ProcessEnv,
  });

  assert.equal(snapshot.existingQualifiedUnsent.needsRefreshedCopy, 1);
  assert.equal(snapshot.existingQualifiedUnsent.informationalOutdatedPackages, 1);
  assert.equal(snapshot.existingQualifiedUnsent.total, 1);
  assert.equal(snapshot.existingQualifiedUnsent.readyForEmailReview, 1);
  assert.match(snapshot.recommendation.nextBestMove, /copy refresh/i);
});

test("Smart Backfill, Market Scout, dashboard, and Smart Autonomous share current-evidence inventory counts", async () => {
  resetProspectMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const base = eligibleProspect();
  const strong = {
    ...base,
    id: "shared-current-evidence-strong",
    fitDisposition: "adequate_existing_website" as const,
    websiteVerification: {
      ...base.websiteVerification!,
      fit: {
        ...base.websiteVerification!.fit!,
        disposition: "adequate_existing_website" as const,
      },
    },
  } satisfies Prospect;
  const stale = queueItem({
    id: "shared-current-evidence-queue",
    prospectId: strong.id,
    topProspectResultId: "shared-current-evidence-result",
    outreachCopyVersion: "old_copy_v0",
  });
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error("Summary-only inventory checks must not call a provider."); };
    setProspectMemoryForTests([strong]);
    setOutreachQueueMemoryForTests([stale]);

    const dashboard = await getAutonomousGrowthDashboard();
    const backfill = await processExistingQualifiedProspects({ dryRun: true });
    const scout = await runMarketScoutDryRunForDashboard();
    const smart = await runSmartAutonomousDryRun();
    const totals = [
      dashboard.smartGrowth.existingQualifiedUnsent.total,
      backfill.smartGrowth.existingQualifiedUnsent.total,
      scout.smartGrowth.existingQualifiedUnsent.total,
      smart.smartGrowth.existingQualifiedUnsent.total,
    ];

    assert.deepEqual(totals, [0, 0, 0, 0]);
    assert.equal(backfill.smartGrowth.existingQualifiedUnsent.informationalOutdatedPackages, 1);
    assert.doesNotMatch(backfill.summary.nextBestAction, /Use existing qualified unsent|copy refresh/i);
    assert.doesNotMatch(scout.summary.nextBestAction, /Use existing qualified unsent|copy refresh/i);
    assert.doesNotMatch(smart.summary.nextBestAction, /Use existing qualified unsent|copy refresh/i);
    assert.equal(memoryAuditEventsForTests().some((event) => /send|provider/i.test(event.action)), false);
    assert.deepEqual(await getProspect(strong.id), strong);
    assert.deepEqual(outreachQueueMemoryForTests(), [stale]);
  } finally {
    globalThis.fetch = originalFetch;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Smart Growth skips contacted, suppressed, bad-fit, and phone-only inventory before recommending new discovery", () => {
  const sent = queueItem({ id: "sent-smart", status: "Sent", sentDate: new Date(20).toISOString(), outreachCopyVersion: "old_copy_v0" });
  const suppressed = queueItem({ id: "suppressed-smart", status: "Suppressed", replyStatus: "complaint", notes: "suppressed" });
  const phoneOnly = queueItem({ id: "phone-smart", contactSource: "Phone", blockedReason: "Phone-only / written outreach blocked" });
  const badFitProspect = withAnalysis({
    ...structuredClone(seedProspects[0]),
    businessName: "Blocked Supplier",
    email: "owner@example.com",
    recommendedContactMethod: "send_email",
  } as Prospect);
  const badFit = topProspectResultFixture(badFitProspect, {
    id: "result-bad-fit",
    selected: false,
    rejectionReason: "Supplier/distributor",
    resultBucket: "blocked",
  });
  const job = topProspectJobFixture(createAutopilotCampaign(defaultAutopilotCampaignSettings), {
    results: [],
    reviewedNotRecommended: [badFit],
    blockedProspects: [badFit],
  });
  const snapshot = buildSmartAutonomousGrowthSnapshot({
    queue: [sent, suppressed, phoneOnly],
    topProspectJobs: [job],
    environment: { OUTREACH_EMAIL_DISABLED: "true" } as NodeJS.ProcessEnv,
    now: new Date(30),
  });

  assert.equal(snapshot.existingQualifiedUnsent.total, 0);
  assert.equal(snapshot.existingQualifiedUnsent.skippedCount, 4);
  assert.match(snapshot.copySummaries.blockedReasons, /Already Contacted|Suppressed|Phone-Only|Supplier/);
  assert.match(snapshot.recommendation.nextBestMove, /Market Scout/i);
  assert.doesNotMatch(snapshot.copySummaries.debug, /DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|GOOGLE_PLACES_API_KEY|secret-/i);
});

test("queue items removed from email eligibility require manual research even when the stored address is preserved", () => {
  const item = queueItem({
    id: "manual-email-verification",
    email: "admin@totalwptheme.com",
    contactSource: "Needs manual verification",
    status: "Needs Review",
  });

  assert.equal(smartQueueKeyForItem(item), "needsManualResearch");
});

test("routine no-send audit notes do not move an eligible email record into contacted inventory", () => {
  const item = queueItem({
    id: "routine-no-send-audit",
    email: "hello@readybusiness.com",
    contactSource: "Public email",
    status: "Needs Review",
    notes: "Provider test completed; no outreach was sent. Emails sent: 0.",
  });

  assert.equal(smartQueueKeyForItem(item), "readyForEmailReview");
});

test("Market Scout dry run stays bounded and recommends a market without provider calls or sends", () => {
  const scout = buildMarketScoutDryRun({
    marketsToTest: ["Tampa, FL", "Orlando, FL", "Dallas, TX"],
    tradesToTest: ["Pressure Washing", "Landscaping", "HVAC"],
    scoutSampleSizePerMarketTrade: 12,
    maxTotalScoutRecords: 30,
  }, [], new Date(40));

  assert.equal(scout.bounded, true);
  assert.equal(scout.totalEstimatedRecords <= 30, true);
  assert.ok(scout.results.length > 0);
  assert.ok(scout.bestResult);
  assert.match(scout.bestResult?.recommendationReason ?? "", /dry run and made no provider calls/i);
  assert.doesNotMatch(JSON.stringify(scout), /DATABASE_URL|GOOGLE_PLACES_API_KEY|RESEND_API_KEY|secret-/i);
});

function queueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  const now = new Date().toISOString();
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
    emailBody: "Hi there,\n\nI made you a quick preview showing how the site could be cleaner and easier for people to request a quote.\n\nIf you would rather not receive another note, reply and I will close the loop.",
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
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: now,
    previewVersion: "preview-v1",
    lastRegeneratedAt: "",
    createdAt: now,
    updatedAt: now,
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

test("casual DM playbook asks permission before the manual Lovable build", () => {
  const prospect = {
    ...eligibleProspect(),
    website: "",
    websiteStatus: "no_owned_website",
    profileUrl: "https://facebook.com/sample-roofing",
    prospectType: "no_website_social_only",
    classification: "social_only",
    recommendedContactMethod: "message_on_facebook",
  } as Prospect;
  const playbook = casualDmPlaybook(prospect, publicLink);

  assert.match(playbook.firstDm, /build you a modern website from the ground up/i);
  assert.match(playbook.firstDm, /Would you be interested in seeing what that could look like\?/i);
  assert.doesNotMatch(playbook.firstDm, /https?:\/\/|\/p\//);
  assert.doesNotMatch(playbook.firstDm, /\b(?:I|we)\s+(?:built|made|created|put together)\b.{0,50}\bpreview\b/i);
  assert.match(playbook.yesReply, /I'll put together a website concept and send you a quick video walkthrough/i);
  assert.doesNotMatch(playbook.yesReply, /https?:\/\/|\/p\//);
  assert.match(playbook.sendAfterLoom, /Video walkthrough:/);
  assert.match(playbook.sendAfterLoom, /Website:/);
  assert.match(playbook.sendAfterLoom, /\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.match(playbook.pricingReply, /one-time price is \$1,000/);
  assert.match(playbook.pricingReply, /\$49\/month/);
  assert.match(playbook.higherSupportReply, /\$79\/month/);
  assert.match(playbook.starterPageReply, /\$500/);
});

test("Prospect Said Yes creates a Preview Build Needed task instead of sending", () => {
  assert.ok(outreachQueueStatuses.includes("Prospect Said Yes"));
  assert.ok(outreachQueueStatuses.includes("Preview Build Needed"));
  assert.equal(queueStatusAfterManualAction("Prospect Said Yes"), "Preview Build Needed");
  assert.equal(queueStatusAfterManualAction("First DM Sent"), "First DM Sent");
});

test("Loom Needed task exposes checklist, fix notes, scripts, and no auto-send path", () => {
  const task = loomNeededTaskForQueueItem(queueItem({
    status: "Loom Needed",
    regenerationPlan: ["make layout more believable"],
    improvementSuggestions: ["fix image relevance"],
    detectedIssues: ["Preview copy is generic."],
  }));

  assert.equal(task.businessName, "Sample Roofing");
  assert.equal(task.canMarkReadyForLoom, false);
  assert.ok(task.checklist.some((check) => check.key === "manual_preview_qa" && !check.passed));
  assert.ok(task.fixNotes.includes("make layout more believable"));
  assert.equal(task.recommendation.recommended, false);
  assert.match(task.recommendation.whyRecommended, /Wait until/);
  assert.match(task.scripts.loomScript, /This is not live yet/);
  assert.match(task.scripts.sendAfterLoom, /Website:/);
});

test("strong Loom preview can be marked ready only after public preview and quality checks pass", () => {
  const task = loomNeededTaskForQueueItem(queueItem({
    status: "Loom Needed",
    previewQualityScore: 92,
    regenerationPlan: [],
    improvementSuggestions: [],
    detectedIssues: [],
  }));

  assert.equal(task.canMarkReadyForLoom, true);
});

test("Loom recommendation appears only for high-value prospects with visual reason", () => {
  const recommended = loomRecommendationForQueueItem(queueItem({
    status: "Loom Needed",
    contactSource: "Facebook",
    previewQualityScore: 92,
    reviewScore: 84,
    detectedIssues: ["Current homepage makes the quote path hard to see."],
    improvementSuggestions: ["Preview shows a clearer quote path above the fold."],
    regenerationPlan: [],
  }));
  const blockedPhone = loomRecommendationForQueueItem(queueItem({
    status: "Loom Needed",
    contactSource: "Phone",
    previewQualityScore: 92,
    reviewScore: 84,
    detectedIssues: ["Current homepage makes the quote path hard to see."],
    improvementSuggestions: ["Preview shows a clearer quote path above the fold."],
    regenerationPlan: [],
  }));
  const weakPreview = loomRecommendationForQueueItem(queueItem({
    status: "Loom Needed",
    contactSource: "Facebook",
    previewQualityScore: 72,
    reviewScore: 84,
    detectedIssues: ["Current homepage makes the quote path hard to see."],
    regenerationPlan: ["make layout more believable"],
  }));

  assert.equal(recommended.recommended, true);
  assert.match(recommended.title, /Sample Roofing/);
  assert.equal(recommended.talkingPoints.length, 3);
  assert.match(recommended.currentSiteIssue, /quote path/);
  assert.match(recommended.previewLink, /\/p\/abcdefghijklmnopqrstuvwxyzABCDEF/);
  assert.equal(blockedPhone.recommended, false);
  assert.equal(weakPreview.recommended, false);
});

test("manual preview build notification is internal-only and secret-safe", () => {
  const item = queueItem({ status: "Preview Build Needed" });
  const notification = loomNeededNotificationDraft(item, {
    OUTREACH_NOTIFY_EMAIL: "operator@example.com",
    OUTREACH_NOTIFY_FROM_EMAIL: "alerts@webworkshop.dev",
    OUTREACH_NOTIFY_ON_LOOM_NEEDED: "true",
    RESEND_API_KEY: "secret-resend-key",
  });

  assert.equal(notification.configured, true);
  assert.match(notification.subject, /Manual preview build needed: Sample Roofing/);
  assert.match(notification.body, /manual|Lovable/i);
  assert.doesNotMatch(JSON.stringify(notification), /secret-resend-key|operator@example.com|alerts@webworkshop.dev/);
});


test("pre-interest Top Prospect artifacts create outreach without a preview", () => {
  const prospect = { ...eligibleProspect(), preview: undefined };
  const prepared = prepareTopProspectOutreachArtifacts(prospect, "written_only");
  assert.equal(prepared.previewLink, "");
  assert.equal(prepared.buildPrompt, "");
  assert.equal(prepared.prospect.preview, undefined);
  assert.match(prepared.prospect.outreach?.concise ?? "", /Would you be interested in seeing what that could look like\?/i);
});

test("approval snapshot rejects a changed reviewed draft", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  try {
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const eligible = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: "",
      prospect: eligibleProspect(),
      topProspectResultId: "stale-approval-snapshot",
    });
    const result = await approveAndQueueEmail(eligible.id, {
      businessName: eligible.businessName,
      email: eligible.email,
      subjectLine: eligible.subjectLine,
      emailBody: `${eligible.emailBody}\nchanged after review`,
      outreachCopyVersion: eligible.outreachCopyVersion,
      updatedAt: eligible.updatedAt,
    });
    assert.equal(result.queued, false);
    assert.match(result.blockedReasons.join(" "), /changed after review/i);
    assert.notEqual(result.item?.status, "Queued");
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("post-interest polish state is protected from pre-contact reconciliation", async () => {
  const originalEnv = { ...process.env };
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  Object.assign(process.env, env());
  const prospect = eligibleProspectFor({
    id: "protected-polish-prospect",
    businessName: "Protected Polish Plumbing",
    website: "https://protectedpolishplumbing.com",
    email: "approved@protectedpolishplumbing.com",
  });
  try {
    setProspectMemoryForTests([{ ...prospect, email: "changed@protectedpolishplumbing.com" }]);
    const protectedItem = queueItem({
      id: "protected-polish-item",
      prospectId: prospect.id,
      businessName: prospect.businessName,
      website: prospect.website,
      email: "approved@protectedpolishplumbing.com",
      status: "Preview Needs Polish",
      previewLink: "https://lovable.app/protected-polish-preview",
    });
    setOutreachQueueMemoryForTests([protectedItem]);
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "manual_approval", killSwitch: false });
    await processExistingQualifiedProspects({ dryRun: false });
    const current = outreachQueueMemoryForTests().find((item) => item.id === protectedItem.id);
    assert.equal(current?.status, "Preview Needs Polish");
    assert.equal(current?.email, "approved@protectedpolishplumbing.com");
  } finally {
    process.env = originalEnv;
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("real approval UI submits the exact draft snapshot instead of clicking a rendered row", () => {
  const route = readFileSync(new URL("../app/api/engine/autonomous-growth/route.ts", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../components/engine/AutonomousGrowthWorkspace.tsx", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../components/engine/EmailDraftReviewHelper.tsx", import.meta.url), "utf8");
  assert.match(route, /expectedApprovalSnapshot[\s\S]*Review the exact current recipient/);
  assert.match(workspace, /expectedApprovalSnapshot:[\s\S]*emailBody: item\.emailBody[\s\S]*updatedAt: item\.updatedAt/);
  assert.match(helper, /expectedApprovalSnapshot:[\s\S]*emailBody: selectedItem\.emailBody[\s\S]*updatedAt: selectedItem\.updatedAt/);
  assert.doesNotMatch(helper, /approveButton\.click\(\)/);
});

test("bulk copy regeneration preserves the saved contact first name from the live prospect", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetProspectMemoryForTests();
  const prospect = eligibleProspect();
  Object.assign(prospect, {
    id: "named-regeneration-prospect",
    businessName: "Pinnacle Pressure Washing of Toledo",
    city: "Toledo",
    state: "OH",
    email: "nick@pinnacle419.com",
    contactPersonName: "Nick Smith",
  });
  prospect.contactEvidence = [{
    kind: "email",
    value: prospect.email,
    sourceUrl: `${prospect.website.replace(/\/$/, "")}/contact`,
    extractionMethod: "mailto",
    confidence: "high",
    domainMatchesBusiness: true,
    discoveredAt: new Date().toISOString(),
    sourceType: "owned_website",
    firstParty: true,
    decision: "autonomous_eligible",
    decisionReason: "The business-domain address is publicly displayed on the verified owned website.",
  }, {
    kind: "contact_person",
    value: "Nick Smith",
    sourceUrl: `${prospect.website.replace(/\/$/, "")}/contact`,
    extractionMethod: "visible_text",
    confidence: "high",
    domainMatchesBusiness: true,
    discoveredAt: new Date().toISOString(),
    sourceType: "owned_website",
    firstParty: true,
    decisionReason: "The operator verified this name against the first-party contact page.",
  }];
  setProspectMemoryForTests([prospect]);
  setOutreachQueueMemoryForTests([queueItem({
    id: "named-regeneration-package",
    prospectId: prospect.id,
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: "Toledo, OH",
    email: prospect.email,
    contactSource: "Public email",
    status: "Needs Review",
    outreachCopyVersion: "old_copy_v0",
    emailBody: "Old audit-style copy with One missed opportunity.",
    sentDate: "",
    replyStatus: "",
    notes: "",
  })]);

  const summary = await regenerateUnsentOutreachCopy();
  const refreshed = outreachQueueMemoryForTests()[0];
  assert.equal(summary.updated, 1);
  assert.equal(refreshed.outreachCopyVersion, currentOutreachCopyVersion);
  assert.match(refreshed.emailBody, /^Hi Nick,/);
  assert.match(refreshed.emailBody, /quote request is difficult to reach on the current website/i);
  assert.match(refreshed.emailBody, /rebuild your current website with a more modern design that makes requesting a quote easier/i);
});

test("verified contact first name save updates the prospect and only the linked editable draft", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetProspectMemoryForTests();
  resetOperationalMemoryForTests();
  try {
    const prospect = eligibleProspect();
    Object.assign(prospect, {
      id: "verified-name-editor-prospect",
      businessName: "Pinnacle Pressure Washing of Toledo",
      city: "Toledo",
      state: "OH",
      email: "nick@pinnacle419.com",
      contactPersonName: "",
    });
    prospect.outreach = generateOutreach(prospect, publicLink);
    await saveProspect(prospect);
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: publicLink,
      prospect,
      topProspectResultId: "verified-name-editor-result",
    });
    assert.match(queued.emailBody, /^Hi Pinnacle Pressure Washing of Toledo team,/);

    const result = await saveVerifiedContactFirstNameAndRegenerate(queued.id, "Nick Smith", queued.updatedAt);
    assert.equal(result?.contactFirstName, "Nick");
    assert.match(result?.item.emailBody ?? "", /^Hi Nick,/);
    const savedProspect = await getProspect(prospect.id);
    assert.equal(savedProspect?.contactPersonName, "Nick");
    assert.equal(savedProspect?.contactEvidence.some((item) => item.kind === "contact_person" && item.value === "Nick" && item.firstParty), true);
    assert.equal(result?.item.status, queued.status);
    assert.equal(result?.item.sentDate, "");

    await assert.rejects(
      saveVerifiedContactFirstNameAndRegenerate(result!.item.id, "nick@pinnacle419.com", result!.item.updatedAt),
      /verified person's first name/i,
    );
    await assert.rejects(
      saveVerifiedContactFirstNameAndRegenerate(result!.item.id, "Owner", result!.item.updatedAt),
      /verified person's first name/i,
    );
  } finally {
    resetProspectMemoryForTests();
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

