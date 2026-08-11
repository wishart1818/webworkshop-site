import { allCoreServiceTradesOption, prospectSearchTypes, tradeCategories, type ProspectSearchType } from "@/lib/prospect-engine";
import {
  type OutreachPreference,
  type ProspectMode,
  type TopProspectJob,
  type TopProspectWorkflowType,
} from "@/lib/top-prospects";

export const topProspectSearchSettingsStorageKey = "webworkshop-top-prospect-search-settings-v1";

export type TopProspectFormSettings = {
  prospectType: ProspectSearchType;
  mode: ProspectMode;
  workflowType: TopProspectWorkflowType;
  outreachPreference: OutreachPreference;
  trade: TopProspectJob["input"]["trade"];
  city: string;
  state: string;
  radiusKm: 10 | 25 | 50;
  businessesToScan: number;
  finalProspectsWanted: number;
  excludePreviouslyReviewed: boolean;
};

const prospectModes = new Set<ProspectMode>(["strict", "growth", "volume"]);
const workflowTypes = new Set<TopProspectWorkflowType>(["search", "morning_batch"]);
const outreachPreferences = new Set<OutreachPreference>(["written_only", "phone_allowed"]);
const allowedTrades = new Set<TopProspectJob["input"]["trade"]>([allCoreServiceTradesOption, ...tradeCategories]);
const allowedProspectTypes = new Set<ProspectSearchType>(prospectSearchTypes);
const allowedRadii = new Set([10, 25, 50] as const);

function boundedInteger(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : undefined;
}

export function normalizeTopProspectFormSettings(value: unknown): Partial<TopProspectFormSettings> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  const candidate = value as Partial<Record<keyof TopProspectFormSettings, unknown>>;
  const normalized: Partial<TopProspectFormSettings> = {};

  if (typeof candidate.prospectType === "string" && allowedProspectTypes.has(candidate.prospectType as ProspectSearchType)) {
    normalized.prospectType = candidate.prospectType as ProspectSearchType;
  }
  if (typeof candidate.mode === "string" && prospectModes.has(candidate.mode as ProspectMode)) {
    normalized.mode = candidate.mode as ProspectMode;
  }
  if (typeof candidate.workflowType === "string" && workflowTypes.has(candidate.workflowType as TopProspectWorkflowType)) {
    normalized.workflowType = candidate.workflowType as TopProspectWorkflowType;
  }
  if (typeof candidate.outreachPreference === "string" && outreachPreferences.has(candidate.outreachPreference as OutreachPreference)) {
    normalized.outreachPreference = candidate.outreachPreference as OutreachPreference;
  }
  if (typeof candidate.trade === "string" && allowedTrades.has(candidate.trade as TopProspectJob["input"]["trade"])) {
    normalized.trade = candidate.trade as TopProspectJob["input"]["trade"];
  }
  if (typeof candidate.city === "string" && candidate.city.trim().length <= 1_000) normalized.city = candidate.city;
  if (typeof candidate.state === "string" && /^[A-Za-z]{2}$/.test(candidate.state.trim())) normalized.state = candidate.state.trim().toUpperCase();

  const radiusKm = Number(candidate.radiusKm);
  if (allowedRadii.has(radiusKm as 10 | 25 | 50)) normalized.radiusKm = radiusKm as 10 | 25 | 50;
  const businessesToScan = boundedInteger(candidate.businessesToScan, 5, 250);
  if (businessesToScan !== undefined) normalized.businessesToScan = businessesToScan;
  const finalProspectsWanted = boundedInteger(candidate.finalProspectsWanted, 1, 25);
  if (finalProspectsWanted !== undefined) normalized.finalProspectsWanted = finalProspectsWanted;
  if (typeof candidate.excludePreviouslyReviewed === "boolean") normalized.excludePreviouslyReviewed = candidate.excludePreviouslyReviewed;

  return normalized;
}

export function parseTopProspectFormSettings(raw: string | null) {
  if (!raw) return null;
  try {
    return normalizeTopProspectFormSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}
