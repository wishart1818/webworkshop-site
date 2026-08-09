import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  currentOutreachCopyVersion,
  defaultAutonomousGrowthSettings,
  type OutreachQueueItem,
} from "../lib/autonomous-growth";
import {
  outreachQueueMemoryForTests,
  getAutonomousGrowthSettings,
  resetAutonomousGrowthMemoryForTests,
  safeReadinessRepairProtectionReason,
  setOutreachQueueMemoryForTests,
  updateAutonomousGrowthSettings,
} from "../lib/autonomous-growth-repository";
import {
  internalNotificationBody,
  internalNotificationEnvironment,
  internalSmsBody,
  internalSmsEnvironment,
  maskOperatorPhone,
  sendInternalOperatorNotification,
  sendInternalOperatorSms,
} from "../lib/internal-notifications";
import {
  buildProviderSmokeTestRecord,
  latestOperatorSafeTestResults,
  recordOperatorSafeTestResult,
} from "../lib/operator-test-history";
import { memoryAuditEventsForTests, resetOperationalMemoryForTests } from "../lib/operational-controls";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import {
  getProspect,
  resetProspectMemoryForTests,
  setProspectMemoryForTests,
} from "../lib/prospect-repository";
import {
  currentPermissionFirstWebsiteWordingPasses,
  generateOneTestOutreachPackage,
  getOperatorTestCenterPayload,
  runFullAutonomousReadinessTest,
  runOperatorMarketScoutDryRun,
  runOperatorSmartAutonomousDryRun,
  runOperatorSmartBackfillTest,
  runSafeReadinessRepair,
  simulateNext24Hours,
} from "../lib/operator-test-center";
import { OperatorTestCenterWorkspace } from "../components/engine/OperatorTestCenterWorkspace";

function successfulGoogleProviderDiagnostics() {
  return {
    rawProviderCount: 1,
    afterDistanceFilteringCount: 1,
    afterDuplicateFilteringCount: 1,
    afterQualificationFilteringCount: 1,
    returnedCount: 1,
    radiusKm: 10,
    categorySignals: [],
    sourceCounts: { osm: 0, google: 1, bing: 0, yelp: 0, yellowPages: 0 },
    finalMergedCount: 1,
    providerDiagnostics: {
      osm: { configured: true, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      azureMaps: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      googlePlaces: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 1, withinRadiusCount: 1, afterDeduplicationCount: 1, usableWebsiteCount: 1, envVarPresent: true, endpointVersion: "New", safeErrorMessage: "" },
      yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
    },
  } as const;
}

const readinessPreviewLink = "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF";

function readinessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GOOGLE_PLACES_API_KEY: "actual-google-key",
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    OUTREACH_EMAIL_DISABLED: "false",
    OUTREACH_AUTO_SEND_ENABLED: "true",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

function readinessQueueItem(overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  const now = new Date().toISOString();
  return {
    id: "queue-readiness",
    prospectId: "prospect-readiness",
    topProspectResultId: "result-readiness",
    businessName: "Ready Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa, FL",
    website: "https://readypressurewashing.com",
    email: "owner@readypressurewashing.com",
    contactSource: "Public email",
    contactConfidence: 90,
    previewLink: readinessPreviewLink,
    previewQualityScore: 91,
    subjectLine: "Quick website idea for Ready Pressure Washing",
    emailBody: [
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
      "",
      "147 George St, Findlay, OH 45840",
      "",
      "If you'd rather not hear from me again, just let me know.",
    ].join("\n"),
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Public email package is ready for review.",
    blockedReason: "",
    reviewScore: 86,
    reviewSummary: "Keep.",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Queued",
    sourceProvider: "Google Places",
    queuedDate: now,
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

function evidenceReadyProspectForQueue(
  item: OutreachQueueItem,
  overrides: Partial<Prospect> = {},
) {
  const checkedAt = new Date().toISOString();
  const website = item.website || "https://readypressurewashing.example";
  const legitimateEmail = overrides.email || (item.email.includes("totalwptheme.com")
    ? "owner@suspicious-email-co.example"
    : item.email);
  const base = createProspect({
    businessName: item.businessName,
    website,
    email: legitimateEmail,
    city: item.city.split(",")[0] || "Tampa",
    state: item.city.split(",")[1]?.trim() || "FL",
    trade: item.trade || "Pressure Washing",
    status: "Reviewed",
  });
  const host = new URL(website).hostname;
  const observation = {
    kind: "quote_path" as const,
    statement: "I noticed the quote request is difficult to find from the main service page.",
    rebuildSentence: "I can rebuild your current website with a more modern design that gives the quote request a clear place alongside your services, while also making your services, contact information, and quote request easier for customers to find.",
    evidence: ["A rendered review found that the quote action is separated from the main service content."],
    demoChecklist: ["Show the quote action beside the primary services"],
  };
  return {
    ...base,
    id: item.prospectId,
    status: "Reviewed",
    websiteStatus: "usable",
    websiteStatusDetail: "A current owned website and one grounded rebuild issue were verified.",
    fitDisposition: "clearly_weak_or_outdated_website",
    contactEvidence: [{
      kind: "email",
      value: legitimateEmail,
      sourceUrl: `https://${host}/contact`,
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: checkedAt,
      lastVerifiedAt: checkedAt,
      sourceType: "owned_website",
      firstParty: true,
      decision: "autonomous_eligible",
      decisionReason: "The exact business mailbox is visibly published on the owned contact page.",
    }],
    websiteVerification: {
      version: "website-verification-v2",
      status: "usable",
      confidence: "high",
      canonicalUrl: `${website.replace(/\/$/, "")}/`,
      attempts: [],
      usableSignals: ["meaningful page title", "business name", "navigation", "service content", "mobile viewport"],
      explanation: "A meaningful owned business website was verified.",
      checkedAt,
      ownershipDecision: "owned",
      identityEvidence: ["The saved business identity and website host match."],
      fit: {
        disposition: "clearly_weak_or_outdated_website",
        reason: "A rendered review verified one customer-facing quote-path issue.",
        supportingEvidence: observation.evidence,
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: checkedAt,
        observation,
      },
    },
    ...overrides,
  } satisfies Prospect;
}

test("internal notification test only sends to INTERNAL_NOTIFY_EMAIL", async () => {
  const calls: Array<{ to?: string[]; subject?: string; text?: string; authorization?: string }> = [];
  const result = await sendInternalOperatorNotification({
    kind: "operator_test",
    title: "Internal notification test",
    marketTrade: "Operator Test Center",
    resultCount: 1,
    attention: "Operator needs to verify alerts.",
    nextAction: "Check the internal inbox.",
    pagePath: "/engine?tab=operator-test-center",
  }, {
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
    RESEND_API_KEY: "secret-resend-key",
  } as NodeJS.ProcessEnv, async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { to?: string[]; subject?: string; text?: string };
    calls.push({
      ...body,
      authorization: String((init?.headers as Record<string, string>).Authorization ?? ""),
    });
    return new Response(JSON.stringify({ id: "internal-test-1" }), { status: 200 });
  });

  assert.equal(result.sent, true);
  assert.equal(result.toOperatorOnly, true);
  assert.deepEqual(calls[0].to, ["operator@example.com"]);
  assert.doesNotMatch(calls[0].text ?? "", /prospect@example\.com|DATABASE_URL|secret-resend-key/i);
  assert.match(calls[0].authorization ?? "", /Bearer secret-resend-key/);
});
test("internal notification env is separate from prospect email kill switches", () => {
  const env = internalNotificationEnvironment({
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_EMAIL_DISABLED: "true",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
  } as NodeJS.ProcessEnv);

  assert.equal(env.configured, true);
  assert.equal(env.hasNotifyEmail, true);
  assert.equal(env.hasNotifyFromEmail, true);
});

test("internal SMS test only sends to INTERNAL_NOTIFY_PHONE", async () => {
  const calls: Array<{ to?: string | null; from?: string | null; body?: string | null; authorization?: string }> = [];
  const result = await sendInternalOperatorSms({
    kind: "operator_test",
    title: "Internal SMS test",
    marketTrade: "Operator Test Center",
    resultCount: 1,
    attention: "Operator needs to verify alerts.",
    nextAction: "Check the internal phone.",
    pagePath: "/engine?tab=operator-test-center",
  }, {
    SMS_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_PHONE: "+14195551234",
    TWILIO_ACCOUNT_SID: "twilio-account-sid",
    TWILIO_AUTH_TOKEN: "secret-twilio-token",
    TWILIO_FROM_PHONE: "+14195550000",
    NEXT_PUBLIC_SITE_URL: "https://webworkshop.dev",
  } as NodeJS.ProcessEnv, async (_input, init) => {
    const body = new URLSearchParams(String(init?.body ?? ""));
    calls.push({
      to: body.get("To"),
      from: body.get("From"),
      body: body.get("Body"),
      authorization: String((init?.headers as Record<string, string>).Authorization ?? ""),
    });
    return new Response(JSON.stringify({ sid: "sms-test-1" }), { status: 200 });
  });

  assert.equal(result.sent, true);
  assert.equal(result.toOperatorOnly, true);
  assert.deepEqual(calls.map((call) => call.to), ["+14195551234"]);
  assert.equal(calls[0].from, "+14195550000");
  assert.match(calls[0].body ?? "", /WebWorkshop: Internal SMS test/);
  assert.match(calls[0].body ?? "", /https:\/\/webworkshop\.dev\/engine\?tab=operator-test-center/);
  assert.doesNotMatch(calls[0].body ?? "", /secret-twilio-token|DATABASE_URL|prospect/i);
  assert.match(calls[0].authorization ?? "", /^Basic /);
});

test("SMS does not run when disabled and requires Twilio env vars", async () => {
  let fetchCalled = false;
  const disabled = await sendInternalOperatorSms({
    kind: "operator_test",
    title: "Internal SMS test",
    attention: "Operator only.",
    nextAction: "Configure SMS.",
  }, {
    SMS_NOTIFICATIONS_ENABLED: "false",
    INTERNAL_NOTIFY_PHONE: "+14195551234",
    TWILIO_ACCOUNT_SID: "twilio-account-sid",
    TWILIO_AUTH_TOKEN: "secret-twilio-token",
    TWILIO_FROM_PHONE: "+14195550000",
  } as NodeJS.ProcessEnv, async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });
  const missing = await sendInternalOperatorSms({
    kind: "operator_test",
    title: "Internal SMS test",
    attention: "Operator only.",
    nextAction: "Configure SMS.",
  }, {
    SMS_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_PHONE: "",
    TWILIO_ACCOUNT_SID: "",
    TWILIO_AUTH_TOKEN: "",
    TWILIO_FROM_PHONE: "",
  } as NodeJS.ProcessEnv, async () => {
    fetchCalled = true;
    return new Response("{}", { status: 200 });
  });

  assert.equal(disabled.sent, false);
  assert.match(disabled.blockedReasons.join(" "), /SMS_NOTIFICATIONS_ENABLED/);
  assert.equal(missing.sent, false);
  assert.match(missing.blockedReasons.join(" "), /TWILIO_ACCOUNT_SID|TWILIO_AUTH_TOKEN|TWILIO_FROM_PHONE|INTERNAL_NOTIFY_PHONE/);
  assert.equal(fetchCalled, false);
});

test("SMS body masks lead phone numbers and uses app links without exposing secrets", () => {
  const body = internalSmsBody({
    kind: "phone_only_blocked",
    title: "Phone-only prospect needs review",
    marketTrade: "Pressure Washing near Tampa",
    resultCount: 1,
    attention: "Lead phone +14195550099 needs manual research.",
    nextAction: "Open Test Center and review contact paths.",
    pagePath: "/engine?tab=operator-test-center",
  }, {
    NEXT_PUBLIC_APP_URL: "https://webworkshop.dev",
  } as NodeJS.ProcessEnv);

  assert.match(body, /WebWorkshop: Phone-only prospect needs review/);
  assert.match(body, /Open: https:\/\/webworkshop\.dev\/engine\?tab=operator-test-center/);
  assert.match(body, /\[phone redacted\]/);
  assert.doesNotMatch(body, /\+14195550099|TWILIO_AUTH_TOKEN|secret/i);
  assert.equal(maskOperatorPhone("+14195551234"), "+1*****1234");
});

test("Operator Test Center summaries expose gate statuses without secrets", async () => {
  const originalEnv = { ...process.env };
  try {
    process.env.RESEND_API_KEY = "secret-resend-key";
    process.env.OUTREACH_SEND_PROVIDER = "resend";
    process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
    process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
    process.env.OUTREACH_POSTAL_ADDRESS = "147 George St, Findlay, OH 45840";
    process.env.OUTREACH_EMAIL_DISABLED = "true";
    process.env.OUTREACH_AUTO_SEND_ENABLED = "false";
    process.env.OUTREACH_FULL_AUTO_SEND_ENABLED = "false";
    process.env.INTERNAL_NOTIFICATIONS_ENABLED = "false";
    process.env.SMS_NOTIFICATIONS_ENABLED = "true";
    process.env.INTERNAL_NOTIFY_PHONE = "+14195551234";
    process.env.TWILIO_ACCOUNT_SID = "twilio-account-sid";
    process.env.TWILIO_AUTH_TOKEN = "secret-twilio-token";
    process.env.TWILIO_FROM_PHONE = "+14195550000";

    const payload = await getOperatorTestCenterPayload();
    const summaryBlob = JSON.stringify(payload.summaries);

    assert.match(payload.summaries.emailSafety, /OUTREACH_EMAIL_DISABLED/i);
    assert.match(payload.summaries.emailSafety, /Full auto: blocked/i);
    assert.match(payload.summaries.fullStatus, /Provider coverage/i);
    assert.match(payload.summaries.regenerationSummary, /Latest outreach copy version/i);
    assert.match(payload.summaries.regenerationSummary, /Informational outdated unsent packages/i);
    assert.match(payload.summaries.smsNotifications, /optional and hidden from primary readiness guidance/i);
    assert.match(payload.summaries.smartRecommendation, /Will not do|No outreach|Market Scout|existing qualified/i);
    assert.match(payload.nextRecommendedTest, /Internal alerts|Internal email notifications|Internal notifications|Provider coverage|Top Prospects|First-touch|Resend/i);
    assert.doesNotMatch(payload.nextRecommendedTest, /SMS|Twilio/i);
    assert.doesNotMatch(summaryBlob, /secret-resend-key|secret-twilio-token|DATABASE_URL|postgres:\/\/|operator@example.com|\+14195551234/i);
    assert.ok(payload.statusCards.some((card) => card.label === "Internal notifications"));
    assert.equal(payload.statusCards.some((card) => /SMS|Twilio|Operator phone/i.test(card.label)), false);
    assert.ok(payload.statusCards.some((card) => card.label === "Latest Outreach Copy Version"));
    assert.ok(payload.statusCards.some((card) => card.label === "Informational outdated unsent packages"));
  } finally {
    process.env = originalEnv;
  }
});

test("outdated unsent packages are named in readiness output instead of appearing only as a count", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  const outdated = readinessQueueItem({
    id: "queue-outdated-social",
    prospectId: "prospect-outdated-social",
    topProspectResultId: "result-outdated-social",
    businessName: "Named Outdated Package",
    contactSource: "Social profile",
    email: "",
    status: "DM Draft",
    queuedDate: "",
    outreachCopyVersion: "standardized_permission_first_v2",
  });
  const current = readinessQueueItem({
    id: "queue-current-social",
    prospectId: "prospect-current-social",
    topProspectResultId: "result-current-social",
    businessName: "Current Package",
    contactSource: "Social profile",
    email: "",
    status: "DM Draft",
    queuedDate: "",
  });
  setOutreachQueueMemoryForTests([current]);
  const baselineReadiness = await runFullAutonomousReadinessTest(readinessEnv({
    OUTREACH_EMAIL_DISABLED: "true",
    OUTREACH_AUTO_SEND_ENABLED: "false",
  }));
  setOutreachQueueMemoryForTests([outdated, current]);
  const before = outreachQueueMemoryForTests();
  const settingsBefore = await getAutonomousGrowthSettings();
  const auditBefore = memoryAuditEventsForTests();

  try {
    const payload = await getOperatorTestCenterPayload();
    const readiness = await runFullAutonomousReadinessTest(readinessEnv({
      OUTREACH_EMAIL_DISABLED: "true",
      OUTREACH_AUTO_SEND_ENABLED: "false",
    }));

    assert.match(payload.summaries.regenerationSummary, /Informational outdated unsent packages: 1/);
    assert.match(payload.summaries.regenerationSummary, /Named Outdated Package/);
    assert.match(payload.summaries.regenerationSummary, /prospect prospect-outdated-social/);
    assert.match(payload.summaries.regenerationSummary, /package queue-outdated-social/);
    assert.doesNotMatch(payload.summaries.regenerationSummary, /Current Package \[prospect/);
    assert.equal(payload.statusCards.find((card) => card.label === "Informational outdated unsent packages")?.status, "ready");
    assert.equal(readiness.readiness?.outdatedCopyRecords.length, 1);
    assert.equal(readiness.readiness?.outdatedCopyRecords[0]?.businessName, "Named Outdated Package");
    assert.equal(readiness.readiness?.outdatedCopyRecords[0]?.prospectId, "prospect-outdated-social");
    assert.equal(readiness.readiness?.outdatedCopyRecords[0]?.packageId, "queue-outdated-social");
    assert.equal(readiness.readiness?.failed.length, baselineReadiness.readiness?.failed.length);
    assert.equal(readiness.readiness?.failedRecords.length, baselineReadiness.readiness?.failedRecords.length);
    assert.equal(readiness.readiness?.failedRecords.length, 0);
    assert.match(readiness.readiness?.summaries.full ?? "", /Blocking current-evidence records needing attention: 0/);
    assert.doesNotMatch(readiness.readiness?.summaries.full ?? "", /Eligible records needing attention/i);
    assert.match(readiness.readiness?.summaries.full ?? "", /Informational outdated packages: 1/);
    assert.match(readiness.readiness?.summaries.failedOnly ?? "", /Named Outdated Package/);
    assert.match(readiness.readiness?.summaries.failedOnly ?? "", /standardized_permission_first_v2/);
    assert.deepEqual(outreachQueueMemoryForTests(), before);
    assert.deepEqual(await getAutonomousGrowthSettings(), settingsBefore);
    const nonReadinessHistoryAfter = memoryAuditEventsForTests().filter((event) => event.action !== "operator_test_center_result");
    const nonReadinessHistoryBefore = auditBefore.filter((event) => event.action !== "operator_test_center_result");
    assert.deepEqual(nonReadinessHistoryAfter, nonReadinessHistoryBefore);
  } finally {
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
  }
});

test("Full Readiness reports stale strong-site queue inventory as informational rather than qualified", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const stale = readinessQueueItem({
    id: "readiness-stale-strong-site",
    prospectId: "readiness-current-strong-site",
    topProspectResultId: "readiness-current-strong-site-result",
    businessName: "Current Strong Site",
    outreachCopyVersion: "old_copy_v0",
    status: "Needs Review",
    contactSource: "Public email",
  });
  const current = evidenceReadyProspectForQueue(stale, {
    fitDisposition: "adequate_existing_website",
  });
  current.websiteVerification = {
    ...current.websiteVerification!,
    fit: {
      ...current.websiteVerification!.fit!,
      disposition: "adequate_existing_website",
      reason: "Rendered review confirms the current website is already suitable.",
      supportingEvidence: ["Branding, service content, and contact paths are complete."],
    },
  };
  setOutreachQueueMemoryForTests([stale]);
  setProspectMemoryForTests([current]);
  const queueBefore = structuredClone(outreachQueueMemoryForTests());
  const prospectBefore = structuredClone(await getProspect(current.id));

  try {
    const result = await runFullAutonomousReadinessTest(readinessEnv({
      OUTREACH_EMAIL_DISABLED: "true",
      OUTREACH_AUTO_SEND_ENABLED: "false",
    }));
    const existingCheck = result.readiness?.checks.find((check) => check.key === "existing-qualified");
    const outdatedCheck = result.readiness?.checks.find((check) => check.key === "outdated-copy");
    const scoutInventoryCheck = result.readiness?.checks.find((check) => check.key === "market-scout-existing-inventory");

    assert.match(existingCheck?.detail ?? "", /^0 existing qualified unsent prospect/);
    assert.match(outdatedCheck?.detail ?? "", /1 informational outdated package/);
    assert.match(outdatedCheck?.detail ?? "", /0 current-qualified package/);
    assert.equal(scoutInventoryCheck?.status, "passed");
    assert.deepEqual(outreachQueueMemoryForTests(), queueBefore);
    assert.deepEqual(await getProspect(current.id), prospectBefore);
    assert.equal(memoryAuditEventsForTests().some((event) => /send|provider/i.test(event.action)), false);
  } finally {
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
    resetProspectMemoryForTests();
  }
});

test("readiness separates legacy and source-less email records from autonomous eligibility", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const legacy = readinessQueueItem({
    id: "legacy-evidence-package",
    prospectId: "legacy-evidence-prospect",
    businessName: "Legacy Evidence Co",
    status: "Needs Review",
    queuedDate: "",
    outreachCopyVersion: "standardized_permission_first_v2",
  });
  const sourceLess = readinessQueueItem({
    id: "source-less-package",
    prospectId: "source-less-prospect",
    businessName: "Source Less Email Co",
    status: "Needs Review",
    queuedDate: "",
  });
  const sourceLessProspect = {
    ...evidenceReadyProspectForQueue(sourceLess),
    contactEvidence: [],
  } satisfies Prospect;
  setOutreachQueueMemoryForTests([legacy, sourceLess]);
  setProspectMemoryForTests([sourceLessProspect]);
  const queueBefore = outreachQueueMemoryForTests();
  const prospectBefore = JSON.stringify(await getProspect(sourceLessProspect.id));
  try {
    const result = await runFullAutonomousReadinessTest(readinessEnv({
      OUTREACH_EMAIL_DISABLED: "true",
      OUTREACH_AUTO_SEND_ENABLED: "false",
    }));
    assert.equal(result.readiness?.autonomouslyEligibleRecords, 0);
    assert.ok(result.readiness?.evidenceReviewRecords.some((record) => record.packageId === legacy.id && record.evidenceState === "legacy_candidate"));
    assert.ok(result.readiness?.evidenceReviewRecords.some((record) => record.packageId === sourceLess.id && record.evidenceState === "evidence_incomplete" && /source URL|provenance/i.test(record.reason)));
    assert.equal(result.readiness?.failedRecords.some((record) => [legacy.id, sourceLess.id].includes(record.packageId)), false);
    assert.match(result.readiness?.summaries.full ?? "", /Autonomously eligible queue records: 0/);
    assert.doesNotMatch(result.readiness?.summaries.full ?? "", /Eligible records needing attention/i);
    assert.deepEqual(outreachQueueMemoryForTests(), queueBefore);
    assert.equal(JSON.stringify(await getProspect(sourceLessProspect.id)), prospectBefore);
  } finally {
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
    resetProspectMemoryForTests();
  }
});

test("Pinnacle-style strong website is excluded before any outdated copy regeneration recommendation", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const item = readinessQueueItem({
    id: "strong-site-old-copy",
    prospectId: "strong-site-prospect",
    businessName: "Pinnacle-style Strong Site",
    status: "Needs Review",
    queuedDate: "",
    outreachCopyVersion: "standardized_permission_first_v2",
  });
  const evidenceReady = evidenceReadyProspectForQueue(item);
  const strong = {
    ...evidenceReady,
    fitDisposition: "strong_existing_website" as const,
    websiteVerification: {
      ...evidenceReady.websiteVerification!,
      fit: {
        disposition: "strong_existing_website" as const,
        reason: "Rendered review confirms a professional, complete existing website.",
        supportingEvidence: ["Branding, mobile layout, services, and quote paths are complete."],
        confidence: "high" as const,
        analysisOrigin: "rendered_review" as const,
        evaluatedAt: new Date().toISOString(),
      },
    },
  } satisfies Prospect;
  setOutreachQueueMemoryForTests([item]);
  setProspectMemoryForTests([strong]);
  const before = outreachQueueMemoryForTests();
  try {
    const result = await runFullAutonomousReadinessTest(readinessEnv({
      OUTREACH_EMAIL_DISABLED: "true",
      OUTREACH_AUTO_SEND_ENABLED: "false",
    }));
    assert.equal(result.readiness?.failedRecords.some((record) => record.packageId === item.id), false);
    assert.ok(result.readiness?.excludedRecords.some((record) => record.packageId === item.id && /adequate or strong.*regardless of business score/i.test(record.excludedReason)));
    assert.match(result.readiness?.outdatedCopyRecords.find((record) => record.packageId === item.id)?.proposedChange ?? "", /Keep this draft informational and do not regenerate/i);
    assert.equal(result.readiness?.autonomouslyEligibleRecords, 0);
    assert.deepEqual(outreachQueueMemoryForTests(), before);
  } finally {
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
    resetProspectMemoryForTests();
  }
});

test("Provider Smoke Test history persists successful Google Places results and refresh uses them", async () => {
  resetOperationalMemoryForTests();
  const originalEnv = { ...process.env };
  try {
    process.env.GOOGLE_PLACES_API_KEY = "actual-google-key";
    const record = buildProviderSmokeTestRecord({
      startedAt: new Date(1).toISOString(),
      completedAt: new Date().toISOString(),
      diagnostics: successfulGoogleProviderDiagnostics(),
      sampleCount: 1,
      createdOutreachPackages: false,
      sentOutreach: false,
    });
    await recordOperatorSafeTestResult(record);

    const latest = await latestOperatorSafeTestResults();
    const payload = await getOperatorTestCenterPayload();
    const google = payload.providerHealth.find((provider) => provider.provider === "googlePlaces");

    assert.equal(latest.provider_smoke?.outcome, "success");
    assert.equal(latest.provider_smoke?.providerResults?.find((provider) => provider.provider === "googlePlaces")?.outcome, "success");
    assert.equal(google?.lastStatus, "succeeded");
    assert.notEqual(google?.lastStatus, "not_run");
    assert.match(payload.latestSafeTestResults.providerSmokeTest, /Status: success|Provider smoke test passed/i);
    assert.match(payload.latestSafeTestResults.providerSmokeTest, /Packages created: no/);
    assert.match(payload.latestSafeTestResults.providerSmokeTest, /Outreach sent: no/);
    assert.doesNotMatch(JSON.stringify(payload), /actual-google-key|DATABASE_URL|postgres:\/\//i);
  } finally {
    process.env = originalEnv;
    resetOperationalMemoryForTests();
  }
});

test("Full Readiness consumes persisted provider success and separates missing key from untested provider", async () => {
  resetOperationalMemoryForTests();
  const originalEnv = { ...process.env };
  try {
    process.env.GOOGLE_PLACES_API_KEY = "actual-google-key";
    await recordOperatorSafeTestResult(buildProviderSmokeTestRecord({
      startedAt: new Date(1).toISOString(),
      completedAt: new Date().toISOString(),
      diagnostics: successfulGoogleProviderDiagnostics(),
      sampleCount: 1,
      createdOutreachPackages: false,
      sentOutreach: false,
    }));
    const success = await runFullAutonomousReadinessTest({
      GOOGLE_PLACES_API_KEY: "actual-google-key",
      OUTREACH_SEND_PROVIDER: "resend",
      RESEND_API_KEY: "secret-resend-key",
      OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
      OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
      OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
      OUTREACH_EMAIL_DISABLED: "true",
      OUTREACH_AUTO_SEND_ENABLED: "false",
      OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
      INTERNAL_NOTIFICATIONS_ENABLED: "true",
      INTERNAL_NOTIFY_EMAIL: "operator@example.com",
      INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
    } as NodeJS.ProcessEnv);
    assert.equal(success.readiness?.checks.find((check) => check.key === "google-provider")?.status, "passed");
    assert.doesNotMatch(success.readiness?.summaries.debug ?? "", /Configure Google Places/i);

    resetOperationalMemoryForTests();
    const untested = await runFullAutonomousReadinessTest({
      GOOGLE_PLACES_API_KEY: "actual-google-key",
      OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    } as NodeJS.ProcessEnv);
    assert.match(untested.readiness?.checks.find((check) => check.key === "google-provider")?.detail ?? "", /no persisted Provider Smoke Test/i);
    assert.match(untested.readiness?.checks.find((check) => check.key === "google-provider")?.fix ?? "", /Run Provider Smoke Test/i);

    delete process.env.GOOGLE_PLACES_API_KEY;
    const missing = await runFullAutonomousReadinessTest({
      OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    } as NodeJS.ProcessEnv);
    assert.match(missing.readiness?.checks.find((check) => check.key === "google-provider")?.fix ?? "", /Add GOOGLE_PLACES_API_KEY/i);
  } finally {
    process.env = originalEnv;
    resetOperationalMemoryForTests();
  }
});

test("Internal notification and Resend test results persist with masked recipients", async () => {
  resetOperationalMemoryForTests();
  await recordOperatorSafeTestResult({
    testType: "internal_notification",
    startedAt: new Date(1).toISOString(),
    completedAt: new Date(2).toISOString(),
    outcome: "success",
    summary: "Internal test message sent only to the configured operator email.",
    maskedDestination: "o***@example.com",
    providerMessageId: "safe-message-id",
  });
  await recordOperatorSafeTestResult({
    testType: "internal_resend",
    startedAt: new Date(3).toISOString(),
    completedAt: new Date(4).toISOString(),
    outcome: "success",
    summary: "Internal Resend test sent only to the configured operator email.",
    maskedDestination: "o***@example.com",
    providerMessageId: "safe-message-id-2",
  });

  const payload = await getOperatorTestCenterPayload();

  assert.match(payload.latestSafeTestResults.internalNotificationTest, /Status: success/);
  assert.match(payload.latestSafeTestResults.internalNotificationTest, /Recipient: o\*\*\*@example\.com/);
  assert.match(payload.latestSafeTestResults.internalResendTest, /Status: success/);
  assert.doesNotMatch(JSON.stringify(payload.latestSafeTestResults), /operator@example\.com|secret|RESEND_API_KEY|DATABASE_URL/i);
  resetOperationalMemoryForTests();
});

test("Operator Test Center smart dry runs render summaries and send nothing", async () => {
  const backfill = await runOperatorSmartBackfillTest();
  const scout = await runOperatorMarketScoutDryRun();
  const smart = await runOperatorSmartAutonomousDryRun();

  for (const result of [backfill, scout, smart]) {
    assert.equal(result.ok, true);
    assert.equal(result.smartGrowth?.dryRun, true);
    assert.match(result.message, /No email, DM, form, call, or Loom was sent/i);
    assert.match(result.smartGrowth?.summary.summaryText ?? "", /No emails sent|No DMs sent|No contact forms submitted|No calls placed|No Looms/i);
    assert.doesNotMatch(JSON.stringify(result), /DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|GOOGLE_PLACES_API_KEY|secret-/i);
  }
  assert.match(scout.smartGrowth?.summary.bestMarketTradeRecommendation ?? "", /Pressure Washing|Landscaping|Cleaning|Painting|Concrete|Roofing|HVAC|Plumbing/);
});

test("Simulate Next 24 Hours is a no-send dry run with operator queue counts", async () => {
  const result = await simulateNext24Hours();

  assert.equal(result.ok, true);
  assert.equal(result.simulation?.wouldNotDo.some((line) => /No prospect email sent/i.test(line)), true);
  assert.equal(result.simulation?.wouldNotDo.some((line) => /No social DMs sent/i.test(line)), true);
  assert.equal(result.simulation?.wouldNotDo.some((line) => /No contact forms submitted/i.test(line)), true);
  assert.ok((result.simulation?.counts.phoneCallQueue ?? 0) >= 0);
  assert.match(result.simulation?.summary ?? "", /Simulate Next 24 Hours/i);
});

test("Operator Test Center fake package models the manual Lovable workflow without outreach activity", () => {
  const result = generateOneTestOutreachPackage({
    WEBWORKSHOP_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  } as NodeJS.ProcessEnv);
  const fake = result.fakePackage;

  assert.equal(result.ok, true);
  assert.match(result.message, /No provider calls, prospects, or outreach sends were created/);
  assert.equal(fake?.label, "TEST / FAKE");
  assert.equal(fake?.businessName, "Test Pressure Washing Co.");
  assert.match(fake?.tradeCity ?? "", /Pressure Washing near Orlando, FL/);
  assert.match(fake?.recommendedContactPath ?? "", /manual review only/i);
  assert.equal(result.packagePreview?.firstEmailLinkFree, true);
  assert.equal(result.packagePreview?.firstDmLinkFree, true);
  assert.equal(result.packagePreview?.yesReplyLinkFree, true);
  assert.equal(result.packagePreview?.currentWebsiteWording, true);
  assert.match(result.packagePreview?.publicPreviewLink ?? "", /^https:\/\/webworkshop\.dev\/p\//);
  assert.ok(fake?.scripts.some((script) => script.label === "First email script" && /Would you be interested in seeing what that could look like\?/i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "First Facebook/Instagram DM script" && /Would you be interested in seeing what that could look like\?/i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "Softer DM script"));
  assert.ok(fake?.scripts.some((script) => script.label === "Yes-reply / manual-build confirmation" && /I'll put together a website concept and send you a quick video walkthrough/i.test(script.body) && !/https?:\/\/|\/p\//i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "Pricing reply"));
  assert.ok(fake?.scripts.some((script) => script.label === "Follow-up"));
  assert.ok(fake?.scripts.some((script) => script.label === "Not interested reply"));
  assert.match(fake?.fullSummary ?? "", /rebuild your current website with a more modern design/i);
  const firstEmail = fake?.scripts.find((script) => script.label === "First email script")?.body ?? "";
  const observation = "I noticed the current quote request is difficult to find from the main service page.";
  const rebuildSentence = "I can rebuild your current website with a more modern design that gives the quote request a clear place alongside your core services, while also making your services, contact information, and quote request easier for customers to find.";
  assert.match(firstEmail, /I noticed the current quote request is difficult to find/i);
  assert.equal(currentPermissionFirstWebsiteWordingPasses({ firstEmail, observation, rebuildSentence }), true);
  assert.ok(firstEmail.indexOf(observation) < firstEmail.indexOf(rebuildSentence));
  assert.ok(firstEmail.indexOf(rebuildSentence) < firstEmail.indexOf("Would you be interested in seeing what that could look like?"));
  assert.match(fake?.fullSummary ?? "", /No email, DM, form, phone call, or Loom was sent/i);
  assert.doesNotMatch(fake?.scripts.find((script) => script.label === "First email script")?.body ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(fake?.scripts.find((script) => script.label === "First Facebook\/Instagram DM script")?.body ?? "", /https:\/\/webworkshop\.dev\/p\//i);
  assert.doesNotMatch(fake?.fullSummary ?? "", /will get you more calls|DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|secret/i);
});

test("Full Autonomous Readiness Test is dry-run and reports OUTREACH_EMAIL_DISABLED", async () => {
  const result = await runFullAutonomousReadinessTest({
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    OUTREACH_EMAIL_DISABLED: "true",
    OUTREACH_AUTO_SEND_ENABLED: "false",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
  } as NodeJS.ProcessEnv);

  assert.equal(result.readiness?.manualEmailTest.status, "Blocked");
  assert.ok(result.readiness?.manualEmailTest.reasons.includes("Manual prospect email send is blocked by OUTREACH_EMAIL_DISABLED."));
  assert.match(result.message, /Full Autonomous Readiness Test finished/);
  assert.match(result.readiness?.summaries.full ?? "", /No prospect emails were sent/);
  assert.match(result.readiness?.summaries.full ?? "", /No DMs were sent/);
  assert.match(result.readiness?.summaries.full ?? "", /No contact forms were submitted/);
  assert.match(result.readiness?.summaries.full ?? "", /No phone calls were placed/);
  assert.match(result.readiness?.summaries.full ?? "", /No Looms were recorded or sent/);
  assert.doesNotMatch(JSON.stringify(result.readiness?.summaries), /secret-resend-key|operator@example\.com|postgres:\/\/|secret-twilio-token|actual-google-key/i);
});

test("Full Autonomous Readiness Test blocks full-auto when hard gates are missing", async () => {
  const result = await runFullAutonomousReadinessTest({
    OUTREACH_SEND_PROVIDER: "resend",
    OUTREACH_EMAIL_DISABLED: "false",
    OUTREACH_AUTO_SEND_ENABLED: "false",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  } as NodeJS.ProcessEnv);

  assert.notEqual(result.readiness?.fullAutoEmail.status, "Ready");
  assert.match(result.readiness?.fullAutoEmail.reasons.join(" "), /OUTREACH_AUTO_SEND_ENABLED is not true/);
  assert.match(result.readiness?.fullAutoEmail.reasons.join(" "), /OUTREACH_FULL_AUTO_SEND_ENABLED is not true/);
  assert.ok(result.readiness?.optional.some((check) => check.label === "Full Auto Email final readiness"));
  assert.match(result.readiness?.summaries.safeToTest ?? "", /Full Auto Email: Not recommended yet/);
});

test("Full Autonomous Readiness Test checks manual-build copy, existing prospects, saved results, and queue items", async () => {
  const result = await runFullAutonomousReadinessTest({
    OUTREACH_SEND_PROVIDER: "resend",
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_FROM_EMAIL: "Brendan <hello@webworkshop.dev>",
    OUTREACH_REPLY_TO_EMAIL: "brendan@webworkshop.dev",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
    OUTREACH_EMAIL_DISABLED: "false",
    OUTREACH_AUTO_SEND_ENABLED: "false",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
  } as NodeJS.ProcessEnv);
  const labels = result.readiness?.checks.map((check) => check.label).join("\n") ?? "";

  assert.match(labels, /First-touch email has no preview link/);
  assert.match(labels, /Yes-reply confirms a manual build and stays link-free/);
  assert.match(labels, /Existing qualified unsent prospects checked/);
  assert.match(labels, /Saved Top Prospects results checked/);
  assert.match(labels, /Outreach queue items checked/);
  assert.equal(result.readiness?.checks.find((check) => check.key === "first-email-link-free")?.status, "passed");
  assert.equal(result.readiness?.checks.find((check) => check.key === "yes-reply-manual-build")?.status, "passed");
  assert.doesNotMatch(result.readiness?.summaries.debug ?? "", /\/engine\/previews|secret-resend-key|postgres:\/\/|twilio-auth-token|google-places-key/i);
});

test("Full Readiness excludes blocked old-copy records from pilot-blocking failures", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const originalEnv = { ...process.env };
  try {
    process.env.GOOGLE_PLACES_API_KEY = "actual-google-key";
    await recordOperatorSafeTestResult(buildProviderSmokeTestRecord({
      startedAt: new Date(1).toISOString(),
      completedAt: new Date().toISOString(),
      diagnostics: successfulGoogleProviderDiagnostics(),
      sampleCount: 1,
      createdOutreachPackages: false,
      sentOutreach: false,
    }));
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const queuedReady = readinessQueueItem({ id: "queued-ready", prospectId: "prospect-ready", topProspectResultId: "result-ready" });
    const blockedOldCopy = readinessQueueItem({
      id: "blocked-old-copy",
      prospectId: "prospect-blocked",
      topProspectResultId: "result-blocked",
      businessName: "Blocked Old Copy",
      email: "owner@blockedoldcopy.example",
      website: "https://blockedoldcopy.example",
      status: "Blocked",
      queuedDate: "",
      blockedReason: "Bad fit / do not contact.",
      outreachCopyVersion: "old_audit_copy_v0",
      emailBody: "Old audit copy with One missed opportunity.",
    });
    const affirmativelyContacted = readinessQueueItem({
      id: "affirmatively-contacted",
      prospectId: "prospect-contacted-note",
      topProspectResultId: "result-contacted-note",
      status: "Needs Review",
      queuedDate: "",
      notes: "Initial email sent manually by the operator.",
      outreachCopyVersion: "old_audit_copy_v0",
    });
    setOutreachQueueMemoryForTests([queuedReady, blockedOldCopy, affirmativelyContacted]);
    setProspectMemoryForTests([evidenceReadyProspectForQueue(queuedReady)]);
    const before = JSON.stringify(outreachQueueMemoryForTests());

    const result = await runFullAutonomousReadinessTest(readinessEnv());
    const after = JSON.stringify(outreachQueueMemoryForTests());

    assert.equal(after, before);
    assert.equal(result.readiness?.autoEmailPilot.status, "Ready");
    assert.equal(result.readiness?.failedRecords.some((record) => record.packageId === "blocked-old-copy"), false);
    assert.ok(result.readiness?.excludedRecords.some((record) => record.packageId === "blocked-old-copy" && /Blocked records are historical/i.test(record.excludedReason)));
    assert.ok(result.readiness?.excludedRecords.some((record) => record.packageId === "affirmatively-contacted" && /Contact.*history/i.test(record.excludedReason)));
    assert.doesNotMatch(result.readiness?.autoEmailPilot.reasons.join(" "), /blocked-old-copy|copy\/safety fixes/i);
    assert.match(result.readiness?.summaries.failedOnly ?? "", /Excluded historical\/non-actionable records/);
  } finally {
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
    resetProspectMemoryForTests();
  }
});

test("Full Readiness blocks queued eligible old-copy records but not stale persisted readiness results", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const originalEnv = { ...process.env };
  try {
    process.env.GOOGLE_PLACES_API_KEY = "actual-google-key";
    await recordOperatorSafeTestResult({
      testType: "full_readiness",
      startedAt: new Date(1).toISOString(),
      completedAt: new Date(1).toISOString(),
      outcome: "failed",
      summary: "Old persisted run said first-touch email explains why I am reaching out failed.",
      modeStatuses: {
        dryRunManualRouting: "Needs attention",
        manualEmailTest: "Blocked",
        autoEmailPilot: "Blocked",
        fullAutoEmail: "Blocked",
      },
      safeErrorMessage: "stale old-copy failure",
    });
    await recordOperatorSafeTestResult(buildProviderSmokeTestRecord({
      startedAt: new Date(2).toISOString(),
      completedAt: new Date().toISOString(),
      diagnostics: successfulGoogleProviderDiagnostics(),
      sampleCount: 1,
      createdOutreachPackages: false,
      sentOutreach: false,
    }));
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const oldQueued = readinessQueueItem({
      id: "queued-old-copy",
      prospectId: "prospect-old-copy",
      topProspectResultId: "result-old-copy",
      outreachCopyVersion: "old_audit_copy_v0",
      emailBody: "Old audit-style copy with One missed opportunity.",
    });
    setOutreachQueueMemoryForTests([oldQueued]);
    setProspectMemoryForTests([evidenceReadyProspectForQueue(oldQueued)]);
    const before = JSON.stringify(outreachQueueMemoryForTests());

    const result = await runFullAutonomousReadinessTest(readinessEnv());
    const after = JSON.stringify(outreachQueueMemoryForTests());
    const whyChecks = result.readiness?.checks.filter((check) => check.key === "why-reaching-out") ?? [];

    assert.equal(after, before);
    assert.equal(whyChecks.length, 1);
    assert.equal(whyChecks[0]?.status, "passed");
    assert.ok(result.readiness?.failedRecords.some((record) => record.packageId === "queued-old-copy" && record.category === "Outdated outreach copy"));
    assert.equal(result.readiness?.autoEmailPilot.status, "Blocked");
    assert.match(result.readiness?.autoEmailPilot.reasons.join(" "), /queued public-email record\(s\) need copy\/safety fixes/);
    assert.notEqual(result.readiness?.finalReadinessStatus, "READY FOR AUTO EMAIL PILOT");
  } finally {
    process.env = originalEnv;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
    resetProspectMemoryForTests();
  }
});

test("safe readiness repair fixes deterministic copy, excludes suspicious email, and preserves ambiguous records for review", async () => {
  resetAutonomousGrowthMemoryForTests();
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error("No provider or outreach call is allowed during safe readiness repair.");
    };
    const oldQueued = readinessQueueItem({
      id: "repair-old-copy",
      prospectId: "repair-prospect-old",
      topProspectResultId: "repair-result-old",
      outreachCopyVersion: "old_audit_copy_v0",
      emailBody: "Old audit copy with One missed opportunity.",
      notes: [
        "[auto-email-approved]",
        "Nothing was sent.",
        "No outreach was sent.",
        "Emails sent: 0",
        "Provider test completed; no outreach was sent.",
      ].join("\n"),
    });
    const suspicious = readinessQueueItem({
      id: "repair-suspicious-email",
      prospectId: "repair-prospect-suspicious",
      topProspectResultId: "repair-result-suspicious",
      businessName: "Suspicious Email Co",
      website: "https://suspicious-email-co.example",
      email: "admin@totalwptheme.com",
      status: "Eligible",
      queuedDate: "",
    });
    const ambiguous = readinessQueueItem({
      id: "repair-ambiguous",
      prospectId: "repair-prospect-ambiguous",
      topProspectResultId: "repair-result-ambiguous",
      businessName: "Ambiguous Preview Co",
      previewLink: "",
      status: "Preview Build Needed",
      queuedDate: "",
    });
    const sent = readinessQueueItem({
      id: "repair-sent",
      prospectId: "repair-prospect-sent",
      topProspectResultId: "repair-result-sent",
      status: "Sent",
      sentDate: new Date().toISOString(),
      outreachCopyVersion: "old_audit_copy_v0",
      emailBody: "Sent historical copy.",
    });
    const suppressed = readinessQueueItem({
      id: "repair-suppressed",
      prospectId: "repair-prospect-suppressed",
      topProspectResultId: "repair-result-suppressed",
      status: "Suppressed",
      blockedReason: "Manual suppression recorded.",
      outreachCopyVersion: "old_audit_copy_v0",
    });
    setOutreachQueueMemoryForTests([oldQueued, suspicious, ambiguous, sent, suppressed]);
    setProspectMemoryForTests([
      evidenceReadyProspectForQueue(oldQueued),
      evidenceReadyProspectForQueue(suspicious),
      evidenceReadyProspectForQueue(ambiguous),
    ]);
    const protectedBefore = outreachQueueMemoryForTests().filter((item) => ["repair-sent", "repair-suppressed"].includes(item.id));

    const result = await runSafeReadinessRepair({
      confirmed: true,
      environment: readinessEnv({
        OUTREACH_EMAIL_DISABLED: "true",
        OUTREACH_AUTO_SEND_ENABLED: "false",
        OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
      }),
    });
    const queue = outreachQueueMemoryForTests();
    const repairedCopy = queue.find((item) => item.id === "repair-old-copy");
    const excludedEmail = queue.find((item) => item.id === "repair-suspicious-email");
    const manualReview = queue.find((item) => item.id === "repair-ambiguous");

    assert.equal(result.repair?.recordsInspected.length, 3);
    assert.equal(result.repair?.recordsAutoFixed.length, 1);
    assert.equal(result.repair?.recordsRemovedFromEligibility.length, 1);
    assert.equal(result.repair?.recordsRequiringManualReview.length, 1);
    assert.equal(repairedCopy?.outreachCopyVersion, currentOutreachCopyVersion);
    assert.equal(repairedCopy?.status, "Needs Review");
    assert.doesNotMatch(repairedCopy?.notes ?? "", /\[auto-email-approved\]/);
    assert.doesNotMatch(repairedCopy?.emailBody ?? "", /https:\/\/webworkshop\.dev\/p\/|One missed opportunity/i);
    assert.match(repairedCopy?.emailBody ?? "", /^Hi Ready Pressure Washing team,/);
    assert.match(repairedCopy?.emailBody ?? "", /Would you be interested in seeing what that could look like\?/i);
    assert.match(repairedCopy?.emailBody ?? "", /If you'd rather not hear from me again/i);
    assert.equal(excludedEmail?.contactSource, "Needs manual verification");
    assert.equal(excludedEmail?.email, "admin@totalwptheme.com");
    assert.equal(manualReview?.status, "Preview Build Needed");
    assert.equal(manualReview?.previewLink, "");
    assert.equal(result.repair?.recordsRequiringManualReview[0]?.changed, false);
    assert.deepEqual(
      queue.filter((item) => ["repair-sent", "repair-suppressed"].includes(item.id)),
      protectedBefore,
    );
    assert.equal(result.emailSafety?.status, "Passed");
    assert.deepEqual(result.repair?.outreachSent, { emails: 0, dms: 0, forms: 0, calls: 0, looms: 0 });
    assert.equal(result.repair?.settingsChanged, false);
    assert.equal(result.repair?.previewsBuilt, 0);
    assert.equal(result.repair?.approvalsGranted, 0);
    assert.equal(result.repair?.suppressionAndContactHistoryPreserved, true);
    const receiptEvent = memoryAuditEventsForTests().find((event) => event.action === "safe_readiness_repair_receipt");
    assert.equal(receiptEvent?.outcome, "success");
    assert.equal((receiptEvent?.metadata as { outreachSent?: { emails?: number } } | undefined)?.outreachSent?.emails, 0);
  } finally {
    globalThis.fetch = originalFetch;
    resetAutonomousGrowthMemoryForTests();
    resetOperationalMemoryForTests();
    resetProspectMemoryForTests();
  }
});

test("safe readiness repair distinguishes routine no-send audit text from protected contact history", () => {
  for (const notes of [
    "Nothing was sent.",
    "No outreach was sent.",
    "No email was sent.",
    "Emails sent: 0",
    "Outreach sent: 0",
    "Provider test completed; no outreach was sent.",
    "No email, DM, form, call, or Loom was sent.",
    "No contact forms were submitted. No phone calls were placed. No Looms were recorded or sent.",
  ]) {
    assert.equal(
      safeReadinessRepairProtectionReason(readinessQueueItem({ notes })),
      "",
      notes,
    );
  }

  for (const notes of [
    "Initial email sent by the operator.",
    "Business contacted through its public email.",
    "First DM sent manually.",
    "No email was sent, but the prospect was contacted by phone.",
    "No email was sent, but the first DM was sent manually.",
  ]) {
    assert.match(
      safeReadinessRepairProtectionReason(readinessQueueItem({ notes })),
      /protected/i,
      notes,
    );
  }

  for (const status of ["Sending", "Sent", "Suppressed", "Opted Out", "Bounced", "Complained", "Not Interested"] as const) {
    assert.match(
      safeReadinessRepairProtectionReason(readinessQueueItem({ status })),
      /protected/i,
      status,
    );
  }
  assert.match(
    safeReadinessRepairProtectionReason(readinessQueueItem({ notes: "[auto-email-ambiguous] Provider outcome needs reconciliation." })),
    /ambiguous/i,
  );
  assert.match(
    safeReadinessRepairProtectionReason(readinessQueueItem({ replyStatus: "contacted by phone" })),
    /history/i,
  );
});

test("safe readiness repair requires confirmation and changes nothing before confirmation", async () => {
  resetAutonomousGrowthMemoryForTests();
  const oldQueued = readinessQueueItem({
    id: "repair-confirmation",
    outreachCopyVersion: "old_audit_copy_v0",
    emailBody: "Old copy.",
    notes: "[auto-email-approved]",
  });
  setOutreachQueueMemoryForTests([oldQueued]);
  const before = outreachQueueMemoryForTests();

  const result = await runSafeReadinessRepair({ confirmed: false, environment: readinessEnv() });

  assert.equal(result.ok, false);
  assert.match(result.message, /Confirmation is required/i);
  assert.deepEqual(outreachQueueMemoryForTests(), before);
  resetAutonomousGrowthMemoryForTests();
});

test("operator notification body is short, phone-friendly, and secret-safe", () => {
  const body = internalNotificationBody({
    kind: "provider_issue",
    title: "Provider coverage is weak",
    marketTrade: "Pressure Washing in Tampa, FL",
    resultCount: 0,
    attention: "Google Places timed out.",
    nextAction: "Run Provider Smoke Test before Autopilot.",
    pagePath: "/engine?tab=operator-test-center",
  });

  assert.match(body, /Provider coverage is weak/);
  assert.match(body, /Market\/trade: Pressure Washing in Tampa, FL/);
  assert.match(body, /Next action: Run Provider Smoke Test/);
  assert.doesNotMatch(body, /RESEND_API_KEY|DATABASE_URL|secret/i);
});

test("Operator Test Center SMS env is separate from prospect sending gates", () => {
  const env = internalSmsEnvironment({
    SMS_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_PHONE: "+14195551234",
    TWILIO_ACCOUNT_SID: "twilio-account-sid",
    TWILIO_AUTH_TOKEN: "secret-twilio-token",
    TWILIO_FROM_PHONE: "+14195550000",
    OUTREACH_EMAIL_DISABLED: "true",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
  } as NodeJS.ProcessEnv);

  assert.equal(env.configured, true);
  assert.equal(env.maskedOperatorPhone, "+1*****1234");
});

test("Test Center renders a protected loading shell without real provider keys", () => {
  const html = renderToStaticMarkup(createElement(OperatorTestCenterWorkspace));

  assert.match(html, /Loading Operator Test Center/);
  assert.doesNotMatch(html, /RESEND_API_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|TWILIO_AUTH_TOKEN|secret/i);
});

test("Operator Test Center markup includes Smart Growth safe action buttons", async () => {
  const source = readFileSync("components/engine/OperatorTestCenterWorkspace.tsx", "utf8");
  const routeSource = readFileSync("app/api/engine/operator-test-center/route.ts", "utf8");

  assert.match(source, /Run Full Autonomous Readiness Test/);
  assert.match(source, /Repair Readiness Issues Safely/);
  assert.match(source, /Confirm Safe Repair/);
  assert.match(source, /No outreach will be sent/);
  assert.match(source, /Suppression and contact history will be preserved/);
  assert.match(routeSource, /run_safe_readiness_repair/);
  assert.match(routeSource, /payload\.confirmed !== true/);
  assert.match(source, /Copy Full Autonomous Readiness Summary/);
  assert.match(source, /Copy Readiness Records Summary/);
  assert.match(source, /Blocking records needing attention/);
  assert.match(source, /Informational outdated drafts/);
  assert.match(source, /Manual draft, not a readiness failure/);
  assert.doesNotMatch(source, /failedRecords\.length \+ lastAction\.readiness\.outdatedCopyRecords\.length/);
  assert.match(source, /Copy Next Fix Summary/);
  assert.match(source, /Copy Safe-To-Test Summary/);
  assert.match(source, /Copy Debug Summary/);
  assert.match(source, /finalReadinessStatus/);
  assert.doesNotMatch(source, /Send Internal Test SMS|Copy SMS Notification Summary/);
  assert.match(source, /Run Smart Backfill Test/);
  assert.match(source, /Run Market Scout Dry Run/);
  assert.match(source, /Run Smart Autonomous Dry Run/);
  assert.match(source, /Simulate Next 24 Hours/);
  assert.doesNotMatch(source, /auto-DM|auto-submit forms|auto-call/i);
});
