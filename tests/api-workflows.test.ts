import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyze } from "../app/api/engine/analyze/route";
import { POST as discover } from "../app/api/engine/discover/route";
import { GET as list, POST as create, PUT as update } from "../app/api/engine/prospects/route";
import { GET as systemStatus } from "../app/api/engine/system/route";
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

test.beforeEach(() => {
  resetProspectMemoryForTests();
  resetOperationalMemoryForTests();
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
