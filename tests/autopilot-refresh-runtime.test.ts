import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultAutopilotCampaignSettings,
  type AutopilotDashboard,
} from "../lib/autopilot-campaign";
import {
  persistAutopilotRouteState,
  readPersistedAutopilotRouteState,
  recoveredAutopilotSettingsFromJob,
} from "../lib/autopilot-route-state";
import { resetOperationalMemoryForTests } from "../lib/operational-controls";
import type { TopProspectJob } from "../lib/top-prospects";

test("Autopilot route state survives a fresh in-memory dashboard process", async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  resetOperationalMemoryForTests();
  try {
    const settings = {
      ...defaultAutopilotCampaignSettings,
      campaignName: "Florida pressure washing",
      marketPresetId: "florida",
      customCities: "Tampa, FL; St. Petersburg, FL",
      state: "FL",
      trade: "Pressure Washing" as const,
    };
    const autopilot = {
      campaign: {
        id: "campaign-1",
        status: "running",
        settings,
        latestRunReport: { topProspectJobId: "job-1" },
      },
      activity: { topProspectJobId: "job-1" },
    } as unknown as AutopilotDashboard;

    await persistAutopilotRouteState(autopilot);
    const restored = await readPersistedAutopilotRouteState();
    assert.equal(restored?.jobId, "job-1");
    assert.equal(restored?.status, "running");
    assert.equal(restored?.settings.marketPresetId, "florida");
    assert.equal(restored?.settings.trade, "Pressure Washing");
    assert.equal(restored?.settings.state, "FL");
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    resetOperationalMemoryForTests();
  }
});

test("Autopilot can recover safe settings from an active Top Prospects job", () => {
  const job = {
    input: {
      rawCityInput: "Tampa, FL; St. Petersburg, FL",
      city: "Tampa, FL; St. Petersburg, FL",
      state: "FL",
      trade: "Pressure Washing",
      prospectType: "all",
      mode: "growth",
      businessesToScan: 100,
      finalProspectsWanted: 20,
      excludePreviouslyReviewed: true,
      outreachPreference: "written_only",
    },
  } as TopProspectJob;
  const settings = recoveredAutopilotSettingsFromJob(job);
  assert.equal(settings.marketPresetId, "");
  assert.equal(settings.customCities, "Tampa, FL; St. Petersburg, FL");
  assert.equal(settings.state, "FL");
  assert.equal(settings.trade, "Pressure Washing");
  assert.equal(settings.maxProspectsPerRun, 100);
  assert.equal(settings.maxProspectsTotal, 20);
  assert.equal(settings.requireWrittenContact, true);
});

test("real multi-city continuation avoids self-fetch recursion and uses a Hobby-compatible durable scheduler", () => {
  const listRoute = readFileSync("app/api/engine/top-prospects/route.ts", "utf8");
  const workerRoute = readFileSync("app/api/engine/top-prospects/[jobId]/run/route.ts", "utf8");
  const autonomousRoute = readFileSync("app/api/engine/autonomous-growth/route.ts", "utf8");
  const continuation = readFileSync("lib/top-prospect-continuation.ts", "utf8");
  const cronRoute = readFileSync("app/api/cron/top-prospects/route.ts", "utf8");
  const schedulerWorkflow = readFileSync(".github/workflows/top-prospects-continuation.yml", "utf8");
  const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };

  assert.match(listRoute, /export const maxDuration = 300;/);
  assert.match(workerRoute, /export const maxDuration = 300;/);
  assert.match(autonomousRoute, /export const maxDuration = 300;/);
  assert.match(continuation, /processTopProspectJob\(jobId\)/);
  assert.doesNotMatch(continuation, /fetch\(/);
  assert.doesNotMatch(continuation, /AbortSignal/);
  assert.match(cronRoute, /CRON_SECRET/);
  assert.match(cronRoute, /processTopProspectJob\(active\.id\)/);
  assert.match(schedulerWorkflow, /cron:\s*["']17,47 \* \* \* \*["']/);
  assert.match(schedulerWorkflow, /timeout-minutes:\s*40/);
  assert.match(schedulerWorkflow, /for attempt in \$\(seq 1 7\)/);
  assert.match(schedulerWorkflow, /delay=\$\(\( 300 - elapsed \)\)/);
  assert.match(schedulerWorkflow, /Authorization: Bearer \$CRON_SECRET/);
  assert.match(schedulerWorkflow, /curl --location --fail-with-body/);
  assert.match(schedulerWorkflow, /www\.webworkshop\.dev\/api\/cron\/top-prospects/);
  assert.equal(vercelConfig.crons?.some((entry) => entry.path === "/api/cron/top-prospects"), false);
});
