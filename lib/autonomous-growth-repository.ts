import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  autoEmailPilotGateReasons,
  autonomousFeedbackLabels,
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluateQueuedEmailSendReadiness,
  evaluatePreviewQualityGate,
  evaluateSelfReview,
  buildMarketScoutDryRun,
  buildSmartAutonomousGrowthSnapshot,
  buildSmartRunSummary,
  generateAutonomousRunReview,
  learningSummaryForQueue,
  loomNeededNotificationDraft,
  loomTalkingPoints,
  manualQueueStatusTransitionAllowed,
  manualDmScript,
  normalizeAutonomousGrowthSettings,
  currentOutreachCopyVersion,
  outreachCopyRegenerationEligibility,
  outreachQueueStatuses,
  outreachEnvironment,
  queueStatusAfterManualAction,
  outreachRewritePlan,
  previewRegenerationPlan,
  queueStatusForPackage,
  rewriteOutreachWithFixes,
  smartRecommendationForGrowth,
  type AutonomousFeedbackLabel,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthMetrics,
  type AutonomousGrowthSettings,
  type AutonomousLearningSummary,
  type AutonomousNextAction,
  type AutonomousRunReview,
  type MarketScoutSettings,
  type OutreachQueueItem,
  type OutreachQueueStatus,
  type SmartRunSummary,
} from "@/lib/autonomous-growth";
import {
  activity,
  createProspect,
  generateOutreach,
  normalizeTradeCategory,
  prospectEmailNeedsManualVerification,
  prospectWrittenContactMethodIsUsable,
  reconcileProspectContactRouting,
  type Prospect,
} from "@/lib/prospect-engine";
import { prepareProspectForPreview } from "@/lib/preview-preparation";
import { getProspect, getProspectDatabase, saveProspect } from "@/lib/prospect-repository";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { getTopProspectJob, listTopProspectJobs } from "@/lib/top-prospect-repository";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { evaluateOutreachEmailQuality, publicProspectPreviewLink, type OutreachPreference } from "@/lib/top-prospects";
import { prepareTopProspectArtifactsWithResearch } from "@/lib/top-prospect-preview-preparation";
import {
  attachAutopilotRunReport,
  buildAutopilotDashboard,
  buildAutopilotHandoffFailureReport,
  buildAutopilotRunReport,
  buildAutopilotTopProspectJobReport,
  createAutopilotCampaign,
  defaultAutopilotCampaignSettings,
  runFakeAutopilotSmokeTest,
  transitionAutopilotCampaign,
  type AutopilotCampaign,
  type AutopilotCampaignSettings,
  type AutopilotDashboard,
  type AutopilotHandoffFailure,
  type AutopilotSmokeTestResult,
} from "@/lib/autopilot-campaign";
import { discoveryProviderCoverageStatus } from "@/lib/lead-discovery";
import { sendInternalOperatorNotification, sendInternalOperatorSms, type InternalNotificationInput } from "@/lib/internal-notifications";
import type { TopProspectJob } from "@/lib/top-prospects";

const globalAutonomous = globalThis as typeof globalThis & {
  autonomousGrowthSettingsMemory?: AutonomousGrowthSettings;
  outreachQueueMemory?: OutreachQueueItem[];
  autonomousRunReviewsMemory?: AutonomousRunReview[];
  autopilotCampaignMemory?: AutopilotCampaign;
  autopilotSmokeTestMemory?: AutopilotSmokeTestResult;
  smartAutonomousRunSummaryMemory?: SmartRunSummary;
  approvedAutoEmailQueueIdsMemory?: Set<string>;
};

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const autopilotEnvironmentKillSwitchEnabled = () => process.env.AUTOPILOT_DISABLED === "true";

function memorySettings() {
  if (!globalAutonomous.autonomousGrowthSettingsMemory) {
    globalAutonomous.autonomousGrowthSettingsMemory = { ...defaultAutonomousGrowthSettings, updatedAt: new Date().toISOString() };
  }
  return globalAutonomous.autonomousGrowthSettingsMemory;
}

function memoryQueue() {
  if (!globalAutonomous.outreachQueueMemory) globalAutonomous.outreachQueueMemory = [];
  return globalAutonomous.outreachQueueMemory;
}

function memoryRunReviews() {
  if (!globalAutonomous.autonomousRunReviewsMemory) globalAutonomous.autonomousRunReviewsMemory = [];
  return globalAutonomous.autonomousRunReviewsMemory;
}

function memoryAutopilotCampaign() {
  if (!globalAutonomous.autopilotCampaignMemory) {
    globalAutonomous.autopilotCampaignMemory = {
      ...createAutopilotCampaign(defaultAutopilotCampaignSettings, new Date(0)),
      status: "draft",
      notifications: [{
        id: "autopilot-ready",
        level: "info",
        title: "Autopilot is ready",
        body: "Set one trade and one market, then start Autopilot. Nothing will be sent automatically.",
        createdAt: new Date(0).toISOString(),
      }],
    };
  }
  return globalAutonomous.autopilotCampaignMemory;
}

function autopilotCampaignWithReport(campaign: AutopilotCampaign, report: AutopilotCampaign["latestRunReport"], now = new Date()): AutopilotCampaign {
  const runningHandoff = report?.handoffStatus === "starting_top_prospects" || report?.handoffStatus === "top_prospects_running";
  return {
    ...campaign,
    status: runningHandoff ? "running" : report?.status === "blocked" ? "paused" : "finished",
    queueCounts: report?.queueCounts ?? campaign.queueCounts,
    latestRunReport: report,
    lastRunAt: report?.completedAt ?? campaign.lastRunAt,
    updatedAt: now.toISOString(),
  };
}

async function refreshAutopilotCampaignFromTopProspects(campaign: AutopilotCampaign) {
  const jobId = campaign.latestRunReport?.topProspectJobId;
  if (campaign.status === "stopped") return campaign;
  if (!jobId || campaign.latestRunReport?.fakeOnly || campaign.latestRunReport?.handoffStatus === "failed_to_start") return campaign;
  try {
    const job = await getTopProspectJob(jobId);
    if (!job) return campaign;
    return autopilotCampaignWithReport(campaign, buildAutopilotTopProspectJobReport(campaign, job));
  } catch (error) {
    console.warn("[autonomous-growth] Autopilot could not refresh Top Prospects job.", { error: error instanceof Error ? error.name : "unknown", jobId });
    return campaign;
  }
}

function jsonArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonObject<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value && typeof value === "object" && !Array.isArray(value) ? value as T : fallback;
}

type SettingsRow = Prisma.AutonomousGrowthSettingsGetPayload<Record<string, never>>;
type QueueRow = Prisma.OutreachQueueItemGetPayload<Record<string, never>>;
type ReviewRow = Prisma.AutonomousRunReviewGetPayload<Record<string, never>>;

function settingsToDomain(row: SettingsRow): AutonomousGrowthSettings {
  return normalizeAutonomousGrowthSettings({
    mode: row.mode as AutonomousGrowthSettings["mode"],
    killSwitch: row.killSwitch,
    targetCities: jsonArray(row.targetCities),
    targetServiceAreas: jsonArray(row.targetServiceAreas),
    targetTrades: jsonArray(row.targetTrades) as AutonomousGrowthSettings["targetTrades"],
    excludedTrades: jsonArray(row.excludedTrades) as AutonomousGrowthSettings["excludedTrades"],
    maxProspectsScannedPerDay: row.maxProspectsScannedPerDay,
    maxPreviewsGeneratedPerDay: row.maxPreviewsGeneratedPerDay,
    maxEmailsQueuedPerDay: row.maxEmailsQueuedPerDay,
    maxEmailsSentPerDay: row.maxEmailsSentPerDay,
    emailCooldownMinutes: row.emailCooldownMinutes,
    followUpsEnabled: row.followUpsEnabled,
    styleProfiles: jsonObject(row.styleProfiles, defaultAutonomousGrowthSettings.styleProfiles),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function normalizeNextAction(value: string): AutonomousNextAction {
  if (["Keep", "Regenerate Preview", "Rewrite Outreach", "Needs Human Review", "Skip", "Bad Fit", "Never Contact"].includes(value)) {
    return value as AutonomousNextAction;
  }
  return "Needs Human Review";
}

function queueToDomain(row: QueueRow): OutreachQueueItem {
  return {
    id: row.id,
    prospectId: row.prospectId ?? "",
    topProspectResultId: row.topProspectResultId ?? "",
    businessName: row.businessName,
    trade: row.trade,
    city: row.city,
    website: row.website ?? "",
    email: row.email ?? "",
    contactSource: row.contactSource,
    contactConfidence: row.contactConfidence,
    previewLink: row.previewLink,
    previewQualityScore: row.previewQualityScore,
    subjectLine: row.subjectLine,
    emailBody: row.emailBody,
    dmScript: row.dmScript,
    loomTalkingPoints: row.loomTalkingPoints,
    eligibilityReason: row.eligibilityReason,
    blockedReason: row.blockedReason ?? "",
    reviewScore: row.reviewScore,
    reviewSummary: row.reviewSummary,
    improvementSuggestions: jsonArray(row.improvementSuggestions),
    detectedIssues: jsonArray(row.detectedIssues),
    recommendedNextAction: normalizeNextAction(row.recommendedNextAction),
    regenerationPlan: jsonArray(row.regenerationPlan),
    rewritePlan: jsonArray(row.rewritePlan),
    feedbackLabels: jsonArray(row.feedbackLabels).filter((label): label is AutonomousFeedbackLabel => autonomousFeedbackLabels.includes(label as AutonomousFeedbackLabel)),
    status: row.status as OutreachQueueStatus,
    sourceProvider: row.sourceProvider ?? "",
    queuedDate: row.queuedDate?.toISOString() ?? "",
    sentDate: row.sentDate?.toISOString() ?? "",
    followUpDate: row.followUpDate?.toISOString() ?? "",
    replyStatus: row.replyStatus ?? "",
    notes: row.notes ?? "",
    outreachCopyVersion: row.outreachCopyVersion ?? "",
    outreachCopyGeneratedAt: row.outreachCopyGeneratedAt?.toISOString() ?? "",
    previewVersion: row.previewVersion ?? "",
    lastRegeneratedAt: row.lastRegeneratedAt?.toISOString() ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function reviewToDomain(row: ReviewRow): AutonomousRunReview {
  return {
    id: row.id,
    mode: row.mode as AutonomousGrowthSettings["mode"],
    prospectsScanned: row.prospectsScanned,
    prospectsKept: row.prospectsKept,
    prospectsBlocked: row.prospectsBlocked,
    previewsGenerated: row.previewsGenerated,
    previewsPassed: row.previewsPassed,
    previewsFailed: row.previewsFailed,
    commonPreviewIssues: jsonArray(row.commonPreviewIssues),
    commonLeadIssues: jsonArray(row.commonLeadIssues),
    outreachQualityNotes: jsonArray(row.outreachQualityNotes),
    recommendedFixes: jsonArray(row.recommendedFixes),
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAutonomousGrowthSettings() {
  if (!hasDatabase) return structuredClone(memorySettings());
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const row = await database.autonomousGrowthSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      mode: defaultAutonomousGrowthSettings.mode,
      killSwitch: defaultAutonomousGrowthSettings.killSwitch,
      targetCities: defaultAutonomousGrowthSettings.targetCities,
      targetServiceAreas: defaultAutonomousGrowthSettings.targetServiceAreas,
      targetTrades: defaultAutonomousGrowthSettings.targetTrades,
      excludedTrades: defaultAutonomousGrowthSettings.excludedTrades,
      maxProspectsScannedPerDay: defaultAutonomousGrowthSettings.maxProspectsScannedPerDay,
      maxPreviewsGeneratedPerDay: defaultAutonomousGrowthSettings.maxPreviewsGeneratedPerDay,
      maxEmailsQueuedPerDay: defaultAutonomousGrowthSettings.maxEmailsQueuedPerDay,
      maxEmailsSentPerDay: defaultAutonomousGrowthSettings.maxEmailsSentPerDay,
      emailCooldownMinutes: defaultAutonomousGrowthSettings.emailCooldownMinutes,
      followUpsEnabled: defaultAutonomousGrowthSettings.followUpsEnabled,
      styleProfiles: defaultAutonomousGrowthSettings.styleProfiles,
    },
    update: {},
  });
  return settingsToDomain(row);
}

export async function updateAutonomousGrowthSettings(input: Partial<AutonomousGrowthSettings>) {
  const settings = normalizeAutonomousGrowthSettings({ ...await getAutonomousGrowthSettings(), ...input });
  if (!hasDatabase) {
    globalAutonomous.autonomousGrowthSettingsMemory = { ...settings, updatedAt: new Date().toISOString() };
    return structuredClone(globalAutonomous.autonomousGrowthSettingsMemory);
  }
  await ensureTopProspectSchema();
  const data = {
    mode: settings.mode,
    killSwitch: settings.killSwitch,
    targetCities: settings.targetCities,
    targetServiceAreas: settings.targetServiceAreas,
    targetTrades: settings.targetTrades,
    excludedTrades: settings.excludedTrades,
    maxProspectsScannedPerDay: settings.maxProspectsScannedPerDay,
    maxPreviewsGeneratedPerDay: settings.maxPreviewsGeneratedPerDay,
    maxEmailsQueuedPerDay: settings.maxEmailsQueuedPerDay,
    maxEmailsSentPerDay: settings.maxEmailsSentPerDay,
    emailCooldownMinutes: settings.emailCooldownMinutes,
    followUpsEnabled: settings.followUpsEnabled,
    styleProfiles: settings.styleProfiles,
  };
  const row = await getProspectDatabase().autonomousGrowthSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  return settingsToDomain(row);
}

async function listOutreachQueueItems() {
  if (!hasDatabase) return structuredClone(memoryQueue());
  await ensureTopProspectSchema();
  const rows = await getProspectDatabase().outreachQueueItem.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
  return rows.map(queueToDomain);
}

function memoryApprovedAutoEmailQueueIds() {
  if (!globalAutonomous.approvedAutoEmailQueueIdsMemory) globalAutonomous.approvedAutoEmailQueueIdsMemory = new Set();
  return globalAutonomous.approvedAutoEmailQueueIdsMemory;
}

export async function listOutreachQueueItemsForBackfill() {
  return listOutreachQueueItems();
}

async function findExistingQueueItemForProspect(prospectId: string) {
  const queue = await listOutreachQueueItems();
  return queue.find((item) => item.prospectId === prospectId) ?? null;
}

async function publicPreviewForProspect(prospectId: string) {
  const existing = await findExistingQueueItemForProspect(prospectId);
  if (existing?.previewLink && /\/p\//i.test(existing.previewLink) && !/\/engine(?:\/|$)/i.test(existing.previewLink)) {
    return { previewLink: existing.previewLink, topProspectResultId: existing.topProspectResultId || `manual-prospect-${prospectId}` };
  }
  if (!hasDatabase) return { previewLink: "", topProspectResultId: existing?.topProspectResultId || `manual-prospect-${prospectId}` };
  await ensureTopProspectSchema();
  const result = await getProspectDatabase().topProspectResult.findFirst({
    where: { prospectId, publicPreviewToken: { not: null } },
    orderBy: [{ packageGeneratedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, previewLink: true, publicPreviewToken: true },
  });
  if (!result?.publicPreviewToken) return { previewLink: "", topProspectResultId: existing?.topProspectResultId || `manual-prospect-${prospectId}` };
  return {
    previewLink: result.previewLink && /\/p\//i.test(result.previewLink) ? result.previewLink : publicProspectPreviewLink(result.publicPreviewToken),
    topProspectResultId: existing?.topProspectResultId || result.id,
  };
}

async function listAutonomousRunReviews() {
  if (!hasDatabase) return structuredClone(memoryRunReviews());
  await ensureTopProspectSchema();
  const rows = await getProspectDatabase().autonomousRunReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return rows.map(reviewToDomain);
}

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function metricsForQueue(queue: OutreachQueueItem[], settings: AutonomousGrowthSettings): AutonomousGrowthMetrics {
  const today = todayStart().getTime();
  const todayItems = queue.filter((item) => new Date(item.createdAt).getTime() >= today);
  const sentToday = queue.filter((item) => item.sentDate && new Date(item.sentDate).getTime() >= today).length;
  const sent = queue.filter((item) => ["Sent", "First DM Sent", "Loom Sent", "Pricing Sent"].includes(item.status) || item.sentDate);
  const replies = queue.filter((item) => ["Replied", "Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested"].includes(item.status) || item.replyStatus).length;
  const positiveReplies = queue.filter((item) => ["Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested", "Won"].includes(item.status) || /positive|prospect_said_yes|pricing_requested/i.test(item.replyStatus)).length;
  const tradeCounts = queue.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.trade]: (counts[item.trade] ?? 0) + 1 }), {});
  const bestTrade = Object.entries(tradeCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "Not enough data";
  const subjectCounts = queue.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.subjectLine]: (counts[item.subjectLine] ?? 0) + 1 }), {});
  const bestSubjectLine = Object.entries(subjectCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "Not enough data";
  const ready = queue.filter((item) => ["Eligible", "Queued", "DM Draft", "Ready for Loom"].includes(item.status));
  const loomNeeded = queue.filter((item) => item.status === "Loom Needed").length;
  const loomRecorded = queue.filter((item) => item.status === "Loom Recorded").length;
  const loomSent = queue.filter((item) => item.status === "Loom Sent").length;
  const followUpsDue = queue.filter((item) => item.status === "Follow-up Needed").length;
  const scored = queue.filter((item) => item.reviewScore || item.previewQualityScore);
  return {
    prospectsFoundToday: todayItems.length,
    previewsGeneratedToday: todayItems.filter((item) => item.previewLink).length,
    emailReadyLeads: ready.length,
    blockedPhoneOnlyLeads: queue.filter((item) => /phone-only/i.test(item.blockedReason)).length,
    blockedBadFitLeads: queue.filter((item) => item.status === "Bad Fit" || /bad-fit|inactive|franchise|duplicate/i.test(item.blockedReason)).length,
    emailsQueued: queue.filter((item) => item.status === "Queued").length,
    emailsSentToday: sentToday,
    dailyCapRemaining: Math.max(0, Math.min(settings.maxEmailsSentPerDay, outreachEnvironment().dailyCap) - sentToday),
    replies,
    positiveReplies,
    loomNeeded,
    loomRecorded,
    loomSent,
    followUpsDue,
    replyRate: sent.length ? Math.round((replies / sent.length) * 100) : 0,
    positiveReplyRate: sent.length ? Math.round((positiveReplies / sent.length) * 100) : 0,
    bestTrade,
    bestSubjectLine,
    bestOutreachAngle: ready[0]?.eligibilityReason ?? "Not enough data",
    wonLostProspects: `${queue.filter((item) => item.status === "Won").length} won / ${queue.filter((item) => ["Lost", "Not Interested", "Bad Fit"].includes(item.status)).length} lost`,
    averagePreviewQualityScore: scored.length ? Math.round(scored.reduce((sum, item) => sum + item.previewQualityScore, 0) / scored.length) : 0,
    averageLeadScore: scored.length ? Math.round(scored.reduce((sum, item) => sum + (item.reviewScore || item.previewQualityScore), 0) / scored.length) : 0,
  };
}

function buildCurrentAutopilotDashboard(campaign: AutopilotCampaign, queue: OutreachQueueItem[]) {
  return buildAutopilotDashboard(campaign, queue, hasDatabase, discoveryProviderCoverageStatus(), autopilotEnvironmentKillSwitchEnabled());
}

async function sendInternalOperatorNotificationSafely(
  input: InternalNotificationInput,
  options: { sms?: boolean } = {},
) {
  const [emailResult, smsResult] = await Promise.all([
    sendInternalOperatorNotification(input),
    options.sms === false
      ? Promise.resolve({ sent: false, configured: false, blockedReasons: ["SMS disabled for this workflow."] })
      : sendInternalOperatorSms(input),
  ]);
  if (!emailResult.sent && emailResult.configured) {
    console.warn("[operator-notification] Internal email notification failed safely.", { reasons: emailResult.blockedReasons });
  }
  if (!smsResult.sent && smsResult.configured) {
    console.warn("[operator-notification] Internal SMS notification failed safely.", { reasons: smsResult.blockedReasons });
  }
}

async function listTopProspectJobsSafely() {
  if (!hasDatabase) return [] as TopProspectJob[];
  try {
    return await listTopProspectJobs();
  } catch (error) {
    console.warn("[autonomous-growth] Smart snapshot could not read Top Prospects jobs.", { error: error instanceof Error ? error.name : "unknown" });
    return [] as TopProspectJob[];
  }
}

function topProspectHasPublicPreview(previewLink: string) {
  return /\/p\//i.test(previewLink) && !/\/engine(?:\/|$)/i.test(previewLink);
}

function topProspectBackfillBlockedReason(result: TopProspectJob["results"][number]) {
  const text = `${result.rejectionReason ?? ""} ${result.emailQuality.readinessLabel} ${result.prospect.status} ${result.prospect.notes.join(" ")}`;
  if (result.packageStatus === "SENT" || result.packageSentAt) return "already contacted";
  if (result.packageStatus === "SKIPPED" || result.packageSkippedAt) return "package skipped";
  if (/opted out|bounced|complained|suppressed|never contact|not interested/i.test(text)) return "suppressed or closed";
  if (/phone-only/i.test(text)) return "phone-only";
  if (result.resultBucket === "blocked") return result.rejectionReason ?? "blocked";
  if (!result.selected && result.resultBucket !== "reviewable_lower_priority" && result.packageStatus === "NOT_GENERATED") return "not qualified";
  if (!prospectWrittenContactMethodIsUsable(result.prospect) && result.prospect.recommendedContactMethod !== "verify_email_manually") return "no usable written contact path";
  return "";
}

async function syncTopProspectResultIntoQueue(
  result: TopProspectJob["results"][number],
  outreachPreference: OutreachPreference,
) {
  const previewLink = topProspectHasPublicPreview(result.previewLink)
    ? result.previewLink
    : publicProspectPreviewLink(createPublicPreviewToken());
  const prepared = await prepareTopProspectArtifactsWithResearch(result.prospect, previewLink, outreachPreference);
  const saved = hasDatabase
    ? await saveProspect(prepared.prospect)
    : prepared.prospect;
  if (hasDatabase) {
    const scores = prepared.assessment.salesScores;
    const token = previewLink.split("/p/")[1] ?? null;
    const refreshed = await getProspectDatabase().topProspectResult.updateMany({
      where: {
        id: result.id,
        packageSentAt: null,
        NOT: { packageStatus: "SENT" },
      },
      data: {
        opportunityScore: prepared.assessment.opportunityScore,
        ...scores,
        onlinePresenceGapScore: prepared.assessment.presenceScores?.onlinePresenceGapScore ?? 0,
        businessActivityScore: prepared.assessment.presenceScores?.businessActivityScore ?? 0,
        websiteNeedScore: prepared.assessment.presenceScores?.websiteNeedScore ?? 0,
        mainWeakness: prepared.assessment.mainWeakness,
        whyMayBuy: prepared.assessment.whyMayBuy,
        pitchAngle: prepared.assessment.pitchAngle,
        buildPrompt: prepared.buildPrompt,
        previewLink: prepared.previewLink,
        ...(token ? { publicPreviewToken: token } : {}),
        packageStatus: "PACKAGE_GENERATED",
        packageGeneratedAt: new Date(),
        packageReviewedAt: null,
        packageApprovedAt: null,
        packageSentAt: null,
        packageSkippedAt: null,
      },
    });
    if (refreshed.count !== 1) {
      throw new Error("The Top Prospect package changed before refresh completed.");
    }
  }
  return upsertAutonomousQueueItemFromPackage({
    internalSmsEnabled: false,
    outreachPreference,
    previewLink: prepared.previewLink,
    prospect: saved,
    sourceProvider: "Smart Backfill",
    topProspectResultId: result.id,
  });
}

export async function getAutonomousGrowthDashboard(): Promise<AutonomousGrowthDashboard & { autopilot: AutopilotDashboard }> {
  const settings = await getAutonomousGrowthSettings();
  const queue = await listOutreachQueueItems();
  const runReviews = await listAutonomousRunReviews();
  const topProspectJobs = await listTopProspectJobsSafely();
  const env = outreachEnvironment();
  globalAutonomous.autopilotCampaignMemory = await refreshAutopilotCampaignFromTopProspects(memoryAutopilotCampaign());
  const autopilot = buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
  const smartGrowth = buildSmartAutonomousGrowthSnapshot({
    queue,
    topProspectJobs,
    lastRunSummary: globalAutonomous.smartAutonomousRunSummaryMemory,
  });
  return {
    settings,
    env: {
      autoSendEnabled: env.autoSendEnabled,
      fullAutoSendEnabled: env.fullAutoSendEnabled,
      emailKillSwitchEnabled: env.emailKillSwitchEnabled,
      autopilotDisabled: env.autopilotDisabled,
      sendProvider: env.sendProvider || "not configured",
      hasResendApiKey: env.hasResendApiKey,
      hasFromEmail: env.hasFromEmail,
      hasReplyToEmail: env.hasReplyToEmail,
      hasPostalAddress: env.hasPostalAddress,
      hasNotifyEmail: env.hasNotifyEmail,
      hasNotifyFromEmail: env.hasNotifyFromEmail,
      notifyOnLoomNeeded: env.notifyOnLoomNeeded,
      dailyCap: env.dailyCap,
    },
    metrics: metricsForQueue(queue, settings),
    queue,
    learning: learningSummaryForQueue(queue, runReviews),
    smartGrowth,
    autopilot,
  };
}

export async function startAutopilotCampaign(input: Partial<AutopilotCampaignSettings>, topProspectJob: TopProspectJob) {
  const campaign = createAutopilotCampaign(input);
  const queue = await listOutreachQueueItems();
  const report = buildAutopilotTopProspectJobReport(campaign, topProspectJob);
  globalAutonomous.autopilotCampaignMemory = attachAutopilotRunReport(campaign, report);
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function failAutopilotCampaignHandoff(input: Partial<AutopilotCampaignSettings>, failure: AutopilotHandoffFailure) {
  const campaign = createAutopilotCampaign(input);
  const queue = await listOutreachQueueItems();
  const report = buildAutopilotHandoffFailureReport(campaign, failure);
  globalAutonomous.autopilotCampaignMemory = attachAutopilotRunReport(campaign, report);
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function retryAutopilotCampaignHandoff(topProspectJob: TopProspectJob) {
  const campaign = memoryAutopilotCampaign();
  const queue = await listOutreachQueueItems();
  const report = buildAutopilotTopProspectJobReport(campaign, topProspectJob);
  globalAutonomous.autopilotCampaignMemory = attachAutopilotRunReport({ ...campaign, status: "running" }, report);
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function pauseAutopilotCampaign() {
  const queue = await listOutreachQueueItems();
  globalAutonomous.autopilotCampaignMemory = transitionAutopilotCampaign(memoryAutopilotCampaign(), "pause");
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function resumeAutopilotCampaign() {
  const queue = await listOutreachQueueItems();
  globalAutonomous.autopilotCampaignMemory = transitionAutopilotCampaign(memoryAutopilotCampaign(), "resume");
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function stopAutopilotCampaign() {
  const queue = await listOutreachQueueItems();
  globalAutonomous.autopilotCampaignMemory = transitionAutopilotCampaign(memoryAutopilotCampaign(), "stop");
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function runAutopilotNextBatchNow() {
  const queue = await listOutreachQueueItems();
  const campaign = memoryAutopilotCampaign();
  const runningCampaign = campaign.status === "paused" ? transitionAutopilotCampaign(campaign, "resume") : campaign;
  const report = buildAutopilotRunReport(runningCampaign, queue);
  globalAutonomous.autopilotCampaignMemory = attachAutopilotRunReport(runningCampaign, report);
  return buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
}

export async function runFakeAutopilotSmokeTestForDashboard() {
  const queue = await listOutreachQueueItems();
  const campaign = memoryAutopilotCampaign();
  const smokeTest = runFakeAutopilotSmokeTest(campaign);
  globalAutonomous.autopilotSmokeTestMemory = smokeTest;
  globalAutonomous.autopilotCampaignMemory = attachAutopilotRunReport(campaign, smokeTest.report);
  return {
    autopilot: buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue),
    smokeTest,
  };
}

export type SmartGrowthActionResult = {
  ok: boolean;
  dryRun: boolean;
  message: string;
  smartGrowth: AutonomousGrowthDashboard["smartGrowth"];
  summary: SmartRunSummary;
  autoEmailPilot: AutoEmailPilotCycleResult;
};

export async function processExistingQualifiedProspects(options: { dryRun?: boolean } = {}): Promise<SmartGrowthActionResult> {
  const dryRun = options.dryRun ?? false;
  const initialQueue = await listOutreachQueueItems();
  const jobs = await listTopProspectJobsSafely();
  const initialSnapshot = buildSmartAutonomousGrowthSnapshot({ queue: initialQueue, topProspectJobs: jobs });
  const touchedResultIds = new Set(initialQueue.map((item) => item.topProspectResultId).filter(Boolean));
  const skippedReasons: Record<string, number> = { ...initialSnapshot.existingQualifiedUnsent.blockedSkippedReasons };
  let generatedMissingPackages = 0;
  let refreshedCopyCount = 0;
  let reconciledQueueItems = 0;
  let autoEmailPilot: AutoEmailPilotCycleResult = {
    attempted: 0,
    sent: 0,
    blocked: 0,
    approvedQueued: 0,
    blockedReasons: [],
  };

  if (!dryRun) {
    const regeneration = await regenerateUnsentOutreachCopy();
    refreshedCopyCount = regeneration.updated;
    for (const [reason, count] of Object.entries(regeneration.skippedReasons)) {
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + count;
    }
    for (const item of initialQueue) {
      const reconciled = await reconcileQueueItem(item);
      if (
        reconciled.email !== item.email
        || reconciled.contactSource !== item.contactSource
        || reconciled.status !== item.status
        || reconciled.blockedReason !== item.blockedReason
      ) reconciledQueueItems += 1;
    }
    for (const job of jobs) {
      const candidates = [...job.results, ...(job.reviewableLowerPriority ?? []), ...job.reviewedNotRecommended];
      const seenInJob = new Set<string>();
      for (const result of candidates) {
        if (seenInJob.has(result.id) || touchedResultIds.has(result.id)) continue;
        seenInJob.add(result.id);
        const blockedReason = topProspectBackfillBlockedReason(result);
        if (blockedReason) {
          skippedReasons[blockedReason] = (skippedReasons[blockedReason] ?? 0) + 1;
          continue;
        }
        try {
          await syncTopProspectResultIntoQueue(result, job.input.outreachPreference);
          generatedMissingPackages += 1;
          touchedResultIds.add(result.id);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "package generation failed";
          skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
          console.warn("[autonomous-growth] Smart backfill skipped a Top Prospects result safely.", {
            resultId: result.id,
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    }
    autoEmailPilot = await runAutoEmailPilotCycle();
  }

  const queue = await listOutreachQueueItems();
  const refreshedJobs = await listTopProspectJobsSafely();
  const snapshot = buildSmartAutonomousGrowthSnapshot({ queue, topProspectJobs: refreshedJobs });
  const existing = {
    ...snapshot.existingQualifiedUnsent,
    generatedMissingPackages,
    refreshedCopyCount,
    blockedSkippedReasons: skippedReasons,
  };
  const recommendation = smartRecommendationForGrowth({ existing, scout: snapshot.marketScout });
  const summary = buildSmartRunSummary({
    existing,
    scout: snapshot.marketScout,
    recommendation,
    actionLabel: dryRun ? "Smart Backfill Dry Run" : "Process Existing Qualified Prospects",
    pilotEmailSentCount: autoEmailPilot.sent,
  });
  globalAutonomous.smartAutonomousRunSummaryMemory = summary;
  const smartGrowth = buildSmartAutonomousGrowthSnapshot({
    queue,
    topProspectJobs: refreshedJobs,
    lastRunSummary: summary,
  });
  return {
    ok: true,
    dryRun,
    message: dryRun
      ? "Smart Backfill dry run checked saved queues and Top Prospects results. Nothing was generated or sent."
      : `Processed existing qualified prospects. Reconciled ${reconciledQueueItems} queue item${reconciledQueueItems === 1 ? "" : "s"}, refreshed ${refreshedCopyCount} copy item${refreshedCopyCount === 1 ? "" : "s"}, generated ${generatedMissingPackages} missing package${generatedMissingPackages === 1 ? "" : "s"}, and sent ${autoEmailPilot.sent} approved email${autoEmailPilot.sent === 1 ? "" : "s"}. No DMs, forms, calls, Looms, SMS, or follow-ups were sent.`,
    smartGrowth,
    summary,
    autoEmailPilot,
  };
}

export async function runMarketScoutDryRunForDashboard(input?: Partial<MarketScoutSettings>): Promise<SmartGrowthActionResult> {
  const queue = await listOutreachQueueItems();
  const jobs = await listTopProspectJobsSafely();
  const existing = buildSmartAutonomousGrowthSnapshot({ queue, topProspectJobs: jobs }).existingQualifiedUnsent;
  const scout = buildMarketScoutDryRun(input, jobs);
  const recommendation = smartRecommendationForGrowth({ existing, scout });
  const summary = buildSmartRunSummary({ existing, scout, recommendation, actionLabel: "Market Scout Dry Run" });
  globalAutonomous.smartAutonomousRunSummaryMemory = summary;
  const smartGrowth = buildSmartAutonomousGrowthSnapshot({ queue, topProspectJobs: jobs, marketScoutSettings: input, lastRunSummary: summary });
  return {
    ok: true,
    dryRun: true,
    message: `${scout.message} This was a bounded dry run. No provider calls or outreach sends happened.`,
    smartGrowth,
    summary,
    autoEmailPilot: { attempted: 0, sent: 0, blocked: 0, approvedQueued: 0, blockedReasons: [] },
  };
}

export async function runSmartAutonomousDryRun(): Promise<SmartGrowthActionResult> {
  const queue = await listOutreachQueueItems();
  const jobs = await listTopProspectJobsSafely();
  const snapshot = buildSmartAutonomousGrowthSnapshot({ queue, topProspectJobs: jobs });
  const actionLabel = snapshot.existingQualifiedUnsent.total > 0 || snapshot.existingQualifiedUnsent.needsRefreshedCopy > 0
    ? "Smart Autonomous Dry Run: Use Existing Prospects First"
    : "Smart Autonomous Dry Run: Scout Next Market";
  const summary = buildSmartRunSummary({
    existing: snapshot.existingQualifiedUnsent,
    scout: snapshot.marketScout,
    recommendation: snapshot.recommendation,
    actionLabel,
  });
  globalAutonomous.smartAutonomousRunSummaryMemory = summary;
  return {
    ok: true,
    dryRun: true,
    message: `${snapshot.recommendation.nextBestMove} Dry run only. Nothing was sent or submitted.`,
    smartGrowth: buildSmartAutonomousGrowthSnapshot({ queue, topProspectJobs: jobs, lastRunSummary: summary }),
    summary,
    autoEmailPilot: { attempted: 0, sent: 0, blocked: 0, approvedQueued: 0, blockedReasons: [] },
  };
}

function sourceForProspect(prospect: Prospect) {
  if (
    prospect.email
    && (
      !prospectEmailNeedsManualVerification(prospect)
      || (prospect.recommendedContactMethod === "send_email" && prospect.bestManualContactMethod === "email")
    )
  ) return "Public email";
  if (prospect.quoteFormUrl) return "Quote form";
  if (prospect.contactFormUrl) return "Contact form";
  if (prospect.facebookUrl || prospect.instagramUrl || prospect.linkedinUrl || /facebook|instagram|linkedin/i.test(prospect.profileUrl)) return "Social profile";
  if (prospect.email) return "Email needs manual verification";
  if (prospect.phone) return "Phone";
  return "Manual research";
}

function blockedReasonText(reasons: string[], previewReasons: string[]) {
  return [...previewReasons, ...reasons].filter(Boolean).join(" ");
}

function cityStateFromQueueCity(value: string) {
  const match = value.match(/^(.+?),\s*([A-Z]{2})$/i);
  return {
    city: match?.[1]?.trim() || value || "Unknown",
    state: match?.[2]?.trim().toUpperCase() || "NA",
  };
}

function prospectForQueueCopyRegeneration(item: OutreachQueueItem): Prospect {
  const location = cityStateFromQueueCity(item.city);
  const contactSource = item.contactSource.toLowerCase();
  const manualContact: Prospect["bestManualContactMethod"] =
    /quote/.test(contactSource) ? "quote_form"
      : /contact form/.test(contactSource) ? "contact_form"
        : /facebook/.test(contactSource) ? "facebook"
          : /instagram|social/.test(contactSource) ? "instagram"
            : /linkedin/.test(contactSource) ? "linkedin"
              : item.email ? "email" : "unknown";
  const recommendedContactMethod: Prospect["recommendedContactMethod"] =
    item.email ? "send_email"
      : manualContact === "quote_form" || manualContact === "contact_form" ? "submit_contact_form"
        : manualContact === "facebook" ? "message_on_facebook"
          : manualContact === "instagram" || manualContact === "linkedin" ? "message_on_social"
            : "needs_manual_contact_research";
  return createProspect({
    businessName: item.businessName,
    website: item.website,
    phone: "",
    email: item.email,
    city: location.city,
    state: location.state,
    trade: normalizeTradeCategory(item.trade) ?? "Pressure Washing",
    serviceArea: `${location.city} and nearby communities`,
    sizeIndicator: "Growing",
    status: "Reviewed",
    prospectType: item.website ? "redesign" : "no_website_social_only",
    classification: item.website ? "website_redesign" : "social_only",
    contactFormUrl: manualContact === "contact_form" ? item.website : "",
    quoteFormUrl: manualContact === "quote_form" ? item.website : "",
    facebookUrl: manualContact === "facebook" ? "https://facebook.com/" : "",
    instagramUrl: manualContact === "instagram" ? "https://instagram.com/" : "",
    linkedinUrl: manualContact === "linkedin" ? "https://linkedin.com/company/" : "",
    bestManualContactMethod: manualContact,
    recommendedContactMethod,
    contactConfidence: item.contactConfidence >= 70 ? "high" : item.contactConfidence >= 40 ? "medium" : "low",
    sourceConfidence: item.contactConfidence,
  });
}

async function sendLoomNeededNotificationIfConfigured(item: OutreachQueueItem, requestedStatus: OutreachQueueStatus) {
  if (requestedStatus !== "Prospect Said Yes") return;
  const notification = loomNeededNotificationDraft(item);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.OUTREACH_NOTIFY_EMAIL?.trim();
  const from = process.env.OUTREACH_NOTIFY_FROM_EMAIL?.trim();
  if (!notification.configured || !apiKey || !to || !from) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: notification.subject,
        text: notification.body,
      }),
    });
    if (!response.ok) {
      console.warn("[autonomous-growth] Loom notification was not accepted by provider.", { status: response.status });
    }
  } catch (error) {
    console.warn("[autonomous-growth] Loom notification failed safely.", { error: error instanceof Error ? error.name : "unknown" });
  }
}

function feedbackCategory(label: AutonomousFeedbackLabel) {
  if (/preview/i.test(label)) return "preview";
  if (/outreach/i.test(label)) return "outreach";
  if (/replied|reply|no response/i.test(label)) return "reply";
  if (/too expensive|provider|not interested/i.test(label)) return "lost_reason";
  if (/contact/i.test(label)) return "contact";
  return "lead";
}

function feedbackReview(item: OutreachQueueItem, feedbackLabels = item.feedbackLabels) {
  const previewGate = {
    status: item.previewQualityScore >= 85 ? "Eligible" as const : item.previewQualityScore < 70 ? "Blocked" as const : "Needs Review" as const,
    score: item.previewQualityScore,
    checks: [],
    reasons: item.detectedIssues,
  };
  const regenerationPlan = previewRegenerationPlan(previewGate, feedbackLabels);
  const rewritePlan = outreachRewritePlan(item.emailBody, feedbackLabels);
  const detectedIssues = new Set(item.detectedIssues);
  if (feedbackLabels.includes("Bad lead")) detectedIssues.add("Manual feedback marked this as a bad lead.");
  if (feedbackLabels.includes("Wrong contact")) detectedIssues.add("Manual feedback marked the contact as wrong.");
  if (feedbackLabels.includes("Never contact")) detectedIssues.add("Manual feedback marked this as never contact.");
  let recommendedNextAction: AutonomousNextAction = item.recommendedNextAction;
  if (feedbackLabels.includes("Never contact")) recommendedNextAction = "Never Contact";
  else if (feedbackLabels.includes("Bad fit")) recommendedNextAction = "Bad Fit";
  else if (feedbackLabels.includes("Preview looked bad") || regenerationPlan.length) recommendedNextAction = "Regenerate Preview";
  else if (feedbackLabels.includes("Outreach sounded too AI-ish") || rewritePlan.length) recommendedNextAction = "Rewrite Outreach";
  else if (feedbackLabels.includes("Bad lead")) recommendedNextAction = "Skip";
  else if (feedbackLabels.includes("Good lead") || feedbackLabels.includes("Preview looked good") || feedbackLabels.includes("Outreach sounded good")) recommendedNextAction = "Keep";
  const reviewScore = Math.max(0, Math.min(100, item.reviewScore
    + (feedbackLabels.includes("Good lead") ? 8 : 0)
    + (feedbackLabels.includes("Positive reply") ? 12 : 0)
    - (feedbackLabels.includes("Bad lead") ? 18 : 0)
    - (feedbackLabels.includes("Preview looked bad") ? 10 : 0)
    - (feedbackLabels.includes("Outreach sounded too AI-ish") ? 8 : 0)));
  return {
    reviewScore,
    reviewSummary: `${item.businessName} review: ${recommendedNextAction}. Feedback has been recorded for future recommendations.`,
    improvementSuggestions: [...new Set([...item.improvementSuggestions, ...regenerationPlan, ...rewritePlan])],
    detectedIssues: [...detectedIssues],
    recommendedNextAction,
    regenerationPlan,
    rewritePlan,
  };
}

async function recordRunReview(settings: AutonomousGrowthSettings, queue: OutreachQueueItem[]) {
  const review = generateAutonomousRunReview(settings, queue);
  if (!hasDatabase) {
    memoryRunReviews().unshift(review);
    globalAutonomous.autonomousRunReviewsMemory = memoryRunReviews().slice(0, 12);
    return review;
  }
  await getProspectDatabase().autonomousRunReview.create({
    data: {
      mode: review.mode,
      prospectsScanned: review.prospectsScanned,
      prospectsKept: review.prospectsKept,
      prospectsBlocked: review.prospectsBlocked,
      previewsGenerated: review.previewsGenerated,
      previewsPassed: review.previewsPassed,
      previewsFailed: review.previewsFailed,
      commonPreviewIssues: review.commonPreviewIssues,
      commonLeadIssues: review.commonLeadIssues,
      outreachQualityNotes: review.outreachQualityNotes,
      recommendedFixes: review.recommendedFixes,
      summary: review.summary,
    },
  });
  return review;
}

async function recordLearningEvent(item: OutreachQueueItem) {
  if (!hasDatabase) return;
  await getProspectDatabase().autonomousLearningEvent.create({
    data: {
      queueItemId: item.id,
      topProspectResultId: item.topProspectResultId || null,
      trade: item.trade,
      city: item.city,
      leadSource: item.sourceProvider || "Top Prospects",
      previewStyle: item.regenerationPlan[0] ?? "Current style profile",
      subjectLineAngle: item.subjectLine,
      outreachAngle: item.eligibilityReason,
      contactMethod: item.contactSource,
      previewQualityScore: item.previewQualityScore,
      reviewScore: item.reviewScore,
      replyStatus: item.replyStatus || null,
      positiveReplyStatus: ["Positive Reply", "Prospect Said Yes", "Loom Needed", "Pricing Requested", "Won"].includes(item.status) ? "positive" : null,
      lostReason: ["Lost", "No Response", "Not Interested", "Bad Fit", "Skipped", "Never Contact"].includes(item.status) ? item.status : null,
      manualNote: item.notes || null,
      feedbackLabels: item.feedbackLabels,
    },
  });
}

export type SendQueuedEmailResult = {
  item: OutreachQueueItem | null;
  sent: boolean;
  blockedReasons: string[];
  providerMessageId?: string;
};

export type FullAutoEmailBatchResult = {
  attempted: number;
  sent: number;
  blocked: number;
  fullAutoEnabled: boolean;
  blockedReasons: Array<{
    queueItemId: string;
    businessName: string;
    email: string;
    reasons: string[];
  }>;
};

export type ApproveAndQueueEmailResult = {
  item: OutreachQueueItem | null;
  queued: boolean;
  blockedReasons: string[];
};

export type AutoEmailPilotCycleResult = {
  attempted: number;
  sent: number;
  blocked: number;
  approvedQueued: number;
  blockedReasons: Array<{
    queueItemId: string;
    businessName: string;
    email: string;
    reasons: string[];
  }>;
};

export type EmailSuppressionReason = "bounce" | "complaint" | "unsubscribe" | "manual_suppression";
export type EmailSuppressionResult = {
  matched: number;
  updated: number;
  reason: EmailSuppressionReason;
};

class ApprovalBlockedError extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join("; "));
    this.name = "ApprovalBlockedError";
  }
}

export type OutreachCopyRegenerationSummary = {
  copyVersion: string;
  updated: number;
  skipped: number;
  oldUnsentPackagesNeedingRegeneration: number;
  updatedItems: string[];
  skippedReasons: Record<string, number>;
  message: string;
};

function suppressionStatus(reason: EmailSuppressionReason): OutreachQueueStatus {
  if (reason === "bounce") return "Bounced";
  if (reason === "complaint") return "Complained";
  if (reason === "unsubscribe") return "Opted Out";
  return "Suppressed";
}

function normalizeEmailAddress(value: string) {
  return value.trim().toLowerCase();
}

const protectedQueueStatuses = new Set<OutreachQueueStatus>([
  "Sending",
  "Sent",
  "Bounced",
  "Complained",
  "Opted Out",
  "Suppressed",
  "Never Contact",
  "Not Interested",
  "Bad Fit",
  "Lost",
  "Skipped",
  "No Response",
  "Won",
  "Replied",
  "Positive Reply",
  "First DM Sent",
  "Prospect Said Yes",
  "Loom Needed",
  "Ready for Loom",
  "Loom Recorded",
  "Loom Sent",
  "Pricing Requested",
  "Pricing Sent",
  "Follow-up Needed",
  "Follow-up Sent",
]);
const approvableQueueStatuses = new Set<OutreachQueueStatus>(["Eligible", "Needs Review"]);

const ambiguousOutcomeMarker = "[auto-email-ambiguous]";
const approvalMarker = "[auto-email-approved]";
const claimMarkerPrefix = "[auto-email-claim:";

function queueItemHasAmbiguousOutcome(item: Pick<OutreachQueueItem, "notes">) {
  return item.notes.includes(ambiguousOutcomeMarker);
}

function queueItemDraftMutationIsProtected(item: Pick<OutreachQueueItem, "status" | "notes" | "sentDate">) {
  return Boolean(item.sentDate)
    || item.status === "Queued"
    || protectedQueueStatuses.has(item.status)
    || queueItemHasAmbiguousOutcome(item);
}

function claimMarker(token: string) {
  return `${claimMarkerPrefix}${token}]`;
}

function stripClaimMarkers(value: string) {
  return value
    .split("\n")
    .filter((line) => !line.startsWith(claimMarkerPrefix))
    .join("\n")
    .trim();
}

function stripApprovalMarker(value: string) {
  return value
    .split("\n")
    .filter((line) => line !== approvalMarker)
    .join("\n")
    .trim();
}

async function persistQueueSnapshot(item: OutreachQueueItem, expected: Pick<OutreachQueueItem, "status" | "updatedAt">) {
  if (!hasDatabase) {
    const index = memoryQueue().findIndex((entry) => entry.id === item.id);
    if (index < 0) return null;
    if (
      memoryQueue()[index].status !== expected.status
      || memoryQueue()[index].updatedAt !== expected.updatedAt
      || protectedQueueStatuses.has(memoryQueue()[index].status)
      || queueItemHasAmbiguousOutcome(memoryQueue()[index])
    ) return structuredClone(memoryQueue()[index]);
    memoryQueue()[index] = structuredClone(item);
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const updated = await database.outreachQueueItem.updateMany({
    where: {
      id: item.id,
      status: expected.status,
      updatedAt: new Date(expected.updatedAt),
      sentDate: null,
      NOT: [
        { status: { in: [...protectedQueueStatuses] } },
        { notes: { contains: ambiguousOutcomeMarker } },
      ],
    },
    data: {
      email: item.email || null,
      contactSource: item.contactSource,
      contactConfidence: item.contactConfidence,
      eligibilityReason: item.eligibilityReason,
      blockedReason: item.blockedReason || null,
      recommendedNextAction: item.recommendedNextAction,
      status: item.status,
      queuedDate: item.queuedDate ? new Date(item.queuedDate) : null,
      notes: item.notes || null,
    },
  });
  const row = await database.outreachQueueItem.findUnique({ where: { id: item.id } });
  if (!row) return null;
  if (updated.count !== 1) return queueToDomain(row);
  return queueToDomain(row);
}

async function queueItemHasPersistedApproval(item: OutreachQueueItem, transaction?: Prisma.TransactionClient) {
  if (!hasDatabase) return memoryApprovedAutoEmailQueueIds().has(item.id);
  if (item.notes.split("\n").includes(approvalMarker)) return true;
  await ensureTopProspectSchema();
  const database = transaction ?? getProspectDatabase();
  const [result, draft] = await Promise.all([
    item.topProspectResultId
      ? database.topProspectResult.findUnique({
          where: { id: item.topProspectResultId },
          select: { packageSentAt: true, packageStatus: true },
        })
      : Promise.resolve(null),
    item.prospectId
      ? database.outreachDraft.findFirst({
          where: { prospectId: item.prospectId },
          orderBy: { createdAt: "desc" },
          select: { approvedAt: true },
        })
      : Promise.resolve(null),
  ]);
  return result
    ? result.packageStatus === "APPROVED_TO_SEND" && !result.packageSentAt
    : Boolean(draft?.approvedAt);
}

async function reconcileQueueItem(item: OutreachQueueItem) {
  if (protectedQueueStatuses.has(item.status) || queueItemHasAmbiguousOutcome(item) || !item.prospectId) return item;
  const currentProspect = await getProspect(item.prospectId);
  if (!currentProspect) return item;
  const prospect = reconcileProspectContactRouting(currentProspect);
  if (
    prospect.email !== currentProspect.email
    || prospect.recommendedContactMethod !== currentProspect.recommendedContactMethod
    || prospect.bestManualContactMethod !== currentProspect.bestManualContactMethod
    || prospect.contactConfidence !== currentProspect.contactConfidence
  ) {
    await saveProspect(prospect);
  }
  const settings = await getAutonomousGrowthSettings();
  const queue = await listOutreachQueueItems();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, item.previewLink, "written_only");
  const autoEligibility = evaluateAutoSendEligibility({
    emailQuality,
    emailsSentToday: queue.filter((entry) => entry.sentDate && new Date(entry.sentDate) >= todayStart()).length,
    previewGate,
    previewLink: item.previewLink,
    prospect,
    settings,
  });
  const computedStatus = queueStatusForPackage({ autoEligibility, emailQuality, previewGate, settings });
  const approved = await queueItemHasPersistedApproval(item);
  const nextStatus = approved && computedStatus === "Queued"
    ? "Queued"
    : computedStatus === "Queued"
      ? "Eligible"
      : computedStatus;
  const nowIso = new Date().toISOString();
  const reconciled: OutreachQueueItem = {
    ...item,
    email: prospect.email,
    contactSource: sourceForProspect(prospect),
    contactConfidence: prospect.sourceConfidence,
    status: nextStatus,
    queuedDate: nextStatus === "Queued" ? item.queuedDate || nowIso : "",
    blockedReason: blockedReasonText(autoEligibility.blockedReasons, previewGate.reasons),
    eligibilityReason: emailQuality.ready && previewGate.status === "Eligible"
      ? `${prospect.trade} prospect has a public preview, send-safe copy, and a usable written contact path.`
      : "Package generated, but review is required before any outreach.",
    recommendedNextAction: nextStatus === "Eligible" || nextStatus === "Queued" ? "Keep" : "Needs Human Review",
    updatedAt: nowIso,
  };
  return await persistQueueSnapshot(reconciled, item) ?? reconciled;
}

export async function approveAndQueueEmail(id: string): Promise<ApproveAndQueueEmailResult> {
  const queue = await listOutreachQueueItems();
  const existing = queue.find((entry) => entry.id === id) ?? null;
  if (!existing) return { item: null, queued: false, blockedReasons: ["Queue item was not found."] };
  if (protectedQueueStatuses.has(existing.status) || existing.sentDate || queueItemHasAmbiguousOutcome(existing)) {
    return { item: existing, queued: false, blockedReasons: ["This prospect is already contacted, suppressed, closed, or otherwise protected."] };
  }
  const refreshed = await reconcileQueueItem(existing);
  if (!approvableQueueStatuses.has(refreshed.status)) {
    return {
      item: refreshed,
      queued: false,
      blockedReasons: [refreshed.blockedReason || `Status ${refreshed.status} is not eligible for email approval.`],
    };
  }
  const now = new Date();
  const nowIso = now.toISOString();
  const candidate: OutreachQueueItem = {
    ...refreshed,
    status: "Queued",
    queuedDate: refreshed.queuedDate || nowIso,
    notes: [...stripApprovalMarker(refreshed.notes).split("\n").filter(Boolean), approvalMarker].join("\n"),
    updatedAt: nowIso,
  };
  const refreshedQueue = (await listOutreachQueueItems()).map((entry) => entry.id === id ? candidate : entry);
  const readiness = evaluateQueuedEmailSendReadiness({
    item: candidate,
    queue: refreshedQueue,
    settings: await getAutonomousGrowthSettings(),
  });
  if (!readiness.ready) {
    const blocked: OutreachQueueItem = {
      ...refreshed,
      status: "Needs Review",
      blockedReason: blockedReasonText(readiness.blockedReasons, []),
      notes: [refreshed.notes, `Approval blocked by send-readiness gates: ${readiness.blockedReasons.join("; ")}`].filter(Boolean).join("\n"),
      recommendedNextAction: "Needs Human Review",
      updatedAt: nowIso,
    };
    const saved = await persistQueueSnapshot(blocked, refreshed);
    await safeRecordAudit({
      action: "autonomous_email_approval",
      outcome: "rejected",
      subject: refreshed.email || refreshed.businessName,
      metadata: { queueItemId: refreshed.id, reasons: readiness.blockedReasons },
    });
    return { item: saved ?? blocked, queued: false, blockedReasons: readiness.blockedReasons };
  }

  const prospect = refreshed.prospectId ? await getProspect(refreshed.prospectId) : null;
  if (!hasDatabase) {
    const current = memoryQueue().find((entry) => entry.id === refreshed.id);
    if (
      !current
      || current.status !== refreshed.status
      || current.updatedAt !== refreshed.updatedAt
      || !approvableQueueStatuses.has(current.status)
      || protectedQueueStatuses.has(current.status)
      || current.sentDate
      || queueItemHasAmbiguousOutcome(current)
    ) {
      return {
        item: current ? structuredClone(current) : null,
        queued: false,
        blockedReasons: ["The queue item changed before approval could be saved. Refresh and review it again."],
      };
    }
    if (prospect?.outreach) await saveProspect({ ...prospect, outreach: { ...prospect.outreach, approved: true } });
    memoryApprovedAutoEmailQueueIds().add(refreshed.id);
    const saved = await persistQueueSnapshot({ ...candidate, blockedReason: "", recommendedNextAction: "Keep" }, refreshed);
    if (saved?.status !== "Queued") {
      memoryApprovedAutoEmailQueueIds().delete(refreshed.id);
      return {
        item: saved,
        queued: false,
        blockedReasons: ["The queue item changed before approval could be saved. Refresh and review it again."],
      };
    }
    await safeRecordAudit({
      action: "autonomous_email_approval",
      outcome: "success",
      subject: refreshed.email,
      metadata: { queueItemId: refreshed.id },
    });
    return { item: saved ?? candidate, queued: true, blockedReasons: [] };
  }

  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  let saved: OutreachQueueItem;
  try {
    const savedRow = await database.$transaction(async (transaction) => {
      const current = await transaction.outreachQueueItem.findUnique({ where: { id: refreshed.id } });
      if (
        !current
        || current.status !== refreshed.status
        || current.updatedAt.toISOString() !== refreshed.updatedAt
        || !approvableQueueStatuses.has(current.status as OutreachQueueStatus)
        || current.sentDate
        || protectedQueueStatuses.has(current.status as OutreachQueueStatus)
        || queueItemHasAmbiguousOutcome({ notes: current.notes ?? "" })
      ) {
        throw new ApprovalBlockedError(["The queue item changed before approval could be saved. Refresh and review it again."]);
      }

      if (refreshed.topProspectResultId) {
        const linkedResult = await transaction.topProspectResult.findUnique({
          where: { id: refreshed.topProspectResultId },
          select: { packageSentAt: true, packageStatus: true },
        });
        if (!linkedResult) throw new ApprovalBlockedError(["The linked Top Prospect result no longer exists."]);
        if (linkedResult.packageStatus === "SENT" || linkedResult.packageSentAt) {
          throw new ApprovalBlockedError(["The linked Top Prospect result was already sent."]);
        }
        const resultApproval = await transaction.topProspectResult.updateMany({
          where: {
            id: refreshed.topProspectResultId,
            packageSentAt: null,
            packageStatus: { notIn: ["SENT", "SKIPPED"] },
          },
          data: {
            packageStatus: "APPROVED_TO_SEND",
            packageReviewedAt: now,
            packageApprovedAt: now,
          },
        });
        if (resultApproval.count !== 1) {
          throw new ApprovalBlockedError(["The linked Top Prospect result changed before approval completed."]);
        }
      }

      if (refreshed.prospectId) {
        const linkedDraft = await transaction.outreachDraft.findFirst({
          where: { prospectId: refreshed.prospectId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (linkedDraft) {
          const draftApproval = await transaction.outreachDraft.updateMany({
            where: { id: linkedDraft.id },
            data: { approvedAt: now },
          });
          if (draftApproval.count !== 1) {
            throw new ApprovalBlockedError(["The linked outreach draft changed before approval completed."]);
          }
        }
      }

      const queueApproval = await transaction.outreachQueueItem.updateMany({
        where: {
          id: refreshed.id,
          status: refreshed.status,
          updatedAt: new Date(refreshed.updatedAt),
          sentDate: null,
          NOT: [
            { status: { in: [...protectedQueueStatuses] } },
            { notes: { contains: ambiguousOutcomeMarker } },
          ],
        },
        data: {
          email: candidate.email,
          contactSource: "Public email",
          contactConfidence: candidate.contactConfidence,
          status: "Queued",
          queuedDate: now,
          blockedReason: null,
          recommendedNextAction: "Keep",
          notes: candidate.notes || null,
        },
      });
      if (queueApproval.count !== 1) {
        throw new ApprovalBlockedError(["The queue item changed before approval completed. Refresh and review it again."]);
      }
      return transaction.outreachQueueItem.findUniqueOrThrow({ where: { id: refreshed.id } });
    }, { isolationLevel: "Serializable" });
    saved = queueToDomain(savedRow);
  } catch (error) {
    if (error instanceof ApprovalBlockedError) {
      const current = (await listOutreachQueueItems()).find((entry) => entry.id === refreshed.id) ?? refreshed;
      await safeRecordAudit({
        action: "autonomous_email_approval",
        outcome: "rejected",
        subject: current.email || current.businessName,
        metadata: { queueItemId: current.id, reasons: error.reasons },
      });
      return { item: current, queued: false, blockedReasons: error.reasons };
    }
    throw error;
  }
  await safeRecordAudit({
    action: "autonomous_email_approval",
    outcome: "success",
    subject: refreshed.email,
    metadata: { queueItemId: refreshed.id, topProspectResultId: refreshed.topProspectResultId || null },
  });
  await Promise.allSettled([
    (async () => recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems()))(),
  ]);
  return { item: saved, queued: true, blockedReasons: [] };
}

function unknownSuppressionQueueItem(email: string, status: OutreachQueueStatus, reason: EmailSuppressionReason, source: string, note: string, nowIso: string): OutreachQueueItem {
  return {
    id: `suppression-${email.replace(/[^a-z0-9]+/gi, "-")}`,
    prospectId: "",
    topProspectResultId: "",
    businessName: `Suppressed email: ${email}`,
    trade: "Unknown",
    city: "Unknown",
    website: "",
    email,
    contactSource: "Suppression event",
    contactConfidence: 0,
    previewLink: "",
    previewQualityScore: 0,
    subjectLine: "",
    emailBody: "",
    dmScript: "",
    loomTalkingPoints: "",
    eligibilityReason: "Email was suppressed before a matching prospect package existed.",
    blockedReason: `Suppressed by ${source}: ${reason}.`,
    reviewScore: 0,
    reviewSummary: "Suppression placeholder blocks future Auto Email Pilot sends for this address/domain.",
    improvementSuggestions: [],
    detectedIssues: [`Suppression event: ${reason}`],
    recommendedNextAction: "Never Contact",
    regenerationPlan: [],
    rewritePlan: [],
    feedbackLabels: [],
    status,
    sourceProvider: source,
    queuedDate: "",
    sentDate: "",
    followUpDate: "",
    replyStatus: reason,
    notes: note,
    outreachCopyVersion: "",
    outreachCopyGeneratedAt: "",
    previewVersion: "",
    lastRegeneratedAt: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

type EmailSendClaim = {
  item: OutreachQueueItem;
  marker: string;
  token: string;
};

type EmailSendClaimResult =
  | { claimed: true; claim: EmailSendClaim }
  | { claimed: false; item: OutreachQueueItem | null; blockedReasons: string[] };

class ConfirmedProviderRejectionError extends Error {
  constructor(readonly status: number) {
    super(`Email provider rejected the message before acceptance with HTTP ${status}.`);
    this.name = "ConfirmedProviderRejectionError";
  }
}

class AmbiguousProviderOutcomeError extends Error {
  constructor(message = "Email provider outcome is uncertain. Manual reconciliation is required.") {
    super(message);
    this.name = "AmbiguousProviderOutcomeError";
  }
}

export function prospectInitialEmailIdempotencyKey(
  item: Pick<OutreachQueueItem, "email" | "id" | "prospectId">,
) {
  const identity = item.prospectId.trim()
    || createHash("sha256").update(normalizeEmailAddress(item.email) || item.id).digest("hex").slice(0, 32);
  return `auto-email-pilot-initial-prospect-${identity}`.slice(0, 256);
}

async function claimQueuedEmailForSend(id: string): Promise<EmailSendClaimResult> {
  const token = crypto.randomUUID();
  const marker = claimMarker(token);
  const claimedAt = new Date();
  const claimedAtIso = claimedAt.toISOString();

  if (!hasDatabase) {
    const approvalCandidate = memoryQueue().find((entry) => entry.id === id) ?? null;
    if (!approvalCandidate) return { claimed: false, item: null, blockedReasons: ["Queue item was not found."] };
    if (!(await queueItemHasPersistedApproval(approvalCandidate))) {
      return { claimed: false, item: structuredClone(approvalCandidate), blockedReasons: ["Persisted email approval is missing."] };
    }
    const item = memoryQueue().find((entry) => entry.id === id) ?? null;
    if (!item) return { claimed: false, item: null, blockedReasons: ["Queue item was not found."] };
    if (
      item.status !== "Queued"
      || item.sentDate
      || protectedQueueStatuses.has(item.status)
      || queueItemHasAmbiguousOutcome(item)
    ) {
      return { claimed: false, item: structuredClone(item), blockedReasons: ["The email is no longer queued and available to send."] };
    }
    item.status = "Sending";
    item.notes = [stripClaimMarkers(item.notes), marker].filter(Boolean).join("\n");
    item.updatedAt = claimedAtIso;
    return { claimed: true, claim: { item: structuredClone(item), marker, token } };
  }

  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  try {
    const row = await database.$transaction(async (transaction) => {
      const current = await transaction.outreachQueueItem.findUnique({ where: { id } });
      if (!current) throw new ApprovalBlockedError(["Queue item was not found."]);
      const domain = queueToDomain(current);
      if (
        domain.status !== "Queued"
        || domain.sentDate
        || queueItemHasAmbiguousOutcome(domain)
      ) {
        throw new ApprovalBlockedError(["The email is no longer queued and available to send."]);
      }
      if (!(await queueItemHasPersistedApproval(domain, transaction))) {
        throw new ApprovalBlockedError(["Persisted email approval is missing."]);
      }
      const claimed = await transaction.outreachQueueItem.updateMany({
        where: {
          id,
          status: "Queued",
          sentDate: null,
          updatedAt: current.updatedAt,
          NOT: { notes: { contains: ambiguousOutcomeMarker } },
        },
        data: {
          status: "Sending",
          notes: [stripClaimMarkers(current.notes ?? ""), marker].filter(Boolean).join("\n"),
          updatedAt: claimedAt,
        },
      });
      if (claimed.count !== 1) {
        throw new ApprovalBlockedError(["Another process changed or claimed this queue item first."]);
      }
      return transaction.outreachQueueItem.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: "Serializable" });
    return { claimed: true, claim: { item: queueToDomain(row), marker, token } };
  } catch (error) {
    if (error instanceof ApprovalBlockedError) {
      const current = await database.outreachQueueItem.findUnique({ where: { id } });
      return { claimed: false, item: current ? queueToDomain(current) : null, blockedReasons: error.reasons };
    }
    throw error;
  }
}

async function claimStillOwned(claim: EmailSendClaim) {
  if (!hasDatabase) {
    const current = memoryQueue().find((entry) => entry.id === claim.item.id);
    return Boolean(current?.status === "Sending" && current.notes.includes(claim.marker) && !current.sentDate);
  }
  const count = await getProspectDatabase().outreachQueueItem.count({
    where: {
      id: claim.item.id,
      status: "Sending",
      sentDate: null,
      notes: { contains: claim.marker },
    },
  });
  return count === 1;
}

async function releaseClaimBeforeDispatch(claim: EmailSendClaim, reason: string) {
  const nowIso = new Date().toISOString();
  if (!hasDatabase) {
    const current = memoryQueue().find((entry) => entry.id === claim.item.id);
    if (!current || current.status !== "Sending" || !current.notes.includes(claim.marker)) return current ? structuredClone(current) : null;
    current.status = "Queued";
    current.notes = stripClaimMarkers(current.notes);
    current.blockedReason = reason;
    current.updatedAt = nowIso;
    return structuredClone(current);
  }
  const database = getProspectDatabase();
  const current = await database.outreachQueueItem.findUnique({ where: { id: claim.item.id } });
  if (!current) return null;
  const released = await database.outreachQueueItem.updateMany({
    where: {
      id: claim.item.id,
      status: "Sending",
      sentDate: null,
      notes: { contains: claim.marker },
    },
    data: {
      status: "Queued",
      notes: stripClaimMarkers(current.notes ?? "") || null,
      blockedReason: reason,
    },
  });
  const row = await database.outreachQueueItem.findUnique({ where: { id: claim.item.id } });
  return row && released.count === 1 ? queueToDomain(row) : row ? queueToDomain(row) : null;
}

async function clearPersistedApproval(
  transaction: Prisma.TransactionClient,
  item: OutreachQueueItem,
  now: Date,
) {
  if (item.topProspectResultId) {
    await transaction.topProspectResult.updateMany({
      where: { id: item.topProspectResultId, packageStatus: "APPROVED_TO_SEND", packageSentAt: null },
      data: {
        packageStatus: "READY_FOR_REVIEW",
        packageReviewedAt: now,
        packageApprovedAt: null,
      },
    });
  }
  if (item.prospectId) {
    await transaction.outreachDraft.updateMany({
      where: { prospectId: item.prospectId, approvedAt: { not: null } },
      data: { approvedAt: null },
    });
  }
}

async function finishClaimWithReview(
  claim: EmailSendClaim,
  message: string,
  ambiguous: boolean,
  providerMessageId = "",
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const status: OutreachQueueStatus = ambiguous ? "Blocked" : "Needs Review";
  const note = ambiguous
    ? `${ambiguousOutcomeMarker} Auto Email Pilot provider outcome requires manual reconciliation on ${nowIso}: ${message}${providerMessageId ? ` Resend message ID: ${providerMessageId}` : ""}`
    : `Auto Email Pilot send was rejected before acceptance on ${nowIso}: ${message}`;

  if (!hasDatabase) {
    const current = memoryQueue().find((entry) => entry.id === claim.item.id);
    if (!current || current.status !== "Sending" || !current.notes.includes(claim.marker)) return current ? structuredClone(current) : null;
    current.status = status;
    current.sentDate = "";
    current.blockedReason = message;
    current.recommendedNextAction = "Needs Human Review";
    current.notes = [stripApprovalMarker(stripClaimMarkers(current.notes)), note].filter(Boolean).join("\n");
    current.updatedAt = nowIso;
    memoryApprovedAutoEmailQueueIds().delete(current.id);
    await recordRunReview(memorySettings(), memoryQueue());
    return structuredClone(current);
  }

  const database = getProspectDatabase();
  const row = await database.$transaction(async (transaction) => {
    const current = await transaction.outreachQueueItem.findUnique({ where: { id: claim.item.id } });
    if (!current) return null;
    const updated = await transaction.outreachQueueItem.updateMany({
      where: {
        id: claim.item.id,
        status: "Sending",
        sentDate: null,
        notes: { contains: claim.marker },
      },
      data: {
        status,
        sentDate: null,
        blockedReason: message,
        recommendedNextAction: "Needs Human Review",
        notes: [stripApprovalMarker(stripClaimMarkers(current.notes ?? "")), note].filter(Boolean).join("\n"),
      },
    });
    if (updated.count !== 1) return transaction.outreachQueueItem.findUnique({ where: { id: claim.item.id } });
    await clearPersistedApproval(transaction, claim.item, now);
    return transaction.outreachQueueItem.findUnique({ where: { id: claim.item.id } });
  }, { isolationLevel: "Serializable" });
  if (!row) return null;
  await Promise.allSettled([
    (async () => recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems()))(),
  ]);
  return queueToDomain(row);
}

async function sendWithResend(item: OutreachQueueItem, environment: NodeJS.ProcessEnv = process.env) {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.OUTREACH_FROM_EMAIL?.trim();
  const replyTo = environment.OUTREACH_REPLY_TO_EMAIL?.trim();
  if (!apiKey || !from || !replyTo) throw new Error("Email provider, sender, or reply-to is not configured.");
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": prospectInitialEmailIdempotencyKey(item),
      },
      body: JSON.stringify({
        from,
        to: [item.email],
        reply_to: replyTo,
        subject: item.subjectLine,
        text: item.emailBody,
      }),
    });
  } catch {
    throw new AmbiguousProviderOutcomeError();
  }
  if (!response.ok) {
    if (response.status === 409) {
      throw new AmbiguousProviderOutcomeError("Email provider returned an idempotency conflict. Manual reconciliation is required.");
    }
    throw new ConfirmedProviderRejectionError(response.status);
  }
  let payload: { id?: unknown };
  try {
    payload = await response.json() as { id?: unknown };
  } catch {
    throw new AmbiguousProviderOutcomeError("Email provider returned a malformed success response.");
  }
  const providerMessageId = typeof payload.id === "string" ? payload.id.trim() : "";
  if (!providerMessageId) {
    throw new AmbiguousProviderOutcomeError("Email provider returned success without a valid message ID.");
  }
  return providerMessageId;
}

async function markQueueItemSent(claim: EmailSendClaim, providerMessageId: string, now = new Date()) {
  const sentDate = now.toISOString();
  const notes = [
    stripApprovalMarker(stripClaimMarkers(claim.item.notes)),
    `Resend message ID: ${providerMessageId}`,
  ].filter(Boolean).join("\n");
  if (!hasDatabase) {
    const existing = memoryQueue().find((entry) => entry.id === claim.item.id);
    if (!existing) return null;
    if (existing.status !== "Sending" || !existing.notes.includes(claim.marker) || existing.sentDate) return null;
    existing.status = "Sent";
    existing.sentDate = sentDate;
    existing.notes = notes;
    existing.updatedAt = sentDate;
    await Promise.allSettled([
      recordRunReview(memorySettings(), memoryQueue()),
    ]);
    return structuredClone(existing);
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const row = await database.$transaction(async (transaction) => {
    const sent = await transaction.outreachQueueItem.updateMany({
      where: {
        id: claim.item.id,
        status: "Sending",
        sentDate: null,
        notes: { contains: claim.marker },
      },
      data: {
        status: "Sent",
        sentDate: now,
        notes,
      },
    });
    if (sent.count !== 1) throw new AmbiguousProviderOutcomeError("Provider accepted the email, but the claimed queue item could not be marked Sent.");
    if (claim.item.topProspectResultId) {
      await transaction.topProspectResult.updateMany({
        where: { id: claim.item.topProspectResultId, packageStatus: { not: "SENT" } },
        data: { packageStatus: "SENT", packageSentAt: now },
      });
    }
    return transaction.outreachQueueItem.findUniqueOrThrow({ where: { id: claim.item.id } });
  }, { isolationLevel: "Serializable" });
  const domain = queueToDomain(row);
  await Promise.allSettled([
    recordLearningEvent(domain),
    (async () => recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems()))(),
  ]);
  return domain;
}

export async function sendQueuedEmailQueueItem(
  id: string,
  options: { beforeProviderDispatch?: () => Promise<void> } = {},
): Promise<SendQueuedEmailResult> {
  const settings = await getAutonomousGrowthSettings();
  const initialQueue = await listOutreachQueueItems();
  const initialItem = initialQueue.find((entry) => entry.id === id) ?? null;
  const item = initialItem ? await reconcileQueueItem(initialItem) : null;
  if (!item) return { item: null, sent: false, blockedReasons: ["Queue item was not found."] };
  const queue = await listOutreachQueueItems();
  const emailsSentToday = queue.filter((entry) => entry.sentDate && new Date(entry.sentDate) >= todayStart()).length;
  const readiness = evaluateQueuedEmailSendReadiness({ emailSendsToday: emailsSentToday, item, queue, settings });
  if (!readiness.ready) {
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "rejected",
      subject: item.email || item.businessName,
      metadata: { queueItemId: item.id, reasons: readiness.blockedReasons },
    });
    return { item, sent: false, blockedReasons: readiness.blockedReasons };
  }

  const claimed = await claimQueuedEmailForSend(id);
  if (!claimed.claimed) {
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "rejected",
      subject: claimed.item?.email || claimed.item?.businessName || id,
      metadata: { queueItemId: id, reasons: claimed.blockedReasons },
    });
    return { item: claimed.item, sent: false, blockedReasons: claimed.blockedReasons };
  }
  const { claim } = claimed;

  try {
    await enforceRateLimit({
      action: "autonomous_email_send",
      subject: "global",
      limit: Math.max(0, Math.min(settings.maxEmailsSentPerDay, outreachEnvironment().dailyCap)),
      windowMs: 24 * 60 * 60 * 1000,
    });
    await enforceRateLimit({
      action: "autonomous_email_send_recipient",
      subject: item.email.toLowerCase(),
      limit: 1,
      windowMs: Math.max(1, settings.emailCooldownMinutes) * 60_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "A pre-dispatch safety claim failed.";
    const released = await releaseClaimBeforeDispatch(claim, message);
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "rejected",
      subject: claim.item.email,
      metadata: { queueItemId: claim.item.id, reason: message, phase: "pre_dispatch" },
    });
    return { item: released, sent: false, blockedReasons: [message] };
  }

  await options.beforeProviderDispatch?.();
  if (!(await claimStillOwned(claim))) {
    const current = (await listOutreachQueueItems()).find((entry) => entry.id === claim.item.id) ?? claim.item;
    return { item: current, sent: false, blockedReasons: ["The send claim was cancelled by a newer protected state before provider dispatch."] };
  }

  let providerMessageId = "";
  try {
    providerMessageId = await sendWithResend(claim.item);
  } catch (error) {
    const ambiguous = error instanceof AmbiguousProviderOutcomeError;
    const message = error instanceof Error ? error.message : "Email provider request failed safely.";
    const failedItem = await finishClaimWithReview(claim, message, ambiguous);
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "failure",
      subject: claim.item.email,
      metadata: {
        queueItemId: claim.item.id,
        reason: message,
        phase: ambiguous ? "ambiguous_provider_outcome" : "confirmed_rejection",
      },
    });
    await sendInternalOperatorNotification({
      kind: "approved_email_failed",
      title: ambiguous ? "Approved email outcome needs reconciliation" : "Approved email send failed",
      marketTrade: `${claim.item.trade} in ${claim.item.city}`,
      resultCount: 1,
      attention: `${claim.item.businessName} did not reach a confirmed Sent state. Reason: ${message}`,
      nextAction: ambiguous ? "Reconcile the attempt in Resend before any manual retry." : "Review Resend and queue the email again only after fixing the rejection.",
      pagePath: "/engine?tab=operator-test-center",
    });
    return { item: failedItem, sent: false, blockedReasons: [message] };
  }

  try {
    const sentItem = await markQueueItemSent(claim, providerMessageId);
    if (!sentItem) {
      const failedItem = await finishClaimWithReview(
        claim,
        "Provider accepted the email, but the claimed queue item could not be marked Sent.",
        true,
        providerMessageId,
      );
      return {
        item: failedItem,
        sent: false,
        blockedReasons: ["Provider accepted the email, but sent-state persistence requires manual reconciliation."],
        providerMessageId,
      };
    }
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "success",
      subject: claim.item.email,
      metadata: { queueItemId: claim.item.id, provider: "resend", providerMessageId },
    });
    await sendInternalOperatorNotification({
      kind: "approved_email_sent",
      title: "Approved email send succeeded",
      marketTrade: `${claim.item.trade} in ${claim.item.city}`,
      resultCount: 1,
      attention: `${claim.item.businessName} email was accepted by the provider.`,
      nextAction: "Watch for a reply and keep suppression handling active.",
      pagePath: "/engine?tab=operator-test-center",
    });
    return { item: sentItem, sent: true, blockedReasons: [], providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider accepted the email, but sent-state persistence failed.";
    const failedItem = await finishClaimWithReview(claim, message, true, providerMessageId);
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "failure",
      subject: claim.item.email,
      metadata: { queueItemId: claim.item.id, reason: message, phase: "sent_state_persistence", providerMessageId },
    });
    return {
      item: failedItem,
      sent: false,
      blockedReasons: ["Provider accepted the email, but sent-state persistence requires manual reconciliation."],
      providerMessageId,
    };
  }
}

async function executeAutoEmailPilotCycle(): Promise<AutoEmailPilotCycleResult> {
  const settings = await getAutonomousGrowthSettings();
  const env = outreachEnvironment();
  const queue = await listOutreachQueueItems();
  const queuedPublicEmailItems = queue.filter((item) => item.status === "Queued" && item.contactSource === "Public email" && !item.sentDate);
  const approvedItems: OutreachQueueItem[] = [];
  for (const item of queuedPublicEmailItems) {
    if (await queueItemHasPersistedApproval(item)) approvedItems.push(item);
  }
  const sentToday = queue.filter((item) => item.sentDate && new Date(item.sentDate) >= todayStart()).length;
  const remainingDailyCap = Math.max(0, Math.min(settings.maxEmailsSentPerDay, env.dailyCap) - sentToday);
  const result: AutoEmailPilotCycleResult = {
    attempted: 0,
    sent: 0,
    blocked: 0,
    approvedQueued: approvedItems.length,
    blockedReasons: [],
  };
  const cycleGateReasons = autoEmailPilotGateReasons({
    emailsSentToday: sentToday,
    environment: env,
    settings,
  });
  if (cycleGateReasons.length) {
    if (approvedItems.length) {
      result.blocked = approvedItems.length;
      result.blockedReasons = approvedItems.map((item) => ({
        queueItemId: item.id,
        businessName: item.businessName,
        email: item.email,
        reasons: cycleGateReasons,
      }));
    }
    await safeRecordAudit({
      action: "auto_email_pilot_cycle",
      outcome: "rejected",
      subject: "approved-queued-email",
      metadata: { reasons: cycleGateReasons, approvedQueued: approvedItems.length },
    });
    return result;
  }

  const candidates = approvedItems.slice(0, remainingDailyCap);
  result.attempted = candidates.length;
  for (const item of candidates) {
    const send = await sendQueuedEmailQueueItem(item.id);
    if (send.sent) {
      result.sent += 1;
    } else {
      result.blocked += 1;
      result.blockedReasons.push({
        queueItemId: item.id,
        businessName: item.businessName,
        email: item.email,
        reasons: send.blockedReasons,
      });
    }
  }
  await safeRecordAudit({
    action: "auto_email_pilot_cycle",
    outcome: result.sent > 0 ? "success" : result.blocked > 0 ? "rejected" : "success",
    subject: "approved-queued-email",
    metadata: {
      attempted: result.attempted,
      sent: result.sent,
      blocked: result.blocked,
      remainingDailyCap,
      followUpsAttempted: 0,
      nonEmailChannelsAttempted: 0,
    },
  });
  return result;
}

export async function runAutoEmailPilotCycle(): Promise<AutoEmailPilotCycleResult> {
  return executeAutoEmailPilotCycle();
}

export async function runFullAutoEmailBatch(): Promise<FullAutoEmailBatchResult> {
  const settings = await getAutonomousGrowthSettings();
  const env = outreachEnvironment();
  const queue = await listOutreachQueueItems();
  if (!env.fullAutoSendEnabled) {
    await safeRecordAudit({
      action: "autonomous_email_batch",
      outcome: "rejected",
      subject: "full-auto-email",
      metadata: { reason: "OUTREACH_FULL_AUTO_SEND_ENABLED is not true." },
    });
    await sendInternalOperatorNotificationSafely({
      kind: "auto_email_blocked",
      title: "Auto Email Pilot blocked",
      resultCount: 0,
      attention: "Full automatic batch sending did not run because OUTREACH_FULL_AUTO_SEND_ENABLED is not true.",
      nextAction: "Keep it disabled unless you intentionally switch to a reviewed Auto Email Pilot setup.",
      pagePath: "/engine?tab=operator-test-center",
    }, { sms: false });
    return {
      attempted: 0,
      sent: 0,
      blocked: 0,
      fullAutoEnabled: false,
      blockedReasons: [{
        queueItemId: "",
        businessName: "Full auto email batch",
        email: "",
        reasons: ["OUTREACH_FULL_AUTO_SEND_ENABLED is not true."],
      }],
    };
  }
  const queued: OutreachQueueItem[] = [];
  for (const item of queue.filter((candidate) => candidate.status === "Queued" && candidate.contactSource === "Public email")) {
    if (await queueItemHasPersistedApproval(item)) queued.push(item);
  }
  const sentToday = queue.filter((item) => item.sentDate && new Date(item.sentDate) >= todayStart()).length;
  const remainingDailyCap = Math.max(0, Math.min(settings.maxEmailsSentPerDay, env.dailyCap) - sentToday);
  const batchLimit = Math.min(queued.length, remainingDailyCap, 5);
  const result: FullAutoEmailBatchResult = {
    attempted: batchLimit,
    sent: 0,
    blocked: 0,
    fullAutoEnabled: true,
    blockedReasons: [],
  };
  if (batchLimit <= 0) {
    await safeRecordAudit({
      action: "autonomous_email_batch",
      outcome: "rejected",
      subject: "full-auto-email",
      metadata: { reason: "No eligible queued public-email items or daily cap is exhausted.", queued: queued.length, remainingDailyCap },
    });
    return {
      ...result,
      blocked: queued.length ? queued.length : 1,
      blockedReasons: [{
        queueItemId: queued[0]?.id ?? "",
        businessName: queued[0]?.businessName ?? "Full auto email batch",
        email: queued[0]?.email ?? "",
        reasons: ["No eligible queued public-email items or daily cap is exhausted."],
      }],
    };
  }
  for (const item of queued.slice(0, batchLimit)) {
    const send = await sendQueuedEmailQueueItem(item.id);
    if (send.sent) {
      result.sent += 1;
    } else {
      result.blocked += 1;
      result.blockedReasons.push({
        queueItemId: item.id,
        businessName: item.businessName,
        email: item.email,
        reasons: send.blockedReasons,
      });
    }
  }
  await safeRecordAudit({
    action: "autonomous_email_batch",
    outcome: result.sent > 0 ? "success" : "rejected",
    subject: "full-auto-email",
    metadata: {
      attempted: result.attempted,
      sent: result.sent,
      blocked: result.blocked,
      limit: batchLimit,
    },
  });
  return result;
}

export async function recordEmailSuppression(email: string, reason: EmailSuppressionReason, source = "operator"): Promise<EmailSuppressionResult> {
  const normalized = normalizeEmailAddress(email);
  if (!normalized || !normalized.includes("@")) {
    await safeRecordAudit({
      action: "email_suppression_record",
      outcome: "rejected",
      subject: normalized || "missing-email",
      metadata: { reason: "invalid_email", source },
    });
    return { matched: 0, updated: 0, reason };
  }
  const status = suppressionStatus(reason);
  const note = `Suppressed by ${source}: ${reason}.`;
  const nowIso = new Date().toISOString();
  if (!hasDatabase) {
    const matches = memoryQueue().filter((item) => normalizeEmailAddress(item.email) === normalized);
    for (const item of matches) {
      item.status = status;
      item.replyStatus = reason;
      item.notes = [item.notes, note].filter(Boolean).join("\n");
      item.recommendedNextAction = "Never Contact";
      item.updatedAt = nowIso;
    }
    if (matches.length === 0) {
      const placeholder = unknownSuppressionQueueItem(normalized, status, reason, source, note, nowIso);
      memoryQueue().unshift(placeholder);
    }
    await safeRecordAudit({
      action: "email_suppression_record",
      outcome: "success",
      subject: normalized,
      metadata: { reason, source, matched: matches.length, updated: matches.length || 1, createdSuppressionRecord: matches.length === 0 },
    });
    await sendInternalOperatorNotificationSafely({
      kind: "suppression_recorded",
      title: "Email suppression recorded",
      resultCount: matches.length || 1,
      attention: `${normalized} was marked ${status}.`,
      nextAction: "Review the suppression record before any future outreach.",
      pagePath: "/engine?tab=operator-test-center",
    });
    await recordRunReview(memorySettings(), memoryQueue());
    return { matched: matches.length, updated: matches.length || 1, reason };
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const matches = await database.outreachQueueItem.findMany({ where: { email: { equals: normalized, mode: "insensitive" } } });
  const update = await database.outreachQueueItem.updateMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
    data: {
      status,
      replyStatus: reason,
      recommendedNextAction: "Never Contact",
      notes: note,
    },
  });
  let createdSuppressionRecord = false;
  if (matches.length === 0) {
    await database.outreachQueueItem.create({
      data: {
        businessName: `Suppressed email: ${normalized}`,
        trade: "Unknown",
        city: "Unknown",
        website: null,
        email: normalized,
        contactSource: "Suppression event",
        contactConfidence: 0,
        previewLink: "",
        previewQualityScore: 0,
        subjectLine: "",
        emailBody: "",
        dmScript: "",
        loomTalkingPoints: "",
        eligibilityReason: "Email was suppressed before a matching prospect package existed.",
        blockedReason: `Suppressed by ${source}: ${reason}.`,
        reviewScore: 0,
        reviewSummary: "Suppression placeholder blocks future Auto Email Pilot sends for this address/domain.",
        improvementSuggestions: [],
        detectedIssues: [`Suppression event: ${reason}`],
        recommendedNextAction: "Never Contact",
        regenerationPlan: [],
        rewritePlan: [],
        feedbackLabels: [],
        status,
        sourceProvider: source,
        replyStatus: reason,
        notes: note,
      },
    });
    createdSuppressionRecord = true;
  }
  await safeRecordAudit({
    action: "email_suppression_record",
    outcome: "success",
    subject: normalized,
    metadata: { reason, source, matched: matches.length, updated: update.count || 1, createdSuppressionRecord },
  });
  await sendInternalOperatorNotificationSafely({
    kind: "suppression_recorded",
    title: "Email suppression recorded",
    resultCount: update.count || 1,
    attention: `${normalized} was marked ${status}.`,
    nextAction: "Review the suppression record before any future outreach.",
    pagePath: "/engine?tab=operator-test-center",
  });
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return { matched: matches.length, updated: update.count || 1, reason };
}

export async function upsertAutonomousQueueItemFromPackage(input: {
  forceReviewOnly?: boolean;
  internalSmsEnabled?: boolean;
  outreachPreference: OutreachPreference;
  previewLink: string;
  prospect: Prospect;
  sourceProvider?: string;
  topProspectResultId: string;
}) {
  const {
    outreachPreference,
    previewLink,
    sourceProvider = "Top Prospects",
    topProspectResultId,
  } = input;
  const prospect = reconcileProspectContactRouting(input.prospect);
  const settings = await getAutonomousGrowthSettings();
  const previewGate = evaluatePreviewQualityGate(prospect);
  const emailQuality = evaluateOutreachEmailQuality(prospect, previewLink, outreachPreference);
  const queue = await listOutreachQueueItems();
  const emailsSentToday = queue.filter((item) => item.sentDate && new Date(item.sentDate) >= todayStart()).length;
  const autoEligibility = evaluateAutoSendEligibility({
    emailQuality,
    emailsSentToday,
    previewGate,
    previewLink,
    prospect,
    settings,
  });
  const selfReview = evaluateSelfReview({ emailQuality, previewGate, prospect });
  const computedStatus = queueStatusForPackage({ autoEligibility, emailQuality, previewGate, settings });
  const status = computedStatus === "Queued" ? "Eligible" : computedStatus;
  const now = new Date();
  const outreach = prospect.outreach;
  const outreachGeneratedAt = outreach?.outreachCopyGeneratedAt || outreach?.generatedAt || now.toISOString();
  const itemData = {
    prospectId: prospect.id,
    topProspectResultId,
    businessName: prospect.businessName,
    trade: prospect.trade,
    city: `${prospect.city}, ${prospect.state}`,
    website: prospect.website || null,
    email: prospect.email || null,
    contactSource: sourceForProspect(prospect),
    contactConfidence: prospect.sourceConfidence,
    previewLink,
    previewQualityScore: previewGate.score,
    subjectLine: outreach?.subjects[0] ?? `A website idea for ${prospect.businessName}`,
    emailBody: outreach?.concise ?? "",
    dmScript: manualDmScript(prospect, previewLink),
    loomTalkingPoints: loomTalkingPoints(prospect, previewLink),
    eligibilityReason: emailQuality.ready && previewGate.status === "Eligible"
      ? `${prospect.trade} prospect has a public preview, send-safe copy, and a usable written contact path.`
      : "Package generated, but review is required before any outreach.",
    blockedReason: blockedReasonText(autoEligibility.blockedReasons, previewGate.reasons) || null,
    reviewScore: selfReview.reviewScore,
    reviewSummary: selfReview.reviewSummary,
    improvementSuggestions: selfReview.improvementSuggestions,
    detectedIssues: selfReview.detectedIssues,
    recommendedNextAction: selfReview.recommendedNextAction,
    regenerationPlan: selfReview.regenerationPlan,
    rewritePlan: selfReview.rewritePlan,
    feedbackLabels: [],
    status,
    sourceProvider,
    queuedDate: null,
    sentDate: null,
    followUpDate: null,
    replyStatus: null,
    notes: null,
    outreachCopyVersion: outreach?.outreachCopyVersion ?? currentOutreachCopyVersion,
    outreachCopyGeneratedAt: new Date(outreachGeneratedAt),
    previewVersion: prospect.preview?.generatedAt ? "preview-v1" : "",
    lastRegeneratedAt: null,
  };
  if (!hasDatabase) {
    const existingIndex = memoryQueue().findIndex((item) => item.topProspectResultId === topProspectResultId);
    const existing = existingIndex >= 0 ? memoryQueue()[existingIndex] : null;
    if (existing && queueItemDraftMutationIsProtected(existing)) return structuredClone(existing);
    const domain: OutreachQueueItem = {
      ...itemData,
      id: existingIndex >= 0 ? memoryQueue()[existingIndex].id : `queue-${topProspectResultId}`,
      website: itemData.website ?? "",
      email: itemData.email ?? "",
      blockedReason: itemData.blockedReason ?? "",
      queuedDate: "",
      sentDate: "",
      followUpDate: "",
      replyStatus: "",
      notes: "",
      outreachCopyVersion: itemData.outreachCopyVersion,
      outreachCopyGeneratedAt: itemData.outreachCopyGeneratedAt.toISOString(),
      previewVersion: itemData.previewVersion,
      lastRegeneratedAt: "",
      createdAt: existingIndex >= 0 ? memoryQueue()[existingIndex].createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (existingIndex >= 0) memoryQueue()[existingIndex] = domain;
    else memoryQueue().unshift(domain);
    if (domain.status === "Blocked" && /phone-only/i.test(domain.blockedReason)) {
      await sendInternalOperatorNotificationSafely({
        kind: "phone_only_blocked",
        title: "Phone-only prospect needs manual research",
        marketTrade: `${domain.trade} in ${domain.city}`,
        resultCount: 1,
        attention: `${domain.businessName} has a preview/package, but written outreach is blocked.`,
        nextAction: "Find a written contact path or leave it blocked.",
        pagePath: "/engine?tab=operator-test-center",
      }, { sms: input.internalSmsEnabled !== false });
    } else if (["Eligible", "Needs Review", "Queued"].includes(domain.status)) {
      await sendInternalOperatorNotificationSafely({
        kind: "outreach_package_ready",
        title: "Outreach package ready for review",
        marketTrade: `${domain.trade} in ${domain.city}`,
        resultCount: 1,
        attention: `${domain.businessName} is in the manual review queue.`,
        nextAction: "Review preview, copy, contact path, and approval gates.",
        pagePath: "/engine?tab=operator-test-center",
      }, { sms: input.internalSmsEnabled !== false });
    }
    await recordRunReview(settings, memoryQueue());
    return domain;
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const row = await database.$transaction(async (transaction) => {
    const existing = await transaction.outreachQueueItem.findUnique({ where: { topProspectResultId } });
    if (!existing) return transaction.outreachQueueItem.create({ data: itemData });
    const existingDomain = queueToDomain(existing);
    if (queueItemDraftMutationIsProtected(existingDomain)) return existing;
    const updated = await transaction.outreachQueueItem.updateMany({
      where: {
        id: existing.id,
        status: existing.status,
        updatedAt: existing.updatedAt,
        sentDate: null,
        NOT: [
          { status: { in: ["Queued", ...protectedQueueStatuses] } },
          { notes: { contains: ambiguousOutcomeMarker } },
        ],
      },
      data: itemData,
    });
    if (updated.count !== 1) {
      throw new Error("The review package changed before refresh completed. Refresh and try again.");
    }
    return transaction.outreachQueueItem.findUniqueOrThrow({ where: { id: existing.id } });
  }, {
    isolationLevel: "Serializable",
  });
  const domain = queueToDomain(row);
  if (domain.status === "Blocked" && /phone-only/i.test(domain.blockedReason)) {
    await sendInternalOperatorNotificationSafely({
      kind: "phone_only_blocked",
      title: "Phone-only prospect needs manual research",
      marketTrade: `${domain.trade} in ${domain.city}`,
      resultCount: 1,
      attention: `${domain.businessName} has a preview/package, but written outreach is blocked.`,
      nextAction: "Find a written contact path or leave it blocked.",
      pagePath: "/engine?tab=operator-test-center",
    }, { sms: input.internalSmsEnabled !== false });
  } else if (["Eligible", "Needs Review", "Queued"].includes(domain.status)) {
    await sendInternalOperatorNotificationSafely({
      kind: "outreach_package_ready",
      title: "Outreach package ready for review",
      marketTrade: `${domain.trade} in ${domain.city}`,
      resultCount: 1,
      attention: `${domain.businessName} is in the manual review queue.`,
      nextAction: "Review preview, copy, contact path, and approval gates.",
      pagePath: "/engine?tab=operator-test-center",
    }, { sms: input.internalSmsEnabled !== false });
  }
  await recordLearningEvent(domain);
  await recordRunReview(settings, await listOutreachQueueItems());
  return domain;
}

export async function updateOutreachQueueStatus(id: string, status: OutreachQueueStatus) {
  if (!outreachQueueStatuses.includes(status)) throw new Error("Select a supported queue status.");
  const nextStatus = queueStatusAfterManualAction(status);
  const nowIso = new Date().toISOString();
  if (!hasDatabase) {
    const item = memoryQueue().find((entry) => entry.id === id);
    if (!item) return null;
    if (item.status === nextStatus) return structuredClone(item);
    if (!manualQueueStatusTransitionAllowed(item.status, status)) {
      throw new Error(`Status cannot change from ${item.status} to ${status} through the general queue action.`);
    }
    const effectiveStatus = nextStatus;
    item.status = effectiveStatus;
    item.followUpDate = effectiveStatus === "Follow-up Needed" ? nowIso : item.followUpDate;
    item.replyStatus = status === "Prospect Said Yes" ? "prospect_said_yes" : item.replyStatus;
    if (effectiveStatus === "Bad Fit") item.recommendedNextAction = "Bad Fit";
    if (["Never Contact", "Opted Out", "Bounced", "Complained", "Suppressed"].includes(effectiveStatus)) item.recommendedNextAction = "Never Contact";
    if (effectiveStatus === "Preview Needs Polish") item.recommendedNextAction = "Regenerate Preview";
    if (effectiveStatus === "Loom Needed" || effectiveStatus === "Ready for Loom") item.recommendedNextAction = "Needs Human Review";
    item.updatedAt = nowIso;
    await recordRunReview(memorySettings(), memoryQueue());
    await sendLoomNeededNotificationIfConfigured(item, status);
    if (status === "Prospect Said Yes") {
      await sendInternalOperatorNotificationSafely({
        kind: "prospect_interested",
        title: "Prospect said yes",
        marketTrade: `${item.trade} in ${item.city}`,
        resultCount: 1,
        attention: `${item.businessName} needs the manual preview, Loom, or pricing step.`,
        nextAction: "Open the queue, send the public preview manually, and prepare Loom if recommended.",
        pagePath: "/engine?tab=operator-test-center",
      });
    }
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const current = await database.outreachQueueItem.findUnique({ where: { id } });
  if (!current) return null;
  const currentStatus = current.status as OutreachQueueStatus;
  if (currentStatus === nextStatus) return queueToDomain(current);
  if (!manualQueueStatusTransitionAllowed(currentStatus, status)) {
    throw new Error(`Status cannot change from ${currentStatus} to ${status} through the general queue action.`);
  }
  const now = new Date();
  const effectiveStatus = nextStatus;
  const extraReviewData =
    effectiveStatus === "Bad Fit" ? { recommendedNextAction: "Bad Fit" }
      : ["Never Contact", "Opted Out", "Bounced", "Complained", "Suppressed"].includes(effectiveStatus) ? { recommendedNextAction: "Never Contact" }
        : effectiveStatus === "Preview Needs Polish" ? { recommendedNextAction: "Regenerate Preview" }
          : effectiveStatus === "Loom Needed" || effectiveStatus === "Ready for Loom" ? { recommendedNextAction: "Needs Human Review" }
            : {};
  const update = await database.outreachQueueItem.updateMany({
    where: { id, status: current.status, updatedAt: current.updatedAt },
    data: {
      status: effectiveStatus,
      followUpDate: effectiveStatus === "Follow-up Needed" ? now : undefined,
      replyStatus: status === "Prospect Said Yes" ? "prospect_said_yes" : undefined,
      ...extraReviewData,
    },
  });
  if (update.count !== 1) throw new Error("The queue item changed before the status update completed. Refresh and try again.");
  const row = await database.outreachQueueItem.findUniqueOrThrow({ where: { id } });
  const domain = queueToDomain(row);
  await sendLoomNeededNotificationIfConfigured(domain, status);
  if (status === "Prospect Said Yes") {
    await sendInternalOperatorNotificationSafely({
      kind: "prospect_interested",
      title: "Prospect said yes",
      marketTrade: `${domain.trade} in ${domain.city}`,
      resultCount: 1,
      attention: `${domain.businessName} needs the manual preview, Loom, or pricing step.`,
      nextAction: "Open the queue, send the public preview manually, and prepare Loom if recommended.",
      pagePath: "/engine?tab=operator-test-center",
    });
  }
  await recordLearningEvent(domain);
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return domain;
}

export async function regenerateProspectOutreachWithCurrentScript(prospectId: string, options: { previewOnly?: boolean } = {}) {
  const prospect = await getProspect(prospectId);
  if (!prospect) return null;
  const previewInfo = await publicPreviewForProspect(prospectId);
  const nowIso = new Date().toISOString();
  const outreach = {
    ...generateOutreach(prospect, previewInfo.previewLink),
    approved: false,
    lastRegeneratedAt: nowIso,
  };
  const updated = {
    ...prospect,
    outreach,
    activities: [
      activity("outreach", `Outreach regenerated with ${currentOutreachCopyVersion}. Approval removed. Nothing was sent.`),
      ...prospect.activities,
    ],
  };
  const queueItem = await findExistingQueueItemForProspect(prospectId);
  if (!options.previewOnly && queueItem && queueItemDraftMutationIsProtected(queueItem)) {
    throw new Error("Outreach cannot be regenerated after approval, sending, contact, or suppression.");
  }
  if (options.previewOnly) {
    return {
      prospect,
      updatedProspect: updated,
      queueItem,
      previewLink: previewInfo.previewLink,
      wouldUpdateQueue: Boolean(queueItem),
    };
  }
  const saved = await saveProspect(updated);
  let refreshedQueueItem: OutreachQueueItem | null = null;
  if (queueItem) {
    refreshedQueueItem = await createOrRefreshAutonomousReviewPackageForProspect(saved.id);
  }
  return {
    prospect,
    updatedProspect: saved,
    queueItem: refreshedQueueItem ?? queueItem,
    previewLink: previewInfo.previewLink,
    wouldUpdateQueue: Boolean(queueItem),
  };
}

export async function createOrRefreshAutonomousReviewPackageForProspect(prospectOrId: Prospect | string) {
  const prospect = typeof prospectOrId === "string" ? await getProspect(prospectOrId) : prospectOrId;
  if (!prospect) return null;
  const existingQueueItem = await findExistingQueueItemForProspect(prospect.id);
  if (existingQueueItem && queueItemDraftMutationIsProtected(existingQueueItem)) return existingQueueItem;
  const previewInfo = await publicPreviewForProspect(prospect.id);
  const nowIso = new Date().toISOString();
  const prospectWithPreview = prospect.preview ? prospect : (await prepareProspectForPreview(prospect)).prospect;
  const outreach = {
    ...generateOutreach(prospectWithPreview, previewInfo.previewLink),
    approved: false,
    lastRegeneratedAt: nowIso,
  };
  const saved = await saveProspect({
    ...prospectWithPreview,
    outreach,
    activities: [
      activity("outreach", "Current Autonomous Growth review package created or refreshed. Nothing was sent."),
      ...prospectWithPreview.activities,
    ],
  });
  const queueItem = await upsertAutonomousQueueItemFromPackage({
    forceReviewOnly: true,
    outreachPreference: "written_only",
    previewLink: previewInfo.previewLink,
    prospect: saved,
    sourceProvider: "Legacy Outreach Backfill",
    topProspectResultId: previewInfo.topProspectResultId,
  });
  if (!previewInfo.previewLink) {
    if (queueItemDraftMutationIsProtected(queueItem)) return queueItem;
    const note = "No valid public /p/ preview link was found. Generate/review a public preview before send-ready approval.";
    if (!hasDatabase) {
      const memory = memoryQueue().find((item) => item.id === queueItem.id);
      if (memory && memory.status === queueItem.status && memory.updatedAt === queueItem.updatedAt && !queueItemDraftMutationIsProtected(memory)) {
        memory.status = "Needs Review";
        memory.blockedReason = [memory.blockedReason, note].filter(Boolean).join(" ");
        memory.recommendedNextAction = "Regenerate Preview";
        memory.notes = [memory.notes, note].filter(Boolean).join("\n");
        memory.updatedAt = new Date().toISOString();
        return structuredClone(memory);
      }
    } else {
      const database = getProspectDatabase();
      const updated = await database.outreachQueueItem.updateMany({
        where: {
          id: queueItem.id,
          status: queueItem.status,
          updatedAt: new Date(queueItem.updatedAt),
          sentDate: null,
          NOT: [
            { status: { in: ["Queued", ...protectedQueueStatuses] } },
            { notes: { contains: ambiguousOutcomeMarker } },
          ],
        },
        data: {
          status: "Needs Review",
          blockedReason: [queueItem.blockedReason, note].filter(Boolean).join(" "),
          recommendedNextAction: "Regenerate Preview",
          notes: [queueItem.notes, note].filter(Boolean).join("\n") || null,
        },
      });
      if (updated.count !== 1) {
        const current = await database.outreachQueueItem.findUnique({ where: { id: queueItem.id } });
        return current ? queueToDomain(current) : null;
      }
      const row = await database.outreachQueueItem.findUniqueOrThrow({ where: { id: queueItem.id } });
      return queueToDomain(row);
    }
  }
  return queueItem;
}

export async function recordAutonomousFeedback(id: string, feedbackLabel: AutonomousFeedbackLabel, note = "") {
  if (!autonomousFeedbackLabels.includes(feedbackLabel)) throw new Error("Select a supported feedback label.");
  const nowIso = new Date().toISOString();
  if (!hasDatabase) {
    const item = memoryQueue().find((entry) => entry.id === id);
    if (!item) return null;
    if (item.status === "Sending" || queueItemHasAmbiguousOutcome(item)) {
      throw new Error("Feedback cannot change a queue item while email delivery is unresolved.");
    }
    item.feedbackLabels = [...new Set([...item.feedbackLabels, feedbackLabel])];
    Object.assign(item, feedbackReview(item));
    item.notes = [item.notes, note].filter(Boolean).join("\n");
    item.updatedAt = nowIso;
    await recordRunReview(memorySettings(), memoryQueue());
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const existing = await database.outreachQueueItem.findUnique({ where: { id } });
  if (!existing) return null;
  const current = queueToDomain(existing);
  if (current.status === "Sending" || queueItemHasAmbiguousOutcome(current)) {
    throw new Error("Feedback cannot change a queue item while email delivery is unresolved.");
  }
  const feedbackLabels = [...new Set([...current.feedbackLabels, feedbackLabel])];
  const review = feedbackReview(current, feedbackLabels);
  const updated = await database.outreachQueueItem.updateMany({
    where: {
      id,
      status: existing.status,
      updatedAt: existing.updatedAt,
      NOT: [
        { status: "Sending" },
        { notes: { contains: ambiguousOutcomeMarker } },
      ],
    },
    data: {
      feedbackLabels,
      notes: [current.notes, note].filter(Boolean).join("\n") || null,
      reviewScore: review.reviewScore,
      reviewSummary: review.reviewSummary,
      improvementSuggestions: review.improvementSuggestions,
      detectedIssues: review.detectedIssues,
      recommendedNextAction: review.recommendedNextAction,
      regenerationPlan: review.regenerationPlan,
      rewritePlan: review.rewritePlan,
    },
  });
  if (updated.count !== 1) throw new Error("The queue item changed before feedback was recorded. Refresh and try again.");
  const row = await database.outreachQueueItem.findUniqueOrThrow({ where: { id } });
  await database.autonomousFeedbackEvent.create({
    data: {
      queueItemId: id,
      topProspectResultId: current.topProspectResultId || null,
      businessName: current.businessName,
      trade: current.trade,
      city: current.city,
      feedbackLabel,
      feedbackCategory: feedbackCategory(feedbackLabel),
      note: note || null,
    },
  });
  const domain = queueToDomain(row);
  await recordLearningEvent(domain);
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return domain;
}

export async function rewriteOutreachQueueItem(id: string) {
  const nowIso = new Date().toISOString();
  if (!hasDatabase) {
    const item = memoryQueue().find((entry) => entry.id === id);
    if (!item) return null;
    if (queueItemDraftMutationIsProtected(item)) {
      throw new Error("Outreach copy cannot be rewritten after approval, sending, contact, or suppression.");
    }
    item.emailBody = rewriteOutreachWithFixes(item.emailBody);
    item.rewritePlan = [];
    item.recommendedNextAction = "Needs Human Review";
    item.reviewSummary = `${item.businessName} outreach was rewritten for review. Nothing was sent.`;
    item.updatedAt = nowIso;
    await recordRunReview(memorySettings(), memoryQueue());
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const existing = await database.outreachQueueItem.findUnique({ where: { id } });
  if (!existing) return null;
  const current = queueToDomain(existing);
  if (queueItemDraftMutationIsProtected(current)) {
    throw new Error("Outreach copy cannot be rewritten after approval, sending, contact, or suppression.");
  }
  const updated = await database.outreachQueueItem.updateMany({
    where: {
      id,
      status: existing.status,
      updatedAt: existing.updatedAt,
      sentDate: null,
      NOT: [
        { status: { in: ["Queued", ...protectedQueueStatuses] } },
        { notes: { contains: ambiguousOutcomeMarker } },
      ],
    },
    data: {
      emailBody: rewriteOutreachWithFixes(current.emailBody),
      rewritePlan: [],
      recommendedNextAction: "Needs Human Review",
      reviewSummary: `${current.businessName} outreach was rewritten for review. Nothing was sent.`,
    },
  });
  if (updated.count !== 1) throw new Error("The queue item changed before the rewrite completed. Refresh and try again.");
  const row = await database.outreachQueueItem.findUniqueOrThrow({ where: { id } });
  const domain = queueToDomain(row);
  await recordLearningEvent(domain);
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return domain;
}

function incrementReason(summary: OutreachCopyRegenerationSummary, reason: string) {
  summary.skipped += 1;
  summary.skippedReasons[reason] = (summary.skippedReasons[reason] ?? 0) + 1;
}

function summarizeRegeneration(summary: OutreachCopyRegenerationSummary) {
  const skippedParts = Object.entries(summary.skippedReasons)
    .map(([reason, count]) => `${count} skipped because ${reason}`)
    .join("; ");
  return [
    `${summary.updated} unsent package${summary.updated === 1 ? "" : "s"} updated to ${summary.copyVersion}`,
    skippedParts,
  ].filter(Boolean).join(". ");
}

function regeneratedQueueCopy(item: OutreachQueueItem, nowIso: string) {
  const prospect = prospectForQueueCopyRegeneration(item);
  const previewLink = item.previewLink && /\/p\//i.test(item.previewLink) ? item.previewLink : "";
  const outreach = generateOutreach(prospect, previewLink);
  return {
    subjectLine: outreach.subjects[0],
    emailBody: outreach.concise,
    dmScript: manualDmScript(prospect, previewLink),
    loomTalkingPoints: previewLink
      ? loomTalkingPoints(prospect, previewLink)
      : "Preview missing - generate/review preview before sending yes-reply.",
    outreachCopyVersion: currentOutreachCopyVersion,
    outreachCopyGeneratedAt: new Date(outreach.outreachCopyGeneratedAt || nowIso),
    lastRegeneratedAt: new Date(nowIso),
    rewritePlan: [],
    recommendedNextAction: "Needs Human Review" as const,
    reviewSummary: `${item.businessName} outreach copy was regenerated to ${currentOutreachCopyVersion}. Nothing was sent.`,
    notes: [item.notes, `Outreach copy regenerated to ${currentOutreachCopyVersion}. Nothing was sent.`].filter(Boolean).join("\n"),
  };
}

export async function regenerateUnsentOutreachCopy(): Promise<OutreachCopyRegenerationSummary> {
  const queue = await listOutreachQueueItems();
  const summary: OutreachCopyRegenerationSummary = {
    copyVersion: currentOutreachCopyVersion,
    updated: 0,
    skipped: 0,
    oldUnsentPackagesNeedingRegeneration: 0,
    updatedItems: [],
    skippedReasons: {},
    message: "",
  };
  const nowIso = new Date().toISOString();
  const eligible = queue.filter((item) => {
    const result = outreachCopyRegenerationEligibility(item);
    if (result.eligible) summary.oldUnsentPackagesNeedingRegeneration += 1;
    return result.eligible;
  });

  if (!hasDatabase) {
    for (const item of memoryQueue()) {
      const eligibility = outreachCopyRegenerationEligibility(item);
      if (!eligibility.eligible) {
        incrementReason(summary, eligibility.reason);
        continue;
      }
      Object.assign(item, {
        ...regeneratedQueueCopy(item, nowIso),
        outreachCopyGeneratedAt: nowIso,
        lastRegeneratedAt: nowIso,
        updatedAt: nowIso,
      });
      summary.updated += 1;
      summary.updatedItems.push(item.businessName);
    }
    await recordRunReview(memorySettings(), memoryQueue());
    summary.message = summarizeRegeneration(summary);
    return summary;
  }

  await ensureTopProspectSchema();
  const database = getProspectDatabase();
  const eligibleIds = new Set(eligible.map((item) => item.id));
  for (const item of queue) {
    if (!eligibleIds.has(item.id)) {
      incrementReason(summary, outreachCopyRegenerationEligibility(item).reason);
      continue;
    }
    const regenerated = regeneratedQueueCopy(item, nowIso);
    const updated = await database.outreachQueueItem.updateMany({
      where: {
        id: item.id,
        status: item.status,
        updatedAt: new Date(item.updatedAt),
        sentDate: null,
        NOT: [
          { status: { in: ["Queued", ...protectedQueueStatuses] } },
          { notes: { contains: ambiguousOutcomeMarker } },
        ],
      },
      data: regenerated,
    });
    if (updated.count !== 1) {
      incrementReason(summary, "record changed during regeneration");
      continue;
    }
    summary.updated += 1;
    summary.updatedItems.push(item.businessName);
  }
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  summary.message = summarizeRegeneration(summary);
  return summary;
}

export function resetAutonomousGrowthMemoryForTests() {
  globalAutonomous.autonomousGrowthSettingsMemory = undefined;
  globalAutonomous.outreachQueueMemory = undefined;
  globalAutonomous.autonomousRunReviewsMemory = undefined;
  globalAutonomous.autopilotCampaignMemory = undefined;
  globalAutonomous.autopilotSmokeTestMemory = undefined;
  globalAutonomous.smartAutonomousRunSummaryMemory = undefined;
  globalAutonomous.approvedAutoEmailQueueIdsMemory = undefined;
}

export function setOutreachQueueMemoryForTests(items: OutreachQueueItem[]) {
  globalAutonomous.outreachQueueMemory = structuredClone(items);
}

export function outreachQueueMemoryForTests() {
  return structuredClone(memoryQueue());
}

export function learningSummaryForAutonomousQueueForTests(queue: OutreachQueueItem[], runReviews: AutonomousRunReview[] = []): AutonomousLearningSummary {
  return learningSummaryForQueue(queue, runReviews);
}
