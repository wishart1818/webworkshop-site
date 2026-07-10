import type { Prisma } from "@prisma/client";
import {
  autonomousFeedbackLabels,
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluateQueuedEmailSendReadiness,
  evaluatePreviewQualityGate,
  evaluateSelfReview,
  generateAutonomousRunReview,
  learningSummaryForQueue,
  loomNeededNotificationDraft,
  loomTalkingPoints,
  manualDmScript,
  normalizeAutonomousGrowthSettings,
  outreachQueueStatuses,
  outreachEnvironment,
  queueStatusAfterManualAction,
  outreachRewritePlan,
  previewRegenerationPlan,
  queueStatusForPackage,
  rewriteOutreachWithFixes,
  type AutonomousFeedbackLabel,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthMetrics,
  type AutonomousGrowthSettings,
  type AutonomousLearningSummary,
  type AutonomousNextAction,
  type AutonomousRunReview,
  type OutreachQueueItem,
  type OutreachQueueStatus,
} from "@/lib/autonomous-growth";
import type { Prospect } from "@/lib/prospect-engine";
import { getProspectDatabase } from "@/lib/prospect-repository";
import { getTopProspectJob } from "@/lib/top-prospect-repository";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import { enforceRateLimit, safeRecordAudit } from "@/lib/operational-controls";
import { evaluateOutreachEmailQuality, type OutreachPreference } from "@/lib/top-prospects";
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
import type { TopProspectJob } from "@/lib/top-prospects";

const globalAutonomous = globalThis as typeof globalThis & {
  autonomousGrowthSettingsMemory?: AutonomousGrowthSettings;
  outreachQueueMemory?: OutreachQueueItem[];
  autonomousRunReviewsMemory?: AutonomousRunReview[];
  autopilotCampaignMemory?: AutopilotCampaign;
  autopilotSmokeTestMemory?: AutopilotSmokeTestResult;
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

export async function getAutonomousGrowthDashboard(): Promise<AutonomousGrowthDashboard & { autopilot: AutopilotDashboard }> {
  const settings = await getAutonomousGrowthSettings();
  const queue = await listOutreachQueueItems();
  const runReviews = await listAutonomousRunReviews();
  const env = outreachEnvironment();
  globalAutonomous.autopilotCampaignMemory = await refreshAutopilotCampaignFromTopProspects(memoryAutopilotCampaign());
  const autopilot = buildCurrentAutopilotDashboard(globalAutonomous.autopilotCampaignMemory, queue);
  return {
    settings,
    env: {
      autoSendEnabled: env.autoSendEnabled,
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
    return { item: sentItem, sent: true, blockedReasons: [], providerMessageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed safely.";
    await safeRecordAudit({
      action: "autonomous_email_send",
      outcome: "failure",
      subject: item.email || item.businessName,
      metadata: { queueItemId: item.id, reason: message },
    });
    return { item, sent: false, blockedReasons: [message] };
  }
}

export async function upsertAutonomousQueueItemFromPackage({
  outreachPreference,
  previewLink,
  prospect,
  sourceProvider = "Top Prospects",
  topProspectResultId,
}: {
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
  const status = queueStatusForPackage({ autoEligibility, emailQuality, previewGate, settings });
  const now = new Date();
  const outreach = prospect.outreach;
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
      createdAt: existingIndex >= 0 ? memoryQueue()[existingIndex].createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };
    if (existingIndex >= 0) memoryQueue()[existingIndex] = domain;
    else memoryQueue().unshift(domain);
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
    item.status = nextStatus;
    item.sentDate = ["Sent", "First DM Sent", "Loom Sent", "Pricing Sent"].includes(nextStatus) ? nowIso : item.sentDate;
    item.followUpDate = nextStatus === "Follow-up Needed" ? nowIso : item.followUpDate;
    item.replyStatus = status === "Prospect Said Yes" ? "prospect_said_yes" : item.replyStatus;
    if (nextStatus === "Bad Fit") item.recommendedNextAction = "Bad Fit";
    if (nextStatus === "Never Contact" || nextStatus === "Opted Out") item.recommendedNextAction = "Never Contact";
    if (nextStatus === "Preview Needs Polish") item.recommendedNextAction = "Regenerate Preview";
    if (nextStatus === "Loom Needed" || nextStatus === "Ready for Loom") item.recommendedNextAction = "Needs Human Review";
    item.updatedAt = nowIso;
    await recordRunReview(memorySettings(), memoryQueue());
    await sendLoomNeededNotificationIfConfigured(item, status);
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const now = new Date();
  const extraReviewData =
    nextStatus === "Bad Fit" ? { recommendedNextAction: "Bad Fit" }
      : nextStatus === "Never Contact" || nextStatus === "Opted Out" ? { recommendedNextAction: "Never Contact" }
        : nextStatus === "Preview Needs Polish" ? { recommendedNextAction: "Regenerate Preview" }
          : nextStatus === "Loom Needed" || nextStatus === "Ready for Loom" ? { recommendedNextAction: "Needs Human Review" }
            : {};
  const row = await getProspectDatabase().outreachQueueItem.update({
    where: { id },
    data: {
      status: nextStatus,
      sentDate: ["Sent", "First DM Sent", "Loom Sent", "Pricing Sent"].includes(nextStatus) ? now : undefined,
      followUpDate: nextStatus === "Follow-up Needed" ? now : undefined,
      replyStatus: status === "Prospect Said Yes" ? "prospect_said_yes" : undefined,
      ...extraReviewData,
    },
  });
  const domain = queueToDomain(row);
  await sendLoomNeededNotificationIfConfigured(domain, status);
  await recordLearningEvent(domain);
  await recordRunReview(await getAutonomousGrowthSettings(), await listOutreachQueueItems());
  return domain;
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

export function resetAutonomousGrowthMemoryForTests() {
  globalAutonomous.autonomousGrowthSettingsMemory = undefined;
  globalAutonomous.outreachQueueMemory = undefined;
  globalAutonomous.autonomousRunReviewsMemory = undefined;
  globalAutonomous.autopilotCampaignMemory = undefined;
  globalAutonomous.autopilotSmokeTestMemory = undefined;
}

export function learningSummaryForAutonomousQueueForTests(queue: OutreachQueueItem[], runReviews: AutonomousRunReview[] = []): AutonomousLearningSummary {
  return learningSummaryForQueue(queue, runReviews);
}
