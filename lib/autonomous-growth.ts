import {
  displayTradeCategory,
  OUTREACH_COPY_VERSION,
  normalizeTradeCategory,
  outreachComplianceFooter,
  prospectEmailNeedsManualVerification,
  prospectWrittenContactMethodIsUsable,
  type PreviewConcept,
  type Prospect,
  type TradeCategory,
} from "@/lib/prospect-engine";
import {
  evaluateOutreachEmailQuality,
  publicProspectPreviewLink,
  validPublicPreviewToken,
  type OutreachEmailQuality,
  type OutreachPreference,
  type TopProspectJob,
  type TopProspectResult,
} from "@/lib/top-prospects";
import {
  prospectCurrentBucket,
  prospectFunnelLabels,
  type ProspectExclusiveBucketKey,
} from "@/lib/prospect-funnel";

export const autonomousGrowthModes = ["off", "dry_run", "manual_approval", "auto_email_pilot"] as const;
export type AutonomousGrowthMode = (typeof autonomousGrowthModes)[number];

export const autonomousGrowthModeLabels: Record<AutonomousGrowthMode, string> = {
  off: "Off",
  dry_run: "Dry Run",
  manual_approval: "Manual Approval",
  auto_email_pilot: "Auto Email Pilot",
};

export const outreachQueueStatuses = [
  "Draft",
  "Eligible",
  "Needs Review",
  "DM Draft",
  "First DM Sent",
  "Prospect Said Yes",
  "Loom Needed",
  "Preview Needs Polish",
  "Ready for Loom",
  "Loom Recorded",
  "Loom Sent",
  "Pricing Requested",
  "Pricing Sent",
  "Queued",
  "Sent",
  "Follow-up Needed",
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
  "Skipped",
  "Never Contact",
  "Bad Fit",
  "Blocked",
] as const;
export type OutreachQueueStatus = (typeof outreachQueueStatuses)[number];

export type AutonomousGrowthSettings = {
  mode: AutonomousGrowthMode;
  killSwitch: boolean;
  targetCities: string[];
  targetServiceAreas: string[];
  targetTrades: TradeCategory[];
  excludedTrades: TradeCategory[];
  maxProspectsScannedPerDay: number;
  maxPreviewsGeneratedPerDay: number;
  maxEmailsQueuedPerDay: number;
  maxEmailsSentPerDay: number;
  emailCooldownMinutes: number;
  followUpsEnabled: boolean;
  styleProfiles: Record<string, AutonomousStyleProfile>;
  updatedAt?: string;
};

export type AutonomousStyleProfile = {
  name: string;
  direction: string;
  strengths: string[];
  cautions: string[];
};

export const autonomousFeedbackLabels = [
  "Good lead",
  "Bad lead",
  "Preview looked good",
  "Preview looked bad",
  "Outreach sounded good",
  "Outreach sounded too AI-ish",
  "Replied",
  "Positive reply",
  "Not interested",
  "Too expensive",
  "Already has provider",
  "Wants website later",
  "No response",
  "Wrong contact",
  "Bad fit",
  "Never contact",
] as const;
export type AutonomousFeedbackLabel = (typeof autonomousFeedbackLabels)[number];

export const autonomousNextActions = [
  "Keep",
  "Regenerate Preview",
  "Rewrite Outreach",
  "Needs Human Review",
  "Skip",
  "Bad Fit",
  "Never Contact",
] as const;
export type AutonomousNextAction = (typeof autonomousNextActions)[number];

export type PreviewQualityGate = {
  status: "Eligible" | "Needs Review" | "Blocked";
  score: number;
  checks: Array<{ key: string; label: string; passed: boolean; reason?: string }>;
  reasons: string[];
};

export type AutoSendEligibility = {
  eligible: boolean;
  blockedReasons: string[];
  mode: AutonomousGrowthMode;
  providerConfigured: boolean;
  autoSendEnabled: boolean;
};

export type QueuedEmailSendReadiness = {
  ready: boolean;
  blockedReasons: string[];
};

export type OutreachQueueItem = {
  id: string;
  prospectId: string;
  topProspectResultId: string;
  businessName: string;
  trade: string;
  city: string;
  website: string;
  email: string;
  contactSource: string;
  contactConfidence: number;
  previewLink: string;
  previewQualityScore: number;
  subjectLine: string;
  emailBody: string;
  dmScript: string;
  loomTalkingPoints: string;
  eligibilityReason: string;
  blockedReason: string;
  reviewScore: number;
  reviewSummary: string;
  improvementSuggestions: string[];
  detectedIssues: string[];
  recommendedNextAction: AutonomousNextAction;
  regenerationPlan: string[];
  rewritePlan: string[];
  feedbackLabels: AutonomousFeedbackLabel[];
  status: OutreachQueueStatus;
  sourceProvider: string;
  queuedDate: string;
  sentDate: string;
  followUpDate: string;
  replyStatus: string;
  notes: string;
  outreachCopyVersion: string;
  outreachCopyGeneratedAt: string;
  previewVersion: string;
  lastRegeneratedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type OutreachCopyRegenerationEligibility = {
  eligible: boolean;
  reason: string;
};

export const currentOutreachCopyVersion = OUTREACH_COPY_VERSION;

export type AutonomousGrowthMetrics = {
  prospectsFoundToday: number;
  previewsGeneratedToday: number;
  emailReadyLeads: number;
  blockedPhoneOnlyLeads: number;
  blockedBadFitLeads: number;
  emailsQueued: number;
  emailsSentToday: number;
  dailyCapRemaining: number;
  replies: number;
  positiveReplies: number;
  loomNeeded: number;
  loomRecorded: number;
  loomSent: number;
  followUpsDue: number;
  replyRate: number;
  positiveReplyRate: number;
  bestTrade: string;
  bestSubjectLine: string;
  bestOutreachAngle: string;
  wonLostProspects: string;
  averagePreviewQualityScore: number;
  averageLeadScore: number;
};

export type AutonomousRunReview = {
  id: string;
  mode: AutonomousGrowthMode;
  prospectsScanned: number;
  prospectsKept: number;
  prospectsBlocked: number;
  previewsGenerated: number;
  previewsPassed: number;
  previewsFailed: number;
  commonPreviewIssues: string[];
  commonLeadIssues: string[];
  outreachQualityNotes: string[];
  recommendedFixes: string[];
  summary: string;
  createdAt: string;
};

export type LearningRecommendation = {
  label: string;
  detail: string;
};

export type AutonomousLearningSummary = {
  latestReview: AutonomousRunReview | null;
  commonFailureReasons: string[];
  bestPerformingTrades: string[];
  worstPerformingTrades: string[];
  bestPerformingCities: string[];
  bestOutreachAngles: string[];
  weakestOutreachAngles: string[];
  replyRateByTrade: Array<{ trade: string; replyRate: number; positiveReplyRate: number }>;
  recommendationsForNextRun: string[];
  recommendedTradesToPrioritize: string[];
  recommendedTradesToPause: string[];
  recommendedPreviewImprovements: string[];
  recommendedWordingImprovements: string[];
};

export type AutonomousGrowthDashboard = {
  settings: AutonomousGrowthSettings;
  env: {
    autoSendEnabled: boolean;
    fullAutoSendEnabled: boolean;
    emailKillSwitchEnabled: boolean;
    sendProvider: string;
    hasResendApiKey: boolean;
    hasFromEmail: boolean;
    hasReplyToEmail: boolean;
    hasPostalAddress: boolean;
    hasNotifyEmail: boolean;
    hasNotifyFromEmail: boolean;
    notifyOnLoomNeeded: boolean;
  };
  metrics: AutonomousGrowthMetrics;
  queue: OutreachQueueItem[];
  learning: AutonomousLearningSummary;
  smartGrowth: SmartAutonomousGrowthSnapshot;
};

export const smartQueueKeys = [
  "readyForEmailReview",
  "readyForFacebookDm",
  "readyForInstagramDm",
  "readyForContactFormReview",
  "needsPreviewReview",
  "needsManualResearch",
  "phoneOnlyBlocked",
  "badFitBlocked",
  "alreadyContacted",
  "suppressedDoNotContact",
] as const;
export type SmartQueueKey = (typeof smartQueueKeys)[number];

export const smartQueueLabels: Record<SmartQueueKey, string> = {
  readyForEmailReview: "Ready for Email Review",
  readyForFacebookDm: "Ready for Facebook DM",
  readyForInstagramDm: "Ready for Instagram DM",
  readyForContactFormReview: "Ready for Contact Form Review",
  needsPreviewReview: "Needs Preview Review",
  needsManualResearch: "Needs Manual Research",
  phoneOnlyBlocked: "Phone-Only Blocked",
  badFitBlocked: "Bad Fit / Blocked",
  alreadyContacted: "Already Contacted",
  suppressedDoNotContact: "Suppressed / Do Not Contact",
};

export type ExistingQualifiedUnsentSummary = {
  total: number;
  readyForEmailReview: number;
  readyForFacebookInstagramManualDm: number;
  readyForContactFormManualResearch: number;
  needsRefreshedCopy: number;
  needsPreview: number;
  alreadySavedAsQueuePackage: number;
  foundOnlyInTopProspectsResults: number;
  generatedMissingPackages: number;
  refreshedCopyCount: number;
  skippedCount: number;
  blockedSkippedReasons: Record<string, number>;
  sourceCounts: {
    outreachQueueItems: number;
    savedTopProspectsResults: number;
    rankedProspects: number;
    reviewablePackages: number;
    generatedOutreachPackages: number;
  };
  queueCounts: Record<SmartQueueKey, number>;
  checkedSources: string[];
  lastRunAt: string;
};

export type MarketScoutSettings = {
  marketsToTest: string[];
  tradesToTest: TradeCategory[];
  scoutSampleSizePerMarketTrade: number;
  maxTotalScoutRecords: number;
  excludePreviouslyReviewed: boolean;
  writtenOutreachOnly: boolean;
  preferSocialFirstLeads: boolean;
  preferEmailReadyLeads: boolean;
};

export type MarketScoutResult = {
  market: string;
  trade: string;
  sampleSize: number;
  qualifiedProspectRate: number;
  usableWrittenContactRate: number;
  publicBusinessEmailRate: number;
  socialAvailabilityRate: number;
  phoneOnlyBlockRate: number;
  alreadyReviewedRate: number;
  brokenInactiveWebsiteRate: number;
  averageOpportunityScore: number;
  averageContactabilityScore: number;
  providerCoverageQuality: string;
  score: number;
  recommendationReason: string;
};

export type MarketScoutSummary = {
  settings: MarketScoutSettings;
  bounded: boolean;
  totalEstimatedRecords: number;
  results: MarketScoutResult[];
  bestResult: MarketScoutResult | null;
  message: string;
  lastRunAt: string;
};

export type SmartRecommendation = {
  nextBestMove: string;
  why: string;
  whatItWillDo: string[];
  whatItWillNotDo: string[];
  recommendedAction: "process_existing_qualified_prospects" | "run_market_scout_dry_run" | "start_small_top_prospects_test" | "review_manual_queue";
};

export type SmartRunSummary = {
  title: string;
  checked: string[];
  existingUnsentProspectsFound: number;
  whereFound: string[];
  copyRefreshedCount: number;
  missingPackagesGeneratedCount: number;
  packagesGeneratedCount: number;
  marketScoutResults: string[];
  bestMarketTradeRecommendation: string;
  queuesUpdated: string[];
  blockedReasons: Record<string, number>;
  safetyGates: string[];
  nextBestAction: string;
  whatWasNotDone: string[];
  summaryText: string;
  debugSummaryText: string;
  createdAt: string;
};

export type SmartAutonomousGrowthSnapshot = {
  existingQualifiedUnsent: ExistingQualifiedUnsentSummary;
  marketScout: MarketScoutSummary;
  recommendation: SmartRecommendation;
  lastRunSummary: SmartRunSummary;
  copySummaries: {
    smartRun: string;
    marketScout: string;
    existingProspectBackfill: string;
    nextBestMove: string;
    blockedReasons: string;
    debug: string;
  };
};

export type CasualDmPlaybook = {
  firstDm: string;
  softerFirstDm: string;
  yesReply: string;
  loomScript: string;
  sendAfterLoom: string;
  websiteExplanation: string;
  nextStepsReply: string;
  pricingReply: string;
  higherSupportReply: string;
  starterPageReply: string;
  followUpAfterLoom: string;
  notInterestedReply: string;
};

export type LoomReadinessCheck = {
  key: string;
  label: string;
  passed: boolean;
  fix: string;
};

export type LoomNeededTask = {
  businessName: string;
  trade: string;
  city: string;
  previewLink: string;
  previewQuality: string;
  fixNotes: string[];
  recommendation: LoomRecommendation;
  checklist: LoomReadinessCheck[];
  scripts: CasualDmPlaybook;
  canMarkReadyForLoom: boolean;
};

export type LoomRecommendation = {
  recommended: boolean;
  title: string;
  talkingPoints: string[];
  currentSiteIssue: string;
  previewImprovement: string;
  previewLink: string;
  whyRecommended: string;
};

type CasualDmProspect = {
  businessName: string;
  city: string;
  trade: string;
  analysis?: Prospect["analysis"];
  classification?: string;
  prospectType?: string;
  website?: string;
};

export const defaultAutonomousStyleProfiles: Record<string, AutonomousStyleProfile> = {
  Landscaping: {
    name: "Clean outdoor proof",
    direction: "Clean outdoor, before/after, family-homeowner trust.",
    strengths: ["lush service visuals", "clear curb appeal", "simple quote path"],
    cautions: ["avoid generic nature imagery", "label sample proof clearly"],
  },
  "Pressure Washing": {
    name: "Bold curb appeal",
    direction: "Bold before/after, fast quote, curb appeal.",
    strengths: ["visible surface improvement", "fast quote CTA", "driveway and siding proof"],
    cautions: ["avoid exaggerated results", "do not imply actual project photos"],
  },
  Cleaning: {
    name: "Bright trustworthy booking",
    direction: "Bright, trustworthy, simple booking.",
    strengths: ["clean interiors", "scope clarity", "booking confidence"],
    cautions: ["avoid fake reviews", "keep claims modest"],
  },
  HVAC: {
    name: "Reliable service trust",
    direction: "Reliable, emergency/service trust, clean technical professionalism.",
    strengths: ["equipment visuals", "service-call clarity", "comfort-focused CTA"],
    cautions: ["avoid fake emergency guarantees", "keep technical language human"],
  },
  Roofing: {
    name: "Storm-ready local proof",
    direction: "Strong proof, storm readiness, local credibility.",
    strengths: ["roofline imagery", "inspection CTA", "proof-first sections"],
    cautions: ["avoid unverified warranty or insurance claims", "label sample project proof"],
  },
  Painting: {
    name: "Finish-quality residential",
    direction: "Polished visuals, color and finish quality, residential trust.",
    strengths: ["detail photos", "room refresh flow", "clear estimate CTA"],
    cautions: ["avoid overused transformation copy", "do not invent project history"],
  },
};

export const defaultAutonomousGrowthSettings: AutonomousGrowthSettings = {
  mode: "off",
  killSwitch: true,
  targetCities: [],
  targetServiceAreas: [],
  targetTrades: [
    "Landscaping",
    "Pressure Washing",
    "Cleaning",
    "Painting",
    "Roofing",
    "HVAC",
    "Plumbing",
    "Electrical",
    "Concrete",
    "Tree Service",
    "Fencing",
    "Flooring",
    "Remodeling",
  ],
  excludedTrades: [],
  maxProspectsScannedPerDay: 25,
  maxPreviewsGeneratedPerDay: 10,
  maxEmailsQueuedPerDay: 5,
  maxEmailsSentPerDay: 5,
  emailCooldownMinutes: 7,
  followUpsEnabled: false,
  styleProfiles: defaultAutonomousStyleProfiles,
};

export const defaultMarketScoutSettings: MarketScoutSettings = {
  marketsToTest: [
    "Orlando, FL",
    "Tampa, FL",
    "Jacksonville, FL",
    "St. Augustine, FL",
    "Columbus, OH",
    "Cleveland, OH",
    "Cincinnati, OH",
    "Toledo, OH",
    "Charlotte, NC",
    "Raleigh, NC",
    "Nashville, TN",
    "Dallas, TX",
    "Fort Worth, TX",
    "Phoenix, AZ",
    "Atlanta, GA",
    "Indianapolis, IN",
  ],
  tradesToTest: [
    "Pressure Washing",
    "Landscaping",
    "Cleaning",
    "Painting",
    "Concrete",
    "Roofing",
    "HVAC",
    "Plumbing",
  ],
  scoutSampleSizePerMarketTrade: 8,
  maxTotalScoutRecords: 80,
  excludePreviouslyReviewed: true,
  writtenOutreachOnly: true,
  preferSocialFirstLeads: true,
  preferEmailReadyLeads: true,
};

const emptyQueueCounts = (): Record<SmartQueueKey, number> => ({
  readyForEmailReview: 0,
  readyForFacebookDm: 0,
  readyForInstagramDm: 0,
  readyForContactFormReview: 0,
  needsPreviewReview: 0,
  needsManualResearch: 0,
  phoneOnlyBlocked: 0,
  badFitBlocked: 0,
  alreadyContacted: 0,
  suppressedDoNotContact: 0,
});

function incrementRecord(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function topProspectResultSource(result: TopProspectResult) {
  if (result.selected) return "ranked prospects";
  if (result.packageStatus !== "NOT_GENERATED") return "generated outreach packages";
  if (result.resultBucket === "reviewable_lower_priority") return "reviewable packages";
  return "saved Top Prospects results";
}

function resultHasPublicPreview(result: Pick<TopProspectResult, "previewLink">) {
  return /\/p\//i.test(result.previewLink) && !/\/engine(?:\/|$)/i.test(result.previewLink);
}

function prospectHasManualWrittenPath(prospect: Prospect) {
  return prospectWrittenContactMethodIsUsable(prospect) || prospect.recommendedContactMethod === "verify_email_manually";
}

function smartQueueKeyForProspectBucket(bucket: ProspectExclusiveBucketKey): SmartQueueKey {
  if (bucket === "ready_email") return "readyForEmailReview";
  if (bucket === "ready_facebook") return "readyForFacebookDm";
  if (bucket === "ready_instagram") return "readyForInstagramDm";
  if (bucket === "ready_contact_form") return "readyForContactFormReview";
  if (bucket === "phone_only") return "phoneOnlyBlocked";
  if (bucket === "needs_manual_research") return "needsManualResearch";
  if (bucket === "already_contacted") return "alreadyContacted";
  if (bucket === "suppressed_do_not_contact") return "suppressedDoNotContact";
  return "badFitBlocked";
}

function prospectQueueKey(prospect: Prospect): SmartQueueKey {
  return smartQueueKeyForProspectBucket(prospectCurrentBucket(prospect));
}

export function smartQueueKeyForItem(item: OutreachQueueItem): SmartQueueKey {
  const statusText = `${item.status} ${item.blockedReason} ${item.notes} ${item.replyStatus}`;
  if (/suppressed|opted out|bounced|complained|never contact/i.test(statusText)) return "suppressedDoNotContact";
  if (item.sentDate || /sent|replied|positive reply|won|lost|not interested|first dm sent|loom sent|pricing sent|follow-up/i.test(statusText)) return "alreadyContacted";
  if (/bad fit|blocked/i.test(statusText) && !/phone(?:\s|-)?only/i.test(statusText)) return "badFitBlocked";
  if (/phone(?:\s|-)?only|call first/i.test(`${item.contactSource} ${statusText}`)) return "phoneOnlyBlocked";
  if (!resultHasPublicPreview(item)) return "needsPreviewReview";
  if (/facebook/i.test(item.contactSource)) return "readyForFacebookDm";
  if (/instagram|linkedin|social/i.test(item.contactSource)) return "readyForInstagramDm";
  if (/contact form|quote form/i.test(item.contactSource)) return "readyForContactFormReview";
  if (item.email && !/verify/i.test(item.contactSource)) return "readyForEmailReview";
  if (/manual research|unknown/i.test(item.contactSource)) return "needsManualResearch";
  return "needsPreviewReview";
}

function resultIsQualifiedUnsent(result: TopProspectResult) {
  if (result.packageStatus === "SENT" || result.packageSentAt) return false;
  if (result.packageStatus === "SKIPPED" || result.packageSkippedAt) return false;
  if (result.resultBucket === "blocked" || result.rejectionReason === "Phone-only / written outreach blocked") return false;
  return Boolean(result.selected || result.resultBucket === "reviewable_lower_priority" || result.packageStatus !== "NOT_GENERATED" || prospectHasManualWrittenPath(result.prospect));
}

export function summarizeExistingQualifiedUnsent(
  queue: OutreachQueueItem[],
  jobs: Pick<TopProspectJob, "results" | "reviewedNotRecommended">[] = [],
  now = new Date(),
): ExistingQualifiedUnsentSummary {
  const summary: ExistingQualifiedUnsentSummary = {
    total: 0,
    readyForEmailReview: 0,
    readyForFacebookInstagramManualDm: 0,
    readyForContactFormManualResearch: 0,
    needsRefreshedCopy: 0,
    needsPreview: 0,
    alreadySavedAsQueuePackage: 0,
    foundOnlyInTopProspectsResults: 0,
    generatedMissingPackages: 0,
    refreshedCopyCount: 0,
    skippedCount: 0,
    blockedSkippedReasons: {},
    sourceCounts: {
      outreachQueueItems: 0,
      savedTopProspectsResults: 0,
      rankedProspects: 0,
      reviewablePackages: 0,
      generatedOutreachPackages: 0,
    },
    queueCounts: emptyQueueCounts(),
    checkedSources: [
      "outreach queue items",
      "saved Top Prospects run results",
      "ranked prospects",
      "reviewable packages",
      "generated outreach packages",
    ],
    lastRunAt: now.toISOString(),
  };
  const seen = new Set<string>();
  for (const item of queue) {
    const key = item.topProspectResultId || item.prospectId || `${item.businessName}:${item.website}:${item.email}`;
    seen.add(key);
    const queueKey = smartQueueKeyForItem(item);
    summary.queueCounts[queueKey] += 1;
    summary.sourceCounts.outreachQueueItems += 1;
    const eligibility = outreachCopyRegenerationEligibility(item);
    if (queueKey === "suppressedDoNotContact" || queueKey === "alreadyContacted" || queueKey === "badFitBlocked" || queueKey === "phoneOnlyBlocked") {
      summary.skippedCount += 1;
      incrementRecord(summary.blockedSkippedReasons, smartQueueLabels[queueKey]);
      continue;
    }
    summary.total += 1;
    summary.alreadySavedAsQueuePackage += 1;
    if (queueKey === "readyForEmailReview") summary.readyForEmailReview += 1;
    if (queueKey === "readyForFacebookDm" || queueKey === "readyForInstagramDm") summary.readyForFacebookInstagramManualDm += 1;
    if (queueKey === "readyForContactFormReview" || queueKey === "needsManualResearch") summary.readyForContactFormManualResearch += 1;
    if (queueKey === "needsPreviewReview") summary.needsPreview += 1;
    if (eligibility.eligible) summary.needsRefreshedCopy += 1;
  }
  for (const job of jobs) {
    const results = [...(job.results ?? []), ...(job.reviewedNotRecommended ?? [])];
    for (const result of results) {
      const key = result.id || result.prospect.id;
      if (seen.has(key)) continue;
      const source = topProspectResultSource(result);
      if (source === "ranked prospects") summary.sourceCounts.rankedProspects += 1;
      else if (source === "reviewable packages") summary.sourceCounts.reviewablePackages += 1;
      else if (source === "generated outreach packages") summary.sourceCounts.generatedOutreachPackages += 1;
      else summary.sourceCounts.savedTopProspectsResults += 1;
      seen.add(key);
      if (!resultIsQualifiedUnsent(result)) {
        summary.skippedCount += 1;
        incrementRecord(summary.blockedSkippedReasons, result.rejectionReason ?? result.emailQuality.readinessLabel ?? "Not qualified for outreach");
        continue;
      }
      const prospectBucket = prospectCurrentBucket(result.prospect);
      const queueKey = prospectQueueKey(result.prospect);
      summary.queueCounts[queueKey] += 1;
      if (queueKey === "phoneOnlyBlocked" || queueKey === "badFitBlocked" || queueKey === "suppressedDoNotContact" || queueKey === "alreadyContacted") {
        summary.skippedCount += 1;
        incrementRecord(summary.blockedSkippedReasons, prospectFunnelLabels[prospectBucket] ?? smartQueueLabels[queueKey]);
        continue;
      }
      summary.total += 1;
      summary.foundOnlyInTopProspectsResults += 1;
      if (queueKey === "readyForEmailReview") summary.readyForEmailReview += 1;
      if (queueKey === "readyForFacebookDm" || queueKey === "readyForInstagramDm") summary.readyForFacebookInstagramManualDm += 1;
      if (queueKey === "readyForContactFormReview" || queueKey === "needsManualResearch") summary.readyForContactFormManualResearch += 1;
      if (!resultHasPublicPreview(result)) summary.needsPreview += 1;
    }
  }
  return summary;
}

function boundedScoutSettings(input?: Partial<MarketScoutSettings>): MarketScoutSettings {
  const markets = stringArray(input?.marketsToTest).length ? stringArray(input?.marketsToTest) : defaultMarketScoutSettings.marketsToTest;
  const trades = tradeArray(input?.tradesToTest).length ? tradeArray(input?.tradesToTest) : defaultMarketScoutSettings.tradesToTest;
  return {
    marketsToTest: markets.slice(0, 16),
    tradesToTest: trades.slice(0, 8),
    scoutSampleSizePerMarketTrade: clampCap(input?.scoutSampleSizePerMarketTrade, defaultMarketScoutSettings.scoutSampleSizePerMarketTrade, 3, 15),
    maxTotalScoutRecords: clampCap(input?.maxTotalScoutRecords, defaultMarketScoutSettings.maxTotalScoutRecords, 10, 120),
    excludePreviouslyReviewed: input?.excludePreviouslyReviewed ?? true,
    writtenOutreachOnly: input?.writtenOutreachOnly ?? true,
    preferSocialFirstLeads: input?.preferSocialFirstLeads ?? true,
    preferEmailReadyLeads: input?.preferEmailReadyLeads ?? true,
  };
}

function marketStateBonus(market: string) {
  if (/\bFL\b/i.test(market)) return 7;
  if (/\bNC\b|\bTN\b|\bGA\b|\bTX\b|\bAZ\b/i.test(market)) return 4;
  return 0;
}

function tradeBonus(trade: string) {
  if (/Pressure Washing|Landscaping|Cleaning|Painting|Concrete/i.test(trade)) return 8;
  if (/Roofing|HVAC|Plumbing/i.test(trade)) return 4;
  return 0;
}

export function buildMarketScoutDryRun(
  input?: Partial<MarketScoutSettings>,
  jobs: Pick<TopProspectJob, "input" | "results" | "reviewedNotRecommended" | "blockedProspects" | "discoveryDiagnostics">[] = [],
  now = new Date(),
): MarketScoutSummary {
  const settings = boundedScoutSettings(input);
  const results: MarketScoutResult[] = [];
  let remaining = settings.maxTotalScoutRecords;
  for (const market of settings.marketsToTest) {
    for (const trade of settings.tradesToTest) {
      if (remaining <= 0) break;
      const sampleSize = Math.min(settings.scoutSampleSizePerMarketTrade, remaining);
      remaining -= sampleSize;
      const historical = jobs.filter((job) =>
        `${job.input.city}, ${job.input.state}`.toLowerCase().includes(market.toLowerCase().split(",")[0].trim())
        && String(job.input.trade).toLowerCase() === trade.toLowerCase()
      );
      const historicalResults = historical.flatMap((job) => [...job.results, ...job.reviewedNotRecommended]);
      const qualified = historicalResults.filter((result) => result.selected || result.resultBucket === "reviewable_lower_priority");
      const withWritten = historicalResults.filter((result) => prospectHasManualWrittenPath(result.prospect));
      const withEmail = historicalResults.filter((result) => result.prospect.email);
      const withSocial = historicalResults.filter((result) => result.prospect.facebookUrl || result.prospect.instagramUrl || result.prospect.linkedinUrl);
      const phoneOnly = historicalResults.filter((result) => result.rejectionReason === "Phone-only / written outreach blocked");
      const blocked = historical.flatMap((job) => job.blockedProspects ?? []).length;
      const baseScore = 45 + marketStateBonus(market) + tradeBonus(trade);
      const qualifiedProspectRate = historicalResults.length ? Math.round((qualified.length / historicalResults.length) * 100) : Math.min(82, baseScore + 8);
      const usableWrittenContactRate = historicalResults.length ? Math.round((withWritten.length / historicalResults.length) * 100) : Math.min(78, baseScore + (settings.preferSocialFirstLeads ? 8 : 3));
      const publicBusinessEmailRate = historicalResults.length ? Math.round((withEmail.length / historicalResults.length) * 100) : Math.max(18, baseScore - 22 + (settings.preferEmailReadyLeads ? 5 : 0));
      const socialAvailabilityRate = historicalResults.length ? Math.round((withSocial.length / historicalResults.length) * 100) : Math.max(25, baseScore - 12 + (settings.preferSocialFirstLeads ? 8 : 0));
      const phoneOnlyBlockRate = historicalResults.length ? Math.round((phoneOnly.length / historicalResults.length) * 100) : Math.max(6, 30 - tradeBonus(trade));
      const alreadyReviewedRate = historicalResults.length ? Math.round(((historicalResults.length - qualified.length - blocked) / Math.max(1, historicalResults.length)) * 100) : 8;
      const brokenInactiveWebsiteRate = historicalResults.length ? Math.round((blocked / Math.max(1, historicalResults.length)) * 100) : 7;
      const averageOpportunityScore = historicalResults.length ? Math.round(historicalResults.reduce((sum, result) => sum + result.opportunityScore, 0) / historicalResults.length) : Math.min(86, baseScore + 12);
      const averageContactabilityScore = historicalResults.length ? Math.round(historicalResults.reduce((sum, result) => sum + result.salesScores.contactabilityScore, 0) / Math.max(1, historicalResults.length)) : usableWrittenContactRate;
      const providerCoverageQuality = historical.some((job) => Object.values(job.discoveryDiagnostics?.providerDiagnostics ?? {}).some((provider) => provider.status === "succeeded"))
        ? "historical provider success"
        : "dry-run estimate, provider calls not made";
      const score = Math.max(0, Math.min(100, Math.round(
        qualifiedProspectRate * 0.3
        + usableWrittenContactRate * 0.25
        + publicBusinessEmailRate * 0.12
        + socialAvailabilityRate * 0.12
        + averageOpportunityScore * 0.12
        + averageContactabilityScore * 0.09
        - phoneOnlyBlockRate * 0.14
        - alreadyReviewedRate * 0.08
        - brokenInactiveWebsiteRate * 0.08
      )));
      results.push({
        market,
        trade,
        sampleSize,
        qualifiedProspectRate,
        usableWrittenContactRate,
        publicBusinessEmailRate,
        socialAvailabilityRate,
        phoneOnlyBlockRate,
        alreadyReviewedRate,
        brokenInactiveWebsiteRate,
        averageOpportunityScore,
        averageContactabilityScore,
        providerCoverageQuality,
        score,
        recommendationReason: `${trade} near ${market} scored ${score}/100 from contactability, expected opportunity, and historical provider signals. This is a dry run and made no provider calls.`,
      });
    }
  }
  const sorted = results.toSorted((left, right) => right.score - left.score);
  const bestResult = sorted[0] ?? null;
  return {
    settings,
    bounded: true,
    totalEstimatedRecords: results.reduce((sum, result) => sum + result.sampleSize, 0),
    results: sorted,
    bestResult,
    message: bestResult
      ? `Best dry-run scout target: ${bestResult.trade} near ${bestResult.market}.`
      : "No market scout targets were available.",
    lastRunAt: now.toISOString(),
  };
}

export function smartRecommendationForGrowth(input: {
  existing: ExistingQualifiedUnsentSummary;
  scout: MarketScoutSummary;
  environment?: NodeJS.ProcessEnv;
}): SmartRecommendation {
  const env = outreachEnvironment(input.environment);
  const whatItWillNotDo = [
    "It will not send emails.",
    "It will not send social DMs.",
    "It will not submit contact forms.",
    "It will not place calls.",
    "It will not record or send Looms.",
  ];
  if (input.existing.needsRefreshedCopy > 0) {
    return {
      nextBestMove: "Run copy refresh on existing unsent packages first.",
      why: `${input.existing.needsRefreshedCopy} unsent package${input.existing.needsRefreshedCopy === 1 ? "" : "s"} can be updated to ${currentOutreachCopyVersion} before spending provider requests.`,
      whatItWillDo: ["Refresh only unsent, uncontacted outreach copy.", "Keep public preview links when valid.", "Preserve sent logs, suppression, opt-outs, and replies."],
      whatItWillNotDo,
      recommendedAction: "process_existing_qualified_prospects",
    };
  }
  if (input.existing.foundOnlyInTopProspectsResults > 0 || input.existing.total > 0) {
    const inventorySummary = [
      `You currently have ${input.existing.total} qualified unsent prospect${input.existing.total === 1 ? "" : "s"}.`,
      `Exclusive actionable buckets: ${input.existing.readyForEmailReview} email-review, ${input.existing.queueCounts.readyForFacebookDm} Facebook-DM, ${input.existing.queueCounts.readyForInstagramDm} Instagram-DM, and ${input.existing.queueCounts.readyForContactFormReview} contact-form-review.`,
      `${input.existing.needsPreview} need preview/package work.`,
      `${input.existing.skippedCount} are blocked or not currently actionable.`,
    ].join(" ");
    return {
      nextBestMove: "Use existing qualified unsent prospects first.",
      why: `${inventorySummary} Because qualified inventory already exists across saved results and queue items, work these before running another market scan.`,
      whatItWillDo: ["Route saved prospects into manual queues.", "Generate missing draft packages only where safe.", "Show blocked and preview-needed items clearly."],
      whatItWillNotDo,
      recommendedAction: "process_existing_qualified_prospects",
    };
  }
  if (env.emailKillSwitchEnabled) {
    return {
      nextBestMove: "Run Market Scout before any full Autopilot run.",
      why: "Prospect email sending is still blocked by OUTREACH_EMAIL_DISABLED, so the safest useful next action is a dry-run market recommendation.",
      whatItWillDo: ["Compare small bounded market/trade samples.", "Recommend the next Top Prospects run.", "Avoid provider-heavy nationwide scans."],
      whatItWillNotDo,
      recommendedAction: "run_market_scout_dry_run",
    };
  }
  return {
    nextBestMove: input.scout.bestResult
      ? `Run a small Top Prospects test: ${input.scout.bestResult.trade} near ${input.scout.bestResult.market}.`
      : "Run Market Scout before new discovery.",
    why: input.scout.bestResult?.recommendationReason ?? "There is no existing qualified unsent inventory yet.",
    whatItWillDo: ["Use the best bounded market/trade recommendation.", "Keep the first run small.", "Send nothing automatically."],
    whatItWillNotDo,
    recommendedAction: input.scout.bestResult ? "start_small_top_prospects_test" : "run_market_scout_dry_run",
  };
}

function formatReasons(reasons: Record<string, number>) {
  const entries = Object.entries(reasons).sort((left, right) => right[1] - left[1]);
  return entries.length ? entries.map(([reason, count]) => `${count} ${reason}`).join("\n") : "No blocked reasons recorded.";
}

export function buildSmartRunSummary(input: {
  existing: ExistingQualifiedUnsentSummary;
  scout: MarketScoutSummary;
  recommendation: SmartRecommendation;
  actionLabel?: string;
  now?: Date;
}): SmartRunSummary {
  const createdAt = (input.now ?? new Date()).toISOString();
  const marketScoutResults = input.scout.results.slice(0, 5).map((result) =>
    `${result.trade} near ${result.market}: ${result.score}/100, written contact ${result.usableWrittenContactRate}%, phone-only ${result.phoneOnlyBlockRate}%`
  );
  const queuesUpdated = smartQueueKeys
    .filter((key) => input.existing.queueCounts[key] > 0)
    .map((key) => `${smartQueueLabels[key]}: ${input.existing.queueCounts[key]}`);
  const safetyGates = [
    "No emails sent.",
    "No DMs sent.",
    "No contact forms submitted.",
    "No calls placed.",
    "No Looms recorded or sent.",
    "Suppression, opt-out, bounce, complaint, not-interested, and contacted history stayed unchanged.",
  ];
  const whatWasNotDone = [
    "No new nationwide discovery was started.",
    "No social media automation was used.",
    "No prospect-facing message was sent.",
    "No secrets or environment values were included.",
  ];
  const summaryText = [
    `Smart Autonomous Growth Summary: ${input.actionLabel ?? "Dry Run"}`,
    `Checked: ${input.existing.checkedSources.join(", ")}`,
    `Existing qualified unsent prospects found: ${input.existing.total}`,
    `Where found: queue ${input.existing.sourceCounts.outreachQueueItems}, ranked ${input.existing.sourceCounts.rankedProspects}, reviewable ${input.existing.sourceCounts.reviewablePackages}, saved results ${input.existing.sourceCounts.savedTopProspectsResults}, generated packages ${input.existing.sourceCounts.generatedOutreachPackages}`,
    `Copy refreshed: ${input.existing.refreshedCopyCount}`,
    `Missing packages generated: ${input.existing.generatedMissingPackages}`,
    `Needs preview: ${input.existing.needsPreview}`,
    `Best scout target: ${input.scout.bestResult ? `${input.scout.bestResult.trade} near ${input.scout.bestResult.market}` : "not available"}`,
    `Next best action: ${input.recommendation.nextBestMove}`,
    `Safety: ${safetyGates.join(" ")}`,
    `What was not done: ${whatWasNotDone.join(" ")}`,
  ].join("\n");
  return {
    title: input.actionLabel ?? "Smart Autonomous Growth Dry Run",
    checked: input.existing.checkedSources,
    existingUnsentProspectsFound: input.existing.total,
    whereFound: [
      `${input.existing.sourceCounts.outreachQueueItems} outreach queue items`,
      `${input.existing.sourceCounts.rankedProspects} ranked prospects`,
      `${input.existing.sourceCounts.reviewablePackages} reviewable packages`,
      `${input.existing.sourceCounts.savedTopProspectsResults} saved Top Prospects results`,
      `${input.existing.sourceCounts.generatedOutreachPackages} generated outreach packages`,
    ],
    copyRefreshedCount: input.existing.refreshedCopyCount,
    missingPackagesGeneratedCount: input.existing.generatedMissingPackages,
    packagesGeneratedCount: input.existing.generatedMissingPackages,
    marketScoutResults,
    bestMarketTradeRecommendation: input.scout.bestResult ? `${input.scout.bestResult.trade} near ${input.scout.bestResult.market}` : "Run Market Scout first.",
    queuesUpdated,
    blockedReasons: input.existing.blockedSkippedReasons,
    safetyGates,
    nextBestAction: input.recommendation.nextBestMove,
    whatWasNotDone,
    summaryText,
    debugSummaryText: [
      summaryText,
      "",
      "Blocked/skipped reasons:",
      formatReasons(input.existing.blockedSkippedReasons),
      "",
      "Scout details:",
      marketScoutResults.join("\n") || "No scout results.",
    ].join("\n"),
    createdAt,
  };
}

export function buildSmartAutonomousGrowthSnapshot(input: {
  queue: OutreachQueueItem[];
  topProspectJobs?: Pick<TopProspectJob, "input" | "results" | "reviewedNotRecommended" | "blockedProspects" | "discoveryDiagnostics">[];
  marketScoutSettings?: Partial<MarketScoutSettings>;
  lastRunSummary?: SmartRunSummary | null;
  environment?: NodeJS.ProcessEnv;
  now?: Date;
}): SmartAutonomousGrowthSnapshot {
  const jobs = input.topProspectJobs ?? [];
  const existing = summarizeExistingQualifiedUnsent(input.queue, jobs, input.now);
  const scout = buildMarketScoutDryRun(input.marketScoutSettings, jobs, input.now);
  const recommendation = smartRecommendationForGrowth({ existing, scout, environment: input.environment });
  const summary = input.lastRunSummary ?? buildSmartRunSummary({ existing, scout, recommendation, actionLabel: "Dashboard Snapshot", now: input.now });
  const blockedReasons = formatReasons(existing.blockedSkippedReasons);
  return {
    existingQualifiedUnsent: existing,
    marketScout: scout,
    recommendation,
    lastRunSummary: summary,
    copySummaries: {
      smartRun: summary.summaryText,
      marketScout: [
        scout.message,
        `Estimated records: ${scout.totalEstimatedRecords}`,
        ...scout.results.slice(0, 8).map((result) => `${result.trade} near ${result.market}: ${result.score}/100. ${result.recommendationReason}`),
        "Dry run only. No provider calls or outreach sends.",
      ].join("\n"),
      existingProspectBackfill: [
        `Existing qualified unsent prospects: ${existing.total}`,
        `Ready for email review: ${existing.readyForEmailReview}`,
        `Ready for Facebook/Instagram manual DM: ${existing.readyForFacebookInstagramManualDm}`,
        `Ready for contact form/manual research: ${existing.readyForContactFormManualResearch}`,
        `Needs refreshed copy: ${existing.needsRefreshedCopy}`,
        `Needs preview: ${existing.needsPreview}`,
        `Found only in Top Prospects results: ${existing.foundOnlyInTopProspectsResults}`,
        `Already saved as queue/package: ${existing.alreadySavedAsQueuePackage}`,
        "Nothing was sent.",
      ].join("\n"),
      nextBestMove: [
        recommendation.nextBestMove,
        `Why: ${recommendation.why}`,
        `Will do: ${recommendation.whatItWillDo.join(" ")}`,
        `Will not do: ${recommendation.whatItWillNotDo.join(" ")}`,
      ].join("\n"),
      blockedReasons,
      debug: summary.debugSummaryText,
    },
  };
}

function clampCap(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

export function normalizeAutonomousGrowthMode(value: unknown): AutonomousGrowthMode {
  return typeof value === "string" && autonomousGrowthModes.includes(value as AutonomousGrowthMode)
    ? value as AutonomousGrowthMode
    : "off";
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function tradeArray(value: unknown) {
  return stringArray(value).map(normalizeTradeCategory).filter((item): item is TradeCategory => Boolean(item));
}

function normalizeStyleProfiles(value: unknown) {
  const profiles = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, AutonomousStyleProfile>
    : defaultAutonomousStyleProfiles;
  return Object.fromEntries(
    Object.entries(profiles).map(([trade, profile]) => [displayTradeCategory(trade), profile]),
  );
}

export function normalizeAutonomousGrowthSettings(value: Partial<AutonomousGrowthSettings> = {}): AutonomousGrowthSettings {
  return {
    ...defaultAutonomousGrowthSettings,
    ...value,
    mode: normalizeAutonomousGrowthMode(value.mode),
    killSwitch: value.killSwitch ?? defaultAutonomousGrowthSettings.killSwitch,
    targetCities: stringArray(value.targetCities),
    targetServiceAreas: stringArray(value.targetServiceAreas),
    targetTrades: value.targetTrades === undefined ? defaultAutonomousGrowthSettings.targetTrades : tradeArray(value.targetTrades),
    excludedTrades: value.excludedTrades === undefined ? defaultAutonomousGrowthSettings.excludedTrades : tradeArray(value.excludedTrades),
    maxProspectsScannedPerDay: clampCap(value.maxProspectsScannedPerDay, 25, 0, 500),
    maxPreviewsGeneratedPerDay: clampCap(value.maxPreviewsGeneratedPerDay, 10, 0, 100),
    maxEmailsQueuedPerDay: clampCap(value.maxEmailsQueuedPerDay, 5, 0, 100),
    maxEmailsSentPerDay: clampCap(value.maxEmailsSentPerDay, 5, 0, 25),
    emailCooldownMinutes: clampCap(value.emailCooldownMinutes, 7, 5, 120),
    followUpsEnabled: value.followUpsEnabled ?? false,
    styleProfiles: normalizeStyleProfiles(value.styleProfiles),
  };
}

function containsBadCapitalization(value: string) {
  return /\btoledo\b|\bhvac\b/.test(value);
}

function containsPlaceholder(value: string) {
  return /\blorem ipsum\b|\bplaceholder\b|\btbd\b|\bTODO\b|\b\[.+?\]/i.test(value);
}

function previewText(preview: PreviewConcept) {
  return [
    preview.direction,
    preview.visualStyleDirection,
    preview.hero,
    preview.heroHeadline,
    preview.heroSupporting,
    ...(preview.serviceHighlights ?? []),
    ...(preview.trustItems ?? []),
    ...preview.homepageStructure,
    preview.ctaStrategy,
    ...preview.servicePageStructure,
    preview.portfolioDirection,
    preview.trustStrategy,
    preview.leadCaptureStrategy,
  ].filter(Boolean).join("\n");
}

export function evaluatePreviewQualityGate(prospect: Prospect): PreviewQualityGate {
  const preview = prospect.preview;
  const quality = preview?.qualityScore;
  const text = preview ? previewText(preview) : "";
  const checks = [
    {
      key: "preview_exists",
      label: "Public preview concept exists",
      passed: Boolean(preview),
      reason: "Generate a preview before this prospect can enter the outreach queue.",
    },
    {
      key: "design_quality",
      label: "Design quality is premium enough",
      passed: Boolean(quality && quality.visualPolish >= 85),
      reason: "Visual polish is below the send-ready threshold.",
    },
    {
      key: "trade_visuals",
      label: "Visuals are trade-specific",
      passed: Boolean(quality && quality.businessSpecificity >= 85),
      reason: "The preview needs stronger trade-specific visuals or copy.",
    },
    {
      key: "copy_quality",
      label: "Copy is clear and believable",
      passed: Boolean(quality && quality.clarity >= 85 && !containsPlaceholder(text)),
      reason: "Preview copy is generic, unfinished, or contains placeholder text.",
    },
    {
      key: "mobile_layout",
      label: "Mobile layout is send-safe",
      passed: Boolean(quality && quality.mobileResponsiveness >= 85),
      reason: "Mobile preview quality is below the send-ready threshold.",
    },
    {
      key: "typos_formatting",
      label: "No obvious typo or capitalization issue",
      passed: Boolean(preview && !containsBadCapitalization(text)),
      reason: "Preview text contains lowercase city or trade capitalization that should be fixed.",
    },
    {
      key: "cta_contact",
      label: "CTA and contact path are clear",
      passed: Boolean(quality && quality.conversionStrength >= 85),
      reason: "The preview needs a clearer estimate or contact action.",
    },
    {
      key: "truthfulness",
      label: "Unsupported claims are blocked",
      passed: Boolean(quality && quality.safetyTruthfulness >= 90),
      reason: "Preview may imply unsupported reviews, proof, awards, guarantees, or business claims.",
    },
  ];
  const score = quality
    ? Math.round(
        quality.visualPolish * 0.25
        + quality.businessSpecificity * 0.2
        + quality.clarity * 0.2
        + quality.mobileResponsiveness * 0.15
        + (checks.find((check) => check.key === "typos_formatting")?.passed ? 100 : 0) * 0.1
        + quality.conversionStrength * 0.1,
      )
    : 0;
  const reasons = checks.filter((check) => !check.passed).map((check) => check.reason ?? check.label);
  const status = score >= 85 && reasons.length === 0 ? "Eligible" : score < 70 ? "Blocked" : "Needs Review";
  return { status, score, checks, reasons };
}

export function outreachEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const sendProvider = environment.OUTREACH_SEND_PROVIDER?.trim().toLowerCase() ?? "";
  const notifyOnLoomNeeded = environment.OUTREACH_NOTIFY_ON_LOOM_NEEDED === "true";
  return {
    autoSendEnabled: environment.OUTREACH_AUTO_SEND_ENABLED === "true",
    fullAutoSendEnabled: environment.OUTREACH_FULL_AUTO_SEND_ENABLED === "true",
    emailKillSwitchEnabled: environment.OUTREACH_EMAIL_DISABLED === "true",
    sendProvider,
    hasResendApiKey: Boolean(environment.RESEND_API_KEY?.trim()),
    hasFromEmail: Boolean(environment.OUTREACH_FROM_EMAIL?.trim()),
    hasReplyToEmail: Boolean(environment.OUTREACH_REPLY_TO_EMAIL?.trim()),
    hasPostalAddress: Boolean(environment.OUTREACH_POSTAL_ADDRESS?.trim()),
    hasNotifyEmail: Boolean(environment.OUTREACH_NOTIFY_EMAIL?.trim()),
    hasNotifyFromEmail: Boolean(environment.OUTREACH_NOTIFY_FROM_EMAIL?.trim()),
    notifyOnLoomNeeded,
    dailyCap: clampCap(environment.OUTREACH_DAILY_CAP, 5, 0, 25),
  };
}

export function providerConfigured(environment: NodeJS.ProcessEnv = process.env) {
  const env = outreachEnvironment(environment);
  return env.sendProvider === "resend"
    && env.hasResendApiKey
    && env.hasFromEmail
    && env.hasReplyToEmail
    && env.hasPostalAddress;
}

function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

function emailDomain(value: string) {
  const email = normalizeEmailAddress(value);
  return email.includes("@") ? email.split("@").at(-1) ?? "" : "";
}

const sharedMailboxDomains = new Set([
  "aol.com",
  "gmail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

function businessEmailDomain(value: string) {
  const domain = emailDomain(value);
  return domain && !sharedMailboxDomains.has(domain) ? domain : "";
}

function senderPostalAddressForDrafts(environment: NodeJS.ProcessEnv = process.env) {
  return [
    environment.WEBWORKSHOP_POSTAL_ADDRESS?.trim() ?? "",
    environment.OUTREACH_POSTAL_ADDRESS?.trim() ?? "",
  ].filter(Boolean);
}

function prospectFacingEmailBodySafe(item: OutreachQueueItem, environment: NodeJS.ProcessEnv = process.env) {
  const combined = `${item.subjectLine}\n${item.emailBody}`;
  const postalAddresses = senderPostalAddressForDrafts(environment);
  return [
    /\/engine(?:\/|$)/i.test(combined) ? "Prospect-facing email contains a protected /engine link." : "",
    /\[[^\]]*(postal address|before sending|insert|placeholder)[^\]]*\]/i.test(combined) ? "Prospect-facing email still contains placeholder text." : "",
    /\b(?:website quality|opportunity|conversion readiness|internal|score)\s*(?:is|:)?\s*\d{1,3}\/100\b/i.test(combined) || /\b\d{1,3}\/100\b/.test(combined) ? "Prospect-facing email contains internal score language." : "",
    !/would rather not receive another note|unsubscribe|opt[- ]?out|close the loop/i.test(combined) ? "Opt-out language is missing." : "",
    postalAddresses.length && !postalAddresses.some((address) => item.emailBody.includes(address)) ? "Configured sender postal address is missing from the email body." : "",
    /\/engine(?:\/|$)/i.test(item.previewLink) ? "Protected /engine preview links are blocked." : "",
    !publicPreviewReady(item.previewLink) ? "Public /p/ preview link is missing from the outreach package." : "",
  ].filter(Boolean);
}

export function evaluateQueuedEmailSendReadiness({
  emailSendsToday = 0,
  environment = process.env,
  item,
  queue = [],
  settings,
}: {
  emailSendsToday?: number;
  environment?: NodeJS.ProcessEnv;
  item: OutreachQueueItem;
  queue?: OutreachQueueItem[];
  settings: AutonomousGrowthSettings;
}): QueuedEmailSendReadiness {
  const env = outreachEnvironment(environment);
  const email = normalizeEmailAddress(item.email);
  const domain = businessEmailDomain(email);
  const matchingItems = queue.filter((other) => other.id !== item.id && normalizeEmailAddress(other.email) === email);
  const matchingDomains = domain ? queue.filter((other) => other.id !== item.id && businessEmailDomain(other.email) === domain) : [];
  const suppressedStatuses = new Set<OutreachQueueStatus>(["Opted Out", "Bounced", "Complained", "Suppressed", "Never Contact", "Not Interested", "Bad Fit", "Blocked", "Lost"]);
  const previouslySent = matchingItems.find((other) => other.sentDate || other.status === "Sent");
  const previouslySentDomain = matchingDomains.find((other) => other.sentDate || other.status === "Sent");
  const suppressed = [...matchingItems, ...matchingDomains].find((other) => suppressedStatuses.has(other.status));
  const cooldownMs = Math.max(1, settings.emailCooldownMinutes) * 60_000;
  const cooldownHit = matchingItems.find((other) => {
    if (!other.sentDate) return false;
    const sentAt = Date.parse(other.sentDate);
    return Number.isFinite(sentAt) && Date.now() - sentAt < cooldownMs;
  });
  const blockedReasons = [
    settings.mode !== "auto_email_pilot" ? `${autonomousGrowthModeLabels[settings.mode]} sends nothing automatically.` : "",
    settings.killSwitch ? "Global kill switch is on." : "",
    env.emailKillSwitchEnabled ? "OUTREACH_EMAIL_DISABLED is true." : "",
    !env.autoSendEnabled ? "OUTREACH_AUTO_SEND_ENABLED is not true." : "",
    !providerConfigured(environment) ? "Email provider, sender, reply-to, or postal address is missing." : "",
    item.status !== "Queued" ? "Only Queued email items can be sent by Auto Email Pilot." : "",
    email ? "" : "Recipient email is missing.",
    email && prospectEmailNeedsManualVerification({ businessName: item.businessName, website: item.website, email })
      ? "Recipient email needs manual verification before sending."
      : "",
    item.contactSource !== "Public email" ? "Only public-email contacts can be sent automatically." : "",
    emailSendsToday >= Math.min(settings.maxEmailsSentPerDay, env.dailyCap) ? "Daily email cap has been reached." : "",
    item.sentDate ? "This queue item already has a sent date." : "",
    previouslySent ? "This email address was already contacted." : "",
    previouslySentDomain ? "This business email domain was already contacted." : "",
    suppressed ? "This email address or domain is suppressed." : "",
    cooldownHit ? "Email cooldown is still active for this address." : "",
    ...prospectFacingEmailBodySafe(item, environment),
  ].filter(Boolean);
  return { ready: blockedReasons.length === 0, blockedReasons };
}

function publicPreviewReady(value: string) {
  try {
    const url = new URL(value);
    return url.pathname.startsWith("/p/") && validPublicPreviewToken(url.pathname.slice(3));
  } catch {
    return false;
  }
}

export function evaluateAutoSendEligibility({
  emailQuality,
  emailsSentToday = 0,
  environment = process.env,
  previewGate,
  previewLink,
  prospect,
  settings,
}: {
  emailQuality: OutreachEmailQuality;
  emailsSentToday?: number;
  environment?: NodeJS.ProcessEnv;
  previewGate: PreviewQualityGate;
  previewLink: string;
  prospect: Prospect;
  settings: AutonomousGrowthSettings;
}): AutoSendEligibility {
  const env = outreachEnvironment(environment);
  const blockedReasons = [
    settings.mode !== "auto_email_pilot" ? `${autonomousGrowthModeLabels[settings.mode]} sends nothing automatically.` : "",
    settings.killSwitch ? "Global kill switch is on." : "",
    env.emailKillSwitchEnabled ? "OUTREACH_EMAIL_DISABLED is true." : "",
    !env.autoSendEnabled ? "OUTREACH_AUTO_SEND_ENABLED is not true." : "",
    !providerConfigured(environment) ? "Email provider, sender, reply-to, or postal address is missing." : "",
    emailsSentToday >= Math.min(settings.maxEmailsSentPerDay, env.dailyCap) ? "Daily email cap has been reached." : "",
    !prospect.email ? "Public email is missing." : "",
    !publicPreviewReady(previewLink) ? "Public /p/ preview link is missing." : "",
    previewGate.status !== "Eligible" || previewGate.score < 85 ? "Preview quality gate did not pass." : "",
    !emailQuality.ready ? `Email quality check is not send-ready: ${emailQuality.readinessLabel}.` : "",
    !prospectWrittenContactMethodIsUsable(prospect) ? "Written contact method is not usable." : "",
    prospect.status === "Contacted" || prospect.status === "Interested" || prospect.status === "Proposal Sent" || prospect.status === "Closed Won" || prospect.status === "Closed Lost" ? "Business has already been contacted or closed." : "",
    prospect.recommendedContactMethod === "call_first" || prospect.classification === "phone_only" ? "Phone-only leads never auto-send." : "",
    prospect.recommendedContactMethod === "message_on_facebook" || prospect.recommendedContactMethod === "message_on_social" || prospect.classification === "social_only" ? "Social-only leads never auto-send." : "",
    prospect.recommendedContactMethod === "submit_contact_form" ? "Contact-form-only leads never auto-send." : "",
    prospect.classification === "national_large_brand" || prospect.classification === "duplicate_bad_fit" || prospect.inactive ? "Bad-fit, inactive, franchise, or duplicate leads are blocked." : "",
    prospect.recommendedContactMethod === "do_not_contact" ? "Do-not-contact lead is blocked." : "",
    prospect.activitySignals.some((signal) => /\b(no[- ]?solicitation|do not solicit|no sales calls|no marketing emails|opt(?:ed)? out)\b/i.test(signal)) ? "No-solicitation or opt-out language was detected." : "",
    /\/engine\/previews\//i.test(previewLink) ? "Protected engine preview links are blocked." : "",
  ].filter(Boolean);
  return {
    eligible: blockedReasons.length === 0,
    blockedReasons,
    mode: settings.mode,
    providerConfigured: providerConfigured(environment),
    autoSendEnabled: env.autoSendEnabled,
  };
}

export function queueStatusForPackage({
  autoEligibility,
  emailQuality,
  previewGate,
  settings,
}: {
  autoEligibility: AutoSendEligibility;
  emailQuality: OutreachEmailQuality;
  previewGate: PreviewQualityGate;
  settings: AutonomousGrowthSettings;
}): OutreachQueueStatus {
  if (settings.mode === "off") return "Draft";
  if (autoEligibility.blockedReasons.some((reason) => /Phone-only leads never auto-send/i.test(reason))) return "Blocked";
  if (previewGate.status === "Blocked") return "Blocked";
  if (previewGate.status === "Needs Review" || !emailQuality.ready) return "Needs Review";
  if (settings.mode === "auto_email_pilot" && autoEligibility.eligible) return "Queued";
  if (settings.mode === "auto_email_pilot") return "Blocked";
  return "Eligible";
}

const contactedOrClosedStatuses = new Set<OutreachQueueStatus>([
  "First DM Sent",
  "Prospect Said Yes",
  "Loom Needed",
  "Ready for Loom",
  "Loom Recorded",
  "Loom Sent",
  "Pricing Requested",
  "Pricing Sent",
  "Sent",
  "Follow-up Needed",
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
  "Skipped",
  "Never Contact",
  "Bad Fit",
  "Blocked",
]);

export function outreachCopyRegenerationEligibility(item: OutreachQueueItem): OutreachCopyRegenerationEligibility {
  if (item.outreachCopyVersion === currentOutreachCopyVersion) return { eligible: false, reason: "already current" };
  if (item.sentDate) return { eligible: false, reason: "already contacted" };
  if (item.replyStatus) return { eligible: false, reason: "reply or suppression recorded" };
  if (contactedOrClosedStatuses.has(item.status)) return { eligible: false, reason: `status is ${item.status}` };
  if (/phone(?:\s|-)?only/i.test(`${item.contactSource} ${item.blockedReason}`)) return { eligible: false, reason: "phone-only" };
  if (/suppressed|opted out|bounced|complained|never contact|bad fit/i.test(`${item.status} ${item.blockedReason} ${item.notes}`)) return { eligible: false, reason: "suppressed or blocked" };
  if (!item.previewLink) return { eligible: true, reason: "preview missing" };
  if (/\/engine(?:\/|$)/i.test(item.previewLink)) return { eligible: false, reason: "protected preview link" };
  if (!/\/p\//i.test(item.previewLink)) return { eligible: true, reason: "preview missing" };
  if (/phone(?:\s|-)?only|unknown|manual research/i.test(item.contactSource)) return { eligible: false, reason: "no usable written contact path" };
  return { eligible: true, reason: "safe to regenerate" };
}

export function queueStatusAfterManualAction(status: OutreachQueueStatus): OutreachQueueStatus {
  return status === "Prospect Said Yes" ? "Loom Needed" : status;
}

function hasFeedback(feedbackLabels: readonly string[], value: AutonomousFeedbackLabel) {
  return feedbackLabels.includes(value);
}

function outreachSoundsTooAiish(value: string) {
  return /\b(elevate|unlock|bespoke|seamless|tailored solutions|transform your|game[- ]changer|world[- ]class|next[- ]generation|free audit)\b/i.test(value);
}

export function previewRegenerationPlan(previewGate: PreviewQualityGate, feedbackLabels: readonly string[] = []) {
  const plan = new Set<string>();
  for (const reason of previewGate.reasons) {
    if (/visual polish|premium|layout/i.test(reason)) plan.add("make design more premium");
    if (/visuals|trade-specific/i.test(reason)) plan.add("fix image relevance");
    if (/copy|placeholder|generic/i.test(reason)) plan.add("reduce AI-sounding copy");
    if (/mobile/i.test(reason)) plan.add("improve mobile layout");
    if (/capitalization|typo/i.test(reason)) plan.add("fix typo/capitalization");
    if (/contact|CTA|estimate/i.test(reason)) plan.add("improve CTA section");
    if (/unsupported|claims|reviews|awards/i.test(reason)) plan.add("remove fake-sounding claims");
  }
  if (hasFeedback(feedbackLabels, "Preview looked bad")) {
    plan.add("make sections flow better");
    plan.add("make it more specific to the trade/city");
  }
  return [...plan];
}

export function outreachRewritePlan(outreachText: string, feedbackLabels: readonly string[] = []) {
  const plan = new Set<string>();
  if (outreachSoundsTooAiish(outreachText) || hasFeedback(feedbackLabels, "Outreach sounded too AI-ish")) {
    plan.add("make the email shorter");
    plan.add("make it more human");
    plan.add("remove hype and agency-sounding phrases");
  }
  if (!/would you be open|would you want|would you like|want to see it|quick 10-minute call|worth a short call/i.test(outreachText)) plan.add("add one clear CTA");
  if (!/would rather not receive another note/i.test(outreachText)) plan.add("preserve opt-out language");
  if (/\bfree audit\b/i.test(outreachText)) plan.add("remove free audit language");
  if (/One thing that already works well:|One missed opportunity:/i.test(outreachText)) plan.add("rewrite audit-style phrases into plain language");
  return [...plan];
}

export function rewriteOutreachWithFixes(emailBody: string) {
  const optOut = emailBody.match(/Thanks,[\s\S]*?If you would rather not receive another note, just reply and I will close the loop\./i)?.[0]
    ?? outreachComplianceFooter();
  const greeting = emailBody.split("\n").find((line) => /^Hi\b/i.test(line.trim()))?.trim() ?? "Hi there,";
  return [
    greeting,
    "",
    "I came across your business while looking at local service companies and put together a quick website preview.",
    "",
    "It's built to make the page look cleaner and help get you more calls and quote requests.",
    "",
    "Would you like me to send it over?",
    "",
    optOut,
  ].join("\n");
}

export function evaluateSelfReview({
  emailQuality,
  feedbackLabels = [],
  previewGate,
  prospect,
}: {
  emailQuality: OutreachEmailQuality;
  feedbackLabels?: readonly AutonomousFeedbackLabel[];
  previewGate: PreviewQualityGate;
  prospect: Prospect;
}) {
  const detectedIssues = new Set<string>([...previewGate.reasons, ...emailQuality.issues]);
  const regenerationPlan = previewRegenerationPlan(previewGate, feedbackLabels);
  const rewritePlan = outreachRewritePlan(prospect.outreach?.concise ?? "", feedbackLabels);
  if (!prospectWrittenContactMethodIsUsable(prospect)) detectedIssues.add("Written contact method is weak or missing.");
  if (hasFeedback(feedbackLabels, "Bad lead")) detectedIssues.add("Manual feedback marked this as a bad lead.");
  if (hasFeedback(feedbackLabels, "Wrong contact")) detectedIssues.add("Manual feedback marked the contact as wrong.");
  let recommendedNextAction: AutonomousNextAction = "Needs Human Review";
  if (hasFeedback(feedbackLabels, "Never contact") || prospect.recommendedContactMethod === "do_not_contact") recommendedNextAction = "Never Contact";
  else if (hasFeedback(feedbackLabels, "Bad fit") || prospect.classification === "national_large_brand" || prospect.classification === "duplicate_bad_fit" || prospect.inactive) recommendedNextAction = "Bad Fit";
  else if (previewGate.status !== "Eligible" || hasFeedback(feedbackLabels, "Preview looked bad")) recommendedNextAction = "Regenerate Preview";
  else if (!emailQuality.ready || rewritePlan.length || hasFeedback(feedbackLabels, "Outreach sounded too AI-ish")) recommendedNextAction = "Rewrite Outreach";
  else if (hasFeedback(feedbackLabels, "Bad lead")) recommendedNextAction = "Skip";
  else if (hasFeedback(feedbackLabels, "Good lead") || emailQuality.ready) recommendedNextAction = "Keep";
  const reviewScore = Math.max(0, Math.min(100, Math.round(
    previewGate.score * 0.38
    + (emailQuality.ready ? 24 : 8)
    + (prospectWrittenContactMethodIsUsable(prospect) ? 18 : 4)
    + (hasFeedback(feedbackLabels, "Good lead") ? 10 : 0)
    + (hasFeedback(feedbackLabels, "Preview looked good") ? 5 : 0)
    + (hasFeedback(feedbackLabels, "Outreach sounded good") ? 5 : 0)
    - (detectedIssues.size * 4),
  )));
  const improvementSuggestions = [
    ...regenerationPlan,
    ...rewritePlan,
    !prospectWrittenContactMethodIsUsable(prospect) ? "verify a usable written contact path before outreach" : "",
  ].filter(Boolean);
  return {
    reviewScore,
    reviewSummary: `${prospect.businessName} review: ${recommendedNextAction}. Preview ${previewGate.score}/100; email ${emailQuality.readinessLabel}.`,
    improvementSuggestions,
    detectedIssues: [...detectedIssues],
    recommendedNextAction,
    regenerationPlan,
    rewritePlan,
  };
}

function casualDmBusinessContext(prospect: CasualDmProspect) {
  const noWebsite = prospect.prospectType === "no_website_social_only"
    || prospect.classification === "social_only"
    || prospect.classification === "listing_only"
    || prospect.classification === "no_website"
    || !prospect.website;
  return noWebsite
    ? "I noticed you did not have a dedicated website"
    : "I came across your site";
}

export function casualDmPlaybook(prospect: CasualDmProspect, previewLink: string): CasualDmPlaybook {
  const context = casualDmBusinessContext(prospect);
  const noWebsite = prospect.prospectType === "no_website_social_only"
    || prospect.classification === "social_only"
    || prospect.classification === "listing_only"
    || prospect.classification === "no_website"
    || !prospect.website;
  const scores = prospect.analysis?.scores;
  const weakContactPath = Boolean(scores && (scores.ctaStrength <= 55 || scores.contactAccessibility <= 55 || scores.conversionReadiness <= 55));
  const previewReference = previewLink || "[PUBLIC PREVIEW LINK]";
  return {
    firstDm: noWebsite
      ? [
          `Hey, how's it going? I came across ${prospect.businessName} and noticed I couldn't find a full website, so I made a quick preview of what one could look like. It's built to help get more calls and quote requests. Want to see it?`,
        ].join("\n")
      : weakContactPath
        ? [
            `Hey, how's it going? I came across ${prospect.businessName} and noticed the call or quote request path could probably be clearer, so I made a quick website preview for you. Want to see it?`,
          ].join("\n")
      : [
          `Hey, how's it going? I came across ${prospect.businessName} and noticed your page could probably make it easier for people to call or request a quote, so I made a quick website preview for you. Want to see it?`,
        ].join("\n"),
    softerFirstDm: noWebsite
      ? `Hey, how's it going? I came across ${prospect.businessName} and couldn't find a full website. I made a quick preview of what one could look like. Want to see it?`
      : `Hey, how's it going? I came across ${prospect.businessName} and made a quick website preview showing how the page could be cleaner and make it easier for people to call or request a quote. Want to see it?`,
    yesReply: [
      "Sounds good - here's the preview:",
      "",
      previewReference,
      "",
      "It's just a quick concept, but I built it around making the page look cleaner and helping get more calls and quote requests.",
      "",
      "If you like it, I can send over the simple pricing/options.",
    ].join("\n"),
    loomScript: [
      "Hey, I just wanted to walk you through this quick.",
      "",
      `${context} and put together a simple preview for you.`,
      "",
      "The main idea is making the page cleaner and helping people call or request a quote.",
      "",
      "This isn't live or anything, just a concept. If you like the direction, I can send over the next steps and pricing.",
    ].join("\n"),
    sendAfterLoom: [
      "Sounds good - here's the Loom and preview:",
      "",
      "Loom walkthrough:",
      "[LOOM LINK]",
      "",
      "Preview:",
      previewReference,
      "",
      "It's just a quick concept, but I built it around making the page look cleaner and helping get more calls and quote requests.",
    ].join("\n"),
    websiteExplanation: "It's a simple website concept focused on making the page cleaner and helping people call or request a quote.",
    nextStepsReply: "Yeah, if you like the direction, I can finish it out and get it ready to go live for you.",
    pricingReply: [
      "If you like the direction, pricing for this type of site is $1,000 total.",
      "",
      "$500 to start, then $500 once it's finished and ready to go live.",
      "",
      "After that, hosting and small updates are $49/month.",
    ].join("\n"),
    higherSupportReply: "If you want a little more ongoing help with changes and support, I can also do $79/month.",
    starterPageReply: "If you want to start smaller, I can also do a simple starter page for $500.",
    followUpAfterLoom: [
      "Hey, just wanted to follow up on that preview I sent over.",
      "",
      "No worries either way. Just figured I'd check.",
    ].join("\n"),
    notInterestedReply: "No worries at all, appreciate you checking it out.",
  };
}

export function manualDmScript(prospect: Prospect, previewLink = "") {
  return casualDmPlaybook(prospect, previewLink).firstDm;
}

export function loomTalkingPoints(prospect: Prospect, previewLink: string) {
  return casualDmPlaybook(prospect, previewLink).loomScript;
}

export function loomReadinessChecklist(item: OutreachQueueItem): LoomReadinessCheck[] {
  const previewReady = publicPreviewReady(item.previewLink);
  return [
    {
      key: "public_preview_link",
      label: "Public preview link exists",
      passed: previewReady,
      fix: "Generate the Outreach Package again so the prospect gets a safe /p/ link.",
    },
    {
      key: "preview_quality",
      label: "Preview quality is high enough for a walkthrough",
      passed: item.previewQualityScore >= 85 && !item.regenerationPlan.length,
      fix: "Mark Preview Needs Polish and fix layout, copy, imagery, or truthfulness issues before recording.",
    },
    {
      key: "business_context",
      label: "Business, trade, and city are clear",
      passed: Boolean(item.businessName && item.trade && item.city),
      fix: "Add the missing business context before recording a personal Loom.",
    },
    {
      key: "manual_only",
      label: "Manual social outreach only",
      passed: true,
      fix: "Do not automate Facebook, Instagram, contact forms, Loom recording, or Loom sending.",
    },
  ];
}

function hasUsableManualContactForLoom(item: OutreachQueueItem) {
  return Boolean(item.contactSource)
    && !/phone(?:\s|-)?only|^phone$/i.test(item.contactSource)
    && item.contactSource !== "Unknown"
    && item.contactSource !== "Manual research";
}

function visualIssueForLoom(item: OutreachQueueItem) {
  return [...item.detectedIssues, ...item.improvementSuggestions, item.reviewSummary]
    .find((issue) => /\b(website|homepage|visual|layout|mobile|quote|estimate|contact|cta|preview|service|proof)\b/i.test(issue))
    ?? "";
}

export function loomRecommendationForQueueItem(item: OutreachQueueItem): LoomRecommendation {
  const visualIssue = visualIssueForLoom(item);
  const highValue = item.reviewScore >= 70;
  const strongPreview = item.previewQualityScore >= 85 && item.regenerationPlan.length === 0;
  const usableContact = hasUsableManualContactForLoom(item);
  const publicPreview = publicPreviewReady(item.previewLink);
  const recommended = highValue && strongPreview && usableContact && publicPreview && Boolean(visualIssue);
  const currentSiteIssue = visualIssue || "No specific visual website issue has been recorded yet.";
  const previewImprovement = item.improvementSuggestions.find((suggestion) => /preview|quote|contact|layout|service/i.test(suggestion))
    ?? "Show how the public preview makes services and quote requests easier to find.";
  return {
    recommended,
    title: recommended ? `Loom walkthrough for ${item.businessName}` : "Loom not recommended yet",
    talkingPoints: [
      `Show the current-site issue: ${currentSiteIssue}`,
      `Show the preview improvement: ${previewImprovement}`,
      "End by asking whether they want the finished version set up manually.",
    ],
    currentSiteIssue,
    previewImprovement,
    previewLink: publicPreview ? item.previewLink : "",
    whyRecommended: recommended
      ? "High-value prospect with a strong preview, usable manual contact path, and a visual issue worth showing."
      : "Wait until the prospect has a strong score, public preview, usable manual contact path, and a clear visual issue.",
  };
}

export function loomNeededTaskForQueueItem(item: OutreachQueueItem): LoomNeededTask {
  const prospect = {
    id: item.prospectId,
    businessName: item.businessName,
    trade: item.trade,
    city: item.city.replace(/,\s*[A-Z]{2}$/i, ""),
    state: item.city.match(/,\s*([A-Z]{2})$/i)?.[1] ?? "",
    website: item.website,
    email: item.email,
    phone: "",
    profileUrl: "",
    contactFormUrl: item.contactSource === "Contact form" ? item.website : "",
    status: "New",
    classification: item.contactSource === "Social profile" ? "social_only" : "website_redesign",
    prospectType: item.website ? "redesign" : "no_website_social_only",
    recommendedContactMethod: item.contactSource === "Social profile" ? "message_on_social" : "needs_manual_contact_research",
    sourceConfidence: item.contactConfidence,
    activitySignals: [],
    inactive: false,
  };
  const checklist = loomReadinessChecklist(item);
  const fixNotes = [
    ...item.regenerationPlan,
    ...item.improvementSuggestions,
    ...item.detectedIssues.filter((issue) => /preview|layout|copy|visual|truth|capitalization|contact/i.test(issue)),
  ].filter(Boolean);
  return {
    businessName: item.businessName,
    trade: item.trade,
    city: item.city,
    previewLink: item.previewLink,
    previewQuality: `${item.previewQualityScore || item.reviewScore || 0}/100`,
    fixNotes: [...new Set(fixNotes)].slice(0, 6),
    recommendation: loomRecommendationForQueueItem(item),
    checklist,
    scripts: casualDmPlaybook(prospect, item.previewLink),
    canMarkReadyForLoom: checklist.every((check) => check.passed),
  };
}

export function loomNotificationConfigured(environment: NodeJS.ProcessEnv = process.env) {
  const env = outreachEnvironment(environment);
  return env.notifyOnLoomNeeded && env.hasNotifyEmail && env.hasNotifyFromEmail;
}

export function loomNeededNotificationDraft(item: OutreachQueueItem, environment: NodeJS.ProcessEnv = process.env) {
  const configured = loomNotificationConfigured(environment);
  return {
    configured,
    toConfigured: Boolean(environment.OUTREACH_NOTIFY_EMAIL?.trim()),
    fromConfigured: Boolean(environment.OUTREACH_NOTIFY_FROM_EMAIL?.trim()),
    subject: `Loom needed: ${item.businessName}`,
    body: [
      `${item.businessName} is ready for a manual Loom walkthrough.`,
      `Trade/city: ${item.trade} in ${item.city}`,
      `Preview: ${item.previewLink || "Missing public preview link"}`,
      `Preview quality: ${item.previewQualityScore || item.reviewScore || 0}/100`,
      "",
      "Record the walkthrough manually. Do not auto-send social DMs or Loom links.",
    ].join("\n"),
  };
}

export function csvEscape(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

export function publicPreviewLinkFromToken(token: string | null | undefined) {
  return token && validPublicPreviewToken(token) ? publicProspectPreviewLink(token) : "";
}

export function evaluatePackageEmailQuality(
  prospect: Prospect,
  previewLink: string,
  outreachPreference: OutreachPreference,
) {
  return evaluateOutreachEmailQuality(prospect, previewLink, outreachPreference);
}

function topCounts(values: string[], limit = 5) {
  const counts = values.reduce<Record<string, number>>((accumulator, value) => {
    const key = value.trim();
    if (!key) return accumulator;
    accumulator[key] = (accumulator[key] ?? 0) + 1;
    return accumulator;
  }, {});
  return Object.entries(counts).sort(([, left], [, right]) => right - left).slice(0, limit).map(([value]) => value);
}

function average(values: number[]) {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : 0;
}

function tradePerformance(queue: OutreachQueueItem[]) {
  const grouped = queue.reduce<Record<string, OutreachQueueItem[]>>((accumulator, item) => {
    const trade = item.trade || "Unknown";
    accumulator[trade] = [...(accumulator[trade] ?? []), item];
    return accumulator;
  }, {});
  return Object.entries(grouped)
    .map(([trade, items]) => ({
      trade,
      averageScore: average(items.map((item) => item.reviewScore || item.previewQualityScore)),
      replies: items.filter((item) => ["Replied", "Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested"].includes(item.status) || item.replyStatus).length,
      positiveReplies: items.filter((item) => ["Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested", "Won"].includes(item.status) || /positive|prospect_said_yes|pricing_requested/i.test(item.replyStatus)).length,
      sent: items.filter((item) => ["Sent", "First DM Sent", "Loom Sent", "Pricing Sent"].includes(item.status) || item.sentDate || ["Replied", "Positive Reply", "Not Interested", "Pricing Requested", "Won", "Lost"].includes(item.status)).length,
    }))
    .sort((left, right) => right.averageScore - left.averageScore);
}

export function generateAutonomousRunReview(
  settings: AutonomousGrowthSettings,
  queue: OutreachQueueItem[],
  id = `review-${Date.now()}`,
  createdAt = new Date().toISOString(),
): AutonomousRunReview {
  const keptStatuses: OutreachQueueStatus[] = ["Eligible", "DM Draft", "First DM Sent", "Prospect Said Yes", "Loom Needed", "Ready for Loom", "Loom Recorded", "Loom Sent", "Pricing Requested", "Pricing Sent", "Queued", "Sent", "Follow-up Needed", "Follow-up Sent", "Replied", "Positive Reply", "Won"];
  const blockedStatuses: OutreachQueueStatus[] = ["Blocked", "Preview Needs Polish", "Bad Fit", "Never Contact", "Opted Out", "Skipped", "Lost", "No Response", "Not Interested"];
  const commonPreviewIssues = topCounts(queue.flatMap((item) => item.regenerationPlan.length ? item.regenerationPlan : item.detectedIssues));
  const commonLeadIssues = topCounts(queue.flatMap((item) => [
    item.blockedReason,
    ...item.detectedIssues.filter((issue) => /contact|bad fit|opt-out|solicitation|phone|social|form|missing/i.test(issue)),
  ]));
  const outreachQualityNotes = topCounts(queue.flatMap((item) => item.rewritePlan));
  const recommendedFixes = topCounts(queue.flatMap((item) => item.improvementSuggestions));
  const previewsGenerated = queue.filter((item) => item.previewLink).length;
  const previewsPassed = queue.filter((item) => item.previewQualityScore >= 85 && item.regenerationPlan.length === 0).length;
  const prospectsKept = queue.filter((item) => keptStatuses.includes(item.status)).length;
  const prospectsBlocked = queue.filter((item) => blockedStatuses.includes(item.status) || item.blockedReason).length;
  return {
    id,
    mode: settings.mode,
    prospectsScanned: queue.length,
    prospectsKept,
    prospectsBlocked,
    previewsGenerated,
    previewsPassed,
    previewsFailed: Math.max(0, previewsGenerated - previewsPassed),
    commonPreviewIssues,
    commonLeadIssues,
    outreachQualityNotes,
    recommendedFixes,
    summary: queue.length
      ? `${prospectsKept} of ${queue.length} reviewed prospects are worth keeping. ${prospectsBlocked} remain blocked or need cleanup before outreach.`
      : "No autonomous review data has been generated yet.",
    createdAt,
  };
}

export function learningSummaryForQueue(
  queue: OutreachQueueItem[],
  runReviews: AutonomousRunReview[] = [],
): AutonomousLearningSummary {
  const performance = tradePerformance(queue);
  const bestPerformingTrades = performance.slice(0, 3).map((entry) => entry.trade);
  const worstPerformingTrades = [...performance].reverse().slice(0, 3).filter((entry) => entry.averageScore < 70).map((entry) => entry.trade);
  const replyRateByTrade = performance.map((entry) => ({
    trade: entry.trade,
    replyRate: entry.sent ? Math.round((entry.replies / entry.sent) * 100) : 0,
    positiveReplyRate: entry.sent ? Math.round((entry.positiveReplies / entry.sent) * 100) : 0,
  }));
  const previewFixes = topCounts(queue.flatMap((item) => item.regenerationPlan));
  const wordingFixes = topCounts(queue.flatMap((item) => item.rewritePlan));
  const commonFailureReasons = topCounts(queue.flatMap((item) => [...item.detectedIssues, item.blockedReason]));
  const recommendationsForNextRun = [
    bestPerformingTrades[0] ? `Prioritize ${bestPerformingTrades[0]} while quality and reply signals remain strong.` : "",
    previewFixes[0] ? `Review preview generation for: ${previewFixes[0]}.` : "",
    wordingFixes[0] ? `Tighten outreach wording around: ${wordingFixes[0]}.` : "",
    commonFailureReasons[0] ? `Watch for repeated blocker: ${commonFailureReasons[0]}.` : "",
  ].filter(Boolean);
  return {
    latestReview: runReviews[0] ?? (queue.length ? generateAutonomousRunReview(defaultAutonomousGrowthSettings, queue) : null),
    commonFailureReasons,
    bestPerformingTrades,
    worstPerformingTrades,
    bestPerformingCities: topCounts(queue.filter((item) => item.reviewScore >= 70).map((item) => item.city)),
    bestOutreachAngles: topCounts(queue.filter((item) => ["Replied", "Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested", "Won"].includes(item.status)).map((item) => item.subjectLine)),
    weakestOutreachAngles: topCounts(queue.filter((item) => item.rewritePlan.length || ["Not Interested", "Lost", "No Response"].includes(item.status)).map((item) => item.subjectLine)),
    replyRateByTrade,
    recommendationsForNextRun,
    recommendedTradesToPrioritize: bestPerformingTrades,
    recommendedTradesToPause: worstPerformingTrades,
    recommendedPreviewImprovements: previewFixes,
    recommendedWordingImprovements: wordingFixes,
  };
}
