import type { Prisma } from "@prisma/client";
import {
  discoveryProviders,
  type DiscoveryDiagnostics,
  type DiscoveryProvider,
  type DiscoveryProviderDiagnostic,
} from "@/lib/lead-discovery";
import { listAuditEvents, safeRecordAudit, type AuditEventView } from "@/lib/operational-controls";

export type OperatorSafeTestType = "provider_smoke" | "internal_notification" | "internal_resend" | "full_readiness";
export type OperatorSafeTestOutcome = "success" | "partial" | "no_results" | "not_run" | "failed" | "blocked";
export type OperatorProviderOutcome = "success" | "partial" | "no_results" | "not_run" | "failed";

export type OperatorProviderTestResult = {
  provider: DiscoveryProvider;
  providerName: string;
  enabled: boolean;
  envPresent: boolean | null;
  endpointVersion: string;
  outcome: OperatorProviderOutcome;
  usableSampleCount: number;
  rawRecords: number;
  safeErrorMessage: string;
  failureType: string;
};

export type OperatorSafeTestRecord = {
  testType: OperatorSafeTestType;
  startedAt: string;
  completedAt: string;
  outcome: OperatorSafeTestOutcome;
  summary: string;
  providerResults?: OperatorProviderTestResult[];
  diagnostics?: DiscoveryDiagnostics | null;
  usableSampleCount?: number;
  createdOutreachPackages?: boolean;
  sentOutreach?: boolean;
  maskedDestination?: string;
  providerMessageId?: string;
  modeStatuses?: {
    dryRunManualRouting: string;
    manualEmailTest: string;
    autoEmailPilot: string;
    fullAutoEmail: string;
  };
  safeErrorMessage?: string;
};

const operatorTestAction = "operator_test_center_result";

const providerLabels: Record<DiscoveryProvider, string> = {
  osm: "OpenStreetMap",
  azureMaps: "Azure Maps",
  googlePlaces: "Google Places",
  yelp: "Yelp",
};

export function safeOperatorText(value: string) {
  return value
    .replace(/(?:sk-|rk-|pk-|AIza|ya29)[A-Za-z0-9_\-]{12,}/g, "[secret redacted]")
    .replace(/\bSG\.[A-Za-z0-9_.-]+/g, "[secret redacted]")
    .replace(/\bAC[a-f0-9]{24,}\b/gi, "[secret redacted]")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s]+/gi, "[database url redacted]")
    .replace(/\b(?:DATABASE_URL|RESEND_API_KEY|TWILIO_AUTH_TOKEN|GOOGLE_PLACES_API_KEY|YELP_API_KEY|ENGINE_PASSWORD)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

export function maskEmailAddress(value?: string) {
  const email = value?.trim() ?? "";
  if (!email || !email.includes("@")) return "missing";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1) || "?"}***@${domain}`;
}

function providerEnvPresent(diagnostic?: DiscoveryProviderDiagnostic) {
  if (typeof diagnostic?.envVarPresent === "boolean") return diagnostic.envVarPresent;
  if (diagnostic?.envVarPresent === null) return null;
  if (diagnostic?.configured === true) return true;
  if (diagnostic?.canRunWithoutApiKey) return null;
  return false;
}

export function providerOutcomeFromDiagnostic(diagnostic?: DiscoveryProviderDiagnostic | null): OperatorProviderOutcome {
  if (!diagnostic || diagnostic.queryExecuted !== true) return "not_run";
  if (["failed", "timed_out", "rate_limited"].includes(diagnostic.status)) return "failed";
  const usable = Math.max(diagnostic.usableWebsiteCount ?? 0, diagnostic.returnedCount ?? 0);
  if (diagnostic.status === "succeeded" && usable > 0) return "success";
  if (diagnostic.status === "succeeded" || diagnostic.status === "zero_results") return "no_results";
  return "not_run";
}

function providerRecord(provider: DiscoveryProvider, diagnostic?: DiscoveryProviderDiagnostic): OperatorProviderTestResult {
  const outcome = providerOutcomeFromDiagnostic(diagnostic);
  return {
    provider,
    providerName: providerLabels[provider],
    enabled: Boolean(diagnostic?.configured ?? diagnostic?.canRunWithoutApiKey),
    envPresent: providerEnvPresent(diagnostic),
    endpointVersion: diagnostic?.endpointVersion ?? (provider === "googlePlaces" ? "New" : ""),
    outcome,
    usableSampleCount: Math.max(diagnostic?.usableWebsiteCount ?? 0, diagnostic?.returnedCount ?? 0),
    rawRecords: diagnostic?.returnedCount ?? 0,
    safeErrorMessage: safeOperatorText(diagnostic?.safeErrorMessage ?? ""),
    failureType: diagnostic?.failureType ?? "none",
  };
}

export function buildProviderSmokeTestRecord(input: {
  startedAt: string;
  completedAt: string;
  diagnostics: DiscoveryDiagnostics | null;
  sampleCount: number;
  createdOutreachPackages: boolean;
  sentOutreach: boolean;
  safeError?: string;
}): OperatorSafeTestRecord {
  const providerResults = discoveryProviders.map((provider) => providerRecord(provider, input.diagnostics?.providerDiagnostics?.[provider]));
  const approvedProviders = providerResults.filter((provider) => provider.provider !== "osm");
  const successfulApproved = approvedProviders.filter((provider) => provider.outcome === "success");
  const attemptedApproved = approvedProviders.filter((provider) => provider.outcome !== "not_run");
  const failedApproved = approvedProviders.filter((provider) => provider.outcome === "failed");
  const noResultApproved = approvedProviders.filter((provider) => provider.outcome === "no_results");
  const outcome: OperatorSafeTestOutcome = successfulApproved.length
    ? failedApproved.length || noResultApproved.length ? "partial" : "success"
    : attemptedApproved.length
      ? failedApproved.length ? "failed" : "no_results"
      : input.safeError ? "failed" : "not_run";
  const usableSampleCount = successfulApproved.reduce((sum, provider) => sum + provider.usableSampleCount, 0);
  const providerNames = successfulApproved.map((provider) => provider.providerName).join(", ");
  const summary = outcome === "success" || outcome === "partial"
    ? `Provider smoke test passed with ${usableSampleCount || input.sampleCount} usable sample(s) from ${providerNames || "configured providers"}.`
    : outcome === "no_results"
      ? "Provider smoke test ran, but no approved provider returned usable samples."
      : outcome === "failed"
        ? `Provider smoke test failed safely. ${safeOperatorText(input.safeError ?? failedApproved[0]?.safeErrorMessage ?? "Review provider diagnostics.")}`
        : "Provider smoke test has not run against an approved configured provider yet.";
  return {
    testType: "provider_smoke",
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    outcome,
    summary,
    providerResults,
    diagnostics: input.diagnostics,
    usableSampleCount: usableSampleCount || input.sampleCount,
    createdOutreachPackages: input.createdOutreachPackages,
    sentOutreach: input.sentOutreach,
    safeErrorMessage: input.safeError ? safeOperatorText(input.safeError) : "",
  };
}

function toMetadata(record: OperatorSafeTestRecord): Prisma.InputJsonObject {
  return JSON.parse(safeOperatorText(JSON.stringify(record))) as Prisma.InputJsonObject;
}

function fromEvent(event: AuditEventView): OperatorSafeTestRecord | null {
  if (event.action !== operatorTestAction || !event.metadata || typeof event.metadata !== "object") return null;
  const record = event.metadata as unknown as OperatorSafeTestRecord;
  if (!record.testType || !record.completedAt) return null;
  return record;
}

export async function recordOperatorSafeTestResult(record: OperatorSafeTestRecord) {
  await safeRecordAudit({
    action: operatorTestAction,
    outcome: record.outcome === "failed" || record.outcome === "blocked" ? "failure" : "success",
    subject: record.testType,
    metadata: toMetadata(record),
  });
}

export async function latestOperatorSafeTestResults() {
  const latest: Partial<Record<OperatorSafeTestType, OperatorSafeTestRecord>> = {};
  try {
    const events = await listAuditEvents(100);
    for (const event of events) {
      const record = fromEvent(event);
      if (record && !latest[record.testType]) latest[record.testType] = record;
    }
  } catch {
    return latest;
  }
  return latest;
}

export function isProviderSmokeRecordFresh(record: OperatorSafeTestRecord | undefined, now = new Date()) {
  if (!record) return false;
  const completed = Date.parse(record.completedAt);
  if (!Number.isFinite(completed)) return false;
  return now.getTime() - completed <= 24 * 60 * 60 * 1000;
}

export function providerSmokeHasUsableApprovedProvider(record: OperatorSafeTestRecord | undefined) {
  return Boolean(record?.providerResults?.some((provider) => provider.provider !== "osm" && provider.outcome === "success" && provider.usableSampleCount > 0));
}

export function formatOperatorSafeTestRecord(record: OperatorSafeTestRecord | undefined, fallback: string) {
  if (!record) return fallback;
  const lines = [
    `Status: ${record.outcome}`,
    `Timestamp: ${record.completedAt}`,
    record.summary,
    typeof record.usableSampleCount === "number" ? `Usable samples: ${record.usableSampleCount}` : "",
    typeof record.createdOutreachPackages === "boolean" ? `Packages created: ${record.createdOutreachPackages ? "yes" : "no"}` : "",
    typeof record.sentOutreach === "boolean" ? `Outreach sent: ${record.sentOutreach ? "yes" : "no"}` : "",
    record.maskedDestination ? `Recipient: ${record.maskedDestination}` : "",
    record.safeErrorMessage ? `Safe error: ${record.safeErrorMessage}` : "",
  ];
  return safeOperatorText(lines.filter(Boolean).join("\n"));
}
