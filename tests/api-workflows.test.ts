import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyze } from "../app/api/engine/analyze/route";
import { POST as discover } from "../app/api/engine/discover/route";
import { GET as list, POST as create, PUT as update } from "../app/api/engine/prospects/route";
import { GET as systemStatus } from "../app/api/engine/system/route";
import { GET as latestSelfCheck, POST as runSelfCheck } from "../app/api/engine/system/self-check/route";
import { GET as autonomousDashboard, POST as autonomousAction } from "../app/api/engine/autonomous-growth/route";
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
import { resetAutonomousGrowthMemoryForTests } from "../lib/autonomous-growth-repository";

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
  assert.equal(startedPayload.autopilot.campaign.status, "finished");
  assert.equal(startedPayload.autopilot.marketTargets.length, 2);
  assert.ok(["completed", "completed_with_warnings"].includes(startedPayload.autopilot.activity.status));
  assert.ok(startedPayload.autopilot.activity.entries.some((entry: { label: string }) => /Starting Autopilot campaign/.test(entry.label)));
  assert.ok(startedPayload.autopilot.activity.queueRouting.some((entry: { label: string }) => entry.label === "Email Draft Ready"));
  assert.match(startedPayload.autopilot.campaign.notifications[0].body, /Nothing was sent|Nothing will be contacted automatically/);

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
