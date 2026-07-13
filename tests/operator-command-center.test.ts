import assert from "node:assert/strict";
import test from "node:test";
import {
  executeOperatorCommand,
  listOperatorCommandReceipts,
  parseOperatorCommand,
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
