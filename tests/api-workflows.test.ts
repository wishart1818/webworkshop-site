import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyze } from "../app/api/engine/analyze/route";
import { POST as discover } from "../app/api/engine/discover/route";
import { GET as list, POST as create, PUT as update } from "../app/api/engine/prospects/route";
import { GET as systemStatus } from "../app/api/engine/system/route";
import { GET as latestSelfCheck, POST as runSelfCheck } from "../app/api/engine/system/self-check/route";
import { POST as providerSmokeTest } from "../app/api/engine/system/provider-smoke-test/route";
import { GET as autonomousDashboard, POST as autonomousAction } from "../app/api/engine/autonomous-growth/route";
import { POST as outreachEvent } from "../app/api/engine/outreach-events/route";
import { POST as updateOutreachPackage } from "../app/api/engine/top-prospects/results/[resultId]/package/route";
import {
  memoryAuditEventsForTests,
  recordAudit,
  resetOperationalMemoryForTests,
  safeListAuditEvents,
} from "../lib/operational-controls";
import { seedProspects } from "../lib/prospect-engine";
import { resetProspectMemoryForTests } from "../lib/prospect-repository";
import { resetDiscoveryThrottleForTests } from "../lib/lead-discovery";
import { defaultAutonomousGrowthSettings } from "../lib/autonomous-growth";
import {
  resetAutonomousGrowthMemoryForTests,
  updateAutonomousGrowthSettings,
  upsertAutonomousQueueItemFromPackage,
} from "../lib/autonomous-growth-repository";

test.beforeEach(() => {
  resetProspectMemoryForTests();
  resetOperationalMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
});

test("system API reports development health and recent audit activity", async () => {
  await recordAudit({ action: "test_event", outcome: "success", subject: "test" });
  const response = await systemStatus();
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, "development");
  assert.equal(payload.checks.database.configured, false);
  assert.equal(payload.auditEvents[0].action, "test_event");
});

test("system self-check route stores a safe report for the System page", async () => {
  const before = await latestSelfCheck();
  const beforePayload = await before.json();
  assert.ok("selfCheck" in beforePayload);

  const run = await runSelfCheck();
  const runPayload = await run.json();
  assert.equal(run.status, 200);
  assert.equal(runPayload.selfCheck.overallStatus, "Healthy");
  assert.equal(runPayload.selfCheck.failed.length, 0);
  assert.ok(runPayload.selfCheck.passed.some((item: { key: string }) => item.key === "supplier_filter"));
  assert.ok(runPayload.selfCheck.passed.some((item: { key: string }) => item.key === "domain_mismatch_filter"));
  assert.ok(runPayload.selfCheck.passed.some((item: { key: string }) => item.key === "directory_only_logic"));
  assert.ok(runPayload.selfCheck.passed.some((item: { key: string }) => item.key === "self_review_no_send"));
  assert.ok(runPayload.selfCheck.passed.some((item: { key: string }) => item.key === "autopilot_smoke_test"));
  assert.ok(runPayload.selfCheck.passed.some((item: { key: string }) => item.key === "autopilot_defaults_safe"));

  const system = await systemStatus();
  const systemPayload = await system.json();
  assert.equal(systemPayload.selfCheck.lastRunAt, runPayload.selfCheck.lastRunAt);
});

test("provider smoke test returns diagnostics without creating outreach packages", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.includes("nominatim")) return new Response(JSON.stringify([{ lat: "27.9506", lon: "-82.4572" }]), { status: 200 });
      if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      return new Response("not configured in smoke fixture", { status: 503 });
    };
    resetDiscoveryThrottleForTests();
    const response = await providerSmokeTest();
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.smokeTest.query, "Pressure Washing near Tampa, FL");
    assert.equal(payload.smokeTest.createdOutreachPackages, false);
    assert.equal(payload.smokeTest.sentOutreach, false);
    assert.equal(payload.smokeTest.diagnostics.providerDiagnostics.osm.canRunWithoutApiKey, true);
    assert.equal(payload.smokeTest.diagnostics.providerDiagnostics.osm.queryExecuted, true);
  } finally {
    globalThis.fetch = originalFetch;
    resetDiscoveryThrottleForTests();
  }
});

test("Autopilot dashboard actions start, report, and smoke-test without sending", async () => {
  const initial = await autonomousDashboard();
  const initialPayload = await initial.json();
  assert.equal(initial.status, 200);
  assert.equal(initialPayload.autopilot.campaign.status, "draft");
  assert.equal(initialPayload.autopilot.campaign.settings.excludePreviouslyReviewed, true);
  assert.equal(initialPayload.autopilot.activity.status, "not_started");
  assert.match(initialPayload.autopilot.activity.entries[0].label, /No Autopilot activity yet/);

  const started = await autonomousAction(new Request("https://example.com/api/engine/autonomous-growth", {
    method: "POST",
    body: JSON.stringify({
      action: "start_autopilot",
      autopilotSettings: {
        campaignName: "API smoke campaign",
        customCities: "Toledo, OH; Sylvania, OH",
        state: "OH",
        trade: "Pressure Washing",
      },
    }),
  }));
  const startedPayload = await started.json();
  assert.equal(started.status, 200);
  assert.equal(startedPayload.autopilot.campaign.status, "paused");
  assert.equal(startedPayload.autopilot.marketTargets.length, 2);
  assert.equal(startedPayload.autopilot.activity.status, "failed_to_start");
  assert.equal(startedPayload.autopilot.activity.topProspectJobId, "");
  assert.match(startedPayload.topProspectJobWarning, /Top Prospects|database|job/i);
  assert.ok(startedPayload.autopilot.activity.errors.length > 0);
  assert.ok(startedPayload.autopilot.activity.entries.some((entry: { label: string }) => /could not start Top Prospects job/.test(entry.label)));
  assert.ok(startedPayload.autopilot.activity.handoffDetails.some((detail: { label: string; value: string }) => detail.label === "Attempted trade" && detail.value === "Pressure Washing"));
  assert.ok(startedPayload.autopilot.activity.queueRouting.some((entry: { label: string }) => entry.label === "Email Draft Ready"));
  assert.match(startedPayload.autopilot.campaign.notifications[0].title, /could not start Top Prospects job/);

  const smoke = await autonomousAction(new Request("https://example.com/api/engine/autonomous-growth", {
    method: "POST",
    body: JSON.stringify({ action: "run_fake_autopilot_smoke_test" }),
  }));
  const smokePayload = await smoke.json();
  assert.equal(smoke.status, 200);
  assert.equal(smokePayload.smokeTest.passed, true);
  assert.equal(smokePayload.smokeTest.report.fakeOnly, true);
  assert.equal(smokePayload.autopilot.activity.fakeOnly, true);
  assert.equal(smokePayload.autopilot.activity.providerDiagnostics[0].provider, "Fake Smoke Test");
  assert.ok(smokePayload.autopilot.activity.entries.some((entry: { label: string }) => /Fake Smoke Test Activity/.test(entry.label)));
  assert.ok(smokePayload.smokeTest.fixtureResults.some((fixture: { actualQueue: string }) => fixture.actualQueue === "blockedBadFit"));
});

test("AUTOPILOT_DISABLED blocks real Autopilot starts but leaves safe dashboard actions available", async () => {
  const previousDisabled = process.env.AUTOPILOT_DISABLED;
  try {
    process.env.AUTOPILOT_DISABLED = "true";
    const initial = await autonomousDashboard();
    const initialPayload = await initial.json();
    assert.equal(initial.status, 200);
    assert.equal(initialPayload.autopilot.environmentKillSwitchEnabled, true);

    const blocked = await autonomousAction(new Request("https://example.com/api/engine/autonomous-growth", {
      method: "POST",
      body: JSON.stringify({
        action: "start_autopilot",
        autopilotSettings: {
          campaignName: "Blocked by env",
          customCities: "Tampa, FL",
          state: "FL",
          trade: "Pressure Washing",
        },
      }),
    }));
    const blockedPayload = await blocked.json();
    assert.equal(blocked.status, 200);
    assert.equal(blockedPayload.autopilot.activity.status, "failed_to_start");
    assert.equal(blockedPayload.autopilot.activity.handoffDetails.find((detail: { label: string }) => detail.label === "Failure phase")?.value, "environment");
    assert.equal(blockedPayload.topProspectJobWarning, "Autopilot is disabled by environment kill switch.");
    assert.match(blockedPayload.autopilot.campaign.notifications[0].body, /Nothing was sent/);

    const smoke = await autonomousAction(new Request("https://example.com/api/engine/autonomous-growth", {
      method: "POST",
      body: JSON.stringify({ action: "run_fake_autopilot_smoke_test" }),
    }));
    const smokePayload = await smoke.json();
    assert.equal(smoke.status, 200);
    assert.equal(smokePayload.smokeTest.passed, true);
    assert.equal(smokePayload.smokeTest.report.fakeOnly, true);
  } finally {
    if (previousDisabled === undefined) delete process.env.AUTOPILOT_DISABLED;
    else process.env.AUTOPILOT_DISABLED = previousDisabled;
  }
});

test("AUTOPILOT_DISABLED false or missing allows the normal safe Autopilot start path", async () => {
  const previousDisabled = process.env.AUTOPILOT_DISABLED;
  try {
    process.env.AUTOPILOT_DISABLED = "false";
    const response = await autonomousAction(new Request("https://example.com/api/engine/autonomous-growth", {
      method: "POST",
      body: JSON.stringify({
        action: "start_autopilot",
        autopilotSettings: {
          campaignName: "Allowed by env",
          customCities: "Tampa, FL",
          state: "FL",
          trade: "Pressure Washing",
        },
      }),
    }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.notEqual(payload.autopilot.activity.handoffDetails.find((detail: { label: string }) => detail.label === "Failure phase")?.value, "environment");
    assert.doesNotMatch(payload.topProspectJobWarning ?? "", /environment kill switch/i);

    delete process.env.AUTOPILOT_DISABLED;
    const dashboard = await autonomousDashboard();
    const dashboardPayload = await dashboard.json();
    assert.equal(dashboardPayload.autopilot.environmentKillSwitchEnabled, false);
  } finally {
    if (previousDisabled === undefined) delete process.env.AUTOPILOT_DISABLED;
    else process.env.AUTOPILOT_DISABLED = previousDisabled;
  }
});

test("suppression event endpoint requires a secret token and never sends outreach", async () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  try {
    delete process.env.OUTREACH_SUPPRESSION_WEBHOOK_TOKEN;
    process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
    process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
    process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
    process.env.OUTREACH_SEND_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
    process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
    globalThis.fetch = async () => {
      providerCalls += 1;
      return new Response("should not send", { status: 500 });
    };
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const queued = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
      prospect: { ...seedProspects[0], website: "https://suppression-test.com", email: "owner@suppression-test.com", recommendedContactMethod: "send_email" },
      topProspectResultId: "suppression-token-test",
    });

    const missingToken = await outreachEvent(new Request("https://example.com/api/engine/outreach-events", {
      method: "POST",
      body: JSON.stringify({ type: "bounce", email: queued.email }),
    }));
    assert.equal(missingToken.status, 503);

    process.env.OUTREACH_SUPPRESSION_WEBHOOK_TOKEN = "test-webhook-token";
    const badToken = await outreachEvent(new Request("https://example.com/api/engine/outreach-events", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
      body: JSON.stringify({ type: "complaint", email: queued.email }),
    }));
    assert.equal(badToken.status, 401);
    assert.equal(providerCalls, 0);
    assert.ok(!memoryAuditEventsForTests().some((event) => event.action === "email_suppression_record"));
    assert.ok(!memoryAuditEventsForTests().some((event) => event.action === "outreach_suppression_webhook" && event.outcome === "success"));
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test("suppression event endpoint records bounces, complaints, and unsubscribes into blocked statuses", async () => {
  const originalEnv = { ...process.env };
  try {
    process.env.OUTREACH_SUPPRESSION_WEBHOOK_TOKEN = "test-webhook-token";
    process.env.WEBWORKSHOP_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
    process.env.OUTREACH_POSTAL_ADDRESS = "123 Main St, Toledo, OH";
    process.env.OUTREACH_AUTO_SEND_ENABLED = "true";
    process.env.OUTREACH_SEND_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
    process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
    await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });
    const bounce = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
      prospect: { ...seedProspects[0], id: "bounce-webhook", website: "https://suppression-test.com", email: "bounce@suppression-test.com", recommendedContactMethod: "send_email" },
      topProspectResultId: "bounce-webhook-result",
    });
    const complaint = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
      prospect: { ...seedProspects[2], id: "complaint-webhook", website: "https://complaint-test.com", email: "complaint@complaint-test.com", recommendedContactMethod: "send_email" },
      topProspectResultId: "complaint-webhook-result",
    });
    const unsubscribe = await upsertAutonomousQueueItemFromPackage({
      outreachPreference: "written_only",
      previewLink: "https://webworkshop.dev/p/abcdefghijklmnopqrstuvwxyzABCDEF",
      prospect: { ...seedProspects[4], id: "unsubscribe-webhook", website: "https://unsubscribe-test.com", email: "unsubscribe@unsubscribe-test.com", recommendedContactMethod: "send_email" },
      topProspectResultId: "unsubscribe-webhook-result",
    });

    const events = [
      ["delivery.bounced", bounce.email],
      ["spam.complaint", complaint.email],
      ["unsubscribe", unsubscribe.email],
    ];
    for (const [type, email] of events) {
      const response = await outreachEvent(new Request("https://example.com/api/engine/outreach-events", {
        method: "POST",
        headers: { "x-webworkshop-webhook-token": "test-webhook-token" },
        body: JSON.stringify({ type, data: { email } }),
      }));
      const payload = await response.json();
      assert.equal(response.status, 200);
      assert.equal(payload.received, true);
      assert.equal(payload.updated, 1);
    }

    const dashboard = await autonomousDashboard();
    const payload = await dashboard.json();
    const statuses = new Map(payload.queue.map((item: { email: string; status: string }) => [item.email, item.status]));
    assert.equal(statuses.get(bounce.email), "Bounced");
    assert.equal(statuses.get(complaint.email), "Complained");
    assert.equal(statuses.get(unsubscribe.email), "Opted Out");
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "outreach_suppression_webhook" && event.outcome === "success"));
    assert.ok(memoryAuditEventsForTests().some((event) => event.action === "email_suppression_record" && event.outcome === "success"));
  } finally {
    process.env = originalEnv;
  }
});

test("system audit status remains available when PostgreSQL is unreachable", async () => {
  const events = await safeListAuditEvents(
    { configured: true, reachable: false },
    async () => {
      throw new Error("database unavailable");
    },
  );

  assert.deepEqual(events, []);
});

test("prospect API reads, creates, updates, and audits the workflow", async () => {
  const initial = await list();
  const initialPayload = await initial.json();
  assert.equal(initial.status, 200);
  assert.equal(initialPayload.prospects.length, seedProspects.length);

  const prospect = {
    ...structuredClone(seedProspects[0]),
    id: "api-test-prospect",
    businessName: "API Test Roofing",
    website: "https://example.com/api-test-roofing",
  };
  const created = await create(new Request("https://example.com/api/engine/prospects", {
    method: "POST",
    body: JSON.stringify(prospect),
  }));
  assert.equal(created.status, 201);

  prospect.status = "Interested";
  const updated = await update(new Request("https://example.com/api/engine/prospects", {
    method: "PUT",
    body: JSON.stringify(prospect),
  }));
  const updatedPayload = await updated.json();
  assert.equal(updated.status, 200);
  assert.equal(updatedPayload.prospect.status, "Interested");

  const actions = memoryAuditEventsForTests().map((event) => event.action);
  assert.ok(actions.includes("prospect_create"));
  assert.ok(actions.includes("prospect_update"));
});

test("invalid prospect, discovery, and analysis requests are rejected", async () => {
  const invalidProspect = await create(new Request("https://example.com/api/engine/prospects", {
    method: "POST",
    body: JSON.stringify({ website: "javascript:alert(1)" }),
  }));
  assert.equal(invalidProspect.status, 400);

  const invalidDiscovery = await discover(new Request("https://example.com/api/engine/discover", {
    method: "POST",
    body: JSON.stringify({ city: "", state: "Ohio", trade: "Roofing", radiusKm: 999 }),
  }));
  assert.equal(invalidDiscovery.status, 422);

  const invalidAnalysis = await analyze(new Request("https://example.com/api/engine/analyze", {
    method: "POST",
    body: JSON.stringify({}),
  }));
  assert.equal(invalidAnalysis.status, 400);

  const outcomes = memoryAuditEventsForTests().map((event) => event.outcome);
  assert.ok(outcomes.includes("rejected"));
  assert.ok(outcomes.includes("rejected"));
});

test("manual no-website analysis returns a persisted Presence Gap state", async () => {
  const prospect = {
    ...structuredClone(seedProspects[3]),
    id: "manual-no-website",
    website: "",
    prospectType: "no_website_social_only" as const,
    classification: "phone_only" as const,
    websiteStatus: "no_owned_website" as const,
    websiteStatusDetail: "",
    analysis: undefined,
  };
  const response = await analyze(new Request("https://example.com/api/engine/analyze", {
    method: "POST",
    body: JSON.stringify(prospect),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.prospect.prospectType, "no_website_social_only");
  assert.equal(payload.prospect.websiteStatus, "no_owned_website");
  assert.match(payload.prospect.activities[0].label, /Presence Gap analysis is ready/);
});

test("manual analysis safely converts an invalid legacy website into Presence Gap", async () => {
  const prospect = {
    ...structuredClone(seedProspects[0]),
    id: "manual-invalid-website",
    website: "javascript:alert(1)",
  };
  const response = await analyze(new Request("https://example.com/api/engine/analyze", {
    method: "POST",
    body: JSON.stringify(prospect),
  }));
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.prospect.website, "");
  assert.equal(payload.prospect.websiteStatus, "invalid_website");
  assert.equal(payload.prospect.websiteStatusDetail, "No usable website found.");
});

test("Outreach Package endpoint rejects unsupported actions before persistence access", async () => {
  const response = await updateOutreachPackage(
    new Request("https://example.com/api/engine/top-prospects/results/result-id/package", {
      method: "POST",
      body: JSON.stringify({ action: "send_automatically" }),
    }),
    { params: Promise.resolve({ resultId: "result-id" }) },
  );

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /supported Outreach Package action/);
});

test("unexpected discovery failures do not expose internal error details", async () => {
  const previousProvider = process.env.NOMINATIM_API_URL;
  const previousConsoleError = console.error;
  process.env.NOMINATIM_API_URL = "not-a-valid-url";
  console.error = () => undefined;
  resetDiscoveryThrottleForTests();
  try {
    const response = await discover(new Request("https://example.com/api/engine/discover", {
      method: "POST",
      body: JSON.stringify({ city: "Findlay", state: "OH", trade: "Roofing", radiusKm: 10 }),
    }));
    const payload = await response.json();

    assert.equal(response.status, 500);
    assert.equal(payload.error, "Unable to discover leads right now.");
    assert.doesNotMatch(payload.error, /Invalid URL/i);
  } finally {
    process.env.NOMINATIM_API_URL = previousProvider;
    console.error = previousConsoleError;
    resetDiscoveryThrottleForTests();
  }
});
