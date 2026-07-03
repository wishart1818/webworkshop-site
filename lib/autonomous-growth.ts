import {
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
  "Queued",
  "Sent",
  "Follow-up Needed",
  "Follow-up Sent",
  "Replied",
  "Positive Reply",
  "Not Interested",
  "Opted Out",
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
  updatedAt?: string;
};

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
  replyRate: number;
  positiveReplyRate: number;
  bestTrade: string;
  bestSubjectLine: string;
  bestOutreachAngle: string;
  wonLostProspects: string;
};

export type AutonomousGrowthDashboard = {
  settings: AutonomousGrowthSettings;
  env: {
    autoSendEnabled: boolean;
    sendProvider: string;
    hasResendApiKey: boolean;
    hasFromEmail: boolean;
    hasReplyToEmail: boolean;
    hasPostalAddress: boolean;
  };
  metrics: AutonomousGrowthMetrics;
  queue: OutreachQueueItem[];
};

export const defaultAutonomousGrowthSettings: AutonomousGrowthSettings = {
  mode: "off",
  killSwitch: true,
  targetCities: [],
  targetServiceAreas: [],
  targetTrades: [
    "Landscaping",
    "Power Washing",
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

export function normalizeAutonomousGrowthSettings(value: Partial<AutonomousGrowthSettings> = {}): AutonomousGrowthSettings {
  return {
    ...defaultAutonomousGrowthSettings,
    ...value,
    mode: normalizeAutonomousGrowthMode(value.mode),
    killSwitch: value.killSwitch ?? defaultAutonomousGrowthSettings.killSwitch,
    targetCities: stringArray(value.targetCities),
    targetServiceAreas: stringArray(value.targetServiceAreas),
    targetTrades: stringArray(value.targetTrades) as TradeCategory[],
    excludedTrades: stringArray(value.excludedTrades) as TradeCategory[],
    maxProspectsScannedPerDay: clampCap(value.maxProspectsScannedPerDay, 25, 0, 500),
    maxPreviewsGeneratedPerDay: clampCap(value.maxPreviewsGeneratedPerDay, 10, 0, 100),
    maxEmailsQueuedPerDay: clampCap(value.maxEmailsQueuedPerDay, 5, 0, 100),
    maxEmailsSentPerDay: clampCap(value.maxEmailsSentPerDay, 5, 0, 25),
    emailCooldownMinutes: clampCap(value.emailCooldownMinutes, 7, 5, 120),
    followUpsEnabled: value.followUpsEnabled ?? false,
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
  return {
    autoSendEnabled: environment.OUTREACH_AUTO_SEND_ENABLED === "true",
    sendProvider,
    hasResendApiKey: Boolean(environment.RESEND_API_KEY?.trim()),
    hasFromEmail: Boolean(environment.OUTREACH_FROM_EMAIL?.trim()),
    hasReplyToEmail: Boolean(environment.OUTREACH_REPLY_TO_EMAIL?.trim()),
    hasPostalAddress: Boolean(environment.OUTREACH_POSTAL_ADDRESS?.trim()),
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
  if (previewGate.status === "Blocked") return "Blocked";
  if (previewGate.status === "Needs Review" || !emailQuality.ready) return "Needs Review";
  if (settings.mode === "auto_email_pilot" && autoEligibility.eligible) return "Queued";
  if (settings.mode === "auto_email_pilot") return "Blocked";
  return "Eligible";
}

export function manualDmScript(prospect: Prospect, previewLink: string) {
  return `Hi ${prospect.businessName}, I put together a short concept for a clearer ${prospect.trade} website direction. No pressure, but you can preview it here: ${previewLink}`;
}

export function loomTalkingPoints(prospect: Prospect, previewLink: string) {
  return [
    `Open with how homeowners in ${prospect.city} would find and trust ${prospect.businessName}.`,
    `Point out one clear service path and one estimate action, without mentioning internal scores.`,
    `Show the public concept preview: ${previewLink}`,
    "Close by asking whether this direction would be worth a short call.",
  ].join("\n");
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
