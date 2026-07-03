import type { Prisma } from "@prisma/client";
import {
  defaultAutonomousGrowthSettings,
  evaluateAutoSendEligibility,
  evaluatePreviewQualityGate,
  loomTalkingPoints,
  manualDmScript,
  normalizeAutonomousGrowthSettings,
  outreachQueueStatuses,
  outreachEnvironment,
  queueStatusForPackage,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthMetrics,
  type AutonomousGrowthSettings,
  type OutreachQueueItem,
  type OutreachQueueStatus,
} from "@/lib/autonomous-growth";
import type { Prospect } from "@/lib/prospect-engine";
import { getProspectDatabase } from "@/lib/prospect-repository";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import { evaluateOutreachEmailQuality, type OutreachPreference } from "@/lib/top-prospects";

const globalAutonomous = globalThis as typeof globalThis & {
  autonomousGrowthSettingsMemory?: AutonomousGrowthSettings;
  outreachQueueMemory?: OutreachQueueItem[];
};

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());

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

function jsonArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type SettingsRow = Prisma.AutonomousGrowthSettingsGetPayload<Record<string, never>>;
type QueueRow = Prisma.OutreachQueueItemGetPayload<Record<string, never>>;

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
    updatedAt: row.updatedAt.toISOString(),
  });
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

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function metricsForQueue(queue: OutreachQueueItem[], settings: AutonomousGrowthSettings): AutonomousGrowthMetrics {
  const today = todayStart().getTime();
  const todayItems = queue.filter((item) => new Date(item.createdAt).getTime() >= today);
  const sentToday = queue.filter((item) => item.sentDate && new Date(item.sentDate).getTime() >= today).length;
  const sent = queue.filter((item) => item.status === "Sent" || item.sentDate);
  const replies = queue.filter((item) => ["Replied", "Positive Reply"].includes(item.status) || item.replyStatus).length;
  const positiveReplies = queue.filter((item) => item.status === "Positive Reply" || /positive/i.test(item.replyStatus)).length;
  const tradeCounts = queue.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.trade]: (counts[item.trade] ?? 0) + 1 }), {});
  const bestTrade = Object.entries(tradeCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "Not enough data";
  const subjectCounts = queue.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.subjectLine]: (counts[item.subjectLine] ?? 0) + 1 }), {});
  const bestSubjectLine = Object.entries(subjectCounts).sort(([, left], [, right]) => right - left)[0]?.[0] ?? "Not enough data";
  const ready = queue.filter((item) => ["Eligible", "Queued"].includes(item.status));
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
    replyRate: sent.length ? Math.round((replies / sent.length) * 100) : 0,
    positiveReplyRate: sent.length ? Math.round((positiveReplies / sent.length) * 100) : 0,
    bestTrade,
    bestSubjectLine,
    bestOutreachAngle: ready[0]?.eligibilityReason ?? "Not enough data",
    wonLostProspects: `${positiveReplies} positive / ${queue.filter((item) => ["Not Interested", "Bad Fit"].includes(item.status)).length} lost`,
  };
}

export async function getAutonomousGrowthDashboard(): Promise<AutonomousGrowthDashboard> {
  const settings = await getAutonomousGrowthSettings();
  const queue = await listOutreachQueueItems();
  const env = outreachEnvironment();
  return {
    settings,
    env: {
      autoSendEnabled: env.autoSendEnabled,
      sendProvider: env.sendProvider || "not configured",
      hasResendApiKey: env.hasResendApiKey,
      hasFromEmail: env.hasFromEmail,
      hasReplyToEmail: env.hasReplyToEmail,
      hasPostalAddress: env.hasPostalAddress,
    },
    metrics: metricsForQueue(queue, settings),
    queue,
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
    return domain;
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().outreachQueueItem.upsert({
    where: { topProspectResultId },
    create: itemData,
    update: itemData,
  });
  return queueToDomain(row);
}

export async function updateOutreachQueueStatus(id: string, status: OutreachQueueStatus) {
  if (!outreachQueueStatuses.includes(status)) throw new Error("Select a supported queue status.");
  if (!hasDatabase) {
    const item = memoryQueue().find((entry) => entry.id === id);
    if (!item) return null;
    item.status = status;
    item.updatedAt = new Date().toISOString();
    return structuredClone(item);
  }
  await ensureTopProspectSchema();
  const now = new Date();
  const row = await getProspectDatabase().outreachQueueItem.update({
    where: { id },
    data: {
      status,
      sentDate: status === "Sent" ? now : undefined,
      followUpDate: status === "Follow-up Needed" ? now : undefined,
    },
  });
  return queueToDomain(row);
}

export function resetAutonomousGrowthMemoryForTests() {
  globalAutonomous.autonomousGrowthSettingsMemory = undefined;
  globalAutonomous.outreachQueueMemory = undefined;
}
