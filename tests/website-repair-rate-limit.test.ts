import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POST } from "../app/api/engine/website-verification/route";
import {
  enforceRateLimit,
  memoryAuditEventsForTests,
  OperationalRateLimitError,
  resetOperationalMemoryForTests,
} from "../lib/operational-controls";
import {
  enforceWebsiteRepairApplyRateLimit,
  websiteRepairApplyRateLimit,
} from "../lib/website-repair-rate-limit";

function applyRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/engine/website-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "apply_existing_record_repair",
      confirmation: "REPAIR VERIFIED WEBSITE RECORDS",
      reviewToken: "signed-but-invalid-review-token",
      selectedProspectIds: ["reviewed-prospect"],
      offset: 0,
      limit: 20,
      ...overrides,
    }),
  });
}

test("website repair limiter supports a bounded cleanup session and eventually rejects abuse", async () => {
  resetOperationalMemoryForTests();
  assert.equal(websiteRepairApplyRateLimit.limit, 12);
  assert.equal(websiteRepairApplyRateLimit.windowMs, 60 * 60 * 1000);
  for (let attempt = 1; attempt <= websiteRepairApplyRateLimit.limit; attempt += 1) {
    const result = await enforceWebsiteRepairApplyRateLimit();
    assert.equal(result.count, attempt);
  }
  await assert.rejects(
    enforceWebsiteRepairApplyRateLimit(),
    (error: unknown) => {
      assert.ok(error instanceof OperationalRateLimitError);
      assert.equal(error.code, "RATE_LIMITED");
      assert.ok(error.retryAfterSeconds > 0);
      assert.ok(Date.parse(error.resetsAt) > Date.now());
      return true;
    },
  );
  assert.equal(memoryAuditEventsForTests()[0]?.metadata?.reason, "rate_limit");
});

test("malformed apply input is rejected before consuming the repair attempt budget", async () => {
  resetOperationalMemoryForTests();
  const emptySelection = await POST(applyRequest({ selectedProspectIds: [] }));
  assert.equal(emptySelection.status, 422);
  assert.match((await emptySelection.json()).error, /select at least one reviewed/i);
  const invalidOffset = await POST(applyRequest({ offset: -1 }));
  assert.equal(invalidOffset.status, 422);
  assert.match((await invalidOffset.json()).error, /non-negative integer/i);
  const oversizedBatch = await POST(applyRequest({ limit: 26 }));
  assert.equal(oversizedBatch.status, 422);
  assert.match((await oversizedBatch.json()).error, /between 1 and 25/i);
  const duplicateSelection = await POST(applyRequest({ selectedProspectIds: ["same", "same"] }));
  assert.equal(duplicateSelection.status, 422);
  assert.match((await duplicateSelection.json()).error, /must be unique/i);
  const oversizedToken = await POST(applyRequest({ reviewToken: "x".repeat(240_001) }));
  assert.equal(oversizedToken.status, 422);
  assert.match((await oversizedToken.json()).error, /safe size limit/i);
  const firstCountedAttempt = await enforceWebsiteRepairApplyRateLimit();
  assert.equal(firstCountedAttempt.count, 1);
});

test("concurrent repair attempts share one bounded budget", async () => {
  resetOperationalMemoryForTests();
  const results = await Promise.allSettled(Array.from(
    { length: websiteRepairApplyRateLimit.limit + 4 },
    () => enforceWebsiteRepairApplyRateLimit(),
  ));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, websiteRepairApplyRateLimit.limit);
  assert.equal(results.filter((result) => result.status === "rejected").length, 4);
  assert.equal(results.filter((result) => (
    result.status === "rejected" && result.reason instanceof OperationalRateLimitError
  )).length, 4);
});

test("production repair attempts share an atomic database-backed counter", () => {
  const controls = readFileSync(new URL("../lib/operational-controls.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(controls, /rateLimitBucket\.upsert[\s\S]*action_subject_windowStart[\s\S]*count:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(schema, /model RateLimitBucket[\s\S]*@@unique\(\[action, subject, windowStart\]\)/);
});

test("a rejected signed snapshot consumes one attempt but does not lock the cleanup session", async () => {
  resetOperationalMemoryForTests();
  const first = await POST(applyRequest());
  assert.equal(first.status, 422);
  assert.match((await first.json()).error, /snapshot|signing|invalid/i);
  const second = await POST(applyRequest({ reviewToken: "another-invalid-signed-review-token" }));
  assert.equal(second.status, 422);
  assert.notEqual(second.status, 429);
  const nextAttempt = await enforceWebsiteRepairApplyRateLimit();
  assert.equal(nextAttempt.count, 3);
});

test("website repair rate-limit responses use HTTP 429 and safe retry metadata", async () => {
  resetOperationalMemoryForTests();
  for (let attempt = 0; attempt < websiteRepairApplyRateLimit.limit; attempt += 1) {
    await enforceWebsiteRepairApplyRateLimit();
  }
  const response = await POST(applyRequest());
  const body = await response.json() as {
    code?: string;
    error?: string;
    retryAfterSeconds?: number;
    changed?: number;
    nothingSent?: boolean;
  };
  assert.equal(response.status, 429);
  assert.equal(body.code, "RATE_LIMITED");
  assert.equal(body.changed, 0);
  assert.equal(body.nothingSent, true);
  assert.ok((body.retryAfterSeconds ?? 0) > 0);
  assert.equal(response.headers.get("retry-after"), String(body.retryAfterSeconds));
  assert.match(body.error ?? "", /No records were changed and nothing was sent/i);
});

test("existing dry-run rate limiting remains a separate twelve-request policy", async () => {
  resetOperationalMemoryForTests();
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const result = await enforceRateLimit({
      action: "website_record_audit",
      subject: "operator",
      limit: 12,
      windowMs: 60 * 60 * 1000,
    });
    assert.equal(result.count, attempt);
  }
  const applyAttempt = await enforceWebsiteRepairApplyRateLimit();
  assert.equal(applyAttempt.count, 1);
});
