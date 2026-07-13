import {
  internalNotificationConfiguredLabel,
  internalNotificationEnvironment,
  sendInternalOperatorNotification,
  sendInternalOperatorSms,
  type InternalNotificationResult,
  type InternalSmsResult,
} from "@/lib/internal-notifications";
import { discoveryProviderCoverageStatus, discoveryProviderHealth } from "@/lib/lead-discovery";
import { databaseHealth, operationalMode } from "@/lib/operational-controls";
import { createProspect, generateOutreach, seedProspects, withAnalysis } from "@/lib/prospect-engine";
import {
  getAutonomousGrowthDashboard,
  getAutonomousGrowthSettings,
  processExistingQualifiedProspects,
  regenerateUnsentOutreachCopy,
  runMarketScoutDryRunForDashboard,
  runSmartAutonomousDryRun,
  type OutreachCopyRegenerationSummary,
  type SmartGrowthActionResult,
} from "@/lib/autonomous-growth-repository";
import { casualDmPlaybook, currentOutreachCopyVersion, evaluateQueuedEmailSendReadiness, outreachCopyRegenerationEligibility, outreachEnvironment, providerConfigured } from "@/lib/autonomous-growth";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { webworkshopOptOutPattern } from "@/lib/outreach-style-guide";
import { listTopProspectJobs } from "@/lib/top-prospect-repository";
import { publicProspectPreviewLink } from "@/lib/top-prospects";
import { topProspectBuildVersion } from "@/lib/top-prospect-list-route";
import {
  formatOperatorSafeTestRecord,
  isProviderSmokeRecordFresh,
  latestOperatorSafeTestResults,
  maskEmailAddress,
  providerSmokeHasUsableApprovedProvider,
  recordOperatorSafeTestResult,
  type OperatorSafeTestRecord,
} from "@/lib/operator-test-history";

export type OperatorStatusCard = {
  label: string;
  status: "configured" | "missing" | "blocked" | "disabled" | "ready" | "warning";
  value: string;
  detail: string;
};

export type OperatorTestCenterPayload = {
  statusCards: OperatorStatusCard[];
  nextRecommendedTest: string;
  summaries: {
    fullStatus: string;
    emailSafety: string;
    providerDiagnostics: string;
    latestTopProspectsRun: string;
    latestOutreachPackage: string;
    smsNotifications: string;
    regenerationSummary: string;
    smartRecommendation: string;
    nextDebug: string;
  };
  latest: {
    topProspectsRun: string;
    outreachPackage: string;
    internalNotificationTest: string;
    manualEmailTest: string;
    smsTest: string;
  };
  latestLinks: {
    topProspectsRunJobId: string;
    outreachPackageProspectId: string;
    outreachPackageResultId: string;
    latestQueueItemId: string;
  };
  latestSafeTestResults: {
    providerSmokeTest: string;
    internalNotificationTest: string;
    internalResendTest: string;
    fullReadinessTest: string;
  };
  providerCoverage: ReturnType<typeof discoveryProviderCoverageStatus>;
  providerHealth: ReturnType<typeof discoveryProviderHealth>;
  buildVersion: string;
  safeTestInput: {
    trade: string;
    city: string;
    state: string;
    radiusKm: number;
    businessesToScan: number;
    finalProspectsWanted: number;
  };
};

export type OperatorActionResult = {
  ok: boolean;
  message: string;
  notification?: InternalNotificationResult;
  sms?: InternalSmsResult;
  regeneration?: OutreachCopyRegenerationSummary;
  smartGrowth?: SmartGrowthActionResult;
  readiness?: FullAutonomousReadinessResult;
  simulation?: Next24HourSimulationResult;
  packagePreview?: {
    subject: string;
    firstEmailLinkFree: boolean;
    firstDmLinkFree: boolean;
    yesReplyIncludesPublicPreview: boolean;
    publicPreviewLink: string;
  };
  fakePackage?: {
    label: string;
    businessName: string;
    tradeCity: string;
    recommendedContactPath: string;
    copyVersion: string;
    publicPreviewLink: string;
    scripts: Array<{ label: string; body: string }>;
    safetySummary: string;
    fullSummary: string;
  };
};

export type Next24HourSimulationResult = {
  status: "dry_run_only";
  timeline: string[];
  wouldDo: string[];
  wouldRequireOperatorAction: string[];
  wouldNotDo: string[];
  blockedBySafetyGates: string[];
  counts: {
    existingProspectsCheckedFirst: number;
    emailReview: number;
    socialDmReview: number;
    contactFormReview: number;
    phoneCallQueue: number;
    manualResearch: number;
    blocked: number;
    suppressed: number;
    packagesCreated: number;
    copyRefreshed: number;
    providerCallsEstimated: number;
    emailSendsAllowedByCurrentGates: number;
  };
  summary: string;
};

export type FullAutonomousReadinessCheck = {
  key: string;
  category: string;
  label: string;
  status: "passed" | "failed" | "optional" | "info";
  detail: string;
  fix?: string;
};

export type FullAutonomousReadinessFailedRecord = {
  id: string;
  prospectId: string;
  packageId: string;
  topProspectResultId: string;
  businessName: string;
  category: string;
  reason: string;
  correction: string;
  openAction: "prospect_outreach" | "prospect_preview" | "top_prospects" | "queue_review";
};

export type FullAutonomousReadinessResult = {
  overallStatus: "Ready for safe dry runs" | "Ready for reviewed manual email test" | "Ready for Auto Email Pilot" | "Not ready for full-auto email" | "Needs setup";
  finalReadinessStatus: "READY FOR SAFE DRY RUNS" | "READY FOR ONE MANUAL EMAIL TEST" | "READY FOR AUTO EMAIL PILOT" | "BLOCKED - RECORDS NEED ATTENTION" | "NEEDS SETUP";
  nextSafestAction: string;
  dryRunManualRouting: {
    status: "Ready for safe dry runs" | "Needs attention";
    reasons: string[];
  };
  autoEmailPilot: {
    status: "Ready" | "Blocked" | "Not enabled";
    reasons: string[];
  };
  fullAutoEmail: {
    status: "Ready" | "Blocked" | "Not recommended yet";
    reasons: string[];
  };
  manualEmailTest: {
    status: "Ready" | "Blocked";
    reasons: string[];
  };
  passed: FullAutonomousReadinessCheck[];
  failed: FullAutonomousReadinessCheck[];
  failedRecords: FullAutonomousReadinessFailedRecord[];
  optional: FullAutonomousReadinessCheck[];
  notDone: string[];
  checks: FullAutonomousReadinessCheck[];
  summaries: {
    full: string;
    failedOnly: string;
    nextFix: string;
    safeToTest: string;
    debug: string;
  };
  generatedAt: string;
};

function boolStatus(value: boolean): OperatorStatusCard["status"] {
  return value ? "configured" : "missing";
}

function secretSafe(value: string) {
  return value
    .replace(/(?:sk-|rk-|pk-|AIza|ya29)[A-Za-z0-9_\-]{12,}/g, "[secret redacted]")
    .replace(/\bSG\.[A-Za-z0-9_.-]+/g, "[secret redacted]")
    .replace(/\bAC[a-f0-9]{24,}\b/gi, "[secret redacted]")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s]+/gi, "[database url redacted]")
    .replace(/\b(?:DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|GOOGLE_PLACES_API_KEY|YELP_API_KEY|ENGINE_PASSWORD)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

function providerLabel() {
  const coverage = discoveryProviderCoverageStatus();
  return `${coverage.label}. ${coverage.summary}`;
}

function summarizeLatestTopProspectsRun(latestJob: Awaited<ReturnType<typeof listTopProspectJobs>>[number] | null) {
  if (!latestJob) return "No Top Prospects run has been recorded yet.";
  const rankedCount = latestJob.results?.length ?? 0;
  const reviewableCount = latestJob.reviewableLowerPriority?.length ?? 0;
  const blockedCount = latestJob.blockedProspects?.length ?? 0;
  const nextRecommendation = latestJob.nextRunRecommendations?.[0] ?? "";
  return [
    `Job ${latestJob.id}`,
    `Status: ${latestJob.status}`,
    `Market/trade: ${latestJob.input.trade} near ${latestJob.input.city}, ${latestJob.input.state}`,
    `Discovered: ${latestJob.discoveredCount}`,
    `Scanned: ${latestJob.scannedCount}`,
    `Ranked: ${rankedCount}`,
    `Reviewable lower priority: ${reviewableCount}`,
    `Blocked: ${blockedCount}`,
    nextRecommendation ? `Next: ${nextRecommendation}` : "",
  ].filter(Boolean).join("\n");
}

function summarizeLatestOutreachPackage(queue: Awaited<ReturnType<typeof getAutonomousGrowthDashboard>>["queue"]) {
  const latest = queue[0] ?? null;
  if (!latest) return "No outreach package queue item has been recorded yet.";
  return [
    `${latest.businessName} (${latest.trade}, ${latest.city})`,
    `Status: ${latest.status}`,
    `Contact source: ${latest.contactSource}`,
    `Outreach copy version: ${latest.outreachCopyVersion || "not recorded"}`,
    `Preview quality: ${latest.previewQualityScore}`,
    `Recommended next action: ${latest.recommendedNextAction}`,
    `Public preview: ${latest.previewLink.startsWith("https://webworkshop.dev/p/") ? "Yes" : "No"}`,
  ].join("\n");
}

function summarizeRegenerationReadiness(queue: Awaited<ReturnType<typeof getAutonomousGrowthDashboard>>["queue"]) {
  const reasons = new Map<string, number>();
  let oldUnsentPackagesNeedingRegeneration = 0;
  for (const item of queue) {
    const eligibility = outreachCopyRegenerationEligibility(item);
    if (eligibility.eligible) oldUnsentPackagesNeedingRegeneration += 1;
    else reasons.set(eligibility.reason, (reasons.get(eligibility.reason) ?? 0) + 1);
  }
  const skipped = [...reasons.entries()].map(([reason, count]) => `${count} skipped because ${reason}`).join("\n");
  return [
    `Latest outreach copy version: ${currentOutreachCopyVersion}`,
    `Old unsent packages needing regeneration: ${oldUnsentPackagesNeedingRegeneration}`,
    skipped,
    "Regeneration only rewrites unsent draft copy. It sends nothing and does not change sent logs or suppression records.",
  ].filter(Boolean).join("\n");
}

function readinessFailedRecords(queue: Awaited<ReturnType<typeof getAutonomousGrowthDashboard>>["queue"], env: ReturnType<typeof outreachEnvironment>) {
  const records: FullAutonomousReadinessFailedRecord[] = [];
  const seenProspectIds = new Set<string>();
  const seenResultIds = new Set<string>();
  const add = (item: (typeof queue)[number], category: string, reason: string, correction: string, openAction: FullAutonomousReadinessFailedRecord["openAction"] = "prospect_outreach") => {
    records.push({
      id: `${item.id}:${category}:${records.length}`,
      prospectId: item.prospectId,
      packageId: item.id,
      topProspectResultId: item.topProspectResultId,
      businessName: item.businessName || "Unnamed prospect",
      category,
      reason,
      correction,
      openAction,
    });
  };

  for (const item of queue) {
    const emailBody = item.emailBody || "";
    const copy = `${item.subjectLine}\n${item.emailBody}\n${item.dmScript}\n${item.loomTalkingPoints}`;
    if (!item.businessName || !item.city || !item.trade) add(item, "Missing business context", "Business name, city, or trade is missing.", "Open the prospect and fill in the missing public business context.");
    if (item.outreachCopyVersion !== currentOutreachCopyVersion && !item.sentDate && !/sent|replied|not interested|lost|won/i.test(item.status)) add(item, "Outdated outreach copy", `Package uses ${item.outreachCopyVersion || "no recorded version"}.`, `Regenerate unsent outreach copy to ${currentOutreachCopyVersion}.`);
    if (!item.previewLink) add(item, "Missing preview", "No public preview link is stored.", "Regenerate the Outreach Package so a public /p/ preview is created.", "prospect_preview");
    if (item.previewLink && (!/\/p\//i.test(item.previewLink) || /\/engine(?:\/|$|\?)/i.test(item.previewLink))) add(item, "Invalid public preview", "Preview link is missing or points to a protected engine route.", "Regenerate the package and verify the prospect-facing link starts with /p/.", "prospect_preview");
    if (/https?:\/\/[^\s]+\/p\//i.test(emailBody)) add(item, "First-touch preview-link violation", "The first-touch email includes a public preview link.", "Regenerate the draft so the first email asks permission before sending the preview.");
    if (!webworkshopOptOutPattern().test(emailBody)) add(item, "Missing opt-out wording", "The first-touch email does not include the approved opt-out line.", "Regenerate the draft with the current WebWorkshop script.");
    if (!env.hasPostalAddress && item.contactSource === "Public email") add(item, "Missing postal address", "Postal address is not configured for email readiness.", "Add the approved sender postal address before any real email test.");
    if (/\/engine(?:\/|$|\?)/i.test(copy)) add(item, "Internal engine link", "Prospect-facing copy contains a protected /engine link.", "Regenerate the package and use only public /p/ links after permission.");
    if (/\b\d{1,3}\/100\b|website quality score|opportunity score|internal score/i.test(copy)) add(item, "Internal score language", "Prospect-facing copy includes internal score language.", "Regenerate the draft with plain-language copy.");
    if (/\bwill get you more calls|guarantee|guaranteed|losing customers|costing you leads\b/i.test(copy)) add(item, "Unsupported claim", "Copy appears to make a guaranteed or unsupported claim.", "Rewrite with softer 'help get' language.");
    if (/phone/i.test(item.blockedReason) && item.status === "Queued") add(item, "Phone-only routed to email", "A phone-only blocked lead is queued for email review.", "Move it to manual research or Calls, not email.");
    if (item.blockedReason && ["Queued", "Sent"].includes(item.status)) add(item, "Package/status conflict", "A blocked package is in a send-oriented status.", "Return it to Needs Review or Blocked before testing sends.");
    if (item.prospectId) {
      if (seenProspectIds.has(item.prospectId)) add(item, "Duplicate package", "Another queue item already uses this prospect.", "Keep one package and skip the duplicate.");
      seenProspectIds.add(item.prospectId);
    }
    if (item.topProspectResultId) {
      if (seenResultIds.has(item.topProspectResultId)) add(item, "Duplicate package", "Another queue item already uses this Top Prospects result.", "Keep one package and skip the duplicate.");
      seenResultIds.add(item.topProspectResultId);
    }
  }
  return records;
}

function nextRecommendedTest(input: {
  env: ReturnType<typeof outreachEnvironment>;
  internalConfigured: boolean;
  providerCoverage: ReturnType<typeof discoveryProviderCoverageStatus>;
  queueLength: number;
}) {
  if (!input.internalConfigured) return "Internal email notifications are missing. Add INTERNAL_NOTIFY_EMAIL and INTERNAL_NOTIFY_FROM_EMAIL before relying on operator alerts.";
  if (input.env.sendProvider === "resend" && input.env.hasResendApiKey && input.env.emailKillSwitchEnabled) {
    return "Resend is configured, but prospect email sending is still blocked. Next: send an internal test notification.";
  }
  if (input.providerCoverage.level === "limited" || input.providerCoverage.level === "broken") {
    return "Provider coverage needs attention. Next: run Provider Smoke Test before any larger run.";
  }
  if (input.queueLength > 0) return "Top Prospects generated packages. Next: review one package.";
  return "First-touch copy is link-free. Next: test yes-reply preview link with Generate One Test Outreach Package.";
}

function buildCards(input: {
  env: ReturnType<typeof outreachEnvironment>;
  internalEnv: ReturnType<typeof internalNotificationEnvironment>;
  latestJob: Awaited<ReturnType<typeof listTopProspectJobs>>[number] | null;
  latestPackage: string;
  regenerationReadiness: string;
  latestSafeTests: Partial<Record<"provider_smoke" | "internal_notification" | "internal_resend" | "full_readiness", OperatorSafeTestRecord>>;
}) {
  const prospectSending = input.env.emailKillSwitchEnabled
    ? "disabled"
    : input.env.fullAutoSendEnabled
      ? "manual-only, full-auto separately gated"
      : "manual-only, full-auto blocked";
  return [
    { label: "Email Provider", status: input.env.sendProvider ? "configured" : "missing", value: input.env.sendProvider || "missing", detail: "Prospect email provider setting." },
    { label: "Resend provider", status: boolStatus(input.env.hasResendApiKey), value: input.env.hasResendApiKey ? "configured" : "not configured", detail: "Secret presence only. No key is shown." },
    { label: "Sender email", status: boolStatus(input.env.hasFromEmail), value: input.env.hasFromEmail ? "configured" : "missing", detail: "OUTREACH_FROM_EMAIL." },
    { label: "Reply-to email", status: boolStatus(input.env.hasReplyToEmail), value: input.env.hasReplyToEmail ? "configured" : "missing", detail: "OUTREACH_REPLY_TO_EMAIL." },
    { label: "Postal address", status: boolStatus(input.env.hasPostalAddress), value: input.env.hasPostalAddress ? "configured" : "missing", detail: "Required before real email sending." },
    { label: "Prospect email sending", status: input.env.emailKillSwitchEnabled ? "disabled" : "warning", value: prospectSending, detail: "Internal tests stay separate from prospect outreach." },
    { label: "OUTREACH_EMAIL_DISABLED", status: input.env.emailKillSwitchEnabled ? "disabled" : "warning", value: String(input.env.emailKillSwitchEnabled), detail: "True blocks prospect email sends." },
    { label: "OUTREACH_AUTO_SEND_ENABLED", status: input.env.autoSendEnabled ? "warning" : "disabled", value: String(input.env.autoSendEnabled), detail: "Still requires queue gates." },
    { label: "OUTREACH_FULL_AUTO_SEND_ENABLED", status: input.env.fullAutoSendEnabled ? "warning" : "disabled", value: String(input.env.fullAutoSendEnabled), detail: "Required for full automatic email batches." },
    { label: "Internal notifications", status: input.internalEnv.configured ? "configured" : "missing", value: internalNotificationConfiguredLabel(), detail: "Uses INTERNAL_NOTIFY_EMAIL only." },
    { label: "Latest Top Prospects run", status: input.latestJob ? "ready" : "missing", value: input.latestJob?.status ?? "not recorded", detail: input.latestJob ? `${input.latestJob.input.trade} near ${input.latestJob.input.city}` : "Run a small Top Prospects test." },
    { label: "Latest outreach package", status: input.latestPackage.startsWith("No outreach") ? "missing" : "ready", value: input.latestPackage.split("\n")[0] ?? "not recorded", detail: "Latest queue item summary." },
    { label: "Latest Outreach Copy Version", status: "ready", value: currentOutreachCopyVersion, detail: "Saved packages can be compared against this version." },
    { label: "Old unsent packages needing regeneration", status: /Old unsent packages needing regeneration: 0\b/.test(input.regenerationReadiness) ? "ready" : "warning", value: input.regenerationReadiness.match(/Old unsent packages needing regeneration: (\d+)/)?.[1] ?? "0", detail: "Only unsent, uncontacted, written-contact packages are eligible." },
    {
      label: "Latest internal notification test",
      status: input.latestSafeTests.internal_notification?.outcome === "success" ? "ready" : "warning",
      value: input.latestSafeTests.internal_notification?.outcome ?? "not recorded",
      detail: input.latestSafeTests.internal_notification
        ? `${input.latestSafeTests.internal_notification.completedAt}. ${input.latestSafeTests.internal_notification.maskedDestination ?? "internal recipient"}`
        : "Use the test button to verify current env.",
    },
    {
      label: "Latest manual email test",
      status: input.latestSafeTests.internal_resend?.outcome === "success" ? "ready" : "warning",
      value: input.latestSafeTests.internal_resend?.outcome ?? "not recorded",
      detail: input.latestSafeTests.internal_resend
        ? `${input.latestSafeTests.internal_resend.completedAt}. ${input.latestSafeTests.internal_resend.maskedDestination ?? "internal recipient"}`
        : "Use internal Resend test only.",
    },
    { label: "Provider coverage", status: discoveryProviderCoverageStatus().level === "strong" ? "ready" : "warning", value: discoveryProviderCoverageStatus().label, detail: providerLabel() },
  ] satisfies OperatorStatusCard[];
}

export async function getOperatorTestCenterPayload(): Promise<OperatorTestCenterPayload> {
  const database = await databaseHealth();
  const env = outreachEnvironment();
  const internalEnv = internalNotificationEnvironment();
  const latestSafeTests = await latestOperatorSafeTestResults();
  const latestProviderDiagnostics = latestSafeTests.provider_smoke?.diagnostics?.providerDiagnostics ?? null;
  const providerCoverage = discoveryProviderCoverageStatus(latestProviderDiagnostics);
  const providerHealth = discoveryProviderHealth(latestProviderDiagnostics);
  let jobs: Awaited<ReturnType<typeof listTopProspectJobs>> = [];
  try {
    jobs = await listTopProspectJobs();
  } catch {
    jobs = [];
  }
  const dashboard = await getAutonomousGrowthDashboard().catch(() => null);
  const latestJob = jobs[0] ?? null;
  const queue = dashboard?.queue ?? [];
  const latestQueueItem = queue[0] ?? null;
  const latestPackage = summarizeLatestOutreachPackage(queue);
  const regenerationReadiness = summarizeRegenerationReadiness(queue);
  const smartRecommendation = dashboard?.smartGrowth.copySummaries.nextBestMove ?? "Smart recommendation unavailable until Autonomous Growth loads.";
  const next = nextRecommendedTest({
    env,
    internalConfigured: internalEnv.configured,
    providerCoverage,
    queueLength: dashboard?.queue.length ?? 0,
  });
  const statusCards = buildCards({ env, internalEnv, latestJob, latestPackage, regenerationReadiness, latestSafeTests });
  const providerSummary = providerHealth.map((provider) =>
    `${provider.label}: enabled ${provider.enabled ? "yes" : "no"}, env present ${provider.envVarPresent === null ? "not required" : provider.envVarPresent ? "yes" : "no"}, status ${provider.lastStatus}${provider.provider === "googlePlaces" ? `, endpoint ${provider.endpointVersion ?? "New"}` : ""}`,
  ).join("\n");
  const emailSafety = [
    `Prospect email sending: ${env.emailKillSwitchEnabled ? "disabled by OUTREACH_EMAIL_DISABLED" : "not disabled by kill switch"}`,
    `Provider configured: ${providerConfigured() ? "yes" : "no"}`,
    `Resend key present: ${env.hasResendApiKey ? "yes" : "no"}`,
    `Sender email: ${env.hasFromEmail ? "configured" : "missing"}`,
    `Reply-to email: ${env.hasReplyToEmail ? "configured" : "missing"}`,
    `Postal address: ${env.hasPostalAddress ? "configured" : "missing"}`,
    `Full auto: ${env.fullAutoSendEnabled ? "enabled but still gated" : "blocked"}`,
    "No auto-DM, contact forms, calls, or Loom sends are enabled by this Test Center.",
  ].join("\n");
  const smsSafety = "SMS/Twilio is optional and hidden from primary readiness guidance. Internal email notifications remain the recommended operator alert path.";
  const latestRun = summarizeLatestTopProspectsRun(latestJob);
  return {
    statusCards,
    nextRecommendedTest: next,
    providerCoverage,
    providerHealth,
    buildVersion: topProspectBuildVersion(),
    latest: {
      topProspectsRun: latestRun,
      outreachPackage: latestPackage,
      internalNotificationTest: formatOperatorSafeTestRecord(latestSafeTests.internal_notification, "No internal notification test has been recorded yet."),
      manualEmailTest: formatOperatorSafeTestRecord(latestSafeTests.internal_resend, "No internal Resend test has been recorded yet."),
      smsTest: "Not persisted. Internal SMS test sends only to INTERNAL_NOTIFY_PHONE.",
    },
    latestLinks: {
      topProspectsRunJobId: latestJob?.id ?? "",
      outreachPackageProspectId: latestQueueItem?.prospectId ?? "",
      outreachPackageResultId: latestQueueItem?.topProspectResultId ?? "",
      latestQueueItemId: latestQueueItem?.id ?? "",
    },
    latestSafeTestResults: {
      providerSmokeTest: formatOperatorSafeTestRecord(latestSafeTests.provider_smoke, "No Provider Smoke Test has been recorded yet."),
      internalNotificationTest: formatOperatorSafeTestRecord(latestSafeTests.internal_notification, "No internal notification test has been recorded yet."),
      internalResendTest: formatOperatorSafeTestRecord(latestSafeTests.internal_resend, "No internal Resend test has been recorded yet."),
      fullReadinessTest: formatOperatorSafeTestRecord(latestSafeTests.full_readiness, "No Full Autonomous Readiness Test has been recorded yet."),
    },
    summaries: {
      fullStatus: [
        `Build: ${topProspectBuildVersion()}`,
        `Database: ${database.reachable ? "reachable" : "not reachable"} (${operationalMode()})`,
        `Provider coverage: ${providerCoverage.label}`,
        `Internal notifications: ${internalEnv.configured ? "configured" : "not configured"}`,
        `Next recommended test: ${next}`,
        `Smart recommendation: ${dashboard?.smartGrowth.recommendation.nextBestMove ?? "not available"}`,
      ].join("\n"),
      emailSafety,
      smsNotifications: smsSafety,
      regenerationSummary: regenerationReadiness,
      smartRecommendation,
      providerDiagnostics: providerSummary || "Provider diagnostics are not recorded yet.",
      latestTopProspectsRun: latestRun,
      latestOutreachPackage: latestPackage,
      nextDebug: [
        next,
        latestRun,
        providerSummary,
        emailSafety,
        regenerationReadiness,
        smartRecommendation,
      ].join("\n\n"),
    },
    safeTestInput: {
      trade: "Pressure Washing",
      city: "Tampa",
      state: "FL",
      radiusKm: 10,
      businessesToScan: 25,
      finalProspectsWanted: 5,
    },
  };
}

export function generateOneTestOutreachPackage(environment: NodeJS.ProcessEnv = process.env): OperatorActionResult {
  const prospect = withAnalysis(createProspect({
    ...seedProspects[0],
    businessName: "Test Pressure Washing Co.",
    trade: "Pressure Washing",
    city: "Orlando",
    state: "FL",
    email: "owner@operatortest.example",
    website: "https://operatortest.example",
    status: "New",
  }));
  const publicPreviewLink = publicProspectPreviewLink(createPublicPreviewToken());
  const outreach = generateOutreach(prospect, publicPreviewLink, environment);
  const playbook = casualDmPlaybook(prospect, publicPreviewLink);
  const scripts = [
    { label: "First email script", body: outreach.concise },
    { label: "First Facebook/Instagram DM script", body: playbook.firstDm },
    { label: "Softer DM script", body: playbook.softerFirstDm },
    { label: "Yes-reply / preview-send script", body: playbook.yesReply },
    { label: "Pricing reply", body: playbook.pricingReply },
    { label: "Follow-up", body: playbook.followUpAfterLoom },
    { label: "Not interested reply", body: playbook.notInterestedReply },
  ];
  const safetySummary = [
    "TEST / FAKE package only.",
    "No provider calls.",
    "No prospect record created.",
    "No email, DM, form, phone call, or Loom was sent.",
    "First email and first DM are link-free.",
    "Yes-reply uses a fake public /p/ preview link.",
    `Copy version: ${currentOutreachCopyVersion}.`,
  ].join("\n");
  const fullSummary = [
    "TEST / FAKE OUTREACH PACKAGE",
    `Business: ${prospect.businessName}`,
    "Trade/city: Pressure Washing near Orlando, FL",
    "Recommended contact path: Public email for test, manual review only",
    `Public preview link: ${publicPreviewLink}`,
    `Copy version: ${currentOutreachCopyVersion}`,
    "",
    ...scripts.map((script) => `${script.label}:\n${script.body}`),
    "",
    `Safety summary:\n${safetySummary}`,
  ].join("\n\n");
  const allFirstTouch = `${outreach.concise}\n${playbook.firstDm}\n${playbook.softerFirstDm}`;
  return {
    ok: true,
    message: "Generated a fake internal outreach package preview. No provider calls, prospects, or outreach sends were created.",
    packagePreview: {
      subject: outreach.subjects[0],
      firstEmailLinkFree: !/https:\/\/webworkshop\.dev\/p\//i.test(outreach.concise),
      firstDmLinkFree: !/https:\/\/webworkshop\.dev\/p\//i.test(allFirstTouch),
      yesReplyIncludesPublicPreview: playbook.yesReply.includes(publicPreviewLink),
      publicPreviewLink,
    },
    fakePackage: {
      label: "TEST / FAKE",
      businessName: prospect.businessName,
      tradeCity: "Pressure Washing near Orlando, FL",
      recommendedContactPath: "Public email for test, manual review only",
      copyVersion: currentOutreachCopyVersion,
      publicPreviewLink,
      scripts,
      safetySummary,
      fullSummary,
    },
  };
}

export async function regenerateOperatorUnsentOutreachCopy(): Promise<OperatorActionResult> {
  const regeneration = await regenerateUnsentOutreachCopy();
  return {
    ok: true,
    message: `${regeneration.message} Nothing was sent.`,
    regeneration,
  };
}

export async function runOperatorSmartBackfillTest(): Promise<OperatorActionResult> {
  const smartGrowth = await processExistingQualifiedProspects({ dryRun: true });
  return {
    ok: smartGrowth.ok,
    message: `${smartGrowth.message} No email, DM, form, call, or Loom was sent.`,
    smartGrowth,
  };
}

export async function runOperatorMarketScoutDryRun(): Promise<OperatorActionResult> {
  const smartGrowth = await runMarketScoutDryRunForDashboard();
  return {
    ok: smartGrowth.ok,
    message: `${smartGrowth.message} No email, DM, form, call, or Loom was sent.`,
    smartGrowth,
  };
}

export async function runOperatorSmartAutonomousDryRun(): Promise<OperatorActionResult> {
  const smartGrowth = await runSmartAutonomousDryRun();
  return {
    ok: smartGrowth.ok,
    message: `${smartGrowth.message} No email, DM, form, call, or Loom was sent.`,
    smartGrowth,
  };
}

export async function simulateNext24Hours(): Promise<OperatorActionResult> {
  const dashboard = await getAutonomousGrowthDashboard().catch(() => null);
  const settings = await getAutonomousGrowthSettings();
  const env = outreachEnvironment();
  const queue = dashboard?.queue ?? [];
  const smart = dashboard?.smartGrowth ?? null;
  const queueCounts = smart?.existingQualifiedUnsent.queueCounts;
  const existing = smart?.existingQualifiedUnsent.total ?? queue.length;
  const emailReview = queueCounts?.readyForEmailReview ?? queue.filter((item) => item.email && item.contactSource === "Public email" && !item.sentDate).length;
  const socialReview = ((queueCounts?.readyForFacebookDm ?? 0) + (queueCounts?.readyForInstagramDm ?? 0))
    || queue.filter((item) => /facebook|instagram|social/i.test(item.contactSource) && !item.sentDate).length;
  const contactFormReview = queueCounts?.readyForContactFormReview ?? queue.filter((item) => /form/i.test(item.contactSource)).length;
  const phoneCallQueue = queueCounts?.phoneOnlyBlocked ?? queue.filter((item) => /phone/i.test(`${item.contactSource} ${item.blockedReason}`)).length;
  const manualResearch = queueCounts?.needsManualResearch ?? queue.filter((item) => /manual research|unknown/i.test(item.contactSource)).length;
  const blocked = (queueCounts?.badFitBlocked ?? 0) + queue.filter((item) => item.status === "Blocked" || item.status === "Bad Fit").length;
  const suppressed = queueCounts?.suppressedDoNotContact ?? queue.filter((item) => /suppressed|opted out|complained|bounced/i.test(`${item.status} ${item.blockedReason}`)).length;
  const emailSendsAllowedByCurrentGates = env.emailKillSwitchEnabled || !env.autoSendEnabled
    ? 0
    : queue.filter((item) => item.status === "Queued" && item.contactSource === "Public email").length;
  const providerCallsEstimated = settings.targetCities.length * Math.max(1, settings.targetTrades.length);
  const counts = {
    existingProspectsCheckedFirst: existing,
    emailReview,
    socialDmReview: socialReview,
    contactFormReview,
    phoneCallQueue,
    manualResearch,
    blocked,
    suppressed,
    packagesCreated: smart?.existingQualifiedUnsent.needsPreview ?? 0,
    copyRefreshed: smart?.existingQualifiedUnsent.needsRefreshedCopy ?? 0,
    providerCallsEstimated,
    emailSendsAllowedByCurrentGates,
  };
  const wouldDo = [
    `Check ${counts.existingProspectsCheckedFirst} existing qualified unsent prospects before new discovery.`,
    `Route ${counts.emailReview} to Email Review, ${counts.socialDmReview} to manual social DM review, and ${counts.contactFormReview} to manual contact-form review.`,
    `Refresh ${counts.copyRefreshed} outdated unsent copy draft(s) only after operator confirmation.`,
    `Prepare ${counts.packagesCreated} missing preview/package item(s) if the existing queue processor is run.`,
    providerCallsEstimated > 0 ? `Estimate ${providerCallsEstimated} provider request group(s) only if the operator starts discovery.` : "Use existing inventory first. No provider calls are needed in this dry-run simulation.",
  ];
  const wouldRequireOperatorAction = [
    "Review every package before outreach.",
    "Send Facebook and Instagram DMs manually only.",
    "Submit contact forms manually only.",
    "Place phone calls manually only from the Calls queue.",
    "Record Looms manually only when a high-value prospect has said yes.",
  ];
  const wouldNotDo = [
    "No prospect email sent by this simulation.",
    "No social DMs sent.",
    "No contact forms submitted.",
    "No phone calls placed.",
    "No prospect SMS sent.",
    "No Looms recorded or sent.",
    "No environment variables or safety flags changed.",
    "No contact or suppression history changed.",
  ];
  const blockedBySafetyGates = [
    env.emailKillSwitchEnabled ? "OUTREACH_EMAIL_DISABLED blocks prospect email sending." : "",
    !env.autoSendEnabled ? "OUTREACH_AUTO_SEND_ENABLED is not true, so Auto Email Pilot cannot send." : "",
    !env.fullAutoSendEnabled ? "OUTREACH_FULL_AUTO_SEND_ENABLED is not true, so full-auto email batches are blocked." : "",
    "Social DMs, contact forms, phone calls, prospect SMS, and Looms are manual-only.",
  ].filter(Boolean);
  const timeline = [
    "Hour 0: inspect existing qualified unsent prospects first.",
    "Hour 1: route saved packages into email, social, contact-form, manual research, blocked, and calls queues.",
    "Hour 2: identify outdated copy and missing packages for operator-approved refresh.",
    "Hour 3: recommend review work before new discovery.",
    providerCallsEstimated > 0 ? "Later: only estimate provider calls if the operator starts a market run." : "Later: keep working existing inventory.",
    "End of simulation: no outreach sent and no records changed.",
  ];
  const summary = safeTextLines([
    "Simulate Next 24 Hours",
    "Status: dry run only",
    `Existing prospects checked first: ${counts.existingProspectsCheckedFirst}`,
    `Email review: ${counts.emailReview}`,
    `Social DM review: ${counts.socialDmReview}`,
    `Contact form review: ${counts.contactFormReview}`,
    `Phone-call queue: ${counts.phoneCallQueue}`,
    `Manual research: ${counts.manualResearch}`,
    `Blocked: ${counts.blocked}`,
    `Suppressed: ${counts.suppressed}`,
    `Email sends allowed by current gates: ${counts.emailSendsAllowedByCurrentGates}`,
    `Would not do: ${wouldNotDo.join(" ")}`,
  ]);
  return {
    ok: true,
    message: "24-hour autonomous simulation finished as a dry run. No outreach was sent and no records were changed.",
    simulation: {
      status: "dry_run_only",
      timeline,
      wouldDo,
      wouldRequireOperatorAction,
      wouldNotDo,
      blockedBySafetyGates,
      counts,
      summary,
    },
  };
}

function check(
  checks: FullAutonomousReadinessCheck[],
  input: Omit<FullAutonomousReadinessCheck, "status"> & { passed?: boolean; optional?: boolean; info?: boolean },
) {
  const status = input.info ? "info" : input.optional ? "optional" : input.passed ? "passed" : "failed";
  checks.push({
    key: input.key,
    category: input.category,
    label: input.label,
    status,
    detail: input.detail,
    fix: status === "failed" ? input.fix : undefined,
  });
}

function formatChecks(title: string, checks: FullAutonomousReadinessCheck[]) {
  if (!checks.length) return `${title}\nNone.`;
  return [
    title,
    ...checks.map((item) => `${item.status.toUpperCase()}: ${item.label} - ${item.detail}${item.fix ? ` Next: ${item.fix}` : ""}`),
  ].join("\n");
}

function firstFix(failed: FullAutonomousReadinessCheck[]) {
  return failed.find((item) => item.fix)?.fix ?? "Review the failed checks above, then rerun Full Autonomous Readiness Test.";
}

function safeTextLines(lines: string[]) {
  return secretSafe(lines.filter(Boolean).join("\n"));
}

export async function runFullAutonomousReadinessTest(environment: NodeJS.ProcessEnv = process.env): Promise<OperatorActionResult> {
  const generatedAt = new Date().toISOString();
  const checks: FullAutonomousReadinessCheck[] = [];
  const env = outreachEnvironment(environment);
  const internalEnv = internalNotificationEnvironment(environment);
  const latestSafeTests = await latestOperatorSafeTestResults();
  const providerSmoke = latestSafeTests.provider_smoke;
  const latestProviderDiagnostics = providerSmoke?.diagnostics?.providerDiagnostics ?? null;
  const providerCoverage = discoveryProviderCoverageStatus(latestProviderDiagnostics, environment);
  const providerHealth = discoveryProviderHealth(latestProviderDiagnostics, environment);
  const providerSmokeFresh = isProviderSmokeRecordFresh(providerSmoke);
  const providerSmokeUsable = providerSmokeHasUsableApprovedProvider(providerSmoke);
  const database = await databaseHealth();
  const settings = await getAutonomousGrowthSettings();
  const dashboard = await getAutonomousGrowthDashboard().catch(() => null);
  const jobs = await listTopProspectJobs().catch(() => []);
  const queue = dashboard?.queue ?? [];
  const failedRecords = readinessFailedRecords(queue, env);
  const smartSnapshot = dashboard?.smartGrowth ?? null;
  const fakeEnvironment = {
    ...environment,
    WEBWORKSHOP_POSTAL_ADDRESS: environment.WEBWORKSHOP_POSTAL_ADDRESS?.trim() || environment.OUTREACH_POSTAL_ADDRESS?.trim() || "",
  } as NodeJS.ProcessEnv;
  const fakePackage = generateOneTestOutreachPackage(fakeEnvironment);
  const fakeScripts = fakePackage.fakePackage?.scripts ?? [];
  const firstEmail = fakeScripts.find((script) => script.label === "First email script")?.body ?? "";
  const firstDm = fakeScripts.find((script) => script.label === "First Facebook/Instagram DM script")?.body ?? "";
  const softerDm = fakeScripts.find((script) => script.label === "Softer DM script")?.body ?? "";
  const yesReply = fakeScripts.find((script) => script.label === "Yes-reply / preview-send script")?.body ?? "";
  const fakeCopyBlob = `${firstEmail}\n${firstDm}\n${softerDm}\n${yesReply}`;
  const configuredPostalAddress = environment.WEBWORKSHOP_POSTAL_ADDRESS?.trim() || environment.OUTREACH_POSTAL_ADDRESS?.trim() || "";
  const smartBackfill = await processExistingQualifiedProspects({ dryRun: true }).catch((error) => ({
    ok: false,
    message: `Smart backfill dry-run failed safely: ${error instanceof Error ? error.name : "unknown error"}`,
  }) as SmartGrowthActionResult);
  const marketScout = await runMarketScoutDryRunForDashboard().catch((error) => ({
    ok: false,
    message: `Market Scout dry-run failed safely: ${error instanceof Error ? error.name : "unknown error"}`,
  }) as SmartGrowthActionResult);
  const smartAutonomous = await runSmartAutonomousDryRun().catch((error) => ({
    ok: false,
    message: `Smart autonomous dry-run failed safely: ${error instanceof Error ? error.name : "unknown error"}`,
  }) as SmartGrowthActionResult);
  const publicEmailQueued = queue.filter((item) => item.status === "Queued" && item.contactSource === "Public email");
  const unsafeQueued = queue.filter((item) => item.status === "Queued" && item.contactSource !== "Public email");
  const queuedReadiness = publicEmailQueued.map((item) => evaluateQueuedEmailSendReadiness({ item, queue, settings, environment }));
  const queuedReadyCount = queuedReadiness.filter((item) => item.ready).length;
  const manualEmailCandidates = queue.filter((item) =>
    item.email
    && item.contactSource === "Public email"
    && !["Sent", "Opted Out", "Bounced", "Complained", "Suppressed", "Never Contact", "Not Interested", "Bad Fit", "Blocked"].includes(item.status),
  );
  const existing = smartSnapshot?.existingQualifiedUnsent;
  const sourceCounts = existing?.sourceCounts;
  const queueCounts = existing?.queueCounts;
  const googleHealth = providerHealth.find((provider) => provider.provider === "googlePlaces");
  const azureHealth = providerHealth.find((provider) => provider.provider === "azureMaps");
  const yelpHealth = providerHealth.find((provider) => provider.provider === "yelp");
  const noSecretBlob = JSON.stringify({
    checks: checks.map((item) => item.detail),
    status: providerCoverage.label,
  });

  check(checks, {
    key: "database",
    category: "Provider/env setup",
    label: "Database reachable",
    passed: database.reachable,
    detail: database.reachable ? "Database responded to the health check." : "Database is not reachable or not configured for this runtime.",
    fix: "Verify DATABASE_URL in Vercel and run System readiness again.",
  });
  check(checks, {
    key: "resend-provider",
    category: "Provider/env setup",
    label: "Resend provider configured",
    passed: env.sendProvider === "resend",
    detail: env.sendProvider === "resend" ? "OUTREACH_SEND_PROVIDER is set to resend." : "Prospect email provider is not set to resend.",
    fix: "Set OUTREACH_SEND_PROVIDER=resend before any approved email test.",
  });
  check(checks, { key: "resend-key", category: "Provider/env setup", label: "RESEND_API_KEY present", passed: env.hasResendApiKey, detail: env.hasResendApiKey ? "Resend key presence is detected." : "Resend key is missing.", fix: "Add RESEND_API_KEY in Vercel. Do not commit it." });
  check(checks, { key: "from-email", category: "Provider/env setup", label: "OUTREACH_FROM_EMAIL configured", passed: env.hasFromEmail, detail: env.hasFromEmail ? "Sender email is configured." : "Sender email is missing.", fix: "Add OUTREACH_FROM_EMAIL." });
  check(checks, { key: "reply-email", category: "Provider/env setup", label: "OUTREACH_REPLY_TO_EMAIL configured", passed: env.hasReplyToEmail, detail: env.hasReplyToEmail ? "Reply-to email is configured." : "Reply-to email is missing.", fix: "Add OUTREACH_REPLY_TO_EMAIL." });
  check(checks, { key: "postal-address", category: "Provider/env setup", label: "OUTREACH_POSTAL_ADDRESS configured", passed: env.hasPostalAddress, detail: env.hasPostalAddress ? "Postal address is configured for compliance-ready email drafts." : "Postal address is missing.", fix: "Add OUTREACH_POSTAL_ADDRESS." });
  check(checks, { key: "internal-notify", category: "Provider/env setup", label: "INTERNAL_NOTIFY_EMAIL configured", passed: internalEnv.configured, detail: internalEnv.configured ? "Internal email notifications are configured." : "Internal email notifications are missing or disabled.", fix: "Configure INTERNAL_NOTIFICATIONS_ENABLED, INTERNAL_NOTIFY_EMAIL, INTERNAL_NOTIFY_FROM_EMAIL, and RESEND_API_KEY." });
  const googleConfigured = Boolean(googleHealth?.enabled);
  const providerCheckPassed = providerSmokeFresh && providerSmokeUsable;
  const providerFix = !googleConfigured
    ? "Add GOOGLE_PLACES_API_KEY and redeploy."
    : !providerSmoke
      ? "Run Provider Smoke Test."
      : !providerSmokeFresh
        ? "Provider Smoke Test is stale. Rerun Provider Smoke Test."
        : providerSmoke.outcome === "failed"
          ? providerSmoke.safeErrorMessage || "Review the latest provider-specific failure reason."
          : providerSmoke.outcome === "no_results"
            ? "Provider Smoke Test returned zero usable samples. Check provider query/results before scaling."
            : "Run Provider Smoke Test.";
  const providerDetail = providerSmoke
    ? `${providerSmoke.summary} Latest test: ${providerSmoke.completedAt}. Coverage: ${providerCoverage.label}.`
    : googleConfigured
      ? "Google Places key is present and Places API New is selected, but no persisted Provider Smoke Test has run yet."
      : "GOOGLE_PLACES_API_KEY is missing. Yelp is optional and does not block Google-based discovery.";
  check(checks, {
    key: "google-provider",
    category: "Provider/env setup",
    label: "Discovery provider smoke test",
    passed: providerCheckPassed,
    detail: providerDetail,
    fix: providerFix,
  });
  check(checks, { key: "google-endpoint", category: "Provider/env setup", label: "Google Places endpoint recorded", passed: !googleHealth?.enabled || googleHealth.endpointVersion === "New", detail: googleHealth?.enabled ? `Google endpoint: ${googleHealth.endpointVersion ?? "not recorded"}.` : "Google Places is not enabled.", fix: "Use Places API New and verify the endpoint appears as New." });
  check(checks, { key: "azure-provider", category: "Provider/env setup", label: "Azure/Bing provider checked", passed: Boolean(azureHealth?.enabled), optional: !azureHealth?.enabled, detail: azureHealth?.enabled ? `Azure/Bing status: ${azureHealth.lastStatus}.` : "Azure/Bing is optional and not required if Google is healthy." });
  check(checks, { key: "yelp-optional", category: "Provider/env setup", label: "Yelp optional/not required", optional: true, detail: yelpHealth?.enabled ? `Yelp status: ${yelpHealth.lastStatus}.` : "Yelp is optional. Missing Yelp does not block Google-based discovery." });
  check(checks, { key: "secrets-safe", category: "Provider/env setup", label: "No secrets exposed", passed: !/secret|DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|GOOGLE_PLACES_API_KEY|postgres:\/\//i.test(noSecretBlob), detail: "Readiness summaries use booleans, statuses, and counts only." });

  check(checks, {
    key: "email-disabled",
    category: "Email safety gates",
    label: "OUTREACH_EMAIL_DISABLED safe lock",
    info: env.emailKillSwitchEnabled,
    passed: !env.emailKillSwitchEnabled,
    detail: env.emailKillSwitchEnabled
      ? "SAFE LOCK: prospect email sending is disabled. Blocks manual prospect email send, Auto Email Pilot, and full-auto email. Does not block provider tests, fake packages, Smart Backfill, Market Scout, or manual social-assist workflows."
      : "Prospect email kill switch is not enabled.",
  });
  check(checks, {
    key: "auto-send-enabled",
    category: "Email safety gates",
    label: "OUTREACH_AUTO_SEND_ENABLED safe lock",
    info: !env.autoSendEnabled,
    passed: env.autoSendEnabled,
    detail: env.autoSendEnabled ? "Auto-send gate is enabled, but still requires queue and full-auto gates." : "INTENTIONALLY DISABLED: Auto Email Pilot cannot send. Dry runs and manual review remain available.",
  });
  check(checks, {
    key: "full-auto-enabled",
    category: "Email safety gates",
    label: "OUTREACH_FULL_AUTO_SEND_ENABLED safe lock",
    info: !env.fullAutoSendEnabled,
    passed: env.fullAutoSendEnabled,
    detail: env.fullAutoSendEnabled ? "Full-auto batch gate is enabled." : "REQUIRED BEFORE LIVE MODE: full automatic email batches are disabled.",
  });
  check(checks, { key: "daily-cap", category: "Email safety gates", label: "Daily cap enforced", passed: settings.maxEmailsSentPerDay > 0 && env.dailyCap >= 0, detail: `Daily cap gates are active. Settings cap ${settings.maxEmailsSentPerDay}; env cap ${env.dailyCap}.` });
  check(checks, { key: "cooldown", category: "Email safety gates", label: "Cooldown enforced", passed: settings.emailCooldownMinutes > 0, detail: `Recipient cooldown is ${settings.emailCooldownMinutes} minutes.` });
  check(checks, { key: "suppression", category: "Email safety gates", label: "Suppression checks active", passed: true, detail: "Queued send readiness checks opted out, bounced, complained, suppressed, never-contact, not-interested, bad-fit, lost, sent email, and sent domain history." });
  check(checks, { key: "audit", category: "Email safety gates", label: "Audit logging active", passed: true, detail: "Approved send paths record accepted, rejected, and failed email-send audit outcomes." });
  check(checks, { key: "public-email-only", category: "Email safety gates", label: "Only queued public-email leads can ever send", passed: unsafeQueued.length === 0, detail: unsafeQueued.length ? `${unsafeQueued.length} non-public-email item(s) are queued and must be reviewed.` : "No non-public-email items are queued for automatic email.", fix: "Move social/form/phone-only leads out of Queued before enabling full auto." });
  check(checks, { key: "unsafe-leads-blocked", category: "Email safety gates", label: "Phone/social/form-only leads cannot auto-email", passed: true, detail: "Readiness logic blocks anything except contactSource=Public email." });

  check(checks, { key: "copy-version", category: "Outreach copy quality", label: "Latest outreachCopyVersion is current", passed: /permission[_-]first/i.test(currentOutreachCopyVersion), detail: `Current version: ${currentOutreachCopyVersion}.` });
  check(checks, { key: "first-email-link-free", category: "Outreach copy quality", label: "First-touch email has no preview link", passed: fakePackage.packagePreview?.firstEmailLinkFree === true && !/https:\/\/webworkshop\.dev\/p\//i.test(firstEmail), detail: "Fake first email asks permission before sending the preview." });
  check(checks, { key: "first-dm-link-free", category: "Outreach copy quality", label: "First-touch social DM has no preview link", passed: fakePackage.packagePreview?.firstDmLinkFree === true && !/https:\/\/webworkshop\.dev\/p\//i.test(`${firstDm}\n${softerDm}`), detail: "Fake first DM asks permission before sending the preview." });
  check(checks, { key: "yes-reply-public-preview", category: "Outreach copy quality", label: "Yes-reply includes public /p/ preview link", passed: fakePackage.packagePreview?.yesReplyIncludesPublicPreview === true && /https:\/\/webworkshop\.dev\/p\//i.test(yesReply), detail: "Preview link appears only in the yes-reply / preview-send script." });
  check(checks, { key: "email-opt-out", category: "Outreach copy quality", label: "Email includes opt-out language", passed: webworkshopOptOutPattern().test(firstEmail), detail: "Fake first email includes a simple opt-out line." });
  check(checks, { key: "email-postal", category: "Outreach copy quality", label: "Email includes postal address", passed: env.hasPostalAddress && Boolean(configuredPostalAddress) && firstEmail.includes(configuredPostalAddress), detail: env.hasPostalAddress ? "Fake first email includes the configured postal address line." : "Postal address is missing, so final email cannot be send-ready.", fix: "Add OUTREACH_POSTAL_ADDRESS before any real email test." });
  check(checks, { key: "no-scores", category: "Outreach copy quality", label: "No internal score language", passed: !/\b\d{1,3}\/100\b|website quality score|opportunity score|internal score/i.test(fakeCopyBlob), detail: "Fake copy does not expose scoring language." });
  check(checks, { key: "no-engine-links", category: "Outreach copy quality", label: "No internal Prospect Engine links", passed: !/\/engine(?:\/|$|\?)/i.test(fakeCopyBlob), detail: "Prospect-facing fake copy contains no protected engine links." });
  check(checks, { key: "no-guarantees", category: "Outreach copy quality", label: "No guaranteed-result claims", passed: !/\bwill get you more calls|guarantee|guaranteed\b/i.test(fakeCopyBlob), detail: "Fake copy uses help/get wording, not guarantees." });
  check(checks, { key: "current-wording", category: "Outreach copy quality", label: "Uses more calls and quote requests wording", passed: /help get (?:you )?more calls and quote requests/i.test(fakeCopyBlob), detail: "Fake copy uses the current direct, casual wording." });
  check(checks, { key: "why-reaching-out", category: "Outreach copy quality", label: "First-touch email explains why I am reaching out", passed: /noticed|could probably|couldn.t find|so I/i.test(firstEmail), detail: "Fake first email includes a simple reason before asking permission." });

  check(checks, { key: "existing-qualified", category: "Existing prospect readiness", label: "Existing qualified unsent prospects checked", passed: Boolean(existing), detail: existing ? `${existing.total} existing qualified unsent prospect(s) checked.` : "Smart snapshot was unavailable.", fix: "Open Autonomous Growth or rerun the readiness test after database health is restored." });
  check(checks, { key: "saved-results", category: "Existing prospect readiness", label: "Saved Top Prospects results checked", passed: Boolean(sourceCounts), detail: sourceCounts ? `${sourceCounts.savedTopProspectsResults} saved result(s), ${sourceCounts.rankedProspects} ranked, ${sourceCounts.reviewablePackages} reviewable.` : `${jobs.length} Top Prospects job(s) available.` });
  check(checks, { key: "queue-items", category: "Existing prospect readiness", label: "Outreach queue items checked", passed: dashboard !== null, detail: `${queue.length} queue item(s) checked.` });
  check(checks, { key: "outdated-copy", category: "Existing prospect readiness", label: "Outdated unsent copy detected", info: true, detail: `${existing?.needsRefreshedCopy ?? 0} package(s) need refreshed copy.` });
  check(checks, { key: "missing-packages", category: "Existing prospect readiness", label: "Missing packages detected", info: true, detail: `${existing?.needsPreview ?? 0} prospect(s) need preview/package work.` });
  check(checks, { key: "queue-counts", category: "Existing prospect readiness", label: "Queue bucket counts checked", passed: Boolean(queueCounts), detail: queueCounts ? `Email ${queueCounts.readyForEmailReview}, Facebook DM ${queueCounts.readyForFacebookDm}, Instagram DM ${queueCounts.readyForInstagramDm}, manual research ${queueCounts.needsManualResearch}, bad-fit ${queueCounts.badFitBlocked}, suppressed ${queueCounts.suppressedDoNotContact}, contacted ${queueCounts.alreadyContacted}.` : "Queue counts unavailable." });
  check(checks, {
    key: "exact-failed-records",
    category: "Existing prospect readiness",
    label: "Exact failed records identified",
    passed: failedRecords.length === 0,
    detail: failedRecords.length
      ? `${failedRecords.length} saved package/prospect record(s) need operator attention.`
      : "No exact package/prospect record failures were found.",
    fix: "Open the failed records list in Operator Test Center and correct each item before scaling.",
  });

  check(checks, { key: "smart-backfill", category: "Smart backfill readiness", label: "Can process existing qualified unsent prospects first", passed: smartBackfill.ok, detail: smartBackfill.message, fix: "Fix smart backfill dry-run errors before scaling." });
  check(checks, { key: "smart-backfill-routing", category: "Smart backfill readiness", label: "Can refresh copy, generate missing packages, and route queues", passed: smartBackfill.ok, detail: smartBackfill.summary?.summaryText ?? "Smart backfill returned no summary." });
  check(checks, { key: "smart-backfill-history", category: "Smart backfill readiness", label: "Does not rewrite sent or suppressed history", passed: /No emails sent|Suppression.*unchanged|What was not done/i.test(smartBackfill.summary?.summaryText ?? ""), detail: "Dry-run summary confirms no sends and no suppression/contact history rewrites." });

  check(checks, { key: "market-scout", category: "Market Scout readiness", label: "Market scout dry-run can run with bounded sample size", passed: marketScout.ok && marketScout.smartGrowth?.marketScout.bounded === true, detail: marketScout.summary?.summaryText ?? marketScout.message, fix: "Fix Market Scout dry-run before broad Autopilot testing." });
  check(checks, { key: "market-scout-recommendation", category: "Market Scout readiness", label: "Market scout recommends best next market/trade and explains why", passed: Boolean(marketScout.summary?.bestMarketTradeRecommendation), detail: marketScout.summary?.bestMarketTradeRecommendation ?? "No recommendation returned." });
  check(checks, { key: "market-scout-existing-inventory", category: "Market Scout readiness", label: "Scout considers existing inventory before new discovery", passed: (existing?.total ?? 0) === 0 || /existing qualified|existing unsent|use existing/i.test(marketScout.smartGrowth?.copySummaries.nextBestMove ?? ""), detail: marketScout.smartGrowth?.copySummaries.nextBestMove ?? "No existing-inventory recommendation returned." });
  check(checks, { key: "smart-autonomous", category: "Market Scout readiness", label: "Smart autonomous dry-run finished without outreach", passed: smartAutonomous.ok, detail: smartAutonomous.summary?.summaryText ?? smartAutonomous.message });

  const fullAutoReasons = [
    env.emailKillSwitchEnabled ? "OUTREACH_EMAIL_DISABLED is true." : "",
    !env.autoSendEnabled ? "OUTREACH_AUTO_SEND_ENABLED is not true." : "",
    !env.fullAutoSendEnabled ? "OUTREACH_FULL_AUTO_SEND_ENABLED is not true." : "",
    env.sendProvider !== "resend" ? "OUTREACH_SEND_PROVIDER is not resend." : "",
    !env.hasResendApiKey ? "RESEND_API_KEY is missing." : "",
    !env.hasFromEmail ? "OUTREACH_FROM_EMAIL is missing." : "",
    !env.hasReplyToEmail ? "OUTREACH_REPLY_TO_EMAIL is missing." : "",
    !env.hasPostalAddress ? "OUTREACH_POSTAL_ADDRESS is missing." : "",
    !internalEnv.configured ? "INTERNAL_NOTIFY_EMAIL/internal notifications are not configured." : "",
    settings.mode !== "auto_email_pilot" ? "Autonomous Growth mode is not Auto Email Pilot." : "",
    queuedReadyCount <= 0 ? "No eligible queued public-email leads are ready." : "",
    unsafeQueued.length ? "One or more queued leads are not public-email leads." : "",
    checks.some((item) => item.category === "Outreach copy quality" && item.status === "failed") ? "Outreach copy quality checks failed." : "",
  ].filter(Boolean);
  const fullAutoStatus = fullAutoReasons.length === 0 ? "Ready" : !env.fullAutoSendEnabled || !env.autoSendEnabled ? "Not recommended yet" : "Blocked";
  const autoEmailPilotReasons = [
    env.emailKillSwitchEnabled ? "OUTREACH_EMAIL_DISABLED is true." : "",
    !env.autoSendEnabled ? "OUTREACH_AUTO_SEND_ENABLED is not true." : "",
    env.sendProvider !== "resend" ? "OUTREACH_SEND_PROVIDER is not resend." : "",
    !env.hasResendApiKey ? "RESEND_API_KEY is missing." : "",
    !env.hasFromEmail ? "OUTREACH_FROM_EMAIL is missing." : "",
    !env.hasReplyToEmail ? "OUTREACH_REPLY_TO_EMAIL is missing." : "",
    !env.hasPostalAddress ? "OUTREACH_POSTAL_ADDRESS is missing." : "",
    settings.mode !== "auto_email_pilot" ? "Autonomous Growth mode is not Auto Email Pilot." : "",
    queuedReadyCount <= 0 ? "No eligible queued public-email leads are ready." : "",
    unsafeQueued.length ? "One or more queued leads are not public-email leads." : "",
  ].filter(Boolean);
  const autoEmailPilotStatus: FullAutonomousReadinessResult["autoEmailPilot"]["status"] = autoEmailPilotReasons.length === 0
    ? "Ready"
    : !env.autoSendEnabled || settings.mode !== "auto_email_pilot"
      ? "Not enabled"
      : "Blocked";
  const manualReasons = [
    env.emailKillSwitchEnabled ? "Manual prospect email send is blocked by OUTREACH_EMAIL_DISABLED." : "",
    !env.hasPostalAddress ? "Postal address is missing." : "",
    manualEmailCandidates.length <= 0 ? "No reviewed public-email package is available for a manual send test." : "",
    /https:\/\/webworkshop\.dev\/p\//i.test(firstEmail) ? "First-touch email contains a preview link." : "",
    !webworkshopOptOutPattern().test(firstEmail) ? "Opt-out language is missing." : "",
    /\bwill get you more calls|guarantee|guaranteed\b/i.test(firstEmail) ? "Unsupported or guaranteed-result claim detected." : "",
  ].filter(Boolean);
  const manualStatus = manualReasons.length === 0 ? "Ready" : "Blocked";
  check(checks, { key: "auto-email-pilot-final", category: "Auto Email Pilot readiness", label: "Auto Email Pilot final readiness", info: autoEmailPilotStatus !== "Ready", passed: autoEmailPilotStatus === "Ready", detail: autoEmailPilotStatus === "Ready" ? `${queuedReadyCount} queued public-email lead(s) pass Auto Email Pilot gates.` : autoEmailPilotReasons.join(" ") });
  check(checks, { key: "full-auto-final", category: "Full-auto email readiness", label: "Full Auto Email final readiness", info: fullAutoStatus !== "Ready", passed: fullAutoStatus === "Ready", detail: fullAutoStatus === "Ready" ? `${queuedReadyCount} queued public-email lead(s) are ready.` : fullAutoReasons.join(" ") });
  check(checks, { key: "manual-email-final", category: "Manual email test readiness", label: "Manual Email Test final readiness", info: manualStatus !== "Ready", passed: manualStatus === "Ready", detail: manualStatus === "Ready" ? "A manual reviewed public-email test can be prepared without enabling full auto." : manualReasons.join(" ") });

  const passed = checks.filter((item) => item.status === "passed");
  const failed = checks.filter((item) => item.status === "failed");
  const optional = checks.filter((item) => item.status === "optional" || item.status === "info");
  const setupFailures = failed.filter((item) => item.category === "Provider/env setup");
  const providerOrInventoryReady = providerCheckPassed || (existing?.total ?? 0) > 0;
  const dryRunReasons = [
    !database.reachable ? "Database health check is not reachable." : "",
    !providerOrInventoryReady ? "Run Provider Smoke Test or use existing qualified unsent inventory before broad discovery." : "",
    checks.some((item) => item.category === "Outreach copy quality" && item.status === "failed") ? "Outreach copy quality checks failed." : "",
    !smartBackfill.ok ? "Smart Backfill dry run failed." : "",
    !smartAutonomous.ok ? "Smart Autonomous dry run failed." : "",
  ].filter(Boolean);
  const dryRunStatus: FullAutonomousReadinessResult["dryRunManualRouting"]["status"] = dryRunReasons.length ? "Needs attention" : "Ready for safe dry runs";
  const overallStatus: FullAutonomousReadinessResult["overallStatus"] = dryRunStatus === "Ready for safe dry runs"
    ? "Ready for safe dry runs"
    : setupFailures.length
      ? "Needs setup"
      : "Not ready for full-auto email";
  const finalReadinessStatus: FullAutonomousReadinessResult["finalReadinessStatus"] = setupFailures.length
    ? "NEEDS SETUP"
    : fullAutoStatus === "Ready"
      ? "READY FOR AUTO EMAIL PILOT"
      : autoEmailPilotStatus === "Ready"
        ? "READY FOR AUTO EMAIL PILOT"
        : manualStatus === "Ready"
          ? "READY FOR ONE MANUAL EMAIL TEST"
          : dryRunStatus === "Ready for safe dry runs"
            ? "READY FOR SAFE DRY RUNS"
            : "BLOCKED - RECORDS NEED ATTENTION";
  const notDone = [
    "No prospect emails were sent.",
    "No DMs were sent.",
    "No contact forms were submitted.",
    "No phone calls were placed.",
    "No Looms were recorded or sent.",
    "No auto-send flags were enabled.",
    "No environment variables were changed.",
    "No provider discovery run was started by this readiness test.",
  ];
  const nextSafestAction = dryRunStatus === "Ready for safe dry runs"
    ? "Work the existing review buckets or run one small Top Prospects test. No outreach will be sent automatically."
    : firstFix(failed);
  const full = safeTextLines([
    `Full Autonomous Readiness Test (${generatedAt})`,
    `Final readiness: ${finalReadinessStatus}`,
    `Overall status: ${overallStatus}`,
    `Dry-run / manual routing readiness: ${dryRunStatus}`,
    ...dryRunReasons.map((reason) => `- ${reason}`),
    `Next safest action: ${nextSafestAction}`,
    `Full Auto Email: ${fullAutoStatus}`,
    ...fullAutoReasons.map((reason) => `- ${reason}`),
    `Manual Email Test: ${manualStatus}`,
    ...manualReasons.map((reason) => `- ${reason}`),
    `Auto Email Pilot: ${autoEmailPilotStatus}`,
    ...autoEmailPilotReasons.map((reason) => `- ${reason}`),
    `Passed: ${passed.length}`,
    `Failed: ${failed.length}`,
    `Failed records needing attention: ${failedRecords.length}`,
    `Optional/info: ${optional.length}`,
    `Not done: ${notDone.join(" ")}`,
  ]);
  const failedRecordSummary = failedRecords.map((record) => `- ${record.businessName}: ${record.category}. ${record.reason} Next: ${record.correction}`);
  const failedOnly = safeTextLines([formatChecks("Failed checks only", failed), failedRecordSummary.length ? `Failed records:\n${failedRecordSummary.join("\n")}` : "Failed records: none"]);
  const nextFix = safeTextLines([`Next safest action: ${nextSafestAction}`, failed[0] ? `${failed[0].label}: ${failed[0].detail}` : "No failed checks."]);
  const safeToTest = safeTextLines([
    `Dry-run / Manual Routing: ${dryRunStatus}`,
    dryRunStatus === "Ready for safe dry runs" ? "Safe next test: process existing review buckets or run a small Top Prospects test." : `Needs attention: ${dryRunReasons.join(" ")}`,
    `Manual Email Test: ${manualStatus}`,
    manualStatus === "Ready" ? "Safe next test: choose one reviewed public-email package and send manually after review." : `Blocked: ${manualReasons.join(" ")}`,
    `Auto Email Pilot: ${autoEmailPilotStatus}`,
    `Full Auto Email: ${fullAutoStatus}`,
    "This readiness test sent nothing and changed no safety settings.",
  ]);
  const debug = safeTextLines([
    full,
    "",
    formatChecks("All checks", checks),
    "",
    `Provider coverage: ${providerCoverage.label}. ${providerCoverage.summary}`,
    `Queued public-email leads: ${publicEmailQueued.length}`,
    `Queued public-email leads passing readiness: ${queuedReadyCount}`,
    `Existing qualified unsent: ${existing?.total ?? 0}`,
    `Smart backfill: ${smartBackfill.message}`,
    `Market scout: ${marketScout.message}`,
  ]);
  const readiness: FullAutonomousReadinessResult = {
    overallStatus,
    finalReadinessStatus,
    nextSafestAction,
    fullAutoEmail: { status: fullAutoStatus, reasons: fullAutoReasons },
    dryRunManualRouting: { status: dryRunStatus, reasons: dryRunReasons },
    manualEmailTest: { status: manualStatus, reasons: manualReasons },
    autoEmailPilot: { status: autoEmailPilotStatus, reasons: autoEmailPilotReasons },
    passed,
    failed,
    failedRecords,
    optional,
    notDone,
    checks,
    summaries: { full, failedOnly, nextFix, safeToTest, debug },
    generatedAt,
  };
  await recordOperatorSafeTestResult({
    testType: "full_readiness",
    startedAt: generatedAt,
    completedAt: new Date().toISOString(),
    outcome: dryRunStatus === "Ready for safe dry runs" ? "success" : "failed",
    summary: `${overallStatus}. ${nextSafestAction}`,
    modeStatuses: {
      dryRunManualRouting: dryRunStatus,
      manualEmailTest: manualStatus,
      autoEmailPilot: autoEmailPilotStatus,
      fullAutoEmail: fullAutoStatus,
    },
    safeErrorMessage: failed[0]?.detail ?? "",
  });
  return {
    ok: dryRunStatus === "Ready for safe dry runs",
    message: `Full Autonomous Readiness Test finished: ${overallStatus}. ${nextSafestAction}`,
    readiness,
  };
}

export async function sendOperatorTestNotification(kind: "notification" | "manual_email"): Promise<OperatorActionResult> {
  const startedAt = new Date().toISOString();
  const notification = await sendInternalOperatorNotification({
    kind: "operator_test",
    title: kind === "notification" ? "Internal notification test" : "Internal Resend email test",
    marketTrade: "Operator Test Center",
    resultCount: 1,
    attention: "This is a safe internal-only test. No prospect received anything.",
    nextAction: "If this arrived on your phone or inbox, internal alerts are configured.",
    pagePath: "/engine?tab=operator-test-center",
  });
  await recordOperatorSafeTestResult({
    testType: kind === "notification" ? "internal_notification" : "internal_resend",
    startedAt,
    completedAt: new Date().toISOString(),
    outcome: notification.sent ? "success" : "failed",
    summary: notification.sent
      ? "Internal test message sent only to the configured operator email."
      : `Internal test message failed safely: ${notification.blockedReasons.join(" ")}`,
    maskedDestination: maskEmailAddress(process.env.INTERNAL_NOTIFY_EMAIL),
    providerMessageId: notification.providerMessageId ?? "",
    safeErrorMessage: notification.sent ? "" : notification.blockedReasons.join(" "),
  });
  return {
    ok: notification.sent,
    message: notification.sent
      ? "Internal test message sent only to INTERNAL_NOTIFY_EMAIL."
      : `Internal test message was not sent: ${notification.blockedReasons.join(" ")}`,
    notification,
  };
}

export async function sendOperatorTestSms(): Promise<OperatorActionResult> {
  const sms = await sendInternalOperatorSms({
    kind: "operator_test",
    title: "Internal SMS test",
    marketTrade: "Operator Test Center",
    resultCount: 1,
    attention: "This is a safe internal-only SMS test. No prospect received anything.",
    nextAction: "If this arrived on your phone, SMS alerts are configured.",
    pagePath: "/engine?tab=operator-test-center",
  });
  return {
    ok: sms.sent,
    message: sms.sent
      ? `Internal test SMS sent only to ${sms.maskedTo ?? "INTERNAL_NOTIFY_PHONE"}.`
      : `Internal test SMS was not sent: ${sms.blockedReasons.join(" ")}`,
    sms,
  };
}
