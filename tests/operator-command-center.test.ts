import assert from "node:assert/strict";
import test from "node:test";
import {
  executeOperatorCommand,
  listOperatorCommandReceipts,
  parseOperatorCommand,
  previewOperatorCommand,
} from "../lib/operator-command-center";
import {
  defaultAutonomousGrowthSettings,
} from "../lib/autonomous-growth";
import {
  getAutonomousGrowthSettings,
  resetAutonomousGrowthMemoryForTests,
  updateAutonomousGrowthSettings,
} from "../lib/autonomous-growth-repository";
import { memoryAuditEventsForTests, resetOperationalMemoryForTests } from "../lib/operational-controls";
import { resetProspectMemoryForTests, setProspectMemoryForTests, listProspects } from "../lib/prospect-repository";
import { PREVIEW_GENERATOR_VERSION, seedProspects, withAnalysis, withOutreach, withPreview, type Prospect } from "../lib/prospect-engine";

test("Operator command parser separates prospect search from commands", () => {
  const search = parseOperatorCommand("American Dream Pressure Clean");
  assert.equal(search.commandType, "SEARCH");
  assert.equal(search.navigation?.tab, "Prospects");
  assert.equal(search.navigation?.query, "American Dream Pressure Clean");

  const command = parseOperatorCommand("Show me the email-ready prospects.");
  assert.equal(command.commandType, "SHOW_EMAIL_READY");
  assert.equal(command.confirmationLevel, 1);
  assert.equal(command.navigation?.contactFilter, "email");
});

test("structured commands reject unknown fields and unsupported commands safely", () => {
  const unknownField = parseOperatorCommand("COMMAND: RUN_FULL_READINESS_TEST\nDANGEROUS: true", "command");
  assert.equal(unknownField.commandType, "RUN_FULL_READINESS_TEST");
  assert.match(unknownField.validationErrors.join(" "), /Unsupported field: DANGEROUS/);

  const unsupported = parseOperatorCommand("COMMAND: SEND_PROSPECT_EMAIL\nPROSPECT_ID: abc", "command");
  assert.equal(unsupported.commandType, "UNKNOWN");
  assert.equal(unsupported.confirmationLevel, 3);
  assert.match(unsupported.validationErrors.join(" "), /not supported by the global bar/i);
});

test("ambiguous operator commands are blocked instead of guessed", async () => {
  resetOperationalMemoryForTests();
  const result = await executeOperatorCommand("Turn everything on.", { mode: "command" });

  assert.equal(result.receipt.status, "blocked");
  assert.match(result.receipt.safeErrorMessage ?? "", /can't safely apply/i);
  assert.equal(result.receipt.outreachSent.emails, 0);
  assert.equal(result.receipt.outreachSent.dms, 0);
  assert.equal(memoryAuditEventsForTests().some((event) => event.action === "operator_command_receipt"), true);
});

test("Level 2 settings commands require confirmation before applying", async () => {
  resetOperationalMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, maxEmailsSentPerDay: 5, killSwitch: true });

  const previewOnly = await executeOperatorCommand("Set Auto Email Pilot to 1 email per day.", { mode: "command" });
  assert.equal(previewOnly.receipt.status, "awaiting_confirmation");
  assert.equal((await getAutonomousGrowthSettings()).maxEmailsSentPerDay, 5);
  assert.match(previewOnly.receipt.whatDidNotChange.join(" "), /Awaiting operator confirmation/);

  const confirmed = await executeOperatorCommand("Set Auto Email Pilot to 1 email per day.", { mode: "command", confirmed: true });
  assert.equal(confirmed.receipt.status, "completed");
  assert.equal((await getAutonomousGrowthSettings()).maxEmailsSentPerDay, 1);
  assert.equal(confirmed.receipt.outreachSent.emails, 0);
  assert.match(confirmed.receipt.copyForChatGPT, /Emails sent: 0/);
});

test("pause command uses the existing Autonomous Growth kill switch safely", async () => {
  resetOperationalMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  await updateAutonomousGrowthSettings({ ...defaultAutonomousGrowthSettings, mode: "auto_email_pilot", killSwitch: false });

  const paused = await executeOperatorCommand("Pause all outreach.", { mode: "command", confirmed: true });
  const settings = await getAutonomousGrowthSettings();

  assert.equal(paused.receipt.status, "completed");
  assert.equal(settings.killSwitch, true);
  assert.equal(settings.mode, "off");
  assert.equal(paused.receipt.outreachSent.emails, 0);
  assert.match(paused.receipt.whatDidNotChange.join(" "), /No prospect email/);
});

test("safe diagnostic commands persist secret-safe command receipts", async () => {
  resetOperationalMemoryForTests();
  resetAutonomousGrowthMemoryForTests();
  process.env.RESEND_API_KEY = "sk-secret-test-value-should-not-leak";
  process.env.GOOGLE_PLACES_API_KEY = "AIzaSecretValueThatShouldNotLeak";

  const result = await executeOperatorCommand("Why is sending blocked?", { mode: "command" });
  const receipts = await listOperatorCommandReceipts();

  assert.equal(result.receipt.status, "completed");
  assert.equal(result.receipt.commandType, "EXPLAIN_SENDING_BLOCK");
  assert.ok(receipts.some((receipt) => receipt.id === result.receipt.id || receipt.commandText === "Why is sending blocked?"));
  assert.doesNotMatch(JSON.stringify(receipts), /sk-secret-test-value-should-not-leak|AIzaSecretValueThatShouldNotLeak/);
  assert.equal(result.receipt.outreachSent.forms, 0);
  assert.equal(result.receipt.outreachSent.calls, 0);
  delete process.env.RESEND_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

test("Full Readiness command reuses the existing safe Test Center action", async () => {
  resetOperationalMemoryForTests();
  resetAutonomousGrowthMemoryForTests();

  const result = await executeOperatorCommand("Run the full readiness test.", { mode: "command" });

  assert.match(result.receipt.testsTriggered.join(" "), /Full Autonomous Readiness Test/);
  assert.equal(result.receipt.outreachSent.emails, 0);
  assert.equal(result.receipt.outreachSent.dms, 0);
  assert.ok(["completed", "partially_completed"].includes(result.receipt.status));
});

test("preview commands are recognized explicitly and do not become email safety checks", () => {
  const regenerate = parseOperatorCommand("Regenerate the preview for Pinnacle Pressure Washing of Toledo");
  assert.equal(regenerate.commandType, "REGENERATE_PROSPECT_PREVIEW");
  assert.equal(regenerate.confirmationLevel, 2);
  assert.notEqual(regenerate.commandType, "RUN_EMAIL_SAFETY_CHECK");

  const bulk = parseOperatorCommand("Regenerate all eligible unsent previews using the newest generator");
  assert.equal(bulk.commandType, "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS");
  assert.equal(bulk.confirmationLevel, 2);

  const list = parseOperatorCommand("Show previews that need regeneration");
  assert.equal(list.commandType, "LIST_PREVIEWS_NEEDING_REGENERATION");

  const qa = parseOperatorCommand("Show the QA report for Pinnacle Pressure Washing of Toledo");
  assert.equal(qa.commandType, "SHOW_PREVIEW_QA");
});

test("preview command mode matches one prospect before confirmation without mutating", async () => {
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const prospect = withPreview(withOutreach(withAnalysis({
    ...structuredClone(seedProspects[0]),
    id: "preview-command-match",
    businessName: "Pinnacle Pressure Washing of Toledo",
    email: "hello@pinnaclewash.test",
    recommendedContactMethod: "send_email",
    status: "New",
  })));
  prospect.preview = { ...prospect.preview!, previewVersion: "v2" };
  setProspectMemoryForTests([prospect]);

  const preview = await previewOperatorCommand("Regenerate the preview for Pinnacle Pressure Washing of Toledo");
  const stored = await listProspects();

  assert.equal(preview.commandType, "REGENERATE_PROSPECT_PREVIEW");
  assert.equal(preview.parsedParameters.PROSPECT_ID, "preview-command-match");
  assert.match(preview.copyPlan, /Matched business: Pinnacle Pressure Washing of Toledo/);
  assert.equal(stored[0].preview?.previewVersion, "v2");
});

test("confirmed preview regeneration uses latest generator and sends nothing", async () => {
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const prospect = withPreview(withOutreach(withAnalysis({
    ...structuredClone(seedProspects[0]),
    id: "preview-command-regenerate",
    businessName: "Pinnacle Pressure Washing of Toledo",
    email: "hello@pinnaclewash.test",
    recommendedContactMethod: "send_email",
    status: "New",
  })));
  prospect.preview = { ...prospect.preview!, previewVersion: "v2" };
  setProspectMemoryForTests([prospect]);

  const previewOnly = await executeOperatorCommand("Regenerate the preview for Pinnacle Pressure Washing of Toledo", { confirmed: false });
  assert.equal(previewOnly.receipt.status, "awaiting_confirmation");
  assert.equal((await listProspects())[0].preview?.previewVersion, "v2");

  const confirmed = await executeOperatorCommand("Regenerate the preview for Pinnacle Pressure Washing of Toledo", { confirmed: true });
  const [saved] = await listProspects();

  assert.equal(confirmed.receipt.status, "completed");
  assert.equal(saved.preview?.previewVersion, "v3");
  assert.match(confirmed.receipt.whatChanged.join(" "), new RegExp(PREVIEW_GENERATOR_VERSION));
  assert.equal(confirmed.receipt.outreachSent.emails, 0);
  assert.equal(confirmed.receipt.outreachSent.dms, 0);
  assert.equal(confirmed.receipt.outreachSent.forms, 0);
});

test("confirmed preview regeneration command blocks unsafe contacted records without mutation", async () => {
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  const prospect = withPreview(withOutreach(withAnalysis({
    ...structuredClone(seedProspects[0]),
    id: "preview-command-contacted",
    businessName: "Contacted Pressure Washing",
    email: "hello@contactedwash.test",
    recommendedContactMethod: "send_email",
    status: "Contacted",
  })));
  prospect.preview = { ...prospect.preview!, previewVersion: "v2" };
  setProspectMemoryForTests([prospect]);

  const confirmed = await executeOperatorCommand("Regenerate the preview for Contacted Pressure Washing", { confirmed: true });
  const [saved] = await listProspects();

  assert.equal(confirmed.receipt.status, "blocked");
  assert.match(confirmed.receipt.safeErrorMessage ?? "", /Preview regeneration blocked/i);
  assert.equal(saved.preview?.previewVersion, "v2");
  assert.equal(confirmed.receipt.recordsAffected, 0);
  assert.equal(confirmed.receipt.outreachSent.emails, 0);
  assert.equal(confirmed.receipt.outreachSent.dms, 0);
  assert.equal(confirmed.receipt.outreachSent.forms, 0);
});

test("bulk preview regeneration excludes unsafe or non-actionable records", async () => {
  resetOperationalMemoryForTests();
  resetProspectMemoryForTests();
  function oldPreview(prospect: Prospect) {
    const next = withPreview(withOutreach(withAnalysis(prospect)));
    next.preview = { ...next.preview!, previewVersion: "v2" };
    return next;
  }
  const eligible = oldPreview({
    ...structuredClone(seedProspects[0]),
    id: "bulk-preview-eligible",
    businessName: "Eligible Pressure Washing",
    email: "owner@eligiblewash.test",
    recommendedContactMethod: "send_email",
    status: "New",
  });
  const magic = oldPreview({
    ...structuredClone(seedProspects[0]),
    id: "bulk-preview-magic",
    businessName: "Magic Touch Pressure Washing",
    email: "owner@magictouch.test",
    recommendedContactMethod: "send_email",
    status: "New",
  });
  const contacted = oldPreview({
    ...structuredClone(seedProspects[0]),
    id: "bulk-preview-contacted",
    businessName: "Already Contacted Wash",
    email: "owner@contactedwash.test",
    recommendedContactMethod: "send_email",
    status: "Contacted",
  });
  const phoneOnly = oldPreview({
    ...structuredClone(seedProspects[1]),
    id: "bulk-preview-phone-only",
    businessName: "Phone Only Wash",
    email: "",
    facebookUrl: "",
    instagramUrl: "",
    contactFormUrl: "",
    quoteFormUrl: "",
    recommendedContactMethod: "call_first",
    status: "New",
  });
  setProspectMemoryForTests([eligible, magic, contacted, phoneOnly]);

  const preview = await previewOperatorCommand("Regenerate all eligible unsent previews using the newest generator");
  assert.equal(preview.parsedParameters.ELIGIBLE_COUNT, 1);
  assert.equal(preview.parsedParameters.EXCLUDED_COUNT, 3);

  const confirmed = await executeOperatorCommand("Regenerate all eligible unsent previews using the newest generator", { confirmed: true });
  const saved = await listProspects();
  const regenerated = saved.find((prospect) => prospect.id === "bulk-preview-eligible");
  const excluded = saved.filter((prospect) => prospect.id !== "bulk-preview-eligible");

  assert.equal(confirmed.receipt.status, "completed");
  assert.equal(confirmed.receipt.recordsAffected, 1);
  assert.equal(regenerated?.preview?.previewVersion, "v3");
  assert.ok(excluded.every((prospect) => prospect.preview?.previewVersion === "v2"));
  assert.equal(confirmed.receipt.outreachSent.emails, 0);
  assert.equal(confirmed.receipt.outreachSent.dms, 0);
});
