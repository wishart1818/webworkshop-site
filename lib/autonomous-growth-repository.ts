import type { Prisma } from "@prisma/client";
import {
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
import { activity, createProspect, generateOutreach, normalizeTradeCategory, prospectWrittenContactMethodIsUsable, withPreview, type Prospect } from "@/lib/prospect-engine";
import { getProspect, getProspectDatabase, saveProspect } from "@/lib/prospect-repository";
import { createPublicPreviewToken } from "@/lib/public-preview-token";
import { getTopProspectJob, listTopProspectJobs } from "@/lib/top-prospect-repository";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { evaluateOutreachEmailQuality, prepareTopProspectArtifacts, publicProspectPreviewLink, type OutreachPreference } from "@/lib/top-prospects";
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
    dailyCapRemaining: Math.max(0, settings.maxEmailsSentPerDay - sentToday),
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

async function sendInternalOperatorNotificationSafely(input: InternalNotificationInput) {
  const [emailResult, smsResult] = await Promise.all([
    sendInternalOperatorNotification(input),
    sendInternalOperatorSms(input),
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
  const prepared = prepareTopProspectArtifacts(result.prospect, previewLink, outreachPreference);
  const saved = hasDatabase
    ? await saveProspect(prepared.prospect)
    : prepared.prospect;
  if (hasDatabase) {
    const scores = prepared.assessment.salesScores;
    const token = previewLink.split("/p/")[1] ?? null;
    await getProspectDatabase().topProspectResult.update({
      where: { id: result.id },
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
  }
  return upsertAutonomousQueueItemFromPackage({
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
      sendProvider: env.sendProvider || "not configured",
      hasResendApiKey: env.hasResendApiKey,
      hasFromEmail: env.hasFromEmail,
      hasReplyToEmail: env.hasReplyToEmail,
      hasPostalAddress: env.hasPostalAddress,
      hasNotifyEmail: env.hasNotifyEmail,
      hasNotifyFromEmail: env.hasNotifyFromEmail,
      notifyOnLoomNeeded: env.notifyOnLoomNeeded,
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

  if (!dryRun) {
    const regeneration = await regenerateUnsentOutreachCopy();
    refreshedCopyCount = regeneration.updated;
    for (const [reason, count] of Object.entries(regeneration.skippedReasons)) {
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + count;
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
      : `Processed existing qualified prospects. Refreshed ${refreshedCopyCount} copy item${refreshedCopyCount === 1 ? "" : "s"} and generated ${generatedMissingPackages} missing package${generatedMissingPackages === 1 ? "" : "s"}. Nothing was sent.`,
    smartGrowth,
    summary,
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
  };
}

function sourceForProspect(prospect: Prospect) {
  if (prospect.email) return "Public email";
  if (prospect.contactFormUrl) return "Contact form";
  if (/facebook|instagram/i.test(prospect.profileUrl)) return "Social profile";
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

export type EmailSuppressionReason = "bounce" | "complaint" | "unsubscribe" | "manual_suppression";
export type EmailSuppressionResult = {
  matched: number;
  updated: number;
  reason: EmailSuppressionReason;
};

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

async function sendWithResend(item: OutreachQueueItem, environment: NodeJS.ProcessEnv = process.env) {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.OUTREACH_FROM_EMAIL?.trim();
  const replyTo = environment.OUTREACH_REPLY_TO_EMAIL?.trim();
  if (!apiKey || !from || !replyTo) throw new Error("Email provider, sender, or reply-to is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [item.email],
      reply_to: replyTo,
      subject: item.subjectLine,
      text: item.emailBody,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email provider rejected the message with HTTP ${response.status}.`);
  }
  const payload = await response.json().catch(() => ({})) as { id?: string };
  return payload.id ?? "";
}

function safeEmailSendFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^Email provider (?:rejected|request failed|sender|provider, sender)/i.test(message)
    ? message
    : "Email provider request failed safely.";
}

async function markQueueItemSent(item: OutreachQueueItem, providerMessageId: string, now = new Date()) {
  const sentDate = now.toISOString();
  const notes = [item.notes, providerMessageId ? `Resend message ID: ${providerMessageId}` : "Sent through Auto Email Pilot."].filter(Boolean).join("\n");
  if (!hasDatabase) {
    const existing = memoryQueue().find((entry) => entry.id === item.id);
    if (!existing) return null;
    existing.status = "Sent";
    existing.sentDate = sentDate;
    existing.notes = notes;
    existing.updatedAt = sentDate;
    await recordRunReview(memorySettings(), memoryQueue());
    return structuredClone(existing);
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().outreachQueueItem.update({
    where: { id: item.id },
    data: {
      status: "Sent",
      sentDate: now,
      notes,
    },
  });
  const domain = queueToDomain(row);
  await recordLearningEvent(domain);
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return domain;
}

async function markQueueItemSendFailure(item: OutreachQueueItem, message: string, now = new Date()) {
  const failedAt = now.toISOString();
  const note = `Auto Email Pilot send failed safely on ${failedAt}: ${message}`;
  const notes = [item.notes, note].filter(Boolean).join("\n");
  if (!hasDatabase) {
    const existing = memoryQueue().find((entry) => entry.id === item.id);
    if (!existing) return item;
    existing.status = "Needs Review";
    existing.notes = notes;
    existing.updatedAt = failedAt;
    await recordRunReview(memorySettings(), memoryQueue());
    return structuredClone(existing);
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().outreachQueueItem.update({
    where: { id: item.id },
    data: {
      status: "Needs Review",
      notes,
    },
  });
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return queueToDomain(row);
}

export async function sendQueuedEmailQueueItem(id: string): Promise<SendQueuedEmailResult> {
  const settings = await getAutonomousGrowthSettings();
  const queue = await listOutreachQueueItems();
  const item = queue.find((entry) => entry.id === id) ?? null;
  if (!item) return { item: null, sent: false, blockedReasons: ["Queue item was not found."] };
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
    const providerMessageId = await sendWithResend(item);
    const sentItem = await markQueueItemSent(item, providerMessageId);
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "success",
      subject: item.email,
      metadata: { queueItemId: item.id, provider: "resend", providerMessageId: providerMessageId || "accepted" },
    });
    await sendInternalOperatorNotificationSafely({
      kind: "approved_email_sent",
      title: "Approved email send succeeded",
      marketTrade: `${item.trade} in ${item.city}`,
      resultCount: 1,
      attention: `${item.businessName} email was accepted by the provider.`,
      nextAction: "Watch for a reply and keep suppression handling active.",
      pagePath: "/engine?tab=operator-test-center",
    });
    return { item: sentItem, sent: true, blockedReasons: [], providerMessageId };
  } catch (error) {
    const message = safeEmailSendFailureMessage(error);
    const failedItem = await markQueueItemSendFailure(item, message);
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "failure",
      subject: item.email || item.businessName,
      metadata: { queueItemId: item.id, reason: message },
    });
    await sendInternalOperatorNotificationSafely({
      kind: "approved_email_failed",
      title: "Approved email send failed",
      marketTrade: `${item.trade} in ${item.city}`,
      resultCount: 1,
      attention: `${item.businessName} did not send. Reason: ${message}`,
      nextAction: "Review Resend, sender settings, suppression, and queue status.",
      pagePath: "/engine?tab=operator-test-center",
    });
    return { item: failedItem, sent: false, blockedReasons: [message] };
  }
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
    });
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
  const queued = queue.filter((item) => item.status === "Queued" && item.contactSource === "Public email");
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

export async function upsertAutonomousQueueItemFromPackage({
  forceReviewOnly = false,
  outreachPreference,
  previewLink,
  prospect,
  sourceProvider = "Top Prospects",
  topProspectResultId,
}: {
  forceReviewOnly?: boolean;
  outreachPreference: OutreachPreference;
  previewLink: string;
  prospect: Prospect;
  sourceProvider?: string;
  topProspectResultId: string;
}) {
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
  const status = forceReviewOnly && computedStatus === "Queued" ? "Eligible" : computedStatus;
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
    queuedDate: status === "Queued" ? now : null,
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
    const domain: OutreachQueueItem = {
      ...itemData,
      id: existingIndex >= 0 ? memoryQueue()[existingIndex].id : `queue-${topProspectResultId}`,
      website: itemData.website ?? "",
      email: itemData.email ?? "",
      blockedReason: itemData.blockedReason ?? "",
      queuedDate: itemData.queuedDate?.toISOString() ?? "",
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
      });
    } else if (["Eligible", "Needs Review", "Queued"].includes(domain.status)) {
      await sendInternalOperatorNotificationSafely({
        kind: "outreach_package_ready",
        title: "Outreach package ready for review",
        marketTrade: `${domain.trade} in ${domain.city}`,
        resultCount: 1,
        attention: `${domain.businessName} is in the manual review queue.`,
        nextAction: "Review preview, copy, contact path, and approval gates.",
        pagePath: "/engine?tab=operator-test-center",
      });
    }
    await recordRunReview(settings, memoryQueue());
    return domain;
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().outreachQueueItem.upsert({
    where: { topProspectResultId },
    create: itemData,
    update: itemData,
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
    });
  } else if (["Eligible", "Needs Review", "Queued"].includes(domain.status)) {
    await sendInternalOperatorNotificationSafely({
      kind: "outreach_package_ready",
      title: "Outreach package ready for review",
      marketTrade: `${domain.trade} in ${domain.city}`,
      resultCount: 1,
      attention: `${domain.businessName} is in the manual review queue.`,
      nextAction: "Review preview, copy, contact path, and approval gates.",
      pagePath: "/engine?tab=operator-test-center",
    });
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
    let effectiveStatus = nextStatus;
    if (nextStatus === "Queued") {
      const candidate = { ...item, status: "Queued" as const, queuedDate: item.queuedDate || nowIso };
      const candidateQueue = memoryQueue().map((entry) => entry.id === id ? candidate : entry);
      const readiness = evaluateQueuedEmailSendReadiness({ item: candidate, queue: candidateQueue, settings: memorySettings() });
      if (!readiness.ready) {
        effectiveStatus = "Needs Review";
        item.blockedReason = blockedReasonText(readiness.blockedReasons, []);
        item.notes = [item.notes, `Queue request blocked by send-readiness gates: ${item.blockedReason}`].filter(Boolean).join("\n");
      } else {
        item.queuedDate = item.queuedDate || nowIso;
      }
    }
    item.status = effectiveStatus;
    item.sentDate = ["Sent", "First DM Sent", "Loom Sent", "Pricing Sent"].includes(effectiveStatus) ? nowIso : item.sentDate;
    item.followUpDate = effectiveStatus === "Follow-up Needed" ? nowIso : item.followUpDate;
    item.replyStatus = status === "Prospect Said Yes" ? "prospect_said_yes" : item.replyStatus;
    if (effectiveStatus === "Bad Fit") item.recommendedNextAction = "Bad Fit";
    if (["Never Contact", "Opted Out", "Bounced", "Complained", "Suppressed"].includes(effectiveStatus)) item.recommendedNextAction = "Never Contact";
    if (effectiveStatus === "Preview Needs Polish") item.recommendedNextAction = "Regenerate Preview";
    if (effectiveStatus === "Loom Needed" || effectiveStatus === "Ready for Loom" || (nextStatus === "Queued" && effectiveStatus === "Needs Review")) item.recommendedNextAction = "Needs Human Review";
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
  const now = new Date();
  let effectiveStatus = nextStatus;
  let queueBlockedData: Partial<OutreachQueueItem> = {};
  if (nextStatus === "Queued") {
    const queue = await listOutreachQueueItems();
    const current = queue.find((entry) => entry.id === id);
    if (!current) return null;
    const candidate = { ...current, status: "Queued" as const, queuedDate: current.queuedDate || nowIso };
    const readiness = evaluateQueuedEmailSendReadiness({
      item: candidate,
      queue: queue.map((entry) => entry.id === id ? candidate : entry),
      settings: await getAutonomousGrowthSettings(),
    });
    if (!readiness.ready) {
      effectiveStatus = "Needs Review";
      const blockedReason = blockedReasonText(readiness.blockedReasons, []);
      queueBlockedData = {
        blockedReason,
        notes: [current.notes, `Queue request blocked by send-readiness gates: ${blockedReason}`].filter(Boolean).join("\n"),
        recommendedNextAction: "Needs Human Review",
      };
    } else {
      queueBlockedData = { queuedDate: candidate.queuedDate };
    }
  }
  const extraReviewData =
    effectiveStatus === "Bad Fit" ? { recommendedNextAction: "Bad Fit" }
      : ["Never Contact", "Opted Out", "Bounced", "Complained", "Suppressed"].includes(effectiveStatus) ? { recommendedNextAction: "Never Contact" }
        : effectiveStatus === "Preview Needs Polish" ? { recommendedNextAction: "Regenerate Preview" }
          : effectiveStatus === "Loom Needed" || effectiveStatus === "Ready for Loom" ? { recommendedNextAction: "Needs Human Review" }
            : {};
  const row = await getProspectDatabase().outreachQueueItem.update({
    where: { id },
    data: {
      status: effectiveStatus,
      sentDate: ["Sent", "First DM Sent", "Loom Sent", "Pricing Sent"].includes(effectiveStatus) ? now : undefined,
      followUpDate: effectiveStatus === "Follow-up Needed" ? now : undefined,
      replyStatus: status === "Prospect Said Yes" ? "prospect_said_yes" : undefined,
      ...extraReviewData,
      ...queueBlockedData,
    },
  });
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
  const previewInfo = await publicPreviewForProspect(prospect.id);
  const nowIso = new Date().toISOString();
  const prospectWithPreview = prospect.preview ? prospect : withPreview(prospect);
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
    const note = "No valid public /p/ preview link was found. Generate/review a public preview before send-ready approval.";
    if (!hasDatabase) {
      const memory = memoryQueue().find((item) => item.id === queueItem.id);
      if (memory) {
        memory.status = "Needs Review";
        memory.blockedReason = [memory.blockedReason, note].filter(Boolean).join(" ");
        memory.recommendedNextAction = "Regenerate Preview";
        memory.notes = [memory.notes, note].filter(Boolean).join("\n");
        memory.updatedAt = new Date().toISOString();
        return structuredClone(memory);
      }
    } else {
      const row = await getProspectDatabase().outreachQueueItem.update({
        where: { id: queueItem.id },
        data: {
          status: "Needs Review",
          blockedReason: [queueItem.blockedReason, note].filter(Boolean).join(" "),
          recommendedNextAction: "Regenerate Preview",
          notes: [queueItem.notes, note].filter(Boolean).join("\n") || null,
        },
      });
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
  const feedbackLabels = [...new Set([...current.feedbackLabels, feedbackLabel])];
  const review = feedbackReview(current, feedbackLabels);
  const row = await database.outreachQueueItem.update({
    where: { id },
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
  const row = await database.outreachQueueItem.update({
    where: { id },
    data: {
      emailBody: rewriteOutreachWithFixes(current.emailBody),
      rewritePlan: [],
      recommendedNextAction: "Needs Human Review",
      reviewSummary: `${current.businessName} outreach was rewritten for review. Nothing was sent.`,
    },
  });
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
    await database.outreachQueueItem.update({
      where: { id: item.id },
      data: regenerated,
    });
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
