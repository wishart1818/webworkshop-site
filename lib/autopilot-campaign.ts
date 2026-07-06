import {
  casualDmPlaybook,
  csvEscape,
  type OutreachQueueItem,
} from "@/lib/autonomous-growth";
import {
  allCoreServiceTradesOption,
  displayStateCode,
  displayTradeCategory,
  prospectSearchTypes,
  titleCaseLocation,
  tradeCategories,
  withAnalysis,
  seedProspects,
  type Prospect,
  type ProspectSearchType,
  type TopProspectTradeSelection,
} from "@/lib/prospect-engine";
import {
  estimatedProviderRequestLoad,
  parseTopProspectCityTargets,
  prepareTopProspectArtifacts,
  publicProspectPreviewLink,
  recommendedMarketPresets,
  type RecommendedMarketPreset,
  type TopProspectJob,
  type TopProspectInput,
  type ProspectMode,
} from "@/lib/top-prospects";

export const autopilotCampaignStatuses = ["draft", "running", "paused", "stopped", "finished"] as const;
export type AutopilotCampaignStatus = (typeof autopilotCampaignStatuses)[number];

export const autopilotDurations = ["run_once", "one_day", "three_days", "seven_days", "custom_runs"] as const;
export type AutopilotDuration = (typeof autopilotDurations)[number];

export const autopilotCadences = ["manual_only", "daily", "every_other_day", "weekly"] as const;
export type AutopilotCadence = (typeof autopilotCadences)[number];

export const autopilotOutreachStyles = ["manual_social_safe", "email_review_only", "loom_after_yes"] as const;
export type AutopilotOutreachStyle = (typeof autopilotOutreachStyles)[number];

export const autopilotQueueKeys = [
  "readyForManualDm",
  "needsPreviewReview",
  "loomNeeded",
  "emailDraftReady",
  "blockedBadFit",
  "needsHumanResearch",
] as const;
export type AutopilotQueueKey = (typeof autopilotQueueKeys)[number];

export const autopilotQueueLabels: Record<AutopilotQueueKey, string> = {
  readyForManualDm: "Ready for Manual DM",
  needsPreviewReview: "Needs Preview Review",
  loomNeeded: "Loom Needed",
  emailDraftReady: "Email Draft Ready",
  blockedBadFit: "Blocked / Bad Fit",
  needsHumanResearch: "Needs Human Research",
};

export const autopilotActionLabels = [
  "Start Autopilot",
  "Pause Autopilot",
  "Resume Autopilot",
  "Stop Autopilot",
  "Run next batch now",
  "Run Fake Smoke Test",
] as const;

export const autopilotCampaignDraftStorageKey = "webworkshop.autopilotCampaignDraft.v1";
export const topProspectsAutopilotPrefillStorageKey = "webworkshop.topProspectsAutopilotPrefill.v1";

export type AutopilotStopRules = {
  pauseOnProviderFailure: boolean;
  pauseOnBadFitRatePercent: number;
  pauseAfterWeakPreviewCount: number;
  stopWhenTotalProspectsReached: boolean;
};

export type AutopilotCampaignSettings = {
  campaignName: string;
  marketPresetId: string;
  customCities: string;
  state: string;
  trade: TopProspectTradeSelection;
  prospectType: ProspectSearchType;
  mode: ProspectMode;
  outreachStyle: AutopilotOutreachStyle;
  duration: AutopilotDuration;
  cadence: AutopilotCadence;
  maxProspectsPerRun: number;
  maxPreviewsPerRun: number;
  maxProspectsTotal: number;
  excludePreviouslyReviewed: boolean;
  requirePreviewQuality85: boolean;
  requireWrittenContact: boolean;
  manualDmMode: boolean;
  loomNotifications: boolean;
  stopRules: AutopilotStopRules;
};

export type AutopilotCampaignDraft = Partial<Pick<AutopilotCampaignSettings, "marketPresetId" | "customCities" | "state" | "trade" | "prospectType" | "mode">>;

export type AutopilotQueueCounts = Record<AutopilotQueueKey, number>;

export type AutopilotHandoffStatus =
  | "not_started"
  | "starting_top_prospects"
  | "top_prospects_running"
  | "completed"
  | "completed_with_warnings"
  | "failed_to_start"
  | "failed_during_discovery"
  | "cancelled";

export type AutopilotHandoffFailure = {
  phase: "validation" | "job_creation" | "active_job" | "polling" | "database" | "unknown";
  message: string;
  databaseConnected: boolean;
  activeJobId?: string;
  activeJobStatus?: string;
  attemptedMarket: string;
  attemptedCities: string;
  attemptedTrade: string;
  attemptedProspectMode: ProspectMode;
  attemptedProspectType: ProspectSearchType;
};

export type AutopilotTopProspectsPrefill = {
  city: string;
  state: string;
  trade: TopProspectTradeSelection;
  businessesToScan: number;
  finalProspectsWanted: number;
  prospectType: ProspectSearchType;
  mode: ProspectMode;
  workflowType: TopProspectInput["workflowType"];
  outreachPreference: TopProspectInput["outreachPreference"];
  excludePreviouslyReviewed: boolean;
};

export type AutopilotNotification = {
  id: string;
  level: "info" | "warning" | "success";
  title: string;
  body: string;
  createdAt: string;
};

export type AutopilotRunReport = {
  id: string;
  campaignId: string;
  status: "completed" | "needs_review" | "blocked";
  startedAt: string;
  completedAt: string;
  marketTargets: string[];
  providerRequestEstimate: number;
  prospectsDiscovered: number;
  prospectsQualified: number;
  packagesGenerated: number;
  queueCounts: AutopilotQueueCounts;
  failedCities: Array<{ city: string; reason: string }>;
  safetyFindings: string[];
  recommendations: string[];
  nextRunRecommendation: string;
  topProspectJobId?: string;
  topProspectJobStatus?: TopProspectJob["status"];
  handoffStatus?: AutopilotHandoffStatus;
  handoffFailure?: AutopilotHandoffFailure;
  providerDiagnostics?: AutopilotProviderActivity[];
  cityBreakdown?: AutopilotCityActivity[];
  blockedReasons?: Array<{ reason: string; count: number }>;
  fakeOnly?: boolean;
};

export const autopilotActivityStatuses = [
  "not_started",
  "running",
  "starting_top_prospects",
  "top_prospects_running",
  "completed",
  "completed_with_warnings",
  "paused",
  "failed",
  "failed_to_start",
  "failed_during_discovery",
  "cancelled",
] as const;
export type AutopilotActivityStatus = (typeof autopilotActivityStatuses)[number];

export type AutopilotActivityEntry = {
  id: string;
  level: "info" | "warning" | "error" | "success";
  label: string;
  detail: string;
  createdAt: string;
};

export type AutopilotProviderActivity = {
  provider: string;
  status: "not_recorded" | "succeeded" | "failed" | "timed_out" | "zero_results" | "fake_only";
  rawRecords: number;
  withinRadius: number;
  afterDeduplication: number;
  usableWebsites: number;
  detail: string;
};

export type AutopilotCityActivity = {
  city: string;
  status: "completed" | "failed" | "not_recorded";
  rawRecords: number;
  qualified: number;
  blocked: number;
  reason: string;
};

export type AutopilotActivitySnapshot = {
  status: AutopilotActivityStatus;
  topProspectJobId: string;
  currentStep: string;
  progressPercent: number;
  currentCity: string;
  currentTrade: string;
  currentProvider: string;
  rawRecordsFound: number;
  duplicatesRemoved: number;
  badFitLeadsBlocked: number;
  phoneOnlyLeadsBlocked: number;
  websitesScanned: number;
  previewsGenerated: number;
  previewsPassingQa: number;
  dmScriptsGenerated: number;
  emailDraftsGenerated: number;
  queueCounts: AutopilotQueueCounts;
  warnings: string[];
  errors: string[];
  lastUpdatedAt: string;
  fakeOnly: boolean;
  entries: AutopilotActivityEntry[];
  providerDiagnostics: AutopilotProviderActivity[];
  cityBreakdown: AutopilotCityActivity[];
  blockedReasons: Array<{ reason: string; count: number }>;
  queueRouting: Array<{ queue: AutopilotQueueKey; label: string; count: number }>;
  handoffDetails: Array<{ label: string; value: string }>;
  topProspectsPrefill: AutopilotTopProspectsPrefill;
  nextRecommendedRun: string;
};

export type AutopilotCampaign = {
  id: string;
  status: AutopilotCampaignStatus;
  settings: AutopilotCampaignSettings;
  queueCounts: AutopilotQueueCounts;
  notifications: AutopilotNotification[];
  latestRunReport: AutopilotRunReport | null;
  lastRunAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AutopilotDashboard = {
  campaign: AutopilotCampaign;
  queues: Record<AutopilotQueueKey, OutreachQueueItem[]>;
  activity: AutopilotActivitySnapshot;
  providerRequestEstimate: number;
  marketTargets: string[];
  databaseConfigured: boolean;
  queueCountsSource: "saved_queue" | "latest_run_report";
  safeModeSummary: string[];
  exportRows: Array<Record<string, string | number>>;
};

export type AutopilotSmokeTestResult = {
  passed: boolean;
  report: AutopilotRunReport;
  fixtureResults: Array<{
    businessName: string;
    expectedQueue: AutopilotQueueKey;
    actualQueue: AutopilotQueueKey;
    passed: boolean;
    reason: string;
  }>;
};

export const defaultAutopilotCampaignSettings: AutopilotCampaignSettings = {
  campaignName: "Manual-safe starter campaign",
  marketPresetId: "northwest-ohio",
  customCities: "",
  state: "OH",
  trade: "Landscaping",
  prospectType: "all",
  mode: "growth",
  outreachStyle: "manual_social_safe",
  duration: "run_once",
  cadence: "manual_only",
  maxProspectsPerRun: 100,
  maxPreviewsPerRun: 20,
  maxProspectsTotal: 20,
  excludePreviouslyReviewed: true,
  requirePreviewQuality85: true,
  requireWrittenContact: true,
  manualDmMode: true,
  loomNotifications: true,
  stopRules: {
    pauseOnProviderFailure: true,
    pauseOnBadFitRatePercent: 50,
    pauseAfterWeakPreviewCount: 3,
    stopWhenTotalProspectsReached: true,
  },
};

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function normalizeTrade(value: unknown): TopProspectTradeSelection {
  if (value === allCoreServiceTradesOption) return allCoreServiceTradesOption;
  return tradeCategories.find((trade) => trade === value) ?? defaultAutopilotCampaignSettings.trade;
}

function normalizeProspectType(value: unknown): ProspectSearchType {
  return prospectSearchTypes.includes(value as ProspectSearchType) ? value as ProspectSearchType : defaultAutopilotCampaignSettings.prospectType;
}

function normalizeMode(value: unknown): ProspectMode {
  return value === "strict" || value === "growth" || value === "volume" ? value : defaultAutopilotCampaignSettings.mode;
}

function normalizeDuration(value: unknown): AutopilotDuration {
  return autopilotDurations.includes(value as AutopilotDuration) ? value as AutopilotDuration : defaultAutopilotCampaignSettings.duration;
}

function normalizeCadence(value: unknown): AutopilotCadence {
  return autopilotCadences.includes(value as AutopilotCadence) ? value as AutopilotCadence : defaultAutopilotCampaignSettings.cadence;
}

function normalizeOutreachStyle(value: unknown): AutopilotOutreachStyle {
  return autopilotOutreachStyles.includes(value as AutopilotOutreachStyle) ? value as AutopilotOutreachStyle : defaultAutopilotCampaignSettings.outreachStyle;
}

function presetCitiesInput(preset: RecommendedMarketPreset) {
  return preset.cities.map((city) => `${titleCaseLocation(city.city)}, ${displayStateCode(city.state)}`).join("; ");
}

function presetState(preset: RecommendedMarketPreset) {
  if (!preset.cities.length) return "";
  const firstState = displayStateCode(preset.cities[0].state);
  return preset.cities.every((city) => displayStateCode(city.state) === firstState) ? firstState : "";
}

function stateName(value: string) {
  const state = displayStateCode(value);
  const names: Record<string, string> = {
    FL: "Florida",
    OH: "Ohio",
    TX: "Texas",
    NC: "North Carolina",
    SC: "South Carolina",
    TN: "Tennessee",
    GA: "Georgia",
    AZ: "Arizona",
    NV: "Nevada",
    CO: "Colorado",
    IN: "Indiana",
    MI: "Michigan",
  };
  return names[state] ?? state;
}

export function normalizeAutopilotCampaignSettings(input: Partial<AutopilotCampaignSettings> = {}): AutopilotCampaignSettings {
  const defaults = defaultAutopilotCampaignSettings;
  const stopRules: Partial<AutopilotStopRules> = input.stopRules ?? {};
  return {
    campaignName: typeof input.campaignName === "string" && input.campaignName.trim() ? input.campaignName.trim() : defaults.campaignName,
    marketPresetId: typeof input.marketPresetId === "string" ? input.marketPresetId.trim() : defaults.marketPresetId,
    customCities: typeof input.customCities === "string" ? input.customCities.trim() : defaults.customCities,
    state: displayStateCode(typeof input.state === "string" ? input.state : defaults.state),
    trade: normalizeTrade(input.trade),
    prospectType: normalizeProspectType(input.prospectType),
    mode: normalizeMode(input.mode),
    outreachStyle: normalizeOutreachStyle(input.outreachStyle),
    duration: normalizeDuration(input.duration),
    cadence: normalizeCadence(input.cadence),
    maxProspectsPerRun: boundedNumber(input.maxProspectsPerRun, defaults.maxProspectsPerRun, 5, 250),
    maxPreviewsPerRun: boundedNumber(input.maxPreviewsPerRun, defaults.maxPreviewsPerRun, 0, 50),
    maxProspectsTotal: boundedNumber(input.maxProspectsTotal, defaults.maxProspectsTotal, 1, 500),
    excludePreviouslyReviewed: input.excludePreviouslyReviewed !== false,
    requirePreviewQuality85: input.requirePreviewQuality85 !== false,
    requireWrittenContact: input.requireWrittenContact !== false,
    manualDmMode: input.manualDmMode !== false,
    loomNotifications: input.loomNotifications !== false,
    stopRules: {
      pauseOnProviderFailure: stopRules.pauseOnProviderFailure !== false,
      pauseOnBadFitRatePercent: boundedNumber(stopRules.pauseOnBadFitRatePercent, defaults.stopRules.pauseOnBadFitRatePercent, 10, 100),
      pauseAfterWeakPreviewCount: boundedNumber(stopRules.pauseAfterWeakPreviewCount, defaults.stopRules.pauseAfterWeakPreviewCount, 1, 25),
      stopWhenTotalProspectsReached: stopRules.stopWhenTotalProspectsReached !== false,
    },
  };
}

export function autopilotPresetFields(presetId: string): Pick<AutopilotCampaignSettings, "marketPresetId" | "customCities" | "state"> | null {
  const preset = recommendedMarketPresets.find((item) => item.id === presetId);
  if (!preset) return null;
  return {
    marketPresetId: preset.id,
    customCities: presetCitiesInput(preset),
    state: presetState(preset),
  };
}

export function autopilotDraftFromRecommendedMarket(preset: RecommendedMarketPreset, trade?: TopProspectTradeSelection): AutopilotCampaignDraft {
  const presetFields = autopilotPresetFields(preset.id) ?? {};
  return {
    ...presetFields,
    ...(trade ? { trade } : {}),
  };
}

function closestRecommendedPresetName(targetLabels: string[], excludedPresetId: string) {
  let best: { name: string; overlap: number } | null = null;
  const targetSet = new Set(targetLabels);
  for (const preset of recommendedMarketPresets) {
    if (preset.id === excludedPresetId) continue;
    const overlap = preset.cities.filter((city) => targetSet.has(`${titleCaseLocation(city.city)}, ${displayStateCode(city.state)}`)).length;
    if (!best || overlap > best.overlap) best = { name: preset.name, overlap };
  }
  return best && best.overlap >= Math.max(1, Math.ceil(targetLabels.length / 2)) ? best.name : "";
}

export function autopilotMarketMismatchWarning(settings: Pick<AutopilotCampaignSettings, "marketPresetId" | "customCities" | "state">) {
  const preset = recommendedMarketPresets.find((item) => item.id === settings.marketPresetId);
  if (!preset || !settings.customCities.trim()) return "";
  const presetLabels = new Set(preset.cities.map((city) => `${titleCaseLocation(city.city)}, ${displayStateCode(city.state)}`));
  const targets = parseTopProspectCityTargets(settings.customCities, settings.state);
  if (!targets.length) return "";
  const targetLabels = targets.map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`);
  const exactMatch = targetLabels.length === presetLabels.size && targetLabels.every((label) => presetLabels.has(label));
  if (exactMatch) return "";
  const likelyPreset = closestRecommendedPresetName(targetLabels, preset.id);
  if (likelyPreset) {
    return `Market preset is ${preset.name}, but Custom cities look like ${likelyPreset}. Update cities before starting.`;
  }
  const presetStates = new Set(preset.cities.map((city) => displayStateCode(city.state)));
  const targetStateCounts = targets.reduce<Record<string, number>>((counts, target) => {
    const state = displayStateCode(target.state);
    counts[state] = (counts[state] ?? 0) + 1;
    return counts;
  }, {});
  const dominantState = Object.entries(targetStateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (dominantState && !presetStates.has(dominantState)) {
    return `Market preset is ${preset.name}, but Custom cities appear to be ${stateName(dominantState)}. Update cities before starting.`;
  }
  return `Market preset is ${preset.name}, but Custom cities do not match that preset. Update cities before starting.`;
}

export function recommendedFirstAutopilotRunSettings(): AutopilotCampaignSettings {
  const floridaFields = autopilotPresetFields("florida") ?? {};
  return normalizeAutopilotCampaignSettings({
    ...defaultAutopilotCampaignSettings,
    ...floridaFields,
    trade: "Pressure Washing",
    duration: "run_once",
    cadence: "manual_only",
    maxProspectsPerRun: 100,
    maxPreviewsPerRun: 20,
    maxProspectsTotal: 20,
    outreachStyle: "manual_social_safe",
    excludePreviouslyReviewed: true,
    requirePreviewQuality85: true,
    requireWrittenContact: true,
    manualDmMode: true,
    loomNotifications: true,
    stopRules: {
      ...defaultAutopilotCampaignSettings.stopRules,
      pauseOnProviderFailure: false,
    },
  });
}

export function autopilotStartConfirmation(settings: AutopilotCampaignSettings) {
  const preset = recommendedMarketPresets.find((item) => item.id === settings.marketPresetId);
  const targets = autopilotMarketTargets(settings);
  const market = preset?.name ?? (targets.map((target) => target.label).join("; ") || "Custom market");
  return {
    market,
    citySummary: targets.map((target) => target.label).join("; "),
    trade: displayTradeCategory(settings.trade),
    duration: settings.duration === "run_once" ? "Run once" : settings.duration.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
    safety: "No outreach will be sent automatically.",
  };
}

export function autopilotMarketTargets(settings: AutopilotCampaignSettings) {
  const preset = recommendedMarketPresets.find((item) => item.id === settings.marketPresetId);
  const rawCityInput = settings.customCities || preset?.cities.map((city) => city.label).join("; ") || "Toledo";
  return parseTopProspectCityTargets(rawCityInput, settings.state);
}

export function autopilotProviderRequestEstimate(settings: AutopilotCampaignSettings) {
  const targets = autopilotMarketTargets(settings);
  return estimatedProviderRequestLoad(targets.length, settings.trade);
}

export function autopilotTopProspectInput(settings: AutopilotCampaignSettings): TopProspectInput {
  const targets = autopilotMarketTargets(settings);
  const cityInput = targets.map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`).join("; ");
  const finalProspectsWanted = Math.max(1, Math.min(25, settings.maxPreviewsPerRun || settings.maxProspectsTotal, settings.maxProspectsPerRun));
  return {
    trade: settings.trade,
    city: cityInput,
    rawCityInput: cityInput,
    cityTargets: targets,
    state: settings.state || targets[0]?.state || "OH",
    radiusKm: 50,
    businessesToScan: settings.maxProspectsPerRun,
    finalProspectsWanted,
    prospectType: settings.prospectType,
    mode: settings.mode,
    workflowType: settings.duration === "run_once" ? "search" : "morning_batch",
    outreachPreference: settings.requireWrittenContact ? "written_only" : "phone_allowed",
    excludePreviouslyReviewed: settings.excludePreviouslyReviewed,
  };
}

export function autopilotTopProspectsPrefill(settings: AutopilotCampaignSettings): AutopilotTopProspectsPrefill {
  const input = autopilotTopProspectInput(settings);
  return {
    city: input.city,
    state: displayStateCode(input.state),
    trade: input.trade,
    businessesToScan: input.businessesToScan,
    finalProspectsWanted: input.finalProspectsWanted,
    prospectType: input.prospectType,
    mode: input.mode,
    workflowType: input.workflowType,
    outreachPreference: input.outreachPreference,
    excludePreviouslyReviewed: input.excludePreviouslyReviewed,
  };
}

export function emptyAutopilotQueueCounts(): AutopilotQueueCounts {
  return {
    readyForManualDm: 0,
    needsPreviewReview: 0,
    loomNeeded: 0,
    emailDraftReady: 0,
    blockedBadFit: 0,
    needsHumanResearch: 0,
  };
}

export function autopilotQueueKeyForItem(item: Pick<OutreachQueueItem, "status" | "contactSource" | "previewQualityScore" | "blockedReason" | "email">): AutopilotQueueKey {
  if (["Bad Fit", "Blocked", "Never Contact", "Opted Out", "Skipped"].includes(item.status) || /bad fit|supplier|institution|duplicate|mismatch/i.test(item.blockedReason)) {
    return "blockedBadFit";
  }
  if (["Loom Needed", "Preview Needs Polish", "Ready for Loom", "Loom Recorded"].includes(item.status)) return "loomNeeded";
  if (!item.email && /phone|manual research/i.test(item.contactSource)) return "needsHumanResearch";
  if (item.previewQualityScore < 85 || item.status === "Needs Review" || item.status === "Draft") return "needsPreviewReview";
  if (/social|facebook|instagram|dm/i.test(item.contactSource) || item.status === "DM Draft" || item.status === "First DM Sent") return "readyForManualDm";
  return "emailDraftReady";
}

export function autopilotQueuesForItems(queue: OutreachQueueItem[]): Record<AutopilotQueueKey, OutreachQueueItem[]> {
  const groups: Record<AutopilotQueueKey, OutreachQueueItem[]> = {
    readyForManualDm: [],
    needsPreviewReview: [],
    loomNeeded: [],
    emailDraftReady: [],
    blockedBadFit: [],
    needsHumanResearch: [],
  };
  for (const item of queue) groups[autopilotQueueKeyForItem(item)].push(item);
  return groups;
}

export function autopilotQueueCountsForItems(queue: OutreachQueueItem[]): AutopilotQueueCounts {
  const queues = autopilotQueuesForItems(queue);
  return Object.fromEntries(autopilotQueueKeys.map((key) => [key, queues[key].length])) as AutopilotQueueCounts;
}

function campaignId(now = new Date()) {
  return `autopilot-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

export function createAutopilotCampaign(input: Partial<AutopilotCampaignSettings> = {}, now = new Date()): AutopilotCampaign {
  const settings = normalizeAutopilotCampaignSettings(input);
  const createdAt = now.toISOString();
  const marketCount = autopilotMarketTargets(settings).length;
  const requestEstimate = autopilotProviderRequestEstimate(settings);
  return {
    id: campaignId(now),
    status: "running",
    settings,
    queueCounts: emptyAutopilotQueueCounts(),
    notifications: [
      {
        id: `${campaignId(now)}-started`,
        level: "success",
        title: "Autopilot started safely",
        body: `Prepared ${marketCount} market target${marketCount === 1 ? "" : "s"} with an estimated ${requestEstimate} provider request${requestEstimate === 1 ? "" : "s"}. Nothing will be contacted automatically.`,
        createdAt,
      },
    ],
    latestRunReport: null,
    lastRunAt: "",
    createdAt,
    updatedAt: createdAt,
  };
}

export function transitionAutopilotCampaign(campaign: AutopilotCampaign, action: "pause" | "resume" | "stop", now = new Date()): AutopilotCampaign {
  const status: AutopilotCampaignStatus = action === "pause" ? "paused" : action === "resume" ? "running" : "stopped";
  return {
    ...campaign,
    status,
    notifications: [
      {
        id: `${campaign.id}-${action}-${now.getTime()}`,
        level: action === "stop" ? "warning" as const : "info" as const,
        title: `Autopilot ${action === "pause" ? "paused" : action === "resume" ? "resumed" : "stopped"}`,
        body: "Campaign state changed. No outreach was sent.",
        createdAt: now.toISOString(),
      },
      ...campaign.notifications,
    ].slice(0, 12),
    updatedAt: now.toISOString(),
  };
}

export function buildAutopilotRunReport(campaign: AutopilotCampaign, queue: OutreachQueueItem[], now = new Date(), fakeOnly = false): AutopilotRunReport {
  const settings = campaign.settings;
  const queueCounts = autopilotQueueCountsForItems(queue);
  const marketTargets = autopilotMarketTargets(settings).map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`);
  const providerRequestEstimate = autopilotProviderRequestEstimate(settings);
  const qualified = queueCounts.readyForManualDm + queueCounts.emailDraftReady + queueCounts.loomNeeded + queueCounts.needsPreviewReview;
  const safetyFindings = [
    "Automatic email, social DM, contact form, phone, and Loom sending stayed disabled.",
    settings.excludePreviouslyReviewed ? "Previously reviewed prospects are excluded by default." : "Previously reviewed prospects may be included because the setting is off.",
    settings.requireWrittenContact ? "Written contact is required before an item can be email-ready." : "Written contact requirement is off for this campaign.",
    settings.requirePreviewQuality85 ? "Preview QA threshold is 85+ before review-ready outreach." : "Preview QA threshold is not enforced by this campaign.",
  ];
  const recommendations = [
    queueCounts.needsHumanResearch > queueCounts.emailDraftReady ? "Try one starter trade with stronger written-contact coverage next, such as Cleaning, Painting, Pressure Washing, Landscaping, or Concrete." : "Review the email-ready and manual-DM queues before expanding the market.",
    providerRequestEstimate > 20 ? "This run may take longer and use more provider requests. Keep one trade selected for cleaner review quality." : "Provider load is modest for the next manual batch.",
    queueCounts.blockedBadFit > qualified ? "Bad-fit volume is high. Narrow the trade or use a smaller market preset before the next run." : "Qualification mix is usable. Keep the same trade and expand scan count if queue quality stays strong.",
  ];
  return {
    id: `run-${now.getTime()}`,
    campaignId: campaign.id,
    status: queueCounts.blockedBadFit > qualified ? "needs_review" : "completed",
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    marketTargets,
    providerRequestEstimate,
    prospectsDiscovered: queue.length,
    prospectsQualified: qualified,
    packagesGenerated: queue.filter((item) => item.previewLink || item.emailBody || item.dmScript).length,
    queueCounts,
    failedCities: [],
    safetyFindings,
    recommendations,
    nextRunRecommendation: recommendations[0],
    ...(fakeOnly ? { fakeOnly: true } : {}),
  };
}

function topProspectJobIsActive(status: TopProspectJob["status"]) {
  return ["QUEUED", "RUNNING", "NEEDS_NEXT_BATCH", "PARTIAL_RESULTS_READY"].includes(status);
}

function topProspectJobFailed(status: TopProspectJob["status"]) {
  return ["FAILED", "FAILED_AFTER_DISCOVERY"].includes(status);
}

function topProspectJobCompletedWithWarnings(status: TopProspectJob["status"]) {
  return ["COMPLETED_WITH_PARTIAL_RESULTS"].includes(status);
}

const providerLabels: Record<string, string> = {
  osm: "OpenStreetMap",
  azureMaps: "Azure Maps",
  googlePlaces: "Google Places",
  yelp: "Yelp",
};

function autopilotProviderStatus(status: string): AutopilotProviderActivity["status"] {
  if (status === "not_configured" || status === "rate_limited") return status === "rate_limited" ? "failed" : "not_recorded";
  if (status === "succeeded" || status === "failed" || status === "timed_out" || status === "zero_results") return status;
  return "not_recorded";
}

function topProspectProviderDiagnostics(job: TopProspectJob): AutopilotProviderActivity[] {
  const diagnostics = job.discoveryDiagnostics?.providerDiagnostics;
  if (!diagnostics) return [];
  return Object.entries(diagnostics).map(([provider, diagnostic]) => ({
    provider: providerLabels[provider] ?? provider,
    status: autopilotProviderStatus(diagnostic.status),
    rawRecords: diagnostic.returnedCount,
    withinRadius: diagnostic.withinRadiusCount,
    afterDeduplication: diagnostic.afterDeduplicationCount,
    usableWebsites: diagnostic.usableWebsiteCount,
    detail: diagnostic.queryExecuted === false
      ? "Provider query did not execute for this job."
      : diagnostic.status === "not_configured"
        ? "Provider key is not configured."
        : `Configured: ${diagnostic.configured === null ? "Not recorded" : diagnostic.configured ? "Yes" : "No"}. Query executed: ${diagnostic.queryExecuted === null ? "Not recorded" : diagnostic.queryExecuted ? "Yes" : "No"}.`,
  }));
}

function topProspectCityBreakdown(job: TopProspectJob): AutopilotCityActivity[] {
  const cityDiagnostics = job.discoveryDiagnostics?.cityDiagnostics;
  if (cityDiagnostics?.length) {
    return cityDiagnostics.map((city) => ({
      city: city.label,
      status: city.status === "partial" ? "completed" : city.status,
      rawRecords: city.rawProviderCount,
      qualified: city.qualifiedCount ?? city.returnedCount,
      blocked: city.skippedCount ?? 0,
      reason: city.safeReason || city.mainSkipReasons?.join(", ") || (city.status === "failed" ? "City discovery failed safely." : "Completed without a city-level failure."),
    }));
  }
  const targets = job.input.cityTargets?.length ? job.input.cityTargets : [];
  if (!targets.length) return [];
  return targets.map((target) => ({
    city: target.label,
    status: topProspectJobFailed(job.status) ? "failed" : "not_recorded",
    rawRecords: Math.round(job.discoveredCount / Math.max(1, targets.length)),
    qualified: Math.round((job.qualifiedCount || job.results.length) / Math.max(1, targets.length)),
    blocked: Math.round(job.skippedCount / Math.max(1, targets.length)),
    reason: topProspectJobFailed(job.status) ? (job.errorMessage || "Top Prospects discovery failed safely.") : "City-level diagnostics are not recorded yet.",
  }));
}

function topProspectQueueCounts(job: TopProspectJob): AutopilotQueueCounts {
  const counts = emptyAutopilotQueueCounts();
  const reviewable = job.results;
  for (const result of reviewable) {
    const prospect = result.prospect;
    const previewScore = prospect.preview?.qualityScore?.overall ?? 0;
    if (previewScore > 0 && previewScore < 85) {
      counts.needsPreviewReview += 1;
    } else if (/facebook|instagram/i.test(prospect.profileUrl || "") || prospect.classification === "social_only") {
      counts.readyForManualDm += 1;
    } else if (prospect.email || prospect.contactFormUrl) {
      counts.emailDraftReady += 1;
    } else if (prospect.phone) {
      counts.needsHumanResearch += 1;
    } else {
      counts.needsPreviewReview += 1;
    }
  }
  counts.blockedBadFit = Math.max(0, job.skippedCount + job.reviewedNotRecommended.length);
  return counts;
}

function packagesGeneratedFromTopProspectJob(job: TopProspectJob) {
  return [...job.results, ...job.reviewedNotRecommended].filter((result) => {
    const prospect = result.prospect;
    return Boolean(result.previewLink || result.buildPrompt || prospect.preview || prospect.outreach);
  }).length;
}

function reportStatusForTopProspectJob(job: TopProspectJob): AutopilotRunReport["status"] {
  if (topProspectJobFailed(job.status)) return "blocked";
  if (topProspectJobIsActive(job.status) || topProspectJobCompletedWithWarnings(job.status) || job.errorMessage) return "needs_review";
  return "completed";
}

function handoffStatusForTopProspectJob(job: TopProspectJob): AutopilotHandoffStatus {
  if (topProspectJobIsActive(job.status)) return "top_prospects_running";
  if (topProspectJobFailed(job.status)) return "failed_during_discovery";
  if (topProspectJobCompletedWithWarnings(job.status) || job.errorMessage) return "completed_with_warnings";
  return "completed";
}

export function buildAutopilotTopProspectJobReport(campaign: AutopilotCampaign, job: TopProspectJob, now = new Date()): AutopilotRunReport {
  const marketTargets = job.input.cityTargets?.length
    ? job.input.cityTargets.map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`)
    : autopilotMarketTargets(campaign.settings).map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`);
  const queueCounts = topProspectQueueCounts(job);
  const packagesGenerated = packagesGeneratedFromTopProspectJob(job);
  const handoffStatus = handoffStatusForTopProspectJob(job);
  const active = topProspectJobIsActive(job.status);
  const providerDiagnostics = topProspectProviderDiagnostics(job);
  const cityBreakdown = topProspectCityBreakdown(job);
  const blockedReasons = Object.entries(job.skipSummary)
    .filter(([, count]) => Number(count) > 0)
    .map(([reason, count]) => ({ reason: reason.replaceAll("_", " "), count: Number(count) }));
  const recommendations = job.nextRunRecommendations.length ? job.nextRunRecommendations : [
    active ? "Wait for the Top Prospects job to finish, then review the generated queue." : "Review the generated Top Prospects and outreach packages before the next run.",
  ];
  return {
    id: campaign.latestRunReport?.id ?? `run-${now.getTime()}`,
    campaignId: campaign.id,
    status: reportStatusForTopProspectJob(job),
    startedAt: campaign.latestRunReport?.startedAt ?? job.createdAt,
    completedAt: active ? "" : (job.completedAt ?? job.updatedAt ?? now.toISOString()),
    marketTargets,
    providerRequestEstimate: autopilotProviderRequestEstimate(campaign.settings),
    prospectsDiscovered: job.discoveredCount,
    prospectsQualified: job.qualifiedCount || job.results.length,
    packagesGenerated,
    queueCounts,
    failedCities: (job.discoveryDiagnostics?.cityDiagnostics ?? [])
      .filter((city) => city.status === "failed")
      .map((city) => ({ city: city.label, reason: city.safeReason || city.mainSkipReasons?.join(", ") || "City discovery failed safely." })),
    safetyFindings: [
      "Automatic email, social DM, contact form, phone, and Loom sending stayed disabled.",
      campaign.settings.requireWrittenContact ? "Written contact is required before send-ready review." : "Written contact requirement is off for this campaign.",
      "Autopilot used the protected Top Prospects job pipeline for discovery and analysis.",
    ],
    recommendations,
    nextRunRecommendation: recommendations[0] ?? "Review this Top Prospects run before starting another one.",
    topProspectJobId: job.id,
    topProspectJobStatus: job.status,
    handoffStatus,
    providerDiagnostics,
    cityBreakdown,
    blockedReasons,
  };
}

export function buildAutopilotHandoffFailureReport(campaign: AutopilotCampaign, failure: AutopilotHandoffFailure, now = new Date()): AutopilotRunReport {
  const recommendations = [
    failure.activeJobId ? "Wait for the active Top Prospects job to finish, refresh activity, then retry the Autopilot handoff." : "Retry Autopilot handoff, or open Top Prospects with the same settings and start the run there.",
    "No prospects were counted because the Top Prospects job did not start.",
  ];
  return {
    id: campaign.latestRunReport?.id ?? `run-${now.getTime()}`,
    campaignId: campaign.id,
    status: "blocked",
    startedAt: now.toISOString(),
    completedAt: now.toISOString(),
    marketTargets: autopilotMarketTargets(campaign.settings).map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`),
    providerRequestEstimate: autopilotProviderRequestEstimate(campaign.settings),
    prospectsDiscovered: 0,
    prospectsQualified: 0,
    packagesGenerated: 0,
    queueCounts: emptyAutopilotQueueCounts(),
    failedCities: [],
    safetyFindings: [
      "Automatic email, social DM, contact form, phone, and Loom sending stayed disabled.",
      "Autopilot stopped before discovery because the Top Prospects job did not start.",
    ],
    recommendations,
    nextRunRecommendation: recommendations[0],
    handoffStatus: "failed_to_start",
    handoffFailure: failure,
  };
}

export function attachAutopilotRunReport(campaign: AutopilotCampaign, report: AutopilotRunReport, now = new Date()): AutopilotCampaign {
  const runningHandoff = report.handoffStatus === "starting_top_prospects" || report.handoffStatus === "top_prospects_running";
  const failedStart = report.handoffStatus === "failed_to_start" || report.handoffStatus === "failed_during_discovery";
  return {
    ...campaign,
    status: runningHandoff ? "running" : report.status === "blocked" ? "paused" : "finished",
    queueCounts: report.queueCounts,
    latestRunReport: report,
    lastRunAt: report.completedAt,
    notifications: [
      {
        id: `${campaign.id}-run-${now.getTime()}`,
        level: failedStart ? "warning" as const : runningHandoff ? "info" as const : report.status === "blocked" ? "warning" as const : "success" as const,
        title: failedStart ? "Autopilot could not start Top Prospects job" : runningHandoff ? "Top Prospects job started" : report.fakeOnly ? "Fake Autopilot smoke test finished" : "Autopilot batch report is ready",
        body: failedStart
          ? `${report.handoffFailure?.message ?? "Top Prospects job did not start."} Nothing was sent.`
          : runningHandoff
            ? `Top Prospects job ${report.topProspectJobId} is running. Nothing will be sent automatically.`
            : `${report.prospectsQualified} reviewable prospect${report.prospectsQualified === 1 ? "" : "s"} sorted into safe queues. Nothing was sent.`,
        createdAt: now.toISOString(),
      },
      ...campaign.notifications,
    ].slice(0, 12),
    updatedAt: now.toISOString(),
  };
}

function fakeQueueItem(prospect: Prospect, overrides: Partial<OutreachQueueItem> = {}): OutreachQueueItem {
  const previewLink = overrides.previewLink ?? publicProspectPreviewLink("abcdefghijklmnopqrstuvwxyzABCDEF");
  const prepared = prepareTopProspectArtifacts(withAnalysis(prospect), previewLink).prospect;
  const playbook = casualDmPlaybook(prepared, previewLink);
  const now = new Date(0).toISOString();
  return {
    id: `fake-${prospect.id}`,
    prospectId: prospect.id,
    topProspectResultId: `fake-result-${prospect.id}`,
    businessName: prospect.businessName,
    trade: displayTradeCategory(prospect.trade),
    city: `${titleCaseLocation(prospect.city)}, ${displayStateCode(prospect.state)}`,
    website: prospect.website,
    email: prospect.email,
    contactSource: prospect.email ? "Public email" : prospect.contactFormUrl ? "Contact form" : /facebook|instagram/i.test(prospect.profileUrl) ? "Social profile" : prospect.phone ? "Phone" : "Manual research",
    contactConfidence: prospect.sourceConfidence,
    previewLink,
    previewQualityScore: prepared.preview?.qualityScore?.overall ?? 88,
    subjectLine: prepared.outreach?.subjects[0] ?? `A website idea for ${prospect.businessName}`,
    emailBody: prepared.outreach?.concise ?? "",
    dmScript: playbook.firstDm,
    loomTalkingPoints: playbook.loomScript,
    eligibilityReason: "Fake Autopilot smoke-test fixture.",
    blockedReason: "",
    reviewScore: 82,
    reviewSummary: "Fake fixture queued for review only.",
    improvementSuggestions: [],
    detectedIssues: [],
    recommendedNextAction: "Keep",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status: "Eligible",
    sourceProvider: "Fake Autopilot Smoke Test",
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function fakeAutopilotSmokeQueue() {
  const base = structuredClone(seedProspects[0]);
  return [
    fakeQueueItem({
      ...base,
      id: "fixture-pressure-washing-email",
      businessName: "Glass City Pressure Washing",
      trade: "Pressure Washing",
      city: "toledo",
      state: "oh",
      email: "owner@example.com",
      recommendedContactMethod: "send_email",
    } as Prospect, { status: "Eligible", previewQualityScore: 91 }),
    fakeQueueItem({
      ...base,
      id: "fixture-facebook-dm",
      businessName: "Sylvania Lawn Care",
      trade: "Landscaping",
      city: "sylvania",
      state: "oh",
      email: "",
      profileUrl: "https://facebook.com/sylvania-lawn-care",
      recommendedContactMethod: "message_on_facebook",
      classification: "social_only",
    } as Prospect, { status: "DM Draft", contactSource: "Social profile", email: "" }),
    fakeQueueItem({
      ...base,
      id: "fixture-weak-preview",
      businessName: "Perrysburg Painting Co",
      trade: "Painting",
      city: "perrysburg",
      state: "oh",
      email: "paint@example.com",
    } as Prospect, { status: "Needs Review", previewQualityScore: 74, detectedIssues: ["Preview quality is below 85."] }),
    fakeQueueItem({
      ...base,
      id: "fixture-supplier",
      businessName: "Toledo HVAC Equipment Supply",
      trade: "HVAC",
      city: "toledo",
      state: "oh",
      email: "sales@example.com",
    } as Prospect, { status: "Bad Fit", blockedReason: "Supplier/equipment distributor blocked." }),
    fakeQueueItem({
      ...base,
      id: "fixture-phone-only",
      businessName: "Maumee Concrete Repair",
      trade: "Concrete",
      city: "maumee",
      state: "oh",
      email: "",
      recommendedContactMethod: "call_first",
      classification: "phone_only",
    } as Prospect, { status: "Blocked", contactSource: "Phone", email: "", blockedReason: "Phone-only lead blocked by written outreach rules." }),
    fakeQueueItem({
      ...base,
      id: "fixture-loom-needed",
      businessName: "Bowling Green Cleaning",
      trade: "Cleaning",
      city: "bowling green",
      state: "oh",
      email: "hello@example.com",
    } as Prospect, { status: "Loom Needed", previewQualityScore: 92 }),
  ];
}

export function runFakeAutopilotSmokeTest(campaign: AutopilotCampaign, now = new Date()): AutopilotSmokeTestResult {
  const queue = fakeAutopilotSmokeQueue();
  const expectations: Array<[string, AutopilotQueueKey, string]> = [
    ["fixture-pressure-washing-email", "emailDraftReady", "Public email with strong preview becomes Email Draft Ready."],
    ["fixture-facebook-dm", "readyForManualDm", "Social lead becomes Manual DM ready, with no first-message link."],
    ["fixture-weak-preview", "needsPreviewReview", "Weak preview is held for review."],
    ["fixture-supplier", "blockedBadFit", "Supplier/equipment lead is blocked."],
    ["fixture-phone-only", "blockedBadFit", "Phone-only lead is blocked under written outreach rules."],
    ["fixture-loom-needed", "loomNeeded", "Prospect Said Yes style state stays in Loom Needed."],
  ];
  const fixtureResults = expectations.map(([id, expectedQueue, reason]) => {
    const item = queue.find((entry) => entry.prospectId === id);
    const actualQueue = item ? autopilotQueueKeyForItem(item) : "needsHumanResearch";
    return {
      businessName: item?.businessName ?? id,
      expectedQueue,
      actualQueue,
      passed: actualQueue === expectedQueue,
      reason,
    };
  });
  const report = buildAutopilotRunReport(campaign, queue, now, true);
  return {
    passed: fixtureResults.every((item) => item.passed)
      && queue.every((item) => !/https?:\/\/|\/p\//i.test(item.dmScript) || item.status !== "DM Draft")
      && report.safetyFindings.some((finding) => /disabled/i.test(finding)),
    report,
    fixtureResults,
  };
}

function countPhoneOnlyBlocked(queue: OutreachQueueItem[]) {
  return queue.filter((item) => {
    const text = `${item.contactSource} ${item.blockedReason} ${item.status}`.toLowerCase();
    return text.includes("phone") && (text.includes("blocked") || item.status === "Blocked" || item.status === "Bad Fit");
  }).length;
}

function countPreviewsPassingQa(queue: OutreachQueueItem[], report: AutopilotRunReport) {
  if (!queue.length) return Math.min(report.packagesGenerated, report.queueCounts.emailDraftReady + report.queueCounts.readyForManualDm + report.queueCounts.loomNeeded);
  return queue.filter((item) => item.previewLink && Number(item.previewQualityScore) >= 85).length;
}

function blockedReasonsForQueue(queue: OutreachQueueItem[], report: AutopilotRunReport) {
  if (report.blockedReasons?.length) return report.blockedReasons;
  const counts = new Map<string, number>();
  for (const item of queue) {
    const queueKey = autopilotQueueKeyForItem(item);
    if (queueKey !== "blockedBadFit") continue;
    const reason = item.blockedReason || item.detectedIssues?.[0] || "Blocked by safety or fit rules";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  if (!counts.size && report.queueCounts.blockedBadFit) {
    counts.set(report.fakeOnly ? "Fake blocked fixture, no outreach sent" : "Blocked by safety or fit rules", report.queueCounts.blockedBadFit);
  }
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

function providerDiagnosticsForQueue(queue: OutreachQueueItem[], report: AutopilotRunReport): AutopilotProviderActivity[] {
  if (report.providerDiagnostics?.length) return report.providerDiagnostics;
  if (report.fakeOnly) {
    return [{
      provider: "Fake Smoke Test",
      status: "fake_only",
      rawRecords: report.prospectsDiscovered,
      withinRadius: report.prospectsDiscovered,
      afterDeduplication: report.prospectsDiscovered,
      usableWebsites: report.packagesGenerated,
      detail: "Uses fake leads only. No provider calls. No outreach.",
    }];
  }
  const grouped = new Map<string, OutreachQueueItem[]>();
  for (const item of queue) {
    const provider = item.sourceProvider || "Not recorded";
    grouped.set(provider, [...(grouped.get(provider) ?? []), item]);
  }
  if (!grouped.size) {
    return [{
      provider: "Top Prospects discovery",
      status: "not_recorded",
      rawRecords: report.prospectsDiscovered,
      withinRadius: report.prospectsDiscovered,
      afterDeduplication: report.prospectsDiscovered,
      usableWebsites: report.packagesGenerated,
      detail: "Provider-level diagnostics were not recorded for this Autopilot summary.",
    }];
  }
  return [...grouped.entries()].map(([provider, items]) => ({
    provider,
    status: items.length ? "succeeded" : "zero_results",
    rawRecords: items.length,
    withinRadius: items.length,
    afterDeduplication: items.length,
    usableWebsites: items.filter((item) => Boolean(item.website)).length,
    detail: "Counts are summarized from saved queue items for this run.",
  }));
}

function cityBreakdownForReport(campaign: AutopilotCampaign, queue: OutreachQueueItem[], report: AutopilotRunReport): AutopilotCityActivity[] {
  if (report.cityBreakdown?.length) return report.cityBreakdown;
  const failed = new Map(report.failedCities.map((city) => [city.city, city.reason]));
  const queueByCity = new Map<string, OutreachQueueItem[]>();
  for (const item of queue) {
    const city = item.city || "Not recorded";
    queueByCity.set(city, [...(queueByCity.get(city) ?? []), item]);
  }
  const targets = report.marketTargets.length ? report.marketTargets : autopilotMarketTargets(campaign.settings).map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`);
  if (!targets.length) {
    return [{
      city: "Not recorded",
      status: "not_recorded",
      rawRecords: report.prospectsDiscovered,
      qualified: report.prospectsQualified,
      blocked: report.queueCounts.blockedBadFit,
      reason: "City breakdown was not recorded for this run.",
    }];
  }
  return targets.map((city) => {
    const items = queueByCity.get(city) ?? [];
    const failedReason = failed.get(city);
    return {
      city,
      status: failedReason ? "failed" as const : "completed" as const,
      rawRecords: items.length || Math.round(report.prospectsDiscovered / targets.length),
      qualified: items.length ? items.filter((item) => autopilotQueueKeyForItem(item) !== "blockedBadFit").length : Math.round(report.prospectsQualified / targets.length),
      blocked: items.length ? items.filter((item) => autopilotQueueKeyForItem(item) === "blockedBadFit").length : Math.round(report.queueCounts.blockedBadFit / targets.length),
      reason: failedReason ?? "Completed without a city-level failure.",
    };
  });
}

function handoffDetailsForReport(report: AutopilotRunReport): Array<{ label: string; value: string }> {
  const failure = report.handoffFailure;
  return [
    { label: "Database connected", value: failure ? (failure.databaseConnected ? "Yes" : "No") : "Not recorded" },
    { label: "Top Prospects job ID", value: report.topProspectJobId || failure?.activeJobId || "Not created" },
    { label: "Job status", value: report.topProspectJobStatus || failure?.activeJobStatus || "Not recorded" },
    { label: "Failure phase", value: failure?.phase ?? "Not recorded" },
    { label: "Attempted market", value: failure?.attemptedMarket || report.marketTargets.join("; ") || "Not recorded" },
    { label: "Attempted cities", value: failure?.attemptedCities || report.marketTargets.join("; ") || "Not recorded" },
    { label: "Attempted trade", value: failure?.attemptedTrade || "Not recorded" },
    { label: "Attempted prospect mode", value: failure?.attemptedProspectMode || "Not recorded" },
    { label: "Attempted prospect type", value: failure?.attemptedProspectType || "Not recorded" },
  ];
}

function activityEntriesForReport(campaign: AutopilotCampaign, report: AutopilotRunReport, queue: OutreachQueueItem[]): AutopilotActivityEntry[] {
  const startedAt = report.startedAt;
  const providerDiagnostics = providerDiagnosticsForQueue(queue, report);
  if (report.handoffStatus === "failed_to_start") {
    const failure = report.handoffFailure;
    return [
      {
        id: `${report.id}-start`,
        level: "info",
        label: "Starting Top Prospects job",
        detail: `Attempted ${failure?.attemptedTrade ?? displayTradeCategory(campaign.settings.trade)} for ${failure?.attemptedMarket ?? (report.marketTargets.join("; ") || "the selected market")}. Nothing was sent.`,
        createdAt: startedAt,
      },
      {
        id: `${report.id}-handoff-failed`,
        level: "error",
        label: "Autopilot could not start Top Prospects job",
        detail: failure?.message ?? "The protected Top Prospects job did not start.",
        createdAt: report.completedAt,
      },
      {
        id: `${report.id}-counts-zero`,
        level: "warning",
        label: "Run report stayed at 0 because no job ran",
        detail: "0 records means the handoff failed before discovery, not that no prospects were found.",
        createdAt: report.completedAt,
      },
    ];
  }
  const entries: AutopilotActivityEntry[] = [
    {
      id: `${report.id}-start`,
      level: "info",
      label: report.fakeOnly ? "Fake Smoke Test Activity — no providers, no outreach." : "Starting Autopilot campaign",
      detail: report.fakeOnly ? "Fake fixtures are sorted into review queues only." : "Campaign prepared prospects, previews, scripts, and queues. Nothing was sent.",
      createdAt: startedAt,
    },
    {
      id: `${report.id}-cities`,
      level: "info",
      label: `Parsed ${report.marketTargets.length || autopilotMarketTargets(campaign.settings).length} cities`,
      detail: report.marketTargets.join(", ") || "No market targets were recorded.",
      createdAt: startedAt,
    },
    {
      id: `${report.id}-requests`,
      level: report.providerRequestEstimate > 20 ? "warning" : "info",
      label: `Estimated ${report.providerRequestEstimate} provider requests`,
      detail: report.providerRequestEstimate > 20 ? "This may take longer and use more provider requests." : "Provider request load is modest.",
      createdAt: startedAt,
    },
  ];
  for (const target of report.marketTargets.slice(0, 8)) {
    entries.push({
      id: `${report.id}-city-${target}`,
      level: "info",
      label: `Searching ${target}`,
      detail: `${campaign.settings.trade} search target queued for safe discovery.`,
      createdAt: startedAt,
    });
  }
  for (const provider of providerDiagnostics) {
    entries.push({
      id: `${report.id}-provider-${provider.provider}`,
      level: provider.status === "failed" || provider.status === "timed_out" ? "error" : provider.status === "zero_results" ? "warning" : "success",
      label: `${provider.provider} returned ${provider.rawRecords} records`,
      detail: provider.detail,
      createdAt: report.completedAt,
    });
  }
  const phoneOnly = countPhoneOnlyBlocked(queue);
  entries.push(
    {
      id: `${report.id}-dedupe`,
      level: "info",
      label: "Removed 0 duplicates",
      detail: "Duplicate removal count was not recorded separately for this Autopilot summary.",
      createdAt: report.completedAt,
    },
    {
      id: `${report.id}-blocked`,
      level: report.queueCounts.blockedBadFit ? "warning" : "success",
      label: `Blocked ${report.queueCounts.blockedBadFit} bad-fit or unsafe leads`,
      detail: phoneOnly ? `${phoneOnly} phone-only lead${phoneOnly === 1 ? "" : "s"} blocked under written outreach rules.` : "Written outreach safety rules stayed active.",
      createdAt: report.completedAt,
    },
    {
      id: `${report.id}-scan`,
      level: "info",
      label: `Scanning ${queue.filter((item) => Boolean(item.website)).length || report.packagesGenerated} websites`,
      detail: "Website and preview work stayed in review-only queues.",
      createdAt: report.completedAt,
    },
    {
      id: `${report.id}-previews`,
      level: "success",
      label: `Generated ${report.packagesGenerated} previews`,
      detail: `${countPreviewsPassingQa(queue, report)} preview${countPreviewsPassingQa(queue, report) === 1 ? "" : "s"} passed QA or were routed for review.`,
      createdAt: report.completedAt,
    },
    {
      id: `${report.id}-scripts`,
      level: "success",
      label: `Created ${report.queueCounts.readyForManualDm} manual DM scripts and ${report.queueCounts.emailDraftReady} email drafts`,
      detail: "Drafts require human review. No outreach was sent.",
      createdAt: report.completedAt,
    },
    {
      id: `${report.id}-finish`,
      level: report.handoffStatus === "top_prospects_running" || report.handoffStatus === "starting_top_prospects" ? "info" : report.status === "completed" ? "success" : report.status === "blocked" ? "error" : "warning",
      label: report.handoffStatus === "top_prospects_running" || report.handoffStatus === "starting_top_prospects" ? "Top Prospects job is still running" : report.handoffStatus === "failed_during_discovery" ? "Top Prospects job failed during discovery" : report.status === "blocked" ? "Autopilot run failed" : report.status === "needs_review" ? "Finished run with warnings" : "Finished run",
      detail: report.nextRunRecommendation,
      createdAt: report.completedAt,
    },
  );
  return entries;
}

function autopilotActivityStatus(campaign: AutopilotCampaign, report: AutopilotRunReport | null): AutopilotActivityStatus {
  if (!report) {
    if (campaign.status === "running") return "running";
    if (campaign.status === "paused") return "paused";
    return "not_started";
  }
  if (report.handoffStatus === "starting_top_prospects") return "starting_top_prospects";
  if (report.handoffStatus === "top_prospects_running") return "top_prospects_running";
  if (report.handoffStatus === "failed_to_start") return "failed_to_start";
  if (report.handoffStatus === "failed_during_discovery") return "failed_during_discovery";
  if (report.handoffStatus === "cancelled") return "cancelled";
  if (report.handoffStatus === "completed_with_warnings") return "completed_with_warnings";
  if (report.handoffStatus === "completed") return "completed";
  if (report.status === "blocked") return "failed";
  if (campaign.status === "paused") return "paused";
  if (report.status === "needs_review" || report.failedCities.length) return "completed_with_warnings";
  return "completed";
}

function currentStepForActivity(status: AutopilotActivityStatus, report: AutopilotRunReport) {
  if (status === "failed_to_start") return "Top Prospects job did not start";
  if (status === "starting_top_prospects") return "Starting Top Prospects job";
  if (status === "top_prospects_running") return "Top Prospects job running";
  if (status === "failed_during_discovery") return "Top Prospects job failed during discovery";
  if (status === "cancelled") return "Autopilot was cancelled or stopped";
  if (status === "completed_with_warnings") return "Run finished with warnings";
  if (status === "completed") return "Run finished, review queues are ready";
  if (report.status === "blocked") return "Run stopped by a blocking rule";
  return "Run finished with warnings";
}

function buildAutopilotActivity(campaign: AutopilotCampaign, queue: OutreachQueueItem[], now = new Date()): AutopilotActivitySnapshot {
  const report = campaign.latestRunReport;
  const queueCounts = report?.queueCounts ?? campaign.queueCounts;
  const queueRouting = autopilotQueueKeys.map((key) => ({ queue: key, label: autopilotQueueLabels[key], count: queueCounts[key] }));
  const prefill = autopilotTopProspectsPrefill(campaign.settings);
  if (!report) {
    return {
      status: autopilotActivityStatus(campaign, null),
      topProspectJobId: "",
      currentStep: campaign.status === "running" ? "Waiting for the first activity update" : "No Autopilot run has started",
      progressPercent: campaign.status === "running" ? 10 : 0,
      currentCity: "",
      currentTrade: displayTradeCategory(campaign.settings.trade),
      currentProvider: "",
      rawRecordsFound: 0,
      duplicatesRemoved: 0,
      badFitLeadsBlocked: 0,
      phoneOnlyLeadsBlocked: 0,
      websitesScanned: 0,
      previewsGenerated: 0,
      previewsPassingQa: 0,
      dmScriptsGenerated: 0,
      emailDraftsGenerated: 0,
      queueCounts,
      warnings: [],
      errors: [],
      lastUpdatedAt: campaign.updatedAt || now.toISOString(),
      fakeOnly: false,
      entries: [{
        id: `${campaign.id}-activity-empty`,
        level: "info",
        label: "No Autopilot activity yet. Start Autopilot or run the fake smoke test to see live steps.",
        detail: "This panel will show discovery, filtering, preview, script, and queue routing progress.",
        createdAt: campaign.updatedAt || now.toISOString(),
      }],
      providerDiagnostics: [],
      cityBreakdown: [],
      blockedReasons: [],
      queueRouting,
      handoffDetails: [],
      topProspectsPrefill: prefill,
      nextRecommendedRun: "Start Autopilot or run the fake smoke test to generate activity.",
    };
  }
  const providerDiagnostics = providerDiagnosticsForQueue(queue, report);
  const phoneOnlyLeadsBlocked = countPhoneOnlyBlocked(queue);
  const status = autopilotActivityStatus(campaign, report);
  const warnings = [
    ...(status === "top_prospects_running" || status === "starting_top_prospects" ? ["Top Prospects job is still running. Counts will update as discovery and scanning progress."] : []),
    ...(report.status === "needs_review" ? ["Run completed with warnings and needs review."] : []),
    ...report.failedCities.map((city) => `${city.city}: ${city.reason}`),
  ];
  const errors = report.handoffStatus === "failed_to_start"
    ? [report.handoffFailure?.message ?? "Top Prospects job did not start."]
    : report.handoffStatus === "failed_during_discovery"
      ? [report.nextRunRecommendation]
      : report.status === "blocked" ? ["Run failed or paused by a blocking rule."] : [];
  const runningJob = status === "starting_top_prospects" || status === "top_prospects_running";
  return {
    status,
    topProspectJobId: report.topProspectJobId ?? "",
    currentStep: currentStepForActivity(status, report),
    progressPercent: runningJob ? (report.prospectsDiscovered ? 55 : 25) : 100,
    currentCity: report.marketTargets.at(-1) ?? "",
    currentTrade: displayTradeCategory(campaign.settings.trade),
    currentProvider: providerDiagnostics.at(-1)?.provider ?? "",
    rawRecordsFound: report.prospectsDiscovered,
    duplicatesRemoved: 0,
    badFitLeadsBlocked: Math.max(0, report.queueCounts.blockedBadFit - phoneOnlyLeadsBlocked),
    phoneOnlyLeadsBlocked,
    websitesScanned: queue.filter((item) => Boolean(item.website)).length || report.packagesGenerated,
    previewsGenerated: report.packagesGenerated,
    previewsPassingQa: countPreviewsPassingQa(queue, report),
    dmScriptsGenerated: queue.filter((item) => Boolean(item.dmScript)).length || report.queueCounts.readyForManualDm,
    emailDraftsGenerated: queue.filter((item) => Boolean(item.emailBody)).length || report.queueCounts.emailDraftReady,
    queueCounts,
    warnings,
    errors,
    lastUpdatedAt: report.completedAt || campaign.updatedAt || now.toISOString(),
    fakeOnly: Boolean(report.fakeOnly),
    entries: activityEntriesForReport(campaign, report, queue),
    providerDiagnostics,
    cityBreakdown: cityBreakdownForReport(campaign, queue, report),
    blockedReasons: blockedReasonsForQueue(queue, report),
    queueRouting,
    handoffDetails: handoffDetailsForReport(report),
    topProspectsPrefill: prefill,
    nextRecommendedRun: report.nextRunRecommendation,
  };
}

export function buildAutopilotDashboard(campaign: AutopilotCampaign, queue: OutreachQueueItem[], databaseConfigured = false): AutopilotDashboard {
  const queues = autopilotQueuesForItems(queue);
  const liveQueueCounts = autopilotQueueCountsForItems(queue);
  const reportQueueCounts = campaign.latestRunReport?.queueCounts;
  const queueCounts = reportQueueCounts ?? liveQueueCounts;
  const marketTargets = autopilotMarketTargets(campaign.settings).map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`);
  return {
    campaign: { ...campaign, queueCounts },
    queues,
    activity: buildAutopilotActivity({ ...campaign, queueCounts }, queue),
    providerRequestEstimate: autopilotProviderRequestEstimate(campaign.settings),
    marketTargets,
    databaseConfigured,
    queueCountsSource: reportQueueCounts ? "latest_run_report" : "saved_queue",
    safeModeSummary: [
      "Manual/social-safe mode is the default.",
      "The first Facebook DM never includes a preview link.",
      "Loom recording and Loom sending are manual tasks.",
      "No email, form, social, phone, or Loom outreach is sent automatically.",
    ],
    exportRows: queue.map((item) => ({
      businessName: item.businessName,
      trade: item.trade,
      city: item.city,
      queue: autopilotQueueLabels[autopilotQueueKeyForItem(item)],
      previewLink: item.previewLink,
      contactSource: item.contactSource,
      status: item.status,
      blockedReason: item.blockedReason,
    })),
  };
}

export function autopilotQueueCsv(rows: AutopilotDashboard["exportRows"]) {
  const headers = ["business name", "trade", "city", "autopilot queue", "preview link", "contact source", "status", "blocked reason"];
  return [
    headers,
    ...rows.map((row) => [
      row.businessName,
      row.trade,
      row.city,
      row.queue,
      row.previewLink,
      row.contactSource,
      row.status,
      row.blockedReason,
    ]),
  ].map((row) => row.map((cell) => csvEscape(String(cell ?? ""))).join(",")).join("\n");
}
