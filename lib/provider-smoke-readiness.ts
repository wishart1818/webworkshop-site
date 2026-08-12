import type { DiscoveryProvider } from "@/lib/lead-discovery";

type ProviderSmokeRecord = {
  completedAt: string;
  outcome: string;
  providerResults?: Array<{
    provider: DiscoveryProvider;
    providerName: string;
    outcome: string;
    usableSampleCount: number;
  }>;
};

export type ProviderSmokeReadinessReason =
  | "ready"
  | "missing"
  | "stale"
  | "failed"
  | "no_usable_approved_provider";

export type ProviderSmokeReadiness = {
  passed: boolean;
  reason: ProviderSmokeReadinessReason;
  completedAt: string;
  usableApprovedProviders: Array<{
    provider: DiscoveryProvider;
    providerName: string;
    usableSampleCount: number;
  }>;
};

const providerSmokeFreshnessWindowMs = 24 * 60 * 60 * 1000;

export function isProviderSmokeRecordFresh(record: ProviderSmokeRecord | undefined, now = new Date()) {
  if (!record) return false;
  const completed = Date.parse(record.completedAt);
  if (!Number.isFinite(completed)) return false;
  return now.getTime() - completed <= providerSmokeFreshnessWindowMs;
}

export function providerSmokeHasUsableApprovedProvider(record: ProviderSmokeRecord | undefined) {
  return Boolean(record?.providerResults?.some((provider) => provider.provider !== "osm" && provider.outcome === "success" && provider.usableSampleCount > 0));
}

export function providerSmokeReadiness(
  record: ProviderSmokeRecord | undefined,
  now = new Date(),
): ProviderSmokeReadiness {
  if (!record) {
    return { passed: false, reason: "missing", completedAt: "", usableApprovedProviders: [] };
  }
  if (!isProviderSmokeRecordFresh(record, now)) {
    return { passed: false, reason: "stale", completedAt: record.completedAt, usableApprovedProviders: [] };
  }
  if (record.outcome === "failed" || record.outcome === "blocked") {
    return { passed: false, reason: "failed", completedAt: record.completedAt, usableApprovedProviders: [] };
  }
  const usableApprovedProviders = (record.providerResults ?? [])
    .filter((provider) => provider.provider !== "osm" && provider.outcome === "success" && provider.usableSampleCount > 0)
    .map((provider) => ({
      provider: provider.provider,
      providerName: provider.providerName,
      usableSampleCount: provider.usableSampleCount,
    }));
  if (!usableApprovedProviders.length) {
    return { passed: false, reason: "no_usable_approved_provider", completedAt: record.completedAt, usableApprovedProviders: [] };
  }
  return { passed: true, reason: "ready", completedAt: record.completedAt, usableApprovedProviders };
}

export function providerSmokeReadinessWarning(readiness: ProviderSmokeReadiness) {
  if (readiness.reason === "missing") return "No Provider Smoke Test has been recorded yet.";
  if (readiness.reason === "stale") return "Provider Smoke Test is stale. Rerun Provider Smoke Test.";
  if (readiness.reason === "failed") return "Latest Provider Smoke Test failed safely. Review its provider diagnostics.";
  if (readiness.reason === "no_usable_approved_provider") return "Provider Smoke Test has no usable sample from an approved provider.";
  return "";
}
