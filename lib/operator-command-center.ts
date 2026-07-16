import type { Prisma } from "@prisma/client";
import { runFullAutonomousReadinessTest, runOperatorMarketScoutDryRun, runOperatorSmartAutonomousDryRun, runOperatorSmartBackfillTest, generateOneTestOutreachPackage, sendOperatorTestNotification } from "@/lib/operator-test-center";
import { buildProviderSmokeTestRecord, recordOperatorSafeTestResult, safeOperatorText } from "@/lib/operator-test-history";
import { listAuditEvents, safeRecordAudit, type AuditEventView } from "@/lib/operational-controls";
import { discoverContractorsWithDiagnostics } from "@/lib/lead-discovery";
import { createOrRefreshAutonomousReviewPackageForProspect, getAutonomousGrowthDashboard, processExistingQualifiedProspects, regenerateProspectOutreachWithCurrentScript, updateAutonomousGrowthSettings } from "@/lib/autonomous-growth-repository";
import { autonomousGrowthModes, type AutonomousGrowthMode, type AutonomousGrowthSettings } from "@/lib/autonomous-growth";
import { applyLegacyOutreachBackfill, previewLegacyOutreachBackfill } from "@/lib/legacy-outreach-backfill";
import { listProspects, saveProspect } from "@/lib/prospect-repository";
import { PREVIEW_GENERATOR_VERSION, previewRegenerationBlockReason, type Prospect } from "@/lib/prospect-engine";
import { prepareProspectForPreview } from "@/lib/preview-preparation";
import { prospectCurrentBucket } from "@/lib/prospect-funnel";

export const operatorCommandTypes = [
  "OPEN_PROSPECT",
  "SHOW_EMAIL_READY",
  "SHOW_FACEBOOK_READY",
  "SHOW_INSTAGRAM_READY",
  "SHOW_CONTACT_FORM_READY",
  "SHOW_PHONE_ONLY",
  "SHOW_HIGH_PRIORITY",
  "SHOW_BLOCKED",
  "SHOW_SUPPRESSED",
  "SHOW_LATEST_TEST_RESULT",
  "OPEN_AUTONOMOUS_GROWTH",
  "OPEN_TEST_CENTER",
  "RUN_PROVIDER_SMOKE_TEST",
  "RUN_FULL_READINESS_TEST",
  "RUN_EMAIL_SAFETY_CHECK",
  "RUN_SMART_BACKFILL_DRY_RUN",
  "RUN_MARKET_SCOUT_DRY_RUN",
  "RUN_SMART_AUTONOMOUS_DRY_RUN",
  "GENERATE_FAKE_TEST_PACKAGE",
  "SEND_INTERNAL_NOTIFICATION_TEST",
  "SEND_INTERNAL_RESEND_TEST",
  "EXPLAIN_SENDING_BLOCK",
  "EXPLAIN_NEXT_RECOMMENDED_ACTION",
  "SET_AUTONOMOUS_MODE",
  "SET_DAILY_EMAIL_CAP",
  "SET_DAILY_QUEUE_CAP",
  "SET_DAILY_SCAN_CAP",
  "SET_DAILY_PREVIEW_CAP",
  "SET_COOLDOWN_MINUTES",
  "ENABLE_FOLLOW_UPS",
  "DISABLE_FOLLOW_UPS",
  "ENABLE_GLOBAL_KILL_SWITCH",
  "DISABLE_GLOBAL_KILL_SWITCH",
  "PAUSE_ALL_OUTREACH",
  "CONFIGURE_AUTO_EMAIL_PILOT",
  "SHOW_EXISTING_QUALIFIED_PROSPECTS",
  "PROCESS_EXISTING_QUALIFIED_PROSPECTS",
  "SHOW_ELIGIBLE_EMAIL_QUEUE",
  "MOVE_REVIEWED_LEAD_TO_EMAIL_QUEUE",
  "PREVIEW_LEGACY_OUTREACH_BACKFILL",
  "APPLY_LEGACY_OUTREACH_BACKFILL",
  "REGENERATE_PROSPECT_OUTREACH",
  "CREATE_AUTONOMOUS_REVIEW_PACKAGE",
  "REGENERATE_PROSPECT_PREVIEW",
  "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS",
  "LIST_PREVIEWS_NEEDING_REGENERATION",
  "SHOW_PREVIEW_QA",
] as const;

export type OperatorCommandType = (typeof operatorCommandTypes)[number];
export type OperatorCommandStatus = "previewed" | "awaiting_confirmation" | "running" | "completed" | "partially_completed" | "blocked" | "failed" | "cancelled";
export type OperatorCommandLevel = 1 | 2 | 3;

export type OperatorCommandPreview = {
  commandText: string;
  commandType: OperatorCommandType | "SEARCH" | "UNKNOWN";
  parsedParameters: Record<string, string | number | boolean>;
  exactMatch: boolean;
  confidence: "exact" | "pattern" | "low";
  confirmationRequired: boolean;
  confirmationLevel: OperatorCommandLevel;
  plannedActions: string[];
  safetyImpact: string[];
  validationErrors: string[];
  outreachCouldOccur: boolean;
  navigation?: OperatorCommandNavigation;
  copyPlan: string;
};

export type OperatorCommandNavigation = {
  tab?: "Overview" | "Top Prospects" | "Prospects" | "Pipeline" | "Autonomous Growth" | "Operator Test Center" | "System" | "Command Activity";
  query?: string;
  contactFilter?: "all" | "email" | "form" | "social" | "hide_phone_only" | "send_ready" | "needs_research";
  funnelFilter?: string;
  prospectId?: string;
};

export type OperatorCommandReceipt = {
  id: string;
  commandText: string;
  commandType: OperatorCommandType | "SEARCH" | "UNKNOWN";
  status: OperatorCommandStatus;
  createdAt: string;
  confirmedAt?: string;
  completedAt?: string;
  plannedActions: string[];
  whatChanged: string[];
  whatDidNotChange: string[];
  recordsAffected: number;
  testsTriggered: string[];
  messagesSent: number;
  outreachSent: {
    emails: number;
    dms: number;
    forms: number;
    calls: number;
    looms: number;
  };
  safeErrorMessage?: string;
  safeErrorCategory?: string;
  nextRecommendedAction: string;
  relatedPage?: string;
  relatedTestResultId?: string;
  relatedProspectIds?: string[];
  copyForChatGPT: string;
  technicalSummary: string;
};

type ParsedStructured = {
  command?: string;
  fields: Record<string, string>;
  errors: string[];
};

const commandAction = "operator_command_receipt";
const noOutreach = { emails: 0, dms: 0, forms: 0, calls: 0, looms: 0 };
const level3Commands = new Set(["SEND_PROSPECT_EMAIL", "ENABLE_FULL_AUTO_EMAIL", "SUPPRESS_PROSPECT", "DELETE_PROSPECT_DATA", "BULK_CHANGE_QUEUE_STATUS"]);
const previewCommandSet = new Set<OperatorCommandType>(["REGENERATE_PROSPECT_PREVIEW", "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS", "LIST_PREVIEWS_NEEDING_REGENERATION", "SHOW_PREVIEW_QA"]);
const supportedFields = new Set([
  "COMMAND",
  "ACTION",
  "DAILY_EMAIL_CAP",
  "DAILY_QUEUE_CAP",
  "DAILY_SCAN_CAP",
  "DAILY_PREVIEW_CAP",
  "COOLDOWN_MINUTES",
  "MODE",
  "AUTONOMOUS_MODE",
  "PROCESS_EXISTING_FIRST",
  "FULL_AUTO",
  "FOLLOW_UPS",
  "QUEUE_ITEM_ID",
  "PROSPECT_ID",
  "BUSINESS_NAME",
  "FEEDBACK",
  "FORCE",
]);

function isOperatorCommandType(value: string): value is OperatorCommandType {
  return operatorCommandTypes.includes(value as OperatorCommandType);
}

function safeJson<T>(value: T): T {
  return JSON.parse(safeOperatorText(JSON.stringify(value))) as T;
}

function parseStructuredCommand(text: string): ParsedStructured {
  const fields: Record<string, string> = {};
  const errors: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = /^([A-Z0-9_]+)\s*:\s*(.+)$/i.exec(line);
    if (!match) {
      errors.push(`Unsupported structured line: ${line}`);
      continue;
    }
    const key = match[1].toUpperCase();
    if (!supportedFields.has(key)) {
      errors.push(`Unsupported field: ${key}`);
      continue;
    }
    fields[key] = match[2].trim();
  }
  return { command: fields.COMMAND?.toUpperCase(), fields, errors };
}

function boolValue(value: string | undefined, field: string, errors: string[]) {
  if (value === undefined) return undefined;
  if (/^(true|yes|on)$/i.test(value)) return true;
  if (/^(false|no|off)$/i.test(value)) return false;
  errors.push(`${field} must be true or false.`);
  return undefined;
}

function positiveInteger(value: string | undefined, field: string, errors: string[], max = 500) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    errors.push(`${field} must be an integer from 0 to ${max}.`);
    return undefined;
  }
  return number;
}

function commandLabel(type: string) {
  return type.toLowerCase().replaceAll("_", " ");
}

function normalizedProspectText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function prospectPreviewIsCurrent(prospect: Prospect) {
  return prospect.preview?.previewVersion === "v3" && prospect.preview?.qualityScore?.status === "Send-worthy / polished";
}

function prospectPreviewNeedsRegeneration(prospect: Prospect) {
  if (!prospect.preview) return true;
  if (prospect.preview.previewVersion !== "v3") return true;
  if ((prospect.preview.qualityScore?.overall ?? 0) < 88) return true;
  if (prospect.preview.qualityScore?.status && prospect.preview.qualityScore.status !== "Send-worthy / polished") return true;
  return prospect.preview.qualityScore?.notes.some((note) => /flag|generic|placeholder|internal|unsupported|repeated/i.test(note)) ?? false;
}

function suspiciousPreviewEmail(email: string) {
  return /^(admin|noreply|no-reply|wordpress|donotreply|test|example)@/i.test(email) || /(?:theme|template|developer|totalwptheme)\./i.test(email);
}

function previewBulkEligibility(prospect: Prospect, force = false) {
  const bucket = prospectCurrentBucket(prospect);
  if (/magic touch pressure washing/i.test(prospect.businessName)) return { eligible: false, reason: "excluded protected test/business record" };
  const blockReason = previewRegenerationBlockReason(prospect);
  if (blockReason) return { eligible: false, reason: blockReason };
  if (!["ready_email", "ready_contact_form"].includes(bucket)) return { eligible: false, reason: `not in eligible written review bucket (${bucket})` };
  if (bucket === "ready_email" && (!prospect.email || suspiciousPreviewEmail(prospect.email))) return { eligible: false, reason: "missing or suspicious public email" };
  if (!force && prospectPreviewIsCurrent(prospect)) return { eligible: false, reason: "already using latest polished generator" };
  return { eligible: true, reason: "eligible unsent written-contact preview" };
}

function previewSafeFeedback(value: unknown) {
  return safeOperatorText(String(value ?? "")).replace(/\b(award-winning|certified|licensed|insured|guarantee(?:d)?|five-star|best rated|years in business)\b/gi, "").slice(0, 240).trim();
}

async function findPreviewCommandMatches(preview: OperatorCommandPreview) {
  const prospects = await listProspects().catch(() => []);
  const id = String(preview.parsedParameters.PROSPECT_ID ?? "");
  const query = normalizedProspectText(String(preview.parsedParameters.BUSINESS_NAME ?? preview.parsedParameters.query ?? ""));
  if (id) return prospects.filter((prospect) => prospect.id === id);
  if (!query) return [];
  const exact = prospects.filter((prospect) => normalizedProspectText(prospect.businessName) === query);
  if (exact.length) return exact;
  return prospects.filter((prospect) => normalizedProspectText(prospect.businessName).includes(query) || query.includes(normalizedProspectText(prospect.businessName)));
}

function previewCommandSummary(prospects: Prospect[], force = false) {
  const rows = prospects.map((prospect) => ({ prospect, eligibility: previewBulkEligibility(prospect, force), needsRegeneration: prospectPreviewNeedsRegeneration(prospect) }));
  const eligible = rows.filter((row) => row.eligibility.eligible && row.needsRegeneration);
  const alreadyCurrent = rows.filter((row) => row.eligibility.eligible && !row.needsRegeneration);
  const excluded = rows.filter((row) => !row.eligibility.eligible);
  return { rows, eligible, alreadyCurrent, excluded };
}

function previewBusinessQueryFromText(text: string) {
  return safeOperatorText(text)
    .replace(/^regenerate\s+(?:the\s+)?preview\s+for\s+/i, "")
    .replace(/^refresh\s+/i, "")
    .replace(/^make\s+/i, "")
    .replace(/^show\s+(?:the\s+)?qa\s+report\s+for\s+/i, "")
    .replace(/\s+using\s+the\s+latest.*$/i, "")
    .replace(/\s+with\s+the\s+latest.*$/i, "")
    .replace(/\s+preview\s+more.*$/i, "")
    .replace(/(?:'|’|`)?s\s+preview.*$/i, "")
    .replace(/\s+preview$/i, "")
    .trim();
}

function previewText(preview: OperatorCommandPreview) {
  return safeOperatorText([
    "WebWorkshop Command Preview",
    `Command: ${preview.commandType}`,
    `Confirmation level: ${preview.confirmationLevel}`,
    preview.plannedActions.length ? `Planned:\n- ${preview.plannedActions.join("\n- ")}` : "",
    preview.safetyImpact.length ? `Safety:\n- ${preview.safetyImpact.join("\n- ")}` : "",
    preview.validationErrors.length ? `Errors:\n- ${preview.validationErrors.join("\n- ")}` : "",
  ].filter(Boolean).join("\n"));
}

function basePreview(commandText: string, commandType: OperatorCommandPreview["commandType"], level: OperatorCommandLevel): OperatorCommandPreview {
  return {
    commandText: safeOperatorText(commandText).slice(0, 2000),
    commandType,
    parsedParameters: {},
    exactMatch: commandType !== "UNKNOWN",
    confidence: commandType === "UNKNOWN" ? "low" : "pattern",
    confirmationRequired: level > 1,
    confirmationLevel: level,
    plannedActions: [],
    safetyImpact: [
      "No prospect email will be sent by this command layer.",
      "No social DM, contact form, phone call, or Loom will be automated.",
      "Existing outreach safety gates remain authoritative.",
    ],
    validationErrors: [],
    outreachCouldOccur: false,
    copyPlan: "",
  };
}

function structuredPreview(commandText: string): OperatorCommandPreview {
  const parsed = parseStructuredCommand(commandText);
  const command = parsed.command ?? "UNKNOWN";
  const errors = [...parsed.errors];
  if (level3Commands.has(command)) {
    const preview = basePreview(commandText, "UNKNOWN", 3);
    preview.validationErrors.push(`${command} is a Level 3 command and is not supported by the global bar yet. Use the dedicated reviewed workflow.`);
    preview.safetyImpact.push("The command was blocked before any setting or outreach action.");
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (!isOperatorCommandType(command)) {
    const preview = basePreview(commandText, "UNKNOWN", 1);
    preview.validationErrors.push(`Unsupported command: ${command || "missing COMMAND"}.`);
    preview.validationErrors.push(...errors);
    preview.copyPlan = previewText(preview);
    return preview;
  }
  const level = commandLevel(command);
  const preview = basePreview(commandText, command, level);
  preview.exactMatch = true;
  preview.confidence = "exact";
  preview.validationErrors.push(...errors);
  for (const [key, value] of Object.entries(parsed.fields)) {
    if (key === "COMMAND") continue;
    if (key.endsWith("_CAP") || key === "COOLDOWN_MINUTES") preview.parsedParameters[key] = positiveInteger(value, key, preview.validationErrors, key === "COOLDOWN_MINUTES" ? 240 : 500) ?? 0;
    else if (["PROCESS_EXISTING_FIRST", "FULL_AUTO", "FOLLOW_UPS", "FORCE"].includes(key)) preview.parsedParameters[key] = boolValue(value, key, preview.validationErrors) ?? false;
    else preview.parsedParameters[key] = safeOperatorText(value);
  }
  if (command === "CONFIGURE_AUTO_EMAIL_PILOT") {
    if (parsed.fields.FULL_AUTO && boolValue(parsed.fields.FULL_AUTO, "FULL_AUTO", preview.validationErrors) === true) {
      preview.validationErrors.push("FULL_AUTO:true is not allowed from CONFIGURE_AUTO_EMAIL_PILOT. Full-auto email requires a separate strong-confirmation workflow.");
    }
    preview.plannedActions.push("Preview Auto Email Pilot settings.");
    if (parsed.fields.DAILY_EMAIL_CAP) preview.plannedActions.push(`Set daily email cap to ${parsed.fields.DAILY_EMAIL_CAP}.`);
    if (parsed.fields.PROCESS_EXISTING_FIRST) preview.plannedActions.push("Process existing qualified prospects first.");
    preview.plannedActions.push("Keep full-auto email disabled.");
  } else if (command === "PREVIEW_LEGACY_OUTREACH_BACKFILL") {
    preview.plannedActions.push("Preview legacy Prospect and queue outreach copy updates.");
    preview.plannedActions.push("Report counts and samples without changing data.");
  } else if (command === "APPLY_LEGACY_OUTREACH_BACKFILL") {
    preview.plannedActions.push("Regenerate eligible unsent Prospect drafts with the current script.");
    preview.plannedActions.push("Refresh eligible unsent queue packages and create missing review-only packages.");
    preview.plannedActions.push("Require operator confirmation and send nothing.");
  } else if (command === "REGENERATE_PROSPECT_OUTREACH") {
    preview.plannedActions.push(`Regenerate current outreach draft for prospect ${safeOperatorText(parsed.fields.PROSPECT_ID ?? "")}.`);
    preview.plannedActions.push("Remove approval and send nothing.");
    if (!parsed.fields.PROSPECT_ID) preview.validationErrors.push("PROSPECT_ID is required.");
  } else if (command === "CREATE_AUTONOMOUS_REVIEW_PACKAGE") {
    preview.plannedActions.push(`Create or refresh a review-only Autonomous Growth package for prospect ${safeOperatorText(parsed.fields.PROSPECT_ID ?? "")}.`);
    preview.plannedActions.push("Keep the package out of automatic sending.");
    if (!parsed.fields.PROSPECT_ID) preview.validationErrors.push("PROSPECT_ID is required.");
  } else if (command === "REGENERATE_PROSPECT_PREVIEW") {
    preview.plannedActions.push("Regenerate one prospect preview with the newest photo-led generator.");
    preview.plannedActions.push("Retain the existing public preview token and send nothing.");
    if (!parsed.fields.PROSPECT_ID && !parsed.fields.BUSINESS_NAME) preview.validationErrors.push("PROSPECT_ID or BUSINESS_NAME is required.");
  } else if (command === "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS") {
    preview.plannedActions.push("Regenerate only eligible unsent, uncontacted, non-suppressed written-contact previews.");
    preview.plannedActions.push("Exclude contacted, sent, suppressed, phone-only, placeholder-email, blocked, and already-current records unless FORCE:true is supplied.");
    preview.plannedActions.push("Send nothing and preserve suppression/contact history.");
  } else if (command === "LIST_PREVIEWS_NEEDING_REGENERATION") {
    preview.plannedActions.push("List previews that need regeneration without changing records.");
  } else if (command === "SHOW_PREVIEW_QA") {
    preview.plannedActions.push("Show the preview QA report for the matched prospect without changing records.");
    if (!parsed.fields.PROSPECT_ID && !parsed.fields.BUSINESS_NAME) preview.validationErrors.push("PROSPECT_ID or BUSINESS_NAME is required.");
  } else {
    preview.plannedActions.push(`Run ${commandLabel(command)}.`);
  }
  preview.copyPlan = previewText(preview);
  return preview;
}

function commandLevel(type: OperatorCommandType): OperatorCommandLevel {
  if (["SET_AUTONOMOUS_MODE", "SET_DAILY_EMAIL_CAP", "SET_DAILY_QUEUE_CAP", "SET_DAILY_SCAN_CAP", "SET_DAILY_PREVIEW_CAP", "SET_COOLDOWN_MINUTES", "ENABLE_FOLLOW_UPS", "DISABLE_FOLLOW_UPS", "ENABLE_GLOBAL_KILL_SWITCH", "DISABLE_GLOBAL_KILL_SWITCH", "PAUSE_ALL_OUTREACH", "CONFIGURE_AUTO_EMAIL_PILOT", "PROCESS_EXISTING_QUALIFIED_PROSPECTS", "MOVE_REVIEWED_LEAD_TO_EMAIL_QUEUE", "APPLY_LEGACY_OUTREACH_BACKFILL", "REGENERATE_PROSPECT_PREVIEW", "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS"].includes(type)) return 2;
  return 1;
}

export function parseOperatorCommand(commandText: string, forcedMode?: "search" | "command"): OperatorCommandPreview {
  const text = commandText.trim();
  if (!text) {
    const preview = basePreview("", "UNKNOWN", 1);
    preview.validationErrors.push("Enter a prospect search or a supported WebWorkshop command.");
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (forcedMode === "search") {
    const preview = basePreview(text, "SEARCH", 1);
    preview.navigation = { tab: "Prospects", query: text };
    preview.plannedActions.push(`Search prospects for "${safeOperatorText(text)}".`);
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (/^COMMAND\s*:/i.test(text)) return structuredPreview(text);
  if (forcedMode !== "command" && !/^(why|show|run|set|pause|start|open|configure|enable|disable|use|process|move|regenerate|refresh|make|list)\b/i.test(text)) {
    const preview = basePreview(text, "SEARCH", 1);
    preview.navigation = { tab: "Prospects", query: text };
    preview.plannedActions.push(`Search prospects for "${safeOperatorText(text)}".`);
    preview.copyPlan = previewText(preview);
    return preview;
  }

  const lower = text.toLowerCase();
  const exact = (type: OperatorCommandType, actions: string[], navigation?: OperatorCommandNavigation) => {
    const preview = basePreview(text, type, commandLevel(type));
    preview.plannedActions = actions;
    preview.navigation = navigation;
    preview.copyPlan = previewText(preview);
    return preview;
  };

  if (/turn everything on|enable everything|full auto everything/.test(lower)) {
    const preview = basePreview(text, "UNKNOWN", 3);
    preview.validationErrors.push("I can't safely apply that as written. Choose one specific command: Enable Auto Email Pilot, enable full-auto email, disable the global kill switch, or change a daily cap.");
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (/show previews?.*(need|needing).*(regen|refresh)|list previews?.*(need|needing).*(regen|refresh)/.test(lower)) {
    return exact("LIST_PREVIEWS_NEEDING_REGENERATION", ["List previews needing regeneration.", "No records will be changed."], { tab: "Command Activity" });
  }
  if (/regenerate all eligible unsent previews|refresh all eligible unsent previews/.test(lower)) {
    const preview = exact("REGENERATE_ELIGIBLE_UNSENT_PREVIEWS", [
      "Find eligible unsent written-contact prospects needing the latest preview generator.",
      "Exclude contacted, sent, suppressed, phone-only, placeholder-email, and already-current records.",
      "Require confirmation before any preview is regenerated.",
    ], { tab: "Command Activity" });
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (/show .*preview qa|show .*qa report/.test(lower)) {
    const query = previewBusinessQueryFromText(text);
    const preview = exact("SHOW_PREVIEW_QA", [`Show Preview QA for "${query || "matched prospect"}".`, "No records will be changed."], { tab: "Prospects", query });
    preview.parsedParameters.BUSINESS_NAME = query;
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (/(regenerate|refresh|make).*(preview)/.test(lower) || /(regenerate|refresh).*(latest photo-led|latest .*generator)/.test(lower)) {
    const query = previewBusinessQueryFromText(text);
    const feedback = /(premium|image-led|darker|dramatic|upscale|reduce text|concrete|driveway|roof|blue|white)/i.test(text) ? text : "";
    const preview = exact("REGENERATE_PROSPECT_PREVIEW", [
      `Regenerate preview for "${query || "matched prospect"}" with ${PREVIEW_GENERATOR_VERSION}.`,
      "Retain the public preview token where possible.",
      "Require confirmation before saving.",
    ], { tab: "Prospects", query });
    preview.parsedParameters.BUSINESS_NAME = query;
    if (feedback) preview.parsedParameters.FEEDBACK = previewSafeFeedback(feedback);
    preview.copyPlan = previewText(preview);
    return preview;
  }
  if (/email safety/.test(lower) || /why is sending blocked|sending blocked/.test(lower)) return exact(/why/.test(lower) ? "EXPLAIN_SENDING_BLOCK" : "RUN_EMAIL_SAFETY_CHECK", ["Explain current email safety gates."]);
  if (/email[-\s]?ready/.test(lower)) return exact("SHOW_EMAIL_READY", ["Open email-ready prospects."], { tab: "Prospects", contactFilter: "email" });
  if (/facebook/.test(lower)) return exact("SHOW_FACEBOOK_READY", ["Open Facebook-ready prospects."], { tab: "Prospects", contactFilter: "social" });
  if (/instagram/.test(lower)) return exact("SHOW_INSTAGRAM_READY", ["Open Instagram-ready prospects."], { tab: "Prospects", contactFilter: "social" });
  if (/contact form/.test(lower)) return exact("SHOW_CONTACT_FORM_READY", ["Open contact-form-ready prospects."], { tab: "Prospects", contactFilter: "form" });
  if (/phone[-\s]?only/.test(lower)) return exact("SHOW_PHONE_ONLY", ["Open phone-only prospects."], { tab: "Prospects", contactFilter: "needs_research" });
  if (/\b(high|higher|highest) priority\b|\b(best|top) (?:prospects|leads)\b/.test(lower)) return exact("SHOW_HIGH_PRIORITY", ["Open high-priority prospects."], { tab: "Prospects", funnelFilter: "high_priority" });
  if (/blocked/.test(lower)) return exact("SHOW_BLOCKED", ["Open blocked prospects."], { tab: "Prospects", funnelFilter: "bad_fit" });
  if (/suppressed|do not contact/.test(lower)) return exact("SHOW_SUPPRESSED", ["Open suppressed prospects."], { tab: "Prospects", funnelFilter: "suppressed_do_not_contact" });
  if (/latest failed test|latest test/.test(lower)) return exact("SHOW_LATEST_TEST_RESULT", ["Open latest safe test results."], { tab: "Operator Test Center" });
  if (/open autonomous/.test(lower)) return exact("OPEN_AUTONOMOUS_GROWTH", ["Open Autonomous Growth."], { tab: "Autonomous Growth" });
  if (/open test center/.test(lower)) return exact("OPEN_TEST_CENTER", ["Open Operator Test Center."], { tab: "Operator Test Center" });
  if (/provider smoke/.test(lower)) return exact("RUN_PROVIDER_SMOKE_TEST", ["Run the existing Provider Smoke Test.", "Persist a secret-safe receipt."]);
  if (/full readiness|readiness test/.test(lower)) return exact("RUN_FULL_READINESS_TEST", ["Run the existing Full Autonomous Readiness Test.", "Persist a command receipt."]);
  if (/smart backfill/.test(lower)) return exact("RUN_SMART_BACKFILL_DRY_RUN", ["Run Smart Backfill dry run."]);
  if (/market scout/.test(lower)) return exact("RUN_MARKET_SCOUT_DRY_RUN", ["Run Market Scout dry run."]);
  if (/smart autonomous|what autonomous growth would do next/.test(lower)) return exact("RUN_SMART_AUTONOMOUS_DRY_RUN", ["Run Smart Autonomous dry run."]);
  if (/fake.*package|test package/.test(lower)) return exact("GENERATE_FAKE_TEST_PACKAGE", ["Generate a fake package for testing only."]);
  if (/internal notification/.test(lower)) return exact("SEND_INTERNAL_NOTIFICATION_TEST", ["Send internal notification test only."]);
  if (/internal resend|test email through resend/.test(lower)) return exact("SEND_INTERNAL_RESEND_TEST", ["Send internal Resend test only."]);
  if (/next recommended/.test(lower)) return exact("EXPLAIN_NEXT_RECOMMENDED_ACTION", ["Explain the next recommended action."]);
  if (/pause all outreach/.test(lower)) return exact("PAUSE_ALL_OUTREACH", ["Turn on the Autonomous Growth kill switch.", "Switch mode to Off."]);
  const dailyEmail = /(?:set\s+)?(?:auto email pilot\s+to\s+)?(\d+)\s+email(?:s)?\s+per\s+day/.exec(lower);
  if (dailyEmail) {
    const preview = exact("SET_DAILY_EMAIL_CAP", [`Preview daily email cap change to ${dailyEmail[1]}.`]);
    preview.parsedParameters.DAILY_EMAIL_CAP = Number(dailyEmail[1]);
    preview.copyPlan = previewText(preview);
    return preview;
  }
  const openMatch = /^open\s+(.+)$/i.exec(text);
  if (openMatch) {
    const preview = exact("OPEN_PROSPECT", [`Find and open prospect matching "${safeOperatorText(openMatch[1])}".`], { tab: "Prospects", query: openMatch[1].trim() });
    preview.parsedParameters.query = openMatch[1].trim();
    preview.copyPlan = previewText(preview);
    return preview;
  }
  const preview = basePreview(text, "UNKNOWN", 1);
  preview.validationErrors.push("I could not safely match this to a supported command. Use Search mode or open Command Help for examples.");
  preview.copyPlan = previewText(preview);
  return preview;
}

async function enrichPreviewCommand(preview: OperatorCommandPreview) {
  if (!isOperatorCommandType(preview.commandType) || !previewCommandSet.has(preview.commandType)) return preview;
  if (preview.commandType === "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS" || preview.commandType === "LIST_PREVIEWS_NEEDING_REGENERATION") {
    const force = Boolean(preview.parsedParameters.FORCE);
    const prospects = await listProspects().catch(() => []);
    const summary = previewCommandSummary(prospects, force);
    const needsRegeneration = summary.rows.filter((row) => row.needsRegeneration);
    preview.parsedParameters.ELIGIBLE_COUNT = summary.eligible.length;
    preview.parsedParameters.ALREADY_CURRENT_COUNT = summary.alreadyCurrent.length;
    preview.parsedParameters.EXCLUDED_COUNT = summary.excluded.length;
    preview.plannedActions.push(
      `${summary.eligible.length} eligible preview(s) need regeneration.`,
      `${summary.alreadyCurrent.length} eligible preview(s) already use ${PREVIEW_GENERATOR_VERSION}.`,
      `${summary.excluded.length} record(s) excluded from mutation.`
    );
    if (preview.commandType === "LIST_PREVIEWS_NEEDING_REGENERATION") {
      preview.plannedActions.push(`Need regeneration: ${needsRegeneration.slice(0, 10).map((row) => row.prospect.businessName).join(", ") || "none"}.`);
    }
    preview.safetyImpact.push("Bulk preview commands do not send outreach and do not rewrite contact, suppression, bounce, complaint, or sent history.");
    preview.copyPlan = previewText(preview);
    return preview;
  }

  const matches = await findPreviewCommandMatches(preview);
  if (matches.length === 0) {
    preview.validationErrors.push("No matching prospect was found. Use BUSINESS_NAME or PROSPECT_ID.");
  } else if (matches.length > 1) {
    preview.validationErrors.push(`Ambiguous prospect match. Choices: ${matches.slice(0, 8).map((prospect) => `${prospect.businessName} (${prospect.id})`).join(", ")}.`);
  } else {
    const [prospect] = matches;
    preview.parsedParameters.PROSPECT_ID = prospect.id;
    preview.parsedParameters.BUSINESS_NAME = prospect.businessName;
    preview.navigation = { tab: "Prospects", query: prospect.businessName, prospectId: prospect.id };
    preview.plannedActions.push(`Matched business: ${prospect.businessName}.`);
    preview.plannedActions.push(`Current generator: ${prospect.preview?.previewVersion ?? "none"}. New generator: ${PREVIEW_GENERATOR_VERSION}.`);
    preview.plannedActions.push("Public preview token will be retained by saving the same prospect record.");
    if (preview.commandType === "SHOW_PREVIEW_QA") {
      const quality = prospect.preview?.qualityScore;
      preview.plannedActions.push(`QA status: ${quality?.status ?? "Not scored"}. Overall: ${quality?.overall ?? "N/A"}.`);
      if (quality?.notes?.length) preview.plannedActions.push(`Warnings: ${quality.notes.slice(0, 5).join("; ")}`);
    }
  }
  preview.safetyImpact.push("Preview actions do not send email, DMs, forms, calls, Looms, or prospect SMS.");
  preview.copyPlan = previewText(preview);
  return preview;
}

export async function previewOperatorCommand(commandText: string, forcedMode?: "search" | "command") {
  return enrichPreviewCommand(parseOperatorCommand(commandText, forcedMode));
}

function copyForReceipt(receipt: Omit<OperatorCommandReceipt, "copyForChatGPT" | "technicalSummary">) {
  return safeOperatorText([
    "WebWorkshop Command Result",
    `Command: ${receipt.commandType}`,
    `Status: ${receipt.status}`,
    `Timestamp: ${receipt.completedAt ?? receipt.createdAt}`,
    receipt.whatChanged.length ? `Changed:\n- ${receipt.whatChanged.join("\n- ")}` : "Changed:\n- Nothing changed",
    receipt.whatDidNotChange.length ? `Unchanged:\n- ${receipt.whatDidNotChange.join("\n- ")}` : "",
    "Outreach:",
    `- Emails sent: ${receipt.outreachSent.emails}`,
    `- DMs sent: ${receipt.outreachSent.dms}`,
    `- Forms submitted: ${receipt.outreachSent.forms}`,
    `- Calls placed: ${receipt.outreachSent.calls}`,
    `- Looms sent: ${receipt.outreachSent.looms}`,
    receipt.safeErrorMessage ? `Safe error: ${receipt.safeErrorMessage}` : "",
    `Next: ${receipt.nextRecommendedAction}`,
  ].filter(Boolean).join("\n"));
}

function makeReceipt(input: Omit<OperatorCommandReceipt, "id" | "createdAt" | "copyForChatGPT" | "technicalSummary" | "outreachSent" | "messagesSent"> & { createdAt?: string; outreachSent?: OperatorCommandReceipt["outreachSent"]; messagesSent?: number }): OperatorCommandReceipt {
  const base = {
    id: crypto.randomUUID(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    outreachSent: input.outreachSent ?? noOutreach,
    messagesSent: input.messagesSent ?? 0,
    ...input,
  };
  return {
    ...base,
    copyForChatGPT: copyForReceipt(base),
    technicalSummary: safeOperatorText(JSON.stringify({
      commandType: base.commandType,
      status: base.status,
      recordsAffected: base.recordsAffected,
      testsTriggered: base.testsTriggered,
      relatedPage: base.relatedPage,
      safeErrorCategory: base.safeErrorCategory,
    }, null, 2)),
  };
}

function receiptFromEvent(event: AuditEventView): OperatorCommandReceipt | null {
  if (event.action !== commandAction || !event.metadata || typeof event.metadata !== "object") return null;
  const receipt = event.metadata as unknown as OperatorCommandReceipt;
  if (!receipt.commandText || !receipt.commandType || !receipt.status) return null;
  return receipt;
}

export async function recordOperatorCommandReceipt(receipt: OperatorCommandReceipt) {
  await safeRecordAudit({
    action: commandAction,
    outcome: ["failed", "blocked", "cancelled"].includes(receipt.status) ? "rejected" : "success",
    subject: receipt.commandType,
    metadata: safeJson(receipt) as Prisma.InputJsonObject,
  });
}

export async function listOperatorCommandReceipts(limit = 50) {
  const events = await listAuditEvents(Math.min(100, Math.max(1, limit)));
  return events.map(receiptFromEvent).filter((receipt): receipt is OperatorCommandReceipt => Boolean(receipt)).slice(0, limit);
}

async function runProviderSmokeTestCommand() {
  const startedAt = new Date().toISOString();
  const result = await discoverContractorsWithDiagnostics({
    city: "Tampa",
    state: "FL",
    trade: "Pressure Washing",
    radiusKm: 10,
    limit: 5,
    prospectType: "all",
    skipThrottle: true,
  });
  const persisted = buildProviderSmokeTestRecord({
    startedAt,
    completedAt: new Date().toISOString(),
    diagnostics: result.diagnostics,
    sampleCount: result.leads.length,
    createdOutreachPackages: false,
    sentOutreach: false,
  });
  await recordOperatorSafeTestResult(persisted);
  return persisted;
}

async function explainSendingBlock() {
  const dashboard = await getAutonomousGrowthDashboard();
  const reasons = [
    dashboard.settings.killSwitch ? "Global kill switch is on." : "",
    dashboard.env.emailKillSwitchEnabled ? "OUTREACH_EMAIL_DISABLED=true blocks prospect email sending." : "",
    !dashboard.env.autoSendEnabled ? "OUTREACH_AUTO_SEND_ENABLED is not enabled." : "",
    !dashboard.env.fullAutoSendEnabled ? "OUTREACH_FULL_AUTO_SEND_ENABLED is not enabled for full-auto batches." : "",
    dashboard.settings.mode !== "auto_email_pilot" ? "Autonomous Growth mode is not Auto Email Pilot." : "",
    !dashboard.env.hasPostalAddress ? "Sender postal address is missing." : "",
  ].filter(Boolean);
  return reasons.length ? reasons : ["No obvious email safety block found, but suppression, cooldown, queue status, and approval gates still apply."];
}

function settingsPatchFromPreview(preview: OperatorCommandPreview): Partial<AutonomousGrowthSettings> {
  if (preview.commandType === "PAUSE_ALL_OUTREACH" || preview.commandType === "ENABLE_GLOBAL_KILL_SWITCH") return { killSwitch: true, mode: "off" };
  if (preview.commandType === "DISABLE_GLOBAL_KILL_SWITCH") return { killSwitch: false };
  if (preview.commandType === "ENABLE_FOLLOW_UPS") return { followUpsEnabled: true };
  if (preview.commandType === "DISABLE_FOLLOW_UPS") return { followUpsEnabled: false };
  if (preview.commandType === "SET_DAILY_EMAIL_CAP") return { maxEmailsSentPerDay: Number(preview.parsedParameters.DAILY_EMAIL_CAP ?? 1) };
  if (preview.commandType === "SET_DAILY_QUEUE_CAP") return { maxEmailsQueuedPerDay: Number(preview.parsedParameters.DAILY_QUEUE_CAP ?? 1) };
  if (preview.commandType === "SET_DAILY_SCAN_CAP") return { maxProspectsScannedPerDay: Number(preview.parsedParameters.DAILY_SCAN_CAP ?? 25) };
  if (preview.commandType === "SET_DAILY_PREVIEW_CAP") return { maxPreviewsGeneratedPerDay: Number(preview.parsedParameters.DAILY_PREVIEW_CAP ?? 10) };
  if (preview.commandType === "SET_COOLDOWN_MINUTES") return { emailCooldownMinutes: Number(preview.parsedParameters.COOLDOWN_MINUTES ?? 7) };
  if (preview.commandType === "SET_AUTONOMOUS_MODE") {
    const mode = String(preview.parsedParameters.MODE ?? preview.parsedParameters.AUTONOMOUS_MODE ?? "off");
    return { mode: autonomousGrowthModes.includes(mode as AutonomousGrowthMode) ? mode as AutonomousGrowthMode : "off" };
  }
  if (preview.commandType === "CONFIGURE_AUTO_EMAIL_PILOT") {
    return {
      mode: "auto_email_pilot",
      maxEmailsSentPerDay: Number(preview.parsedParameters.DAILY_EMAIL_CAP ?? 1),
      maxEmailsQueuedPerDay: Number(preview.parsedParameters.DAILY_QUEUE_CAP ?? 1),
      followUpsEnabled: Boolean(preview.parsedParameters.FOLLOW_UPS ?? false),
    };
  }
  return {};
}

export async function executeOperatorCommand(commandText: string, options: { mode?: "search" | "command"; confirmed?: boolean } = {}) {
  const preview = await previewOperatorCommand(commandText, options.mode);
  if (preview.validationErrors.length) {
    const receipt = makeReceipt({
      commandText: preview.commandText,
      commandType: preview.commandType,
      status: "blocked",
      plannedActions: preview.plannedActions,
      whatChanged: [],
      whatDidNotChange: ["No settings changed.", "No outreach was sent."],
      recordsAffected: 0,
      testsTriggered: [],
      safeErrorMessage: preview.validationErrors.join(" "),
      safeErrorCategory: "validation_error",
      nextRecommendedAction: "Use Command Help or choose Search mode.",
    });
    await recordOperatorCommandReceipt(receipt);
    return { preview, receipt };
  }
  if (preview.confirmationRequired && !options.confirmed) {
    const receipt = makeReceipt({
      commandText: preview.commandText,
      commandType: preview.commandType,
      status: "awaiting_confirmation",
      plannedActions: preview.plannedActions,
      whatChanged: [],
      whatDidNotChange: ["Awaiting operator confirmation.", "No outreach was sent."],
      recordsAffected: 0,
      testsTriggered: [],
      nextRecommendedAction: "Review the plan, then Confirm and Apply or Cancel.",
      relatedPage: preview.navigation?.tab,
    });
    await recordOperatorCommandReceipt(receipt);
    return { preview, receipt };
  }

  try {
    if (preview.commandType === "SEARCH") {
      const receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: "SEARCH",
        status: "completed",
        plannedActions: preview.plannedActions,
        whatChanged: [`Search filter applied: ${preview.commandText}`],
        whatDidNotChange: ["No prospect data changed.", "No outreach was sent."],
        recordsAffected: 0,
        testsTriggered: [],
        nextRecommendedAction: "Review the filtered prospect list.",
        relatedPage: "Prospects",
      });
      await recordOperatorCommandReceipt(receipt);
      return { preview, receipt };
    }
    if (preview.confirmationLevel === 1 && preview.navigation) {
      let prospectIds: string[] = [];
      if (preview.commandType === "OPEN_PROSPECT" && preview.parsedParameters.query) {
        const prospects = await listProspects().catch(() => []);
        const query = String(preview.parsedParameters.query).toLowerCase();
        const match = prospects.find((prospect) => prospect.businessName.toLowerCase().includes(query));
        if (match) {
          preview.navigation.prospectId = match.id;
          preview.navigation.query = match.businessName;
          prospectIds = [match.id];
        }
      }
      const receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "completed",
        plannedActions: preview.plannedActions,
        whatChanged: [`Opened ${preview.navigation.tab ?? "requested view"}.`],
        whatDidNotChange: ["No settings changed.", "No outreach was sent."],
        recordsAffected: prospectIds.length,
        testsTriggered: [],
        nextRecommendedAction: "Review the requested list or prospect.",
        relatedPage: preview.navigation.tab,
        relatedProspectIds: prospectIds,
      });
      await recordOperatorCommandReceipt(receipt);
      return { preview, receipt };
    }

    let receipt: OperatorCommandReceipt;
    if (preview.commandType === "RUN_PROVIDER_SMOKE_TEST") {
      const test = await runProviderSmokeTestCommand();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: test.outcome === "failed" ? "failed" : test.outcome === "partial" ? "partially_completed" : "completed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Provider Smoke Test result persisted."],
        whatDidNotChange: ["No outreach packages were created.", "No outreach was sent."],
        recordsAffected: test.usableSampleCount ?? 0,
        testsTriggered: ["Provider Smoke Test"],
        nextRecommendedAction: test.outcome === "success" || test.outcome === "partial" ? "Run a small Top Prospects test." : "Open Test Center and review provider setup.",
        relatedPage: "Operator Test Center",
        relatedTestResultId: test.completedAt,
        safeErrorMessage: test.safeErrorMessage,
      });
    } else if (preview.commandType === "RUN_FULL_READINESS_TEST") {
      const result = await runFullAutonomousReadinessTest();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "partially_completed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Full Autonomous Readiness Test result persisted."],
        whatDidNotChange: ["No outreach was sent.", "No settings changed."],
        recordsAffected: 0,
        testsTriggered: ["Full Autonomous Readiness Test"],
        nextRecommendedAction: result.readiness?.nextSafestAction ?? "Review Test Center readiness result.",
        relatedPage: "Operator Test Center",
        relatedTestResultId: result.readiness?.generatedAt,
      });
    } else if (preview.commandType === "RUN_EMAIL_SAFETY_CHECK" || preview.commandType === "EXPLAIN_SENDING_BLOCK") {
      const reasons = await explainSendingBlock();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "completed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Explained current sending blocks."],
        whatDidNotChange: reasons,
        recordsAffected: 0,
        testsTriggered: ["Email Safety Check"],
        nextRecommendedAction: "Keep manual review gates on unless you are intentionally configuring Auto Email Pilot.",
        relatedPage: "Operator Test Center",
      });
    } else if (preview.commandType === "RUN_SMART_BACKFILL_DRY_RUN") {
      const result = await runOperatorSmartBackfillTest();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "failed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Smart Backfill dry run completed."],
        whatDidNotChange: ["No outreach was sent."],
        recordsAffected: result.smartGrowth?.smartGrowth.existingQualifiedUnsent.total ?? 0,
        testsTriggered: ["Smart Backfill Dry Run"],
        nextRecommendedAction: result.smartGrowth?.summary.nextBestAction ?? "Review Smart Growth.",
        relatedPage: "Autonomous Growth",
      });
    } else if (preview.commandType === "RUN_MARKET_SCOUT_DRY_RUN") {
      const result = await runOperatorMarketScoutDryRun();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "failed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Market Scout dry run completed."],
        whatDidNotChange: ["No provider calls or outreach sends were performed beyond the existing safe dry-run behavior."],
        recordsAffected: result.smartGrowth?.smartGrowth.marketScout.results.length ?? 0,
        testsTriggered: ["Market Scout Dry Run"],
        nextRecommendedAction: result.smartGrowth?.summary.nextBestAction ?? "Review Market Scout.",
        relatedPage: "Autonomous Growth",
      });
    } else if (preview.commandType === "RUN_SMART_AUTONOMOUS_DRY_RUN" || preview.commandType === "EXPLAIN_NEXT_RECOMMENDED_ACTION") {
      const result = await runOperatorSmartAutonomousDryRun();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "failed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Smart Autonomous dry run completed."],
        whatDidNotChange: ["No outreach was sent."],
        recordsAffected: result.smartGrowth?.smartGrowth.existingQualifiedUnsent.total ?? 0,
        testsTriggered: ["Smart Autonomous Dry Run"],
        nextRecommendedAction: result.smartGrowth?.summary.nextBestAction ?? "Review Autonomous Growth recommendation.",
        relatedPage: "Autonomous Growth",
      });
    } else if (preview.commandType === "GENERATE_FAKE_TEST_PACKAGE") {
      const result = generateOneTestOutreachPackage();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "failed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Generated a fake operator test package."],
        whatDidNotChange: ["No real prospect was contacted.", "No outreach was sent."],
        recordsAffected: 0,
        testsTriggered: ["Fake Test Package"],
        nextRecommendedAction: "Review generated copy in Test Center.",
        relatedPage: "Operator Test Center",
      });
    } else if (preview.commandType === "SEND_INTERNAL_NOTIFICATION_TEST" || preview.commandType === "SEND_INTERNAL_RESEND_TEST") {
      const result = await sendOperatorTestNotification(preview.commandType === "SEND_INTERNAL_NOTIFICATION_TEST" ? "notification" : "manual_email");
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "failed",
        plannedActions: preview.plannedActions,
        whatChanged: [result.message],
        whatDidNotChange: ["No prospect email was sent.", "No SMS to prospects, DMs, forms, calls, or Looms were sent."],
        recordsAffected: 0,
        testsTriggered: [preview.commandType === "SEND_INTERNAL_NOTIFICATION_TEST" ? "Internal Notification Test" : "Internal Resend Test"],
        messagesSent: result.ok ? 1 : 0,
        nextRecommendedAction: "Review Latest Safe Test Results.",
        relatedPage: "Operator Test Center",
      });
    } else if (preview.commandType === "SHOW_EXISTING_QUALIFIED_PROSPECTS" || preview.commandType === "SHOW_ELIGIBLE_EMAIL_QUEUE") {
      const dashboard = await getAutonomousGrowthDashboard();
      const count = preview.commandType === "SHOW_ELIGIBLE_EMAIL_QUEUE" ? dashboard.queue.filter((item) => item.status === "Queued" && item.contactSource === "Public email").length : dashboard.smartGrowth.existingQualifiedUnsent.total;
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "completed",
        plannedActions: preview.plannedActions,
        whatChanged: [`Loaded ${count} matching item(s).`],
        whatDidNotChange: ["No queue statuses changed.", "No outreach was sent."],
        recordsAffected: count,
        testsTriggered: [],
        nextRecommendedAction: "Open Autonomous Growth and review the queue.",
        relatedPage: "Autonomous Growth",
      });
    } else if (preview.commandType === "PROCESS_EXISTING_QUALIFIED_PROSPECTS") {
      const result = await processExistingQualifiedProspects({ dryRun: false });
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.ok ? "completed" : "failed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Existing qualified prospects were processed into manual review queues."],
        whatDidNotChange: ["No outreach was sent."],
        recordsAffected: result.summary?.existingUnsentProspectsFound ?? 0,
        testsTriggered: [],
        nextRecommendedAction: result.summary?.nextBestAction ?? "Review Autonomous Growth queues.",
        relatedPage: "Autonomous Growth",
      });
    } else if (preview.commandType === "PREVIEW_LEGACY_OUTREACH_BACKFILL") {
      const result = await previewLegacyOutreachBackfill();
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "completed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Legacy outreach backfill preview completed."],
        whatDidNotChange: ["No Prospect drafts changed.", "No queue packages changed.", "No outreach was sent."],
        recordsAffected: result.updated.prospectDrafts + result.updated.queuePackages + result.updated.newReviewPackagesCreated,
        testsTriggered: ["Legacy Outreach Backfill Preview"],
        nextRecommendedAction: "Review the preview counts, then run APPLY_LEGACY_OUTREACH_BACKFILL with confirmation if it looks right.",
        relatedPage: "Command Activity",
      });
      receipt.copyForChatGPT = result.copyForChatGPT;
    } else if (preview.commandType === "APPLY_LEGACY_OUTREACH_BACKFILL") {
      const result = await applyLegacyOutreachBackfill({ confirmed: true });
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result.status === "completed" ? "completed" : "blocked",
        plannedActions: preview.plannedActions,
        whatChanged: result.status === "completed"
          ? [`Updated ${result.updated.prospectDrafts} Prospect draft(s).`, `Updated ${result.updated.queuePackages} queue package(s).`, `Created ${result.updated.newReviewPackagesCreated} review-only package(s).`]
          : [],
        whatDidNotChange: ["No sent/contacted/suppressed records were rewritten.", "No outreach was sent."],
        recordsAffected: result.updated.prospectDrafts + result.updated.queuePackages + result.updated.newReviewPackagesCreated,
        testsTriggered: ["Legacy Outreach Backfill Apply"],
        nextRecommendedAction: "Open Prospects or Autonomous Growth and review refreshed drafts.",
        relatedPage: "Command Activity",
      });
      receipt.copyForChatGPT = result.copyForChatGPT;
    } else if (preview.commandType === "REGENERATE_PROSPECT_OUTREACH") {
      const prospectId = String(preview.parsedParameters.PROSPECT_ID ?? "");
      const result = await regenerateProspectOutreachWithCurrentScript(prospectId, { previewOnly: String(preview.parsedParameters.ACTION ?? "").toLowerCase() === "preview_only" });
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: result ? "completed" : "blocked",
        plannedActions: preview.plannedActions,
        whatChanged: result ? [String(preview.parsedParameters.ACTION ?? "").toLowerCase() === "preview_only" ? "Previewed current Prospect draft regeneration." : "Regenerated Prospect outreach with current script."] : [],
        whatDidNotChange: ["Approval was not preserved for regenerated copy.", "No outreach was sent."],
        recordsAffected: result ? 1 : 0,
        testsTriggered: [],
        nextRecommendedAction: result ? "Review the Prospect Outreach tab." : "Check the Prospect ID and try again.",
        relatedPage: "Prospects",
        relatedProspectIds: prospectId ? [prospectId] : [],
      });
    } else if (preview.commandType === "CREATE_AUTONOMOUS_REVIEW_PACKAGE") {
      const prospectId = String(preview.parsedParameters.PROSPECT_ID ?? "");
      const previewOnly = String(preview.parsedParameters.ACTION ?? "").toLowerCase() === "preview_only";
      const item = previewOnly ? null : await createOrRefreshAutonomousReviewPackageForProspect(prospectId);
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: previewOnly || item ? "completed" : "blocked",
        plannedActions: preview.plannedActions,
        whatChanged: previewOnly ? ["Previewed review-only package creation."] : item ? [`Created/refreshed review-only package ${item.id}.`] : [],
        whatDidNotChange: ["No package was sent.", "No queue item was moved directly to sent outreach."],
        recordsAffected: previewOnly || item ? 1 : 0,
        testsTriggered: [],
        nextRecommendedAction: "Open Autonomous Growth and review the package.",
        relatedPage: "Autonomous Growth",
        relatedProspectIds: prospectId ? [prospectId] : [],
      });
    } else if (preview.commandType === "REGENERATE_PROSPECT_PREVIEW") {
      const prospectId = String(preview.parsedParameters.PROSPECT_ID ?? "");
      const prospects = await listProspects();
      const prospect = prospects.find((item) => item.id === prospectId);
      if (!prospect) {
        receipt = makeReceipt({
          commandText: preview.commandText,
          commandType: preview.commandType,
          status: "blocked",
          plannedActions: preview.plannedActions,
          whatChanged: [],
          whatDidNotChange: ["No preview changed.", "No outreach was sent."],
          recordsAffected: 0,
          testsTriggered: [],
          safeErrorMessage: "Matched prospect could not be loaded.",
          safeErrorCategory: "prospect_not_found",
          nextRecommendedAction: "Open Prospects and choose a specific record.",
          relatedPage: "Prospects",
        });
      } else {
        const blockReason = previewRegenerationBlockReason(prospect);
        if (blockReason) {
          receipt = makeReceipt({
            commandText: preview.commandText,
            commandType: preview.commandType,
            status: "blocked",
            plannedActions: preview.plannedActions,
            whatChanged: [],
            whatDidNotChange: [`Preview regeneration blocked: ${blockReason}.`, "No preview changed.", "No outreach was sent."],
            recordsAffected: 0,
            testsTriggered: [],
            safeErrorMessage: `Preview regeneration blocked: ${blockReason}.`,
            safeErrorCategory: "preview_regeneration_blocked",
            nextRecommendedAction: "Choose an unsent, uncontacted, non-suppressed prospect.",
            relatedPage: "Prospects",
            relatedProspectIds: [prospect.id],
          });
        } else {
          const preparedPreview = await prepareProspectForPreview(prospect, { mode: "regenerate", feedback: previewSafeFeedback(preview.parsedParameters.FEEDBACK) });
          const saved = await saveProspect(preparedPreview.prospect);
          const queueItem = await createOrRefreshAutonomousReviewPackageForProspect(saved.id);
          receipt = makeReceipt({
            commandText: preview.commandText,
            commandType: preview.commandType,
            status: "completed",
            confirmedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            plannedActions: preview.plannedActions,
            whatChanged: [
              `Preview regenerated for ${saved.businessName}.`,
              `Generator: ${PREVIEW_GENERATOR_VERSION}.`,
              `QA score: ${saved.preview?.qualityScore?.overall ?? "N/A"}.`,
              `QA status: ${saved.preview?.qualityScore?.status ?? "Not scored"}.`,
              queueItem ? `Linked unsent review package refreshed: ${queueItem.id}.` : "No eligible linked review package was refreshed.",
            ],
            whatDidNotChange: ["Public preview record identity was retained.", "No outreach was sent.", "Contact/suppression/sent history was not rewritten."],
            recordsAffected: 1,
            testsTriggered: [],
            nextRecommendedAction: "Open the Prospect Preview tab and inspect the public preview.",
            relatedPage: "Prospects",
            relatedProspectIds: [saved.id],
          });
        }
      }
    } else if (preview.commandType === "REGENERATE_ELIGIBLE_UNSENT_PREVIEWS") {
      const force = Boolean(preview.parsedParameters.FORCE);
      const prospects = await listProspects();
      const summary = previewCommandSummary(prospects, force);
      const regenerated: string[] = [];
      const failed: string[] = [];
      for (const row of summary.eligible) {
        try {
          const preparedPreview = await prepareProspectForPreview(row.prospect, { mode: "regenerate" });
          const saved = await saveProspect(preparedPreview.prospect);
          regenerated.push(saved.businessName);
        } catch (error) {
          failed.push(`${row.prospect.businessName}: ${safeOperatorText(error instanceof Error ? error.message : "safe failure")}`);
        }
      }
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: failed.length ? "partially_completed" : "completed",
        confirmedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        plannedActions: preview.plannedActions,
        whatChanged: regenerated.length ? [`Regenerated ${regenerated.length} eligible unsent preview(s): ${regenerated.join(", ")}.`] : ["No previews needed regeneration."],
        whatDidNotChange: [
          `${summary.alreadyCurrent.length} eligible preview(s) were already current.`,
          `${summary.excluded.length} record(s) were excluded from mutation.`,
          "No outreach was sent.",
          "Suppression/contact/sent history was unchanged.",
          ...(failed.length ? [`Failures: ${failed.join("; ")}`] : []),
        ],
        recordsAffected: regenerated.length,
        testsTriggered: [],
        safeErrorMessage: failed.length ? failed.join("; ") : undefined,
        safeErrorCategory: failed.length ? "partial_preview_regeneration_failure" : undefined,
        nextRecommendedAction: regenerated.length ? "Review the regenerated public previews before using them in outreach." : "Run Show previews that need regeneration to inspect remaining records.",
        relatedPage: "Command Activity",
        relatedProspectIds: summary.eligible.map((row) => row.prospect.id),
      });
    } else if (preview.commandType === "LIST_PREVIEWS_NEEDING_REGENERATION" || preview.commandType === "SHOW_PREVIEW_QA") {
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "completed",
        plannedActions: preview.plannedActions,
        whatChanged: ["Displayed preview diagnostics only."],
        whatDidNotChange: ["No preview changed.", "No outreach was sent.", "No records were mutated."],
        recordsAffected: 0,
        testsTriggered: [],
        nextRecommendedAction: preview.commandType === "SHOW_PREVIEW_QA" ? "Open the Prospect Preview tab for the full QA report." : "Regenerate eligible previews only after reviewing exclusions.",
        relatedPage: preview.navigation?.tab ?? "Command Activity",
        relatedProspectIds: typeof preview.parsedParameters.PROSPECT_ID === "string" ? [preview.parsedParameters.PROSPECT_ID] : [],
      });
    } else if (preview.confirmationLevel === 2) {
      const patch = settingsPatchFromPreview(preview);
      await updateAutonomousGrowthSettings(patch);
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "completed",
        confirmedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        plannedActions: preview.plannedActions,
        whatChanged: Object.entries(patch).map(([key, value]) => `${key}: ${String(value)}`),
        whatDidNotChange: ["OUTREACH_FULL_AUTO_SEND_ENABLED remained unchanged.", "No prospect email, DM, form, phone call, or Loom was sent."],
        recordsAffected: 1,
        testsTriggered: [],
        nextRecommendedAction: "Run Full Autonomous Readiness Test.",
        relatedPage: "Autonomous Growth",
      });
    } else {
      receipt = makeReceipt({
        commandText: preview.commandText,
        commandType: preview.commandType,
        status: "blocked",
        plannedActions: preview.plannedActions,
        whatChanged: [],
        whatDidNotChange: ["No settings changed.", "No outreach was sent."],
        recordsAffected: 0,
        testsTriggered: [],
        safeErrorMessage: "This command is recognized but not executable from the global command bar yet.",
        safeErrorCategory: "unsupported_execution",
        nextRecommendedAction: "Use the dedicated page for this action.",
      });
    }
    await recordOperatorCommandReceipt(receipt);
    return { preview, receipt };
  } catch (error) {
    const receipt = makeReceipt({
      commandText: preview.commandText,
      commandType: preview.commandType,
      status: "failed",
      plannedActions: preview.plannedActions,
      whatChanged: [],
      whatDidNotChange: ["No outreach was sent."],
      recordsAffected: 0,
      testsTriggered: [],
      safeErrorMessage: safeOperatorText(error instanceof Error ? error.message : "Command failed safely."),
      safeErrorCategory: "unexpected_exception",
      nextRecommendedAction: "Open Command Activity and review the safe error.",
    });
    await recordOperatorCommandReceipt(receipt);
    return { preview, receipt };
  }
}
