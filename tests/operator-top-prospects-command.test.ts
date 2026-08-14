import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  executeOperatorCommand,
  parseOperatorCommand,
} from "../lib/operator-command-center";
import {
  getAutonomousGrowthSettings,
  resetAutonomousGrowthMemoryForTests,
} from "../lib/autonomous-growth-repository";
import { resetOperationalMemoryForTests } from "../lib/operational-controls";
import { startTopProspectSearch } from "../lib/top-prospect-start";
import type { TopProspectInput } from "../lib/top-prospects";

const topProspectsCommand = [
  "COMMAND: RUN_TOP_PROSPECTS_SEARCH",
  "CITY: Tampa, FL",
  "TRADE: Pressure Washing",
  "PROSPECT_TYPE: All Prospect Types",
  "PROSPECT_MODE: Growth",
  "OUTREACH_PREFERENCE: Written outreach only",
  "RADIUS_KM: 50",
  "BUSINESSES_TO_SCAN: 30",
  "FINAL_PROSPECTS_WANTED: 10",
  "EXCLUDE_PREVIOUSLY_REVIEWED: true",
  "ACTION: EXECUTE",
].join("\n");

const canonicalInput: TopProspectInput = {
  trade: "Pressure Washing",
  city: "Tampa, FL",
  state: "FL",
  radiusKm: 50,
  businessesToScan: 30,
  finalProspectsWanted: 10,
  prospectType: "all",
  mode: "growth",
  workflowType: "search",
  outreachPreference: "written_only",
  excludePreviouslyReviewed: true,
};

test("structured RUN_TOP_PROSPECTS_SEARCH normalizes the documented command", () => {
  const preview = parseOperatorCommand(topProspectsCommand, "command");

  assert.equal(preview.commandType, "RUN_TOP_PROSPECTS_SEARCH");
  assert.equal(preview.confirmationLevel, 2);
  assert.equal(preview.confirmationRequired, true);
  assert.deepEqual(preview.validationErrors, []);
  assert.deepEqual(preview.navigation, { tab: "Top Prospects" });
  assert.equal(preview.parsedParameters.CITY, "Tampa, FL");
  assert.equal(preview.parsedParameters.STATE, "FL");
  assert.equal(preview.parsedParameters.TRADE, "Pressure Washing");
  assert.equal(preview.parsedParameters.PROSPECT_TYPE, "all");
  assert.equal(preview.parsedParameters.PROSPECT_MODE, "growth");
  assert.equal(preview.parsedParameters.OUTREACH_PREFERENCE, "written_only");
  assert.equal(preview.parsedParameters.RADIUS_KM, 50);
  assert.equal(preview.parsedParameters.BUSINESSES_TO_SCAN, 30);
  assert.equal(preview.parsedParameters.FINAL_PROSPECTS_WANTED, 10);
  assert.equal(preview.parsedParameters.EXCLUDE_PREVIOUSLY_REVIEWED, true);
  assert.equal(preview.parsedParameters.WORKFLOW_TYPE, "search");
  assert.match(preview.copyPlan, /Outreach sent = 0/i);
  assert.equal(preview.outreachCouldOccur, false);
});

test("Top Prospects command accepts false exclusion and supported human-readable enum labels", () => {
  const preview = parseOperatorCommand(topProspectsCommand
    .replace("All Prospect Types", "Redesign Prospects")
    .replace("Growth", "Volume")
    .replace("Written outreach only", "Phone allowed")
    .replace("EXCLUDE_PREVIOUSLY_REVIEWED: true", "EXCLUDE_PREVIOUSLY_REVIEWED: false"), "command");

  assert.deepEqual(preview.validationErrors, []);
  assert.equal(preview.parsedParameters.PROSPECT_TYPE, "redesign");
  assert.equal(preview.parsedParameters.PROSPECT_MODE, "volume");
  assert.equal(preview.parsedParameters.OUTREACH_PREFERENCE, "phone_allowed");
  assert.equal(preview.parsedParameters.EXCLUDE_PREVIOUSLY_REVIEWED, false);
});

test("Top Prospects command fails closed for invalid structured values", () => {
  const invalidCommands = [
    topProspectsCommand.replace("CITY: Tampa, FL", "CITY: Tampa Florida"),
    topProspectsCommand.replace("TRADE: Pressure Washing", "TRADE: Pet Grooming"),
    topProspectsCommand.replace("PROSPECT_TYPE: All Prospect Types", "PROSPECT_TYPE: Any Business"),
    topProspectsCommand.replace("PROSPECT_MODE: Growth", "PROSPECT_MODE: Turbo"),
    topProspectsCommand.replace("OUTREACH_PREFERENCE: Written outreach only", "OUTREACH_PREFERENCE: Send everywhere"),
    topProspectsCommand.replace("RADIUS_KM: 50", "RADIUS_KM: 35"),
    topProspectsCommand.replace("BUSINESSES_TO_SCAN: 30", "BUSINESSES_TO_SCAN: 4"),
    topProspectsCommand.replace("FINAL_PROSPECTS_WANTED: 10", "FINAL_PROSPECTS_WANTED: 31"),
    topProspectsCommand.replace("EXCLUDE_PREVIOUSLY_REVIEWED: true", "EXCLUDE_PREVIOUSLY_REVIEWED: maybe"),
    topProspectsCommand.replace("ACTION: EXECUTE", "ACTION: SEND"),
  ];

  for (const command of invalidCommands) {
    const preview = parseOperatorCommand(command, "command");
    assert.equal(preview.commandType, "RUN_TOP_PROSPECTS_SEARCH");
    assert.ok(preview.validationErrors.length > 0, command);
  }

  const invalidRadius = parseOperatorCommand(topProspectsCommand.replace("RADIUS_KM: 50", "RADIUS_KM: 35"), "command");
  assert.match(invalidRadius.validationErrors.join(" "), /Select a supported radius/);
  for (const field of [
    "CITY",
    "TRADE",
    "PROSPECT_TYPE",
    "PROSPECT_MODE",
    "OUTREACH_PREFERENCE",
    "RADIUS_KM",
    "BUSINESSES_TO_SCAN",
    "FINAL_PROSPECTS_WANTED",
    "EXCLUDE_PREVIOUSLY_REVIEWED",
    "ACTION",
  ]) {
    const withoutField = topProspectsCommand.split("\n").filter((line) => !line.startsWith(`${field}:`)).join("\n");
    const missing = parseOperatorCommand(withoutField, "command");
    assert.match(missing.validationErrors.join(" "), new RegExp(`${field} is required`));
  }
});

test("shared Top Prospects starter validates, creates once, and invokes the existing continuation once", async () => {
  let createCalls = 0;
  let continuationCalls = 0;
  let continuedRequest: Request | null = null;
  let continuedJobId = "";
  const request = new Request("https://www.webworkshop.dev/api/engine/top-prospects", { method: "POST" });

  const result = await startTopProspectSearch(request, canonicalInput, {
    async createJob(input) {
      createCalls += 1;
      assert.equal(input.city, "Tampa");
      assert.equal(input.state, "FL");
      return { id: "top-job-123" };
    },
    continueJob(actualRequest, jobId) {
      continuationCalls += 1;
      continuedRequest = actualRequest;
      continuedJobId = jobId;
    },
  });

  assert.equal(createCalls, 1);
  assert.equal(continuationCalls, 1);
  assert.equal(continuedRequest, request);
  assert.equal(continuedJobId, "top-job-123");
  assert.equal(result.jobId, "top-job-123");
  assert.equal(result.input.workflowType, "search");
});

test("shared starter preserves the active-job protection and never continues a rejected duplicate", async () => {
  let createCalls = 0;
  let continuationCalls = 0;
  const activeError = Object.assign(new Error("A Top Prospects search is already running."), { activeJobId: "active-job" });

  await assert.rejects(() => startTopProspectSearch(
    new Request("https://www.webworkshop.dev/api/engine/top-prospects", { method: "POST" }),
    canonicalInput,
    {
      async createJob() {
        createCalls += 1;
        throw activeError;
      },
      continueJob() {
        continuationCalls += 1;
      },
    },
  ), /already running/);

  assert.equal(createCalls, 1);
  assert.equal(continuationCalls, 0);
});

test("confirmed Top Prospects command starts once, returns job receipt and changes no outreach setting", async () => {
  resetOperationalMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  const settingsBefore = structuredClone(await getAutonomousGrowthSettings());
  const emailKillSwitchBefore = process.env.OUTREACH_EMAIL_DISABLED;
  let startCalls = 0;

  const waiting = await executeOperatorCommand(topProspectsCommand, {
    mode: "command",
    confirmed: false,
    async startTopProspectSearch() {
      startCalls += 1;
      return { jobId: "should-not-start", input: canonicalInput };
    },
  });
  assert.equal(waiting.receipt.status, "awaiting_confirmation");
  assert.equal(startCalls, 0);

  const completed = await executeOperatorCommand(topProspectsCommand, {
    mode: "command",
    confirmed: true,
    async startTopProspectSearch(input) {
      startCalls += 1;
      return { jobId: "top-job-command-1", input };
    },
  });

  assert.equal(startCalls, 1);
  assert.equal(completed.receipt.status, "completed");
  assert.equal(completed.receipt.relatedTopProspectJobId, "top-job-command-1");
  assert.equal(completed.receipt.relatedTopProspectSearch?.city, "Tampa");
  assert.equal(completed.preview.navigation?.tab, "Top Prospects");
  assert.match(completed.receipt.copyForChatGPT, /top-job-command-1/);
  assert.match(completed.receipt.copyForChatGPT, /Pressure Washing/);
  assert.deepEqual(completed.receipt.outreachSent, { emails: 0, dms: 0, forms: 0, calls: 0, looms: 0 });
  assert.deepEqual(await getAutonomousGrowthSettings(), settingsBefore);
  assert.equal(process.env.OUTREACH_EMAIL_DISABLED, emailKillSwitchBefore);
});

test("Operator command reports an active Top Prospects job without duplicating it", async () => {
  resetOperationalMemoryForTests();
  let startCalls = 0;
  const result = await executeOperatorCommand(topProspectsCommand, {
    mode: "command",
    confirmed: true,
    async startTopProspectSearch() {
      startCalls += 1;
      throw Object.assign(new Error("A Top Prospects search is already running."), { activeJobId: "active-top-job" });
    },
  });

  assert.equal(startCalls, 1);
  assert.equal(result.receipt.status, "blocked");
  assert.equal(result.receipt.safeErrorCategory, "top_prospects_already_running");
  assert.equal(result.receipt.relatedTopProspectJobId, "active-top-job");
  assert.equal(result.receipt.outreachSent.emails, 0);
});

test("both API routes use the shared starter and Command Help includes the structured example", () => {
  const topProspectsRoute = readFileSync("app/api/engine/top-prospects/route.ts", "utf8");
  const operatorRoute = readFileSync("app/api/engine/operator-commands/route.ts", "utf8");
  const commandBar = readFileSync("components/engine/OperatorCommandBar.tsx", "utf8");

  assert.match(topProspectsRoute, /startTopProspectSearch\(request, await request\.json\(\)\)/);
  assert.match(operatorRoute, /startTopProspectSearch: \(input\) => startTopProspectSearch\(request, input\)/);
  assert.match(commandBar, /COMMAND: RUN_TOP_PROSPECTS_SEARCH/);
  assert.match(commandBar, /CITY: Tampa, FL/);
  assert.doesNotMatch(operatorRoute, /fetch\(|processTopProspectJob/);
});
