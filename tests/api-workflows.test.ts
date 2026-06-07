import assert from "node:assert/strict";
import test from "node:test";
import { POST as analyze } from "../app/api/engine/analyze/route";
import { POST as discover } from "../app/api/engine/discover/route";
import { GET as list, POST as create, PUT as update } from "../app/api/engine/prospects/route";
import {
  memoryAuditEventsForTests,
  resetOperationalMemoryForTests,
} from "../lib/operational-controls";
import { seedProspects } from "../lib/prospect-engine";
import { resetProspectMemoryForTests } from "../lib/prospect-repository";

test.beforeEach(() => {
  resetProspectMemoryForTests();
  resetOperationalMemoryForTests();
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
