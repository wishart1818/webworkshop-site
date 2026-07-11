import { internalNotificationConfiguredLabel, internalNotificationEnvironment, sendInternalOperatorNotification, type InternalNotificationResult } from "@/lib/internal-notifications";
import { discoveryProviderCoverageStatus, discoveryProviderHealth } from "@/lib/lead-discovery";
import { databaseHealth, operationalMode } from "@/lib/operational-controls";
import { createProspect, generateOutreach, seedProspects, withAnalysis } from "@/lib/prospect-engine";
import { getAutonomousGrowthDashboard } from "@/lib/autonomous-growth-repository";
import { outreachEnvironment, providerConfigured } from "@/lib/autonomous-growth";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { listTopProspectJobs } from "@/lib/top-prospect-repository";
import { publicProspectPreviewLink } from "@/lib/top-prospects";
import { topProspectBuildVersion } from "@/lib/top-prospect-list-route";

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
    nextDebug: string;
  };
  latest: {
    topProspectsRun: string;
    outreachPackage: string;
    internalNotificationTest: string;
    manualEmailTest: string;
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
  packagePreview?: {
    subject: string;
    firstEmailLinkFree: boolean;
    firstDmLinkFree: boolean;
    yesReplyIncludesPublicPreview: boolean;
    publicPreviewLink: string;
  };
};

function boolStatus(value: boolean): OperatorStatusCard["status"] {
  return value ? "configured" : "missing";
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
    `Preview quality: ${latest.previewQualityScore}`,
    `Recommended next action: ${latest.recommendedNextAction}`,
    `Public preview: ${latest.previewLink.startsWith("https://webworkshop.dev/p/") ? "Yes" : "No"}`,
  ].join("\n");
}

function nextRecommendedTest(input: {
  env: ReturnType<typeof outreachEnvironment>;
  internalConfigured: boolean;
  providerCoverage: ReturnType<typeof discoveryProviderCoverageStatus>;
  queueLength: number;
}) {
  if (!input.internalConfigured) return "Internal notifications are missing. Add INTERNAL_NOTIFY_EMAIL and INTERNAL_NOTIFY_FROM_EMAIL before relying on phone alerts.";
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
    { label: "Latest internal notification test", status: "warning", value: "not persisted", detail: "Use the test button to verify current env." },
    { label: "Latest manual email test", status: "warning", value: "not persisted", detail: "Use internal Resend test only." },
    { label: "Provider coverage", status: discoveryProviderCoverageStatus().level === "strong" ? "ready" : "warning", value: discoveryProviderCoverageStatus().label, detail: providerLabel() },
  ] satisfies OperatorStatusCard[];
}

export async function getOperatorTestCenterPayload(): Promise<OperatorTestCenterPayload> {
  const database = await databaseHealth();
  const env = outreachEnvironment();
  const internalEnv = internalNotificationEnvironment();
  const providerCoverage = discoveryProviderCoverageStatus();
  const providerHealth = discoveryProviderHealth();
  let jobs: Awaited<ReturnType<typeof listTopProspectJobs>> = [];
  try {
    jobs = await listTopProspectJobs();
  } catch {
    jobs = [];
  }
  const dashboard = await getAutonomousGrowthDashboard().catch(() => null);
  const latestJob = jobs[0] ?? null;
  const latestPackage = summarizeLatestOutreachPackage(dashboard?.queue ?? []);
  const next = nextRecommendedTest({
    env,
    internalConfigured: internalEnv.configured,
    providerCoverage,
    queueLength: dashboard?.queue.length ?? 0,
  });
  const statusCards = buildCards({ env, internalEnv, latestJob, latestPackage });
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
      internalNotificationTest: "Not persisted. Use Send Internal Test Notification to verify current env.",
      manualEmailTest: "Not persisted. Internal Resend test sends only to INTERNAL_NOTIFY_EMAIL.",
    },
    summaries: {
      fullStatus: [
        `Build: ${topProspectBuildVersion()}`,
        `Database: ${database.reachable ? "reachable" : "not reachable"} (${operationalMode()})`,
        `Provider coverage: ${providerCoverage.label}`,
        `Internal notifications: ${internalEnv.configured ? "configured" : "not configured"}`,
        `Next recommended test: ${next}`,
      ].join("\n"),
      emailSafety,
      providerDiagnostics: providerSummary || "Provider diagnostics are not recorded yet.",
      latestTopProspectsRun: latestRun,
      latestOutreachPackage: latestPackage,
      nextDebug: [
        next,
        latestRun,
        providerSummary,
        emailSafety,
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
    businessName: "Operator Test Pressure Washing",
    trade: "Pressure Washing",
    city: "Tampa",
    state: "FL",
    email: "owner@operatortest.example",
    website: "https://operatortest.example",
    status: "New",
  }));
  const publicPreviewLink = publicProspectPreviewLink(createPublicPreviewToken());
  const outreach = generateOutreach(prospect, publicPreviewLink, environment);
  const firstDm = outreach.concise.startsWith("Hey") ? outreach.concise : `Hey, how's it going? I came across ${prospect.businessName} and made a quick website preview for you. It's built to look cleaner and help get you more calls and quote requests. Want to see it?`;
  const firstTouch = `${outreach.concise}\n${firstDm}`;
  return {
    ok: true,
    message: "Generated a fake internal outreach package preview. No provider calls, prospects, or outreach sends were created.",
    packagePreview: {
      subject: outreach.subjects[0],
      firstEmailLinkFree: !/https:\/\/webworkshop\.dev\/p\//i.test(outreach.concise),
      firstDmLinkFree: !/https:\/\/webworkshop\.dev\/p\//i.test(firstTouch),
      yesReplyIncludesPublicPreview: outreach.detailed.includes(publicPreviewLink),
      publicPreviewLink,
    },
  };
}

export async function sendOperatorTestNotification(kind: "notification" | "manual_email"): Promise<OperatorActionResult> {
  const notification = await sendInternalOperatorNotification({
    kind: "operator_test",
    title: kind === "notification" ? "Internal notification test" : "Internal Resend email test",
    marketTrade: "Operator Test Center",
    resultCount: 1,
    attention: "This is a safe internal-only test. No prospect received anything.",
    nextAction: "If this arrived on your phone or inbox, internal alerts are configured.",
    pagePath: "/engine?tab=operator-test-center",
  });
  return {
    ok: notification.sent,
    message: notification.sent
      ? "Internal test message sent only to INTERNAL_NOTIFY_EMAIL."
      : `Internal test message was not sent: ${notification.blockedReasons.join(" ")}`,
    notification,
  };
}
