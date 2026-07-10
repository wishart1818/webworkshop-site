import {
  displayTradeCategory,
  normalizeTradeCategory,
  outreachComplianceFooter,
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
} from "@/lib/top-prospects";

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
  createdAt: string;
  updatedAt: string;
};

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
    !publicPreviewReady(item.previewLink) || !item.emailBody.includes(item.previewLink) ? "Public /p/ preview link is missing from the email body." : "",
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
  if (!/would you be open|quick 10-minute call|worth a short call/i.test(outreachText)) plan.add("add one clear CTA");
  if (!/would rather not receive another note/i.test(outreachText)) plan.add("preserve opt-out language");
  if (/\bfree audit\b/i.test(outreachText)) plan.add("remove free audit language");
  if (!/One thing that already works well:/i.test(outreachText)) plan.add("replace generic compliment with one specific strength");
  return [...plan];
}

export function rewriteOutreachWithFixes(emailBody: string) {
  const optOut = emailBody.match(/Thanks,[\s\S]*?If you would rather not receive another note, just reply and I will close the loop\./i)?.[0]
    ?? outreachComplianceFooter();
  const greeting = emailBody.split("\n").find((line) => /^Hi\b/i.test(line.trim()))?.trim() ?? "Hi there,";
  const previewLink = emailBody.match(/https?:\/\/[^\s)]+\/p\/[A-Za-z0-9_-]{32}/)?.[0] ?? "";
  return [
    greeting,
    "",
    "I came across your business while looking at local service companies.",
    "",
    "One thing that already works well: customers can find enough public information to know you are active locally.",
    "",
    "One missed opportunity: the next step could be clearer for someone ready to ask about service or an estimate.",
    "",
    previewLink ? `I put together a short concept showing one possible direction: ${previewLink}` : "I put together a short concept showing one possible direction.",
    "",
    "Would you be open to a quick 10-minute call next week?",
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
  const previewReference = previewLink || "[PUBLIC PREVIEW LINK]";
  return {
    firstDm: noWebsite
      ? [
          "Hey, how's it going? I noticed you didn't have a website, so I made you a quick preview showing how you could get more calls.",
          "",
          "Would you like to see it?",
        ].join("\n")
      : [
          "Hey, how's it going? I came across your site and made you a quick preview showing a cleaner way customers could view services and reach out.",
          "",
          "Would you like to see it?",
        ].join("\n"),
    softerFirstDm: [
      "Hey, how's it going? I came across your page and made you a quick preview showing how a simple page could help people see your services and reach out.",
      "",
      "Would you like to see it?",
    ].join("\n"),
    yesReply: "Awesome, I'll send it over. I'm going to make a quick video walking through it too so it makes more sense.",
    loomScript: [
      "Hey, I just wanted to walk you through this quick.",
      "",
      `${context} and put together a simple preview of what your site could look like.`,
      "",
      `The main idea is giving people one clean place to see what you do, look at photos, and request a quote instead of having everything scattered through posts or messages.`,
      "",
      "This isn't live or anything, just a concept. But if you like the direction, I can finish it out and get it set up for you.",
    ].join("\n"),
    sendAfterLoom: [
      "Awesome, here it is:",
      "",
      "Loom walkthrough:",
      "[LOOM LINK]",
      "",
      "Preview:",
      previewReference,
      "",
      "It's just a concept, not live or anything. I just wanted to show you what it could look like.",
    ].join("\n"),
    websiteExplanation: "It's basically a simple website, but focused on giving people one clean place to see your services, photos, and request a quote.",
    nextStepsReply: "Yeah, if you like the direction, I can finish it out and get it ready to go live for you.",
    pricingReply: [
      "For this kind of site, it would be $1,000 total.",
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
    ?? "Show the public preview's cleaner service layout and quote path.";
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
