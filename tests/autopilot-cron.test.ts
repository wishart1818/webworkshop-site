import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Vercel schedules the guarded Auto Email Pilot once per day", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")) as {
    crons?: Array<{ path?: string; schedule?: string }>;
  };
  assert.deepEqual(config.crons, [{ path: "/api/cron/autopilot", schedule: "0 14 * * *" }]);
});

test("scheduled autopilot endpoint fails closed and runs existing approved inventory", () => {
  const route = readFileSync(new URL("../app/api/cron/autopilot/route.ts", import.meta.url), "utf8");
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /authorization.*Bearer/si);
  assert.match(route, /status:\s*401/);
  assert.match(route, /processExistingQualifiedProspects\(\{ dryRun: false \}\)/);
  assert.match(route, /autoEmailPilot\.attempted/);
  assert.match(route, /autoEmailPilot\.sent/);
  assert.match(route, /Scheduled Auto Email Pilot run failed safely/);
});
