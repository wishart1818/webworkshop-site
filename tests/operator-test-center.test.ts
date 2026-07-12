import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
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
import { resetOperationalMemoryForTests } from "../lib/operational-controls";
import {
  generateOneTestOutreachPackage,
  getOperatorTestCenterPayload,
  runFullAutonomousReadinessTest,
  runOperatorMarketScoutDryRun,
  runOperatorSmartAutonomousDryRun,
  runOperatorSmartBackfillTest,
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
    assert.match(payload.summaries.regenerationSummary, /Old unsent packages needing regeneration/i);
    assert.match(payload.summaries.smsNotifications, /optional and hidden from primary readiness guidance/i);
    assert.match(payload.summaries.smartRecommendation, /Will not do|No outreach|Market Scout|existing qualified/i);
    assert.match(payload.nextRecommendedTest, /Internal alerts|Internal email notifications|Internal notifications|Provider coverage|Top Prospects|First-touch|Resend/i);
    assert.doesNotMatch(payload.nextRecommendedTest, /SMS|Twilio/i);
    assert.doesNotMatch(summaryBlob, /secret-resend-key|secret-twilio-token|DATABASE_URL|postgres:\/\/|operator@example.com|\+14195551234/i);
    assert.ok(payload.statusCards.some((card) => card.label === "Internal notifications"));
    assert.equal(payload.statusCards.some((card) => /SMS|Twilio|Operator phone/i.test(card.label)), false);
    assert.ok(payload.statusCards.some((card) => card.label === "Latest Outreach Copy Version"));
    assert.ok(payload.statusCards.some((card) => card.label === "Old unsent packages needing regeneration"));
  } finally {
    process.env = originalEnv;
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

test("Operator Test Center fake package always returns fake scripts without real outreach activity", () => {
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
  assert.equal(result.packagePreview?.yesReplyIncludesPublicPreview, true);
  assert.match(result.packagePreview?.publicPreviewLink ?? "", /^https:\/\/webworkshop\.dev\/p\//);
  assert.ok(fake?.scripts.some((script) => script.label === "First email script" && /Would you like me to send it over\?/i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "First Facebook/Instagram DM script" && /Want to see it\?/i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "Softer DM script"));
  assert.ok(fake?.scripts.some((script) => script.label === "Yes-reply / preview-send script" && /https:\/\/webworkshop\.dev\/p\//i.test(script.body)));
  assert.ok(fake?.scripts.some((script) => script.label === "Pricing reply"));
  assert.ok(fake?.scripts.some((script) => script.label === "Follow-up"));
  assert.ok(fake?.scripts.some((script) => script.label === "Not interested reply"));
  assert.match(fake?.fullSummary ?? "", /help get you more calls and quote requests/i);
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

test("Full Autonomous Readiness Test checks copy, existing prospects, saved results, and queue items", async () => {
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
  assert.match(labels, /Yes-reply includes public \/p\/ preview link/);
  assert.match(labels, /Existing qualified unsent prospects checked/);
  assert.match(labels, /Saved Top Prospects results checked/);
  assert.match(labels, /Outreach queue items checked/);
  assert.ok(result.readiness?.checks.find((check) => check.key === "first-email-link-free")?.status === "passed");
  assert.ok(result.readiness?.checks.find((check) => check.key === "yes-reply-public-preview")?.status === "passed");
  assert.doesNotMatch(result.readiness?.summaries.debug ?? "", /\/engine\/previews|secret-resend-key|postgres:\/\/|twilio-auth-token|google-places-key/i);
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

  assert.match(source, /Run Full Autonomous Readiness Test/);
  assert.match(source, /Copy Full Autonomous Readiness Summary/);
  assert.match(source, /Copy Failed Checks Only/);
  assert.match(source, /Copy Next Fix Summary/);
  assert.match(source, /Copy Safe-To-Test Summary/);
  assert.match(source, /Copy Debug Summary/);
  assert.doesNotMatch(source, /Send Internal Test SMS|Copy SMS Notification Summary/);
  assert.match(source, /Run Smart Backfill Test/);
  assert.match(source, /Run Market Scout Dry Run/);
  assert.match(source, /Run Smart Autonomous Dry Run/);
  assert.doesNotMatch(source, /auto-DM|auto-submit forms|auto-call/i);
});
