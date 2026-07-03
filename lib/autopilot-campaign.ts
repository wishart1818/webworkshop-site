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

export type AutopilotQueueCounts = Record<AutopilotQueueKey, number>;

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
  fakeOnly?: boolean;
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

export function attachAutopilotRunReport(campaign: AutopilotCampaign, report: AutopilotRunReport, now = new Date()): AutopilotCampaign {
  return {
    ...campaign,
    queueCounts: report.queueCounts,
    latestRunReport: report,
    lastRunAt: report.completedAt,
    notifications: [
      {
        id: `${campaign.id}-run-${now.getTime()}`,
        level: report.status === "blocked" ? "warning" as const : "success" as const,
        title: report.fakeOnly ? "Fake Autopilot smoke test finished" : "Autopilot batch report is ready",
        body: `${report.prospectsQualified} reviewable prospect${report.prospectsQualified === 1 ? "" : "s"} sorted into safe queues. Nothing was sent.`,
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

export function buildAutopilotDashboard(campaign: AutopilotCampaign, queue: OutreachQueueItem[], databaseConfigured = false): AutopilotDashboard {
  const queues = autopilotQueuesForItems(queue);
  const liveQueueCounts = autopilotQueueCountsForItems(queue);
  const reportQueueCounts = campaign.latestRunReport?.queueCounts;
  const queueCounts = reportQueueCounts ?? liveQueueCounts;
  const marketTargets = autopilotMarketTargets(campaign.settings).map((target) => `${titleCaseLocation(target.city)}, ${displayStateCode(target.state)}`);
  return {
    campaign: { ...campaign, queueCounts },
    queues,
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
