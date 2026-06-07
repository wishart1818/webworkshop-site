import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { authorizeEngineRequest } from "../lib/engine-auth";
import { discoverContractors, resetDiscoveryThrottleForTests } from "../lib/lead-discovery";
import {
  enforceRateLimit,
  memoryAuditEventsForTests,
  resetOperationalMemoryForTests,
} from "../lib/operational-controls";
import { seedProspects } from "../lib/prospect-engine";
import { validateProspect } from "../lib/prospect-validation";
import { isPrivateAddress, robotsDisallows } from "../lib/site-analysis";

test("prospect validation accepts a complete prospect and rejects unsafe URLs", () => {
  assert.equal(validateProspect(structuredClone(seedProspects[0])).ok, true);
  const invalid = { ...structuredClone(seedProspects[0]), website: "javascript:alert(1)" };
  const result = validateProspect(invalid);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /HTTP or HTTPS/);
});

test("authentication challenges missing credentials and accepts valid credentials", () => {
  const oldUsername = process.env.ENGINE_USERNAME;
  const oldPassword = process.env.ENGINE_PASSWORD;
  process.env.ENGINE_USERNAME = "operator";
  process.env.ENGINE_PASSWORD = "secret";
  try {
    const unauthenticated = authorizeEngineRequest(new NextRequest("https://example.com/engine"));
    assert.equal(unauthenticated?.status, 401);
    const token = Buffer.from("operator:secret").toString("base64");
    const authenticated = authorizeEngineRequest(
      new NextRequest("https://example.com/engine", { headers: { authorization: `Basic ${token}` } }),
    );
    assert.equal(authenticated, null);
  } finally {
    process.env.ENGINE_USERNAME = oldUsername;
    process.env.ENGINE_PASSWORD = oldPassword;
  }
});

test("rate limits reject excess operations and leave audit evidence", async () => {
  resetOperationalMemoryForTests();
  await enforceRateLimit({ action: "test", subject: "operator", limit: 2, windowMs: 60_000 });
  await enforceRateLimit({ action: "test", subject: "operator", limit: 2, windowMs: 60_000 });
  await assert.rejects(
    enforceRateLimit({ action: "test", subject: "operator", limit: 2, windowMs: 60_000 }),
    /Rate limit reached/,
  );
  assert.equal(memoryAuditEventsForTests()[0]?.outcome, "rejected");
});

test("private networks and restrictive robots rules are detected", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.20"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(robotsDisallows("User-agent: *\nDisallow: /", "/"), true);
  assert.equal(robotsDisallows("User-agent: *\nDisallow: /private", "/services"), false);
});

test("lead discovery rejects invalid input before provider access", async () => {
  resetDiscoveryThrottleForTests();
  await assert.rejects(
    discoverContractors({ city: "", state: "Ohio", trade: "Roofing", radiusKm: 999 }),
    /valid city/,
  );
});
