import { Prisma } from "@prisma/client";
import {
  getAutonomousGrowthDashboard,
  getAutonomousGrowthSettings,
  outreachQueueItemHasPersistedApproval,
  updateAutonomousGrowthSettings,
} from "@/lib/autonomous-growth-repository";
import {
  currentOutreachCopyVersion,
  evaluateQueuedEmailSendReadiness,
  outreachEnvironment,
  outreachHistoryTextIndicatesProtectedContact,
  prospectFacingEmailBodySafe,
  providerConfigured,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthSettings,
  type OutreachQueueItem,
} from "@/lib/autonomous-growth";
import {
  outreachDraftLooksCurrent,
  prospectEmailNeedsManualVerification,
  prospectVerifiedEmailEvidence,
  prospectWebsiteAbsenceNeedsManualReview,
  prospectWebsiteVerificationBlockReason,
  type Prospect,
} from "@/lib/prospect-engine";
import { databaseHealth, listAuditEvents, safeRecordAudit, type AuditEventView } from "@/lib/operational-controls";
import {
  runEmailSafetyGatesCheck,
  runFullAutonomousReadinessTest,
  type EmailSafetyGatesResult,
  type OperatorActionResult,
} from "@/lib/operator-test-center";
import { latestOperatorSafeTestResults, type OperatorSafeTestRecord } from "@/lib/operator-test-history";
import { getProspectDatabase, listProspectsWithDiagnostics, type ProspectListResult } from "@/lib/prospect-repository";
import {
  likelyFranchise,
  likelyNationalOrLargeBrand,
  likelySupplierOrDistributor,
  websiteBusinessMismatch,
} from "@/lib/top-prospects";
import { WEBSITE_VERIFICATION_EVIDENCE_MIGRATION_ID } from "@/lib/top-prospect-schema";

export const controlledPilotConfirmation = "ENABLE CONTROLLED PILOT";

export type ControlledLaunchStatus = "READY FOR CONTROLLED PILOT" | "BLOCKED — ACTION REQUIRED";

export type ControlledLaunchCheck = {
  key: string;
  category: "Production" | "Provider" | "Sending safety" | "Prospect eligibility" | "Email content";
  label: string;
  passed: boolean;
  required: boolean;
  detail: string;
};

export type ControlledLaunchEmailPreview = {
  queueItemId: string;
  prospectId: string;
  prospect: string;
  recipient: string;
  sourceUrl: string;
  extractionMethod: string;
  subject: string;
  body: string;
  copyVersion: string;
  generatedAt: string;
  approvalState: "approved" | "not approved";
  eligibilityReason: string;
};

export type ControlledOutreachLaunchReadiness = {
  status: ControlledLaunchStatus;
  generatedAt: string;
  productionUrl: string;
  deploymentCommit: string;
  deploymentProject: string;
  checks: ControlledLaunchCheck[];
  failedChecks: ControlledLaunchCheck[];
  emailPreview: ControlledLaunchEmailPreview | null;
  activationEnabled: boolean;
  activationConfirmation: typeof controlledPilotConfirmation;
  settingsThatWillChange: string[];
  settingsThatRemainDisabled: string[];
  rollbackInstructions: string;
  outreachSent: {
    emails: 0;
    dms: 0;
    forms: 0;
    calls: 0;
    sms: 0;
    looms: 0;
    previews: 0;
  };
};

export type ControlledPilotActivationResult = {
  activated: boolean;
  message: string;
  readiness: ControlledOutreachLaunchReadiness;
  changedSettings: string[];
  unchangedSafetySettings: string[];
  outreachSent: 0;
};

export type ProspectEmailEmergencyStopResult = {
  disabled: true;
  sendsInProgress: number;
  message: string;
  settingsChanged: string[];
  recordsPreserved: true;
  outreachSent: 0;
};

export type ControlledPilotPostSendReport = {
  status: "PILOT SEND VERIFIED" | "PILOT SEND REQUIRES REVIEW";
  generatedAt: string;
  activationAuditId: string;
  approvingOperator: string;
  sentToday: number;
  queueItemId: string;
  prospectId: string;
  recipient: string;
  subject: string;
  approvedBody: string;
  copyVersion: string;
  providerMessageId: string;
  providerSuccessAuditCount: number;
  dailyCapExhausted: boolean;
  noSecondProspectSent: boolean;
  fullAutonomousSendingDisabled: boolean;
  emergencyStopAvailable: true;
  issues: string[];
};

type MigrationStatus = {
  schemaCompatible: boolean;
  migrationApplied: boolean;
  detail: string;
};

type ControlledLaunchDashboard = AutonomousGrowthDashboard & {
  autopilot?: unknown;
};

export type ControlledLaunchDependencies = {
  getDashboard: () => Promise<ControlledLaunchDashboard>;
  getSettings: () => Promise<AutonomousGrowthSettings>;
  updateSettings: (input: Partial<AutonomousGrowthSettings>) => Promise<AutonomousGrowthSettings>;
  getProspects: () => Promise<ProspectListResult>;
  getDatabaseHealth: () => Promise<Awaited<ReturnType<typeof databaseHealth>>>;
  getLatestSafeTests: () => Promise<Partial<Record<"provider_smoke" | "internal_notification" | "internal_resend" | "full_readiness", OperatorSafeTestRecord>>>;
  getPersistedApproval: (item: OutreachQueueItem) => Promise<boolean>;
  runFullReadiness: (environment: NodeJS.ProcessEnv) => Promise<OperatorActionResult>;
  runEmailSafety: (environment: NodeJS.ProcessEnv) => Promise<EmailSafetyGatesResult>;
  getMigrationStatus: () => Promise<MigrationStatus>;
  getAuditEvents: (limit?: number) => Promise<AuditEventView[]>;
  recordAudit: typeof safeRecordAudit;
};

const defaultDependencies: ControlledLaunchDependencies = {
  getDashboard: getAutonomousGrowthDashboard,
  getSettings: getAutonomousGrowthSettings,
  updateSettings: updateAutonomousGrowthSettings,
  getProspects: listProspectsWithDiagnostics,
  getDatabaseHealth: databaseHealth,
  getLatestSafeTests: latestOperatorSafeTestResults,
  getPersistedApproval: outreachQueueItemHasPersistedApproval,
  runFullReadiness: runFullAutonomousReadinessTest,
  runEmailSafety: runEmailSafetyGatesCheck,
  getMigrationStatus: productionWebsiteVerificationMigrationStatus,
  getAuditEvents: listAuditEvents,
  recordAudit: safeRecordAudit,
};

const protectedProspectStatuses = new Set<Prospect["status"]>([
  "Contacted",
  "Interested",
  "Proposal Sent",
  "Closed Won",
  "Closed Lost",
]);

const protectedQueueStatuses = new Set([
  "Sending",
  "Sent",
  "Follow-up Sent",
  "Replied",
  "Positive Reply",
  "Won",
  "Lost",
  "No Response",
  "Not Interested",
  "Opted Out",
  "Bounced",
  "Complained",
  "Suppressed",
  "Never Contact",
  "Bad Fit",
  "Blocked",
]);

function safeMetadata(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function addCheck(
  checks: ControlledLaunchCheck[],
  check: Omit<ControlledLaunchCheck, "required"> & { required?: boolean },
) {
  checks.push({ ...check, required: check.required ?? true });
}

function cleanUrl(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function productionUrl(environment: NodeJS.ProcessEnv) {
  return cleanUrl(
    environment.NEXT_PUBLIC_APP_URL
      || environment.NEXT_PUBLIC_SITE_URL
      || environment.VERCEL_PROJECT_PRODUCTION_URL
      || environment.VERCEL_URL,
  );
}

function safeTestFresh(record: OperatorSafeTestRecord | undefined, now: Date) {
  const completedAt = Date.parse(record?.completedAt ?? "");
  return Number.isFinite(completedAt) && now.getTime() - completedAt <= 24 * 60 * 60 * 1000;
}

function queueItemProtected(item: OutreachQueueItem) {
  return protectedQueueStatuses.has(item.status)
    || Boolean(item.sentDate)
    || Boolean(item.replyStatus)
    || outreachHistoryTextIndicatesProtectedContact(`${item.blockedReason}\n${item.notes}`);
}

function candidateIssues(
  prospect: Prospect,
  item: OutreachQueueItem,
  queue: OutreachQueueItem[],
  settings: AutonomousGrowthSettings,
  environment: NodeJS.ProcessEnv,
) {
  const emailEvidence = prospectVerifiedEmailEvidence(prospect);
  const websiteBlock = prospectWebsiteVerificationBlockReason(prospect, { requireStructuredEvidence: true });
  const hypotheticalSettings: AutonomousGrowthSettings = {
    ...settings,
    mode: "auto_email_pilot",
    killSwitch: false,
    maxEmailsQueuedPerDay: 1,
    maxEmailsSentPerDay: 1,
    followUpsEnabled: false,
  };
  const hypotheticalItem: OutreachQueueItem = { ...item, status: "Queued" };
  const queueForReadiness = queue.map((candidate) => candidate.id === item.id ? hypotheticalItem : candidate);
  const sendReadiness = evaluateQueuedEmailSendReadiness({
    emailSendsToday: 0,
    environment,
    item: hypotheticalItem,
    queue: queueForReadiness,
    settings: hypotheticalSettings,
  });
  const duplicateProspect = queue.some((other) => (
    other.id !== item.id
    && other.prospectId === item.prospectId
    && !queueItemProtected(other)
  ));
  const duplicateRecipient = queue.some((other) => (
    other.id !== item.id
    && other.email.trim().toLowerCase() === item.email.trim().toLowerCase()
    && !queueItemProtected(other)
  ));
  const historyText = [
    ...prospect.notes,
    ...prospect.activities.map((activity) => activity.label),
  ].join("\n");
  return [
    !["Eligible", "Needs Review", "Queued"].includes(item.status) ? `Queue status ${item.status} is not a controlled-pilot review status.` : "",
    queueItemProtected(item) ? "The package has protected contact, suppression, terminal, or ambiguous-outcome history." : "",
    protectedProspectStatuses.has(prospect.status) ? `Prospect status ${prospect.status} is already contacted or closed.` : "",
    outreachHistoryTextIndicatesProtectedContact(historyText) ? "Prospect activity or notes show protected prior contact or suppression." : "",
    websiteBlock,
    prospectWebsiteAbsenceNeedsManualReview(prospect) ? "Website absence or availability remains unverified." : "",
    prospect.fitDisposition === "confirmed_usable_not_fit" ? "The verified usable website is marked not a fit." : "",
    !["genuine_redesign_opportunity", "weak_redesign_opportunity"].includes(prospect.fitDisposition)
      && prospect.websiteVerification?.status === "usable"
      ? "A usable website is not a confirmed redesign opportunity or still requires manual fit review."
      : "",
    likelyNationalOrLargeBrand(prospect) ? "National or large-brand prospects are blocked." : "",
    likelyFranchise(prospect) ? "Franchise-like prospects require manual review." : "",
    likelySupplierOrDistributor(prospect) ? "Supplier or distributor prospects are blocked." : "",
    websiteBusinessMismatch(prospect) ? "Website and business identity appear mismatched." : "",
    !prospect.businessName.trim() ? "Confirmed business identity is missing." : "",
    prospect.contactPersonName.trim() ? "A person name is stored without dedicated verification provenance." : "",
    !prospect.email.trim() ? "Public business email is missing." : "",
    prospectEmailNeedsManualVerification(prospect) ? "Public email is suspicious or needs manual verification." : "",
    !emailEvidence ? "Public email lacks exact source URL, extraction method, and confidence evidence." : "",
    emailEvidence && !emailEvidence.sourceUrl ? "Public email source URL is missing." : "",
    emailEvidence && !["high", "medium"].includes(emailEvidence.confidence) ? "Public email confidence is too low." : "",
    item.contactSource !== "Public email" ? "Queue contact source is not Public email." : "",
    item.email.trim().toLowerCase() !== prospect.email.trim().toLowerCase() ? "Queue recipient does not match the verified prospect email." : "",
    duplicateProspect ? "Another active queue item exists for this prospect." : "",
    duplicateRecipient ? "Another active queue item exists for this recipient." : "",
    item.outreachCopyVersion !== currentOutreachCopyVersion ? "Outreach copy version is outdated." : "",
    !outreachDraftLooksCurrent({
      concise: item.emailBody,
      detailed: item.emailBody,
      followUps: [],
      outreachCopyVersion: item.outreachCopyVersion,
    }, environment) ? "The exact first-touch draft does not match the current permission-first standard." : "",
    ...prospectFacingEmailBodySafe(item, environment),
    !item.eligibilityReason.trim() ? "A written business-fit reason is missing." : "",
    ...sendReadiness.blockedReasons.filter((reason) => !/Only Queued email items/i.test(reason)),
  ].filter(Boolean);
}

async function findControlledCandidate(
  prospects: Prospect[],
  queue: OutreachQueueItem[],
  settings: AutonomousGrowthSettings,
  environment: NodeJS.ProcessEnv,
  dependencies: ControlledLaunchDependencies,
) {
  const prospectsById = new Map(prospects.map((prospect) => [prospect.id, prospect]));
  const inspected: Array<{
    item: OutreachQueueItem;
    prospect: Prospect;
    issues: string[];
    approved: boolean;
  }> = [];
  for (const item of queue) {
    const prospect = prospectsById.get(item.prospectId);
    if (!prospect) continue;
    const approved = await dependencies.getPersistedApproval(item);
    const issues = candidateIssues(prospect, item, queue, settings, environment);
    if (item.status === "Queued") {
      issues.push(approved
        ? "An existing queued approval must be revoked before controlled-pilot activation; choose and approve the first prospect after activation."
        : "Queued item is missing persisted operator approval.");
    }
    if (item.status !== "Queued" && approved) issues.push("A stale approval exists outside Queued status.");
    inspected.push({ item, prospect, issues: [...new Set(issues)], approved });
  }
  return {
    eligible: inspected.find((candidate) => (
      candidate.item.status !== "Queued"
      && !candidate.approved
      && candidate.issues.length === 0
    )) ?? null,
    inspected,
    approvedQueuedCount: inspected.filter((candidate) => candidate.item.status === "Queued" && candidate.approved).length,
  };
}

export async function productionWebsiteVerificationMigrationStatus(): Promise<MigrationStatus> {
  if (!process.env.DATABASE_URL?.trim()) {
    return {
      schemaCompatible: process.env.NODE_ENV !== "production",
      migrationApplied: false,
      detail: process.env.NODE_ENV === "production"
        ? "DATABASE_URL is missing, so schema compatibility cannot be verified."
        : "Development memory mode does not apply PostgreSQL migrations.",
    };
  }
  try {
    const database = getProspectDatabase();
    const columns = await database.$queryRaw<Array<{ column_name: string }>>(Prisma.sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Prospect'
        AND column_name IN ('contactEvidence', 'websiteVerification', 'fitDisposition')
    `);
    const migrations = await database.$queryRaw<Array<{ migration_name: string }>>(Prisma.sql`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE migration_name = ${WEBSITE_VERIFICATION_EVIDENCE_MIGRATION_ID}
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
      LIMIT 1
    `);
    const schemaCompatible = new Set(columns.map((column) => column.column_name)).size === 3;
    const migrationApplied = migrations.length === 1;
    return {
      schemaCompatible,
      migrationApplied,
      detail: schemaCompatible && migrationApplied
        ? "Website-verification evidence columns and migration record are present."
        : "Website-verification evidence schema or migration record is incomplete.",
    };
  } catch {
    return {
      schemaCompatible: false,
      migrationApplied: false,
      detail: "Website-verification schema compatibility could not be confirmed.",
    };
  }
}

export async function runControlledOutreachLaunchReadiness(input: {
  environment?: NodeJS.ProcessEnv;
  dependencies?: Partial<ControlledLaunchDependencies>;
  now?: Date;
} = {}): Promise<ControlledOutreachLaunchReadiness> {
  const environment = input.environment ?? process.env;
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const now = input.now ?? new Date();
  const checks: ControlledLaunchCheck[] = [];
  const [
    fullReadinessResult,
    emailSafety,
    database,
    dashboardResult,
    prospectsResult,
    settingsResult,
    safeTests,
    migration,
  ] = await Promise.all([
    dependencies.runFullReadiness(environment).catch(() => null),
    dependencies.runEmailSafety(environment).catch(() => null),
    dependencies.getDatabaseHealth().catch(() => ({ configured: true, reachable: false, message: "Database health check failed safely." })),
    dependencies.getDashboard().catch(() => null),
    dependencies.getProspects().catch(() => null),
    dependencies.getSettings().catch(() => null),
    dependencies.getLatestSafeTests().catch(
      (): Partial<Record<"provider_smoke" | "internal_notification" | "internal_resend" | "full_readiness", OperatorSafeTestRecord>> => ({}),
    ),
    dependencies.getMigrationStatus().catch(() => ({ schemaCompatible: false, migrationApplied: false, detail: "Migration check failed safely." })),
  ]);
  const env = outreachEnvironment(environment);
  const url = productionUrl(environment);
  const deploymentCommit = environment.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  const deploymentProject = environment.VERCEL_PROJECT_ID?.trim()
    || environment.VERCEL_PROJECT_PRODUCTION_URL?.trim()
    || environment.VERCEL_URL?.trim()
    || "";
  const dashboard = dashboardResult;
  const prospects = prospectsResult?.prospects ?? [];
  const settings = settingsResult;
  const queue = dashboard?.queue ?? [];
  const candidateResult = settings
    ? await findControlledCandidate(prospects, queue, settings, environment, dependencies)
    : { eligible: null, inspected: [], approvedQueuedCount: 0 };
  const candidate = candidateResult.eligible;
  const emailEvidence = candidate ? prospectVerifiedEmailEvidence(candidate.prospect) : null;
  const internalResend = safeTests.internal_resend;
  const internalNotification = safeTests.internal_notification;
  const providerTestReady = internalResend?.outcome === "success"
    && Boolean(internalResend.providerMessageId)
    && safeTestFresh(internalResend, now);
  const internalNotificationReady = internalNotification?.outcome === "success"
    && safeTestFresh(internalNotification, now);
  const productionEnvironment = environment.VERCEL_ENV === "production";
  const mergedMain = environment.VERCEL_GIT_COMMIT_REF === "main" && Boolean(deploymentCommit);
  const databaseReady = database.reachable === true;
  const queueReadable = Boolean(dashboard && Array.isArray(dashboard.queue));
  const prospectsReadable = Boolean(prospectsResult && Array.isArray(prospectsResult.prospects));
  const effectiveCap = settings ? Math.min(settings.maxEmailsSentPerDay, env.dailyCap) : 0;

  addCheck(checks, { key: "production-deployment", category: "Production", label: "Active deployment is production", passed: productionEnvironment, detail: productionEnvironment ? "VERCEL_ENV identifies the active runtime as production." : "The active runtime is not a production deployment." });
  addCheck(checks, { key: "merged-main", category: "Production", label: "Deployment matches merged main", passed: mergedMain, detail: mergedMain ? `Main commit ${deploymentCommit.slice(0, 12)} is active.` : "A production main commit could not be confirmed." });
  addCheck(checks, { key: "production-url", category: "Production", label: "Production URL identified", passed: Boolean(url), detail: url ? `Active URL: ${url}` : "No safe public application URL is configured." });
  addCheck(checks, { key: "project-identity", category: "Production", label: "Vercel project identity recorded", passed: Boolean(deploymentProject), detail: deploymentProject ? `Current runtime project: ${deploymentProject}. Duplicate Vercel projects are not treated as interchangeable; compare their main-branch commit before activation.` : "Vercel project identity is unavailable." });
  addCheck(checks, { key: "duplicate-project-explanation", category: "Production", label: "Duplicate project status explained", passed: true, required: false, detail: "Readiness identifies only the active runtime. A second Vercel project must independently report the same merged main commit; this check never changes project settings." });
  addCheck(checks, { key: "database", category: "Production", label: "Database connection succeeds", passed: databaseReady, detail: database.message });
  addCheck(checks, { key: "prospects-readable", category: "Production", label: "Prospect records are readable", passed: prospectsReadable, detail: prospectsReadable ? `${prospects.length} valid prospect record(s) loaded.` : "Prospect records could not be read." });
  addCheck(checks, { key: "queue-readable", category: "Production", label: "Outreach queue is readable", passed: queueReadable, detail: queueReadable ? `${queue.length} queue record(s) loaded.` : "Outreach queue could not be read." });
  addCheck(checks, { key: "malformed-safe", category: "Production", label: "Malformed records are omitted safely and counted", passed: Boolean(prospectsResult), detail: prospectsResult ? `${prospectsResult.diagnostics.malformedRecordsOmitted} malformed record(s) omitted without breaking the list.` : "Malformed-record diagnostics are unavailable." });
  addCheck(checks, { key: "schema-compatible", category: "Production", label: "Prisma schema is compatible", passed: migration.schemaCompatible, detail: migration.detail });
  addCheck(checks, { key: "migration-applied", category: "Production", label: "Required migration is applied", passed: migration.migrationApplied, detail: migration.detail });
  addCheck(checks, { key: "health-primitives", category: "Production", label: "Production health primitives pass", passed: databaseReady && queueReadable && prospectsReadable, detail: databaseReady && queueReadable && prospectsReadable ? "The same database, queue, and prospect reads used by the health endpoint succeeded." : "One or more production health reads failed." });
  addCheck(checks, { key: "existing-readiness", category: "Production", label: "Full Autonomous Readiness has no eligible record failures", passed: Boolean(fullReadinessResult?.readiness) && (fullReadinessResult?.readiness?.failedRecords.length ?? 1) === 0, detail: fullReadinessResult?.readiness ? `${fullReadinessResult.readiness.failedRecords.length} eligible failed record(s).` : "Full Autonomous Readiness did not complete." });
  addCheck(checks, { key: "email-safety", category: "Sending safety", label: "Email Safety Gates pass", passed: emailSafety?.status === "Passed", detail: emailSafety?.summary ?? "Email Safety Gates did not complete." });

  addCheck(checks, { key: "provider-configured", category: "Provider", label: "Resend provider and sender configuration are present", passed: providerConfigured(environment), detail: providerConfigured(environment) ? "Provider, key, From, Reply-To, and postal address are configured." : "Provider, key, From, Reply-To, or postal address is missing." });
  addCheck(checks, { key: "operator-test", category: "Provider", label: "Operator-owned Resend test passed", passed: providerTestReady, detail: providerTestReady ? `A fresh internal-only test recorded provider message ID ${internalResend?.providerMessageId?.slice(0, 8)}….` : "Run a fresh internal Resend test to the configured operator-owned address." });
  addCheck(checks, { key: "internal-notification", category: "Provider", label: "Internal notification test passed", passed: internalNotificationReady, detail: internalNotificationReady ? "A fresh internal notification test passed." : "Run a fresh internal notification test." });
  addCheck(checks, { key: "provider-reachable", category: "Provider", label: "Provider API accepted an internal-only test", passed: providerTestReady, detail: providerTestReady ? "Resend authenticated and accepted an operator-owned test; no prospect was contacted." : "Provider authentication/reachability is not proven by a fresh internal-only test." });

  addCheck(checks, { key: "full-auto-disabled", category: "Sending safety", label: "Full autonomous email remains disabled", passed: !env.fullAutoSendEnabled, detail: env.fullAutoSendEnabled ? "OUTREACH_FULL_AUTO_SEND_ENABLED must be false." : "OUTREACH_FULL_AUTO_SEND_ENABLED is false." });
  addCheck(checks, { key: "daily-cap", category: "Sending safety", label: "Effective daily cap is exactly 1", passed: env.dailyCap === 1 && effectiveCap === 1, detail: `Environment cap ${env.dailyCap}; effective cap ${effectiveCap}. Activation will persist a settings cap of 1.` });
  addCheck(checks, { key: "pilot-env", category: "Sending safety", label: "Dedicated Auto Email Pilot gates are enabled", passed: !env.autopilotDisabled && !env.emailKillSwitchEnabled && env.autoSendEnabled, detail: `AUTOPILOT_DISABLED=${env.autopilotDisabled}; OUTREACH_EMAIL_DISABLED=${env.emailKillSwitchEnabled}; OUTREACH_AUTO_SEND_ENABLED=${env.autoSendEnabled}.` });
  addCheck(checks, { key: "manual-approval", category: "Sending safety", label: "Manual approval remains required", passed: true, detail: "Only a Queued item with persisted operator approval can enter the atomic send claim." });
  addCheck(checks, { key: "atomic-send", category: "Sending safety", label: "Duplicate and transaction protections remain active", passed: true, detail: "The existing sender retains atomic Queued-to-Sending claims, recipient/domain/global database rate limits, stable provider idempotency, and ambiguous-outcome blocking." });
  addCheck(checks, { key: "suppression", category: "Sending safety", label: "Suppression and prior-contact protections remain active", passed: true, detail: "Opt-out, bounce, complaint, suppression, previous contact, duplicate recipient, and duplicate business-domain checks remain mandatory." });
  addCheck(checks, { key: "other-channels", category: "Sending safety", label: "Other outreach channels remain manual or disabled", passed: true, detail: "No forms, DMs, calls, prospect SMS, Looms, follow-ups, or previews are automated by controlled-pilot activation." });
  addCheck(checks, { key: "provider-failure", category: "Sending safety", label: "Provider failure preserves safe state", passed: true, detail: "Confirmed rejection returns the item to review; ambiguous outcomes become blocked and require reconciliation; neither marks Contacted." });
  addCheck(checks, {
    key: "no-preapproved-queue",
    category: "Sending safety",
    label: "No prospect is pre-approved before activation",
    passed: candidateResult.approvedQueuedCount === 0,
    detail: candidateResult.approvedQueuedCount
      ? `${candidateResult.approvedQueuedCount} queued approval(s) must be revoked before activation.`
      : "The operator must choose and approve the first prospect after controlled activation.",
  });
  addCheck(checks, { key: "candidate", category: "Prospect eligibility", label: "At least one fully verified prospect is ready for manual selection", passed: Boolean(candidate), detail: candidate ? `${candidate.prospect.businessName} has verified website/email evidence and current permission-first copy.` : `${candidateResult.inspected.length} prospect/package pair(s) inspected; none passed every controlled-pilot gate.` });
  addCheck(checks, { key: "candidate-issues", category: "Prospect eligibility", label: "No eligibility issue remains on the selected candidate", passed: Boolean(candidate), detail: candidate ? "Business identity, website state, email source, fit, duplication, history, and copy checks passed." : candidateResult.inspected.slice(0, 3).map((item) => `${item.prospect.businessName}: ${item.issues.join(" ")}`).join(" | ") || "No candidate record is available." });
  addCheck(checks, { key: "exact-email", category: "Email content", label: "Exact first-touch email passes the current standard", passed: Boolean(candidate), detail: candidate ? "The exact subject/body is shown below and remains unapproved until the operator acts." : "No exact eligible email can be displayed." });

  const failedChecks = checks.filter((check) => check.required && !check.passed);
  const status: ControlledLaunchStatus = failedChecks.length
    ? "BLOCKED — ACTION REQUIRED"
    : "READY FOR CONTROLLED PILOT";
  const readiness: ControlledOutreachLaunchReadiness = {
    status,
    generatedAt: now.toISOString(),
    productionUrl: url,
    deploymentCommit,
    deploymentProject,
    checks,
    failedChecks,
    emailPreview: candidate && emailEvidence ? {
      queueItemId: candidate.item.id,
      prospectId: candidate.prospect.id,
      prospect: candidate.prospect.businessName,
      recipient: candidate.item.email,
      sourceUrl: emailEvidence.sourceUrl,
      extractionMethod: emailEvidence.extractionMethod,
      subject: candidate.item.subjectLine,
      body: candidate.item.emailBody,
      copyVersion: candidate.item.outreachCopyVersion,
      generatedAt: candidate.item.outreachCopyGeneratedAt || candidate.item.updatedAt,
      approvalState: candidate.approved ? "approved" : "not approved",
      eligibilityReason: candidate.item.eligibilityReason,
    } : null,
    activationEnabled: failedChecks.length === 0,
    activationConfirmation: controlledPilotConfirmation,
    settingsThatWillChange: [
      "Autonomous Growth mode: Auto Email Pilot",
      "Database kill switch: Off",
      "Queued email cap: 1",
      "Sent email cap: 1",
      "Follow-ups: Disabled",
    ],
    settingsThatRemainDisabled: [
      "Full autonomous email",
      "Automatic DMs",
      "Automatic forms",
      "Automatic calls",
      "Prospect SMS",
      "Automatic Looms",
      "Automatic preview generation before interest",
    ],
    rollbackInstructions: "Use Disable All Prospect Email Sending. It turns the database kill switch on and mode off without deleting history.",
    outreachSent: { emails: 0, dms: 0, forms: 0, calls: 0, sms: 0, looms: 0, previews: 0 },
  };
  await dependencies.recordAudit({
    action: "controlled_outreach_launch_readiness",
    outcome: status === "READY FOR CONTROLLED PILOT" ? "success" : "rejected",
    subject: "controlled-email-pilot",
    metadata: safeMetadata({
      status,
      failedCheckKeys: failedChecks.map((check) => check.key),
      candidateProspectId: readiness.emailPreview?.prospectId ?? "",
      candidateQueueItemId: readiness.emailPreview?.queueItemId ?? "",
      outreachSent: readiness.outreachSent,
    }),
  });
  return readiness;
}

export async function enableControlledEmailPilot(input: {
  confirmation: string;
  environment?: NodeJS.ProcessEnv;
  dependencies?: Partial<ControlledLaunchDependencies>;
}) {
  const environment = input.environment ?? process.env;
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const readiness = await runControlledOutreachLaunchReadiness({ environment, dependencies });
  if (input.confirmation !== controlledPilotConfirmation) {
    return {
      activated: false,
      message: `Type exactly ${controlledPilotConfirmation} before activation.`,
      readiness,
      changedSettings: [],
      unchangedSafetySettings: readiness.settingsThatRemainDisabled,
      outreachSent: 0,
    } satisfies ControlledPilotActivationResult;
  }
  if (!readiness.activationEnabled) {
    return {
      activated: false,
      message: "Controlled Email Pilot remains blocked until every required readiness check passes.",
      readiness,
      changedSettings: [],
      unchangedSafetySettings: readiness.settingsThatRemainDisabled,
      outreachSent: 0,
    } satisfies ControlledPilotActivationResult;
  }
  const env = outreachEnvironment(environment);
  if (env.fullAutoSendEnabled || env.dailyCap !== 1) {
    return {
      activated: false,
      message: "Activation refused because full auto is enabled or the environment daily cap is not exactly 1.",
      readiness,
      changedSettings: [],
      unchangedSafetySettings: readiness.settingsThatRemainDisabled,
      outreachSent: 0,
    } satisfies ControlledPilotActivationResult;
  }
  await dependencies.updateSettings({
    mode: "auto_email_pilot",
    killSwitch: false,
    maxEmailsQueuedPerDay: 1,
    maxEmailsSentPerDay: 1,
    followUpsEnabled: false,
  });
  await dependencies.recordAudit({
    action: "controlled_email_pilot_activation",
    outcome: "success",
    subject: "authenticated-engine-operator",
    metadata: safeMetadata({
      confirmationMatched: true,
      changedSettings: readiness.settingsThatWillChange,
      fullAutoRemainedDisabled: true,
      outreachSent: 0,
    }),
  });
  return {
    activated: true,
    message: "Controlled Email Pilot is enabled for one manually approved first-touch email. Nothing was sent by activation.",
    readiness,
    changedSettings: readiness.settingsThatWillChange,
    unchangedSafetySettings: readiness.settingsThatRemainDisabled,
    outreachSent: 0,
  } satisfies ControlledPilotActivationResult;
}

export async function disableAllProspectEmailSending(input: {
  dependencies?: Partial<ControlledLaunchDependencies>;
} = {}): Promise<ProspectEmailEmergencyStopResult> {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const dashboard = await dependencies.getDashboard().catch(() => null);
  const sendsInProgress = dashboard?.queue.filter((item) => item.status === "Sending").length ?? 0;
  await dependencies.updateSettings({ mode: "off", killSwitch: true, followUpsEnabled: false });
  await dependencies.recordAudit({
    action: "disable_all_prospect_email_sending",
    outcome: "success",
    subject: "authenticated-engine-operator",
    metadata: safeMetadata({ sendsInProgress, recordsPreserved: true, outreachSent: 0 }),
  });
  return {
    disabled: true,
    sendsInProgress,
    message: sendsInProgress
      ? `New prospect sends are blocked. ${sendsInProgress} in-progress request(s) require provider reconciliation.`
      : "All new prospect email sending is blocked. No send was in progress.",
    settingsChanged: ["Autonomous Growth mode: Off", "Database kill switch: On", "Follow-ups: Disabled"],
    recordsPreserved: true,
    outreachSent: 0,
  };
}

function businessDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function validateControlledPilotSend(input: {
  environment?: NodeJS.ProcessEnv;
  dependencies?: Partial<ControlledLaunchDependencies>;
  now?: Date;
} = {}): Promise<ControlledPilotPostSendReport> {
  const environment = input.environment ?? process.env;
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const now = input.now ?? new Date();
  const [dashboard, auditEvents] = await Promise.all([
    dependencies.getDashboard(),
    dependencies.getAuditEvents(100),
  ]);
  const today = businessDateKey(now);
  const sentToday = dashboard.queue.filter((item) => (
    item.status === "Sent"
    && item.sentDate
    && businessDateKey(item.sentDate) === today
  ));
  const sent = sentToday[0] ?? null;
  const sentAt = Date.parse(sent?.sentDate ?? "");
  const activationAudits = Number.isFinite(sentAt)
    ? auditEvents.filter((event) => (
        event.action === "controlled_email_pilot_activation"
        && event.outcome === "success"
        && Date.parse(event.createdAt) <= sentAt
      )).sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    : [];
  const activation = activationAudits[0] ?? null;
  const activationAt = Date.parse(activation?.createdAt ?? "");
  const approvalAudits = sent && Number.isFinite(activationAt)
    ? auditEvents.filter((event) => (
        event.action === "autonomous_email_approval"
        && event.outcome === "success"
        && String(event.metadata?.queueItemId ?? "") === sent.id
        && Date.parse(event.createdAt) >= activationAt
        && Date.parse(event.createdAt) <= sentAt
      ))
    : [];
  const approval = approvalAudits
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
  const approvalAt = Date.parse(approval?.createdAt ?? "");
  const successAudits = sent && Number.isFinite(approvalAt)
    ? auditEvents.filter((event) => (
        event.action === "autonomous_email_send"
        && event.outcome === "success"
        && String(event.metadata?.queueItemId ?? "") === sent.id
        && Date.parse(event.createdAt) >= approvalAt
        && Date.parse(event.createdAt) <= now.getTime()
      ))
    : [];
  const approvingOperator = String(approval?.metadata?.approvedBy ?? "");
  const providerMessageId = sent?.notes.match(/Resend message ID:\s*([^\s]+)/i)?.[1]
    ?? String(successAudits[0]?.metadata?.providerMessageId ?? "");
  const settings = dashboard.settings;
  const env = outreachEnvironment(environment);
  const issues = [
    sentToday.length !== 1 ? `Expected exactly one prospect email today; found ${sentToday.length}.` : "",
    !sent ? "No controlled-pilot sent item is available." : "",
    sent && !activation ? "No successful controlled-pilot activation precedes this send." : "",
    sent && activation && approvalAudits.length !== 1
      ? `Expected one post-activation approval for this queue item; found ${approvalAudits.length}.`
      : "",
    sent && approval && !approvingOperator ? "The approving operator was not recorded." : "",
    sent && !providerMessageId ? "Provider message ID is missing." : "",
    sent && successAudits.length !== 1 ? `Expected one provider-success audit; found ${successAudits.length}.` : "",
    sent && !sent.email ? "Exact recipient is missing." : "",
    sent && !sent.subjectLine ? "Exact subject is missing." : "",
    sent && !sent.emailBody ? "Exact approved body is missing." : "",
    sent && sent.outreachCopyVersion !== currentOutreachCopyVersion ? "Sent copy version is not current." : "",
    Math.min(settings.maxEmailsSentPerDay, env.dailyCap) !== 1 ? "Effective daily cap is not 1." : "",
    env.fullAutoSendEnabled ? "Full autonomous email is enabled." : "",
    settings.followUpsEnabled ? "Automatic follow-ups are enabled." : "",
  ].filter(Boolean);
  const report: ControlledPilotPostSendReport = {
    status: issues.length ? "PILOT SEND REQUIRES REVIEW" : "PILOT SEND VERIFIED",
    generatedAt: now.toISOString(),
    activationAuditId: activation?.id ?? "",
    approvingOperator,
    sentToday: sentToday.length,
    queueItemId: sent?.id ?? "",
    prospectId: sent?.prospectId ?? "",
    recipient: sent?.email ?? "",
    subject: sent?.subjectLine ?? "",
    approvedBody: sent?.emailBody ?? "",
    copyVersion: sent?.outreachCopyVersion ?? "",
    providerMessageId,
    providerSuccessAuditCount: successAudits.length,
    dailyCapExhausted: sentToday.length >= 1,
    noSecondProspectSent: sentToday.length === 1,
    fullAutonomousSendingDisabled: !env.fullAutoSendEnabled,
    emergencyStopAvailable: true,
    issues,
  };
  await dependencies.recordAudit({
    action: "controlled_pilot_post_send_validation",
    outcome: report.status === "PILOT SEND VERIFIED" ? "success" : "rejected",
    subject: sent?.id || "controlled-email-pilot",
    metadata: safeMetadata({
      status: report.status,
      sentToday: report.sentToday,
      queueItemId: report.queueItemId,
      activationAuditId: report.activationAuditId,
      approvingOperator: report.approvingOperator,
      providerSuccessAuditCount: report.providerSuccessAuditCount,
      issues: report.issues,
    }),
  });
  return report;
}
