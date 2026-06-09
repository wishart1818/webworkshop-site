import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { config as middlewareConfig, middleware } from "../middleware";
import nextConfig from "../next.config.mjs";
import { authorizeEngineRequest } from "../lib/engine-auth";
import { discoverContractors, resetDiscoveryThrottleForTests } from "../lib/lead-discovery";
import {
  enforceRateLimit,
  memoryAuditEventsForTests,
  resetOperationalMemoryForTests,
  safeRecordAudit,
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

test("prospect validation rejects malformed nested workflow data", () => {
  const invalidActivity = {
    ...structuredClone(seedProspects[0]),
    activities: [{ id: "activity", type: "unknown", label: "Bad activity", at: "not-a-date" }],
  };
  const activityResult = validateProspect(invalidActivity);
  assert.equal(activityResult.ok, false);
  if (!activityResult.ok) assert.match(activityResult.error, /Activity type/);

  const invalidAnalysis = {
    ...structuredClone(seedProspects[0]),
    analysis: { overallScore: 500, scores: {} },
  };
  const analysisResult = validateProspect(invalidAnalysis);
  assert.equal(analysisResult.ok, false);
  if (!analysisResult.ok) assert.match(analysisResult.error, /Analysis scores/);
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

test("middleware reads ENGINE_USERNAME and ENGINE_PASSWORD directly", () => {
  const oldUsername = process.env.ENGINE_USERNAME;
  const oldPassword = process.env.ENGINE_PASSWORD;
  process.env.ENGINE_USERNAME = "middleware-operator";
  process.env.ENGINE_PASSWORD = "middleware-secret";
  try {
    const unauthenticated = middleware(new NextRequest("https://example.com/engine"));
    assert.equal(unauthenticated?.status, 401);
    const token = Buffer.from("middleware-operator:middleware-secret").toString("base64");
    const authenticated = middleware(
      new NextRequest("https://example.com/engine", { headers: { authorization: `Basic ${token}` } }),
    );
    assert.equal(authenticated, null);
  } finally {
    process.env.ENGINE_USERNAME = oldUsername;
    process.env.ENGINE_PASSWORD = oldPassword;
  }
});

test("production auth failure reports secret-safe missing-variable diagnostics", () => {
  const oldNodeEnv = process.env.NODE_ENV;
  const oldConsoleWarn = console.warn;
  process.env.NODE_ENV = "production";
  console.warn = () => undefined;
  try {
    const response = authorizeEngineRequest(new NextRequest("https://example.com/engine"), {
      username: "operator",
      password: " ",
    });
    assert.equal(response?.status, 503);
    assert.equal(response?.headers.get("X-Engine-Auth-Configuration"), "username-present,password-missing");
    assert.doesNotMatch(response?.headers.get("X-Engine-Auth-Configuration") ?? "", /operator/);
  } finally {
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    console.warn = oldConsoleWarn;
  }
});

test("engine middleware never protects public website routes", () => {
  assert.deepEqual(middlewareConfig.matcher, ["/engine/:path*", "/api/engine/:path*"]);
  assert.equal(middlewareConfig.runtime, "nodejs");
  assert.ok(!middlewareConfig.matcher.some((matcher) => matcher === "/:path*" || matcher === "/(.*)"));
});

test("private engine routes receive no-store and baseline security headers", async () => {
  const config = nextConfig("phase-production-build");
  const rules = await config.headers?.();
  const globalHeaders = rules?.find((rule) => rule.source === "/(.*)")?.headers ?? [];
  const engineHeaders = rules?.find((rule) => rule.source === "/engine/:path*")?.headers ?? [];
  const apiHeaders = rules?.find((rule) => rule.source === "/api/engine/:path*")?.headers ?? [];

  assert.ok(globalHeaders.some((header) => header.key === "Content-Security-Policy"));
  assert.ok(globalHeaders.some((header) => header.key === "X-Content-Type-Options" && header.value === "nosniff"));
  assert.ok(engineHeaders.some((header) => header.key === "Cache-Control" && /no-store/.test(header.value)));
  assert.ok(engineHeaders.some((header) => header.key === "X-Robots-Tag" && /noindex/.test(header.value)));
  assert.ok(apiHeaders.some((header) => header.key === "Cache-Control" && /no-store/.test(header.value)));
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

test("audit failures do not mask the core workflow result", async () => {
  const recorded = await safeRecordAudit(
    { action: "test", outcome: "success" },
    async () => {
      throw new Error("audit storage unavailable");
    },
    () => undefined,
  );

  assert.equal(recorded, false);
});

test("private networks and restrictive robots rules are detected", () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.20"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  assert.equal(robotsDisallows("User-agent: *\nDisallow: /", "/"), true);
  assert.equal(robotsDisallows("User-agent: *\nDisallow: /private", "/services"), false);
});

test("robots rules honor agent groups, allow overrides, wildcards, and precedence", () => {
  const rules = [
    "User-agent: *",
    "Disallow: /",
    "",
    "User-agent: WebWorkshopProspectEngine",
    "Disallow: /private/*",
    "Allow: /private/public$",
    "Disallow: /reports",
  ].join("\n");

  assert.equal(robotsDisallows(rules, "/services"), false);
  assert.equal(robotsDisallows(rules, "/private/estimate"), true);
  assert.equal(robotsDisallows(rules, "/private/public"), false);
  assert.equal(robotsDisallows(rules, "/reports/annual"), true);
});

test("lead discovery rejects invalid input before provider access", async () => {
  resetDiscoveryThrottleForTests();
  await assert.rejects(
    discoverContractors({ city: "", state: "Ohio", trade: "Roofing", radiusKm: 999 }),
    /valid city/,
  );
});
