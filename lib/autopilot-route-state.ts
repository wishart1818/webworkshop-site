import {
  normalizeAutopilotCampaignSettings,
  type AutopilotCampaignSettings,
  type AutopilotDashboard,
} from "@/lib/autopilot-campaign";
import { findLatestAuditEvent, safeRecordAudit } from "@/lib/operational-controls";
import type { TopProspectJob } from "@/lib/top-prospects";

const autopilotStateAction = "autopilot_campaign_state";
const autopilotStateSubject = "current";

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export type PersistedAutopilotRouteState = {
  jobId: string;
  status: string;
  settings: AutopilotCampaignSettings;
};

export async function persistAutopilotRouteState(autopilot: AutopilotDashboard) {
  const settings = autopilot.campaign.settings;
  const jobId = autopilot.activity.topProspectJobId || autopilot.campaign.latestRunReport?.topProspectJobId || "";
  await safeRecordAudit({
    action: autopilotStateAction,
    outcome: "success",
    subject: autopilotStateSubject,
    metadata: {
      jobId,
      status: autopilot.campaign.status,
      campaignName: settings.campaignName,
      marketPresetId: settings.marketPresetId,
      customCities: settings.customCities,
      state: settings.state,
      trade: settings.trade,
      prospectType: settings.prospectType,
      mode: settings.mode,
      outreachStyle: settings.outreachStyle,
      duration: settings.duration,
      cadence: settings.cadence,
      maxProspectsPerRun: settings.maxProspectsPerRun,
      maxProspectsTotal: settings.maxProspectsTotal,
      excludePreviouslyReviewed: settings.excludePreviouslyReviewed,
      requireWrittenContact: settings.requireWrittenContact,
      manualDmMode: settings.manualDmMode,
      loomNotifications: settings.loomNotifications,
      pauseOnProviderFailure: settings.stopRules.pauseOnProviderFailure,
      pauseOnBadFitRatePercent: settings.stopRules.pauseOnBadFitRatePercent,
      stopWhenTotalProspectsReached: settings.stopRules.stopWhenTotalProspectsReached,
    },
  });
}

export async function readPersistedAutopilotRouteState(): Promise<PersistedAutopilotRouteState | null> {
  const event = await findLatestAuditEvent({ action: autopilotStateAction, subject: autopilotStateSubject });
  const metadata = event?.metadata;
  if (!metadata) return null;
  const settings = normalizeAutopilotCampaignSettings({
    campaignName: stringValue(metadata.campaignName),
    marketPresetId: stringValue(metadata.marketPresetId),
    customCities: stringValue(metadata.customCities),
    state: stringValue(metadata.state),
    trade: stringValue(metadata.trade) as AutopilotCampaignSettings["trade"],
    prospectType: stringValue(metadata.prospectType) as AutopilotCampaignSettings["prospectType"],
    mode: stringValue(metadata.mode) as AutopilotCampaignSettings["mode"],
    outreachStyle: stringValue(metadata.outreachStyle) as AutopilotCampaignSettings["outreachStyle"],
    duration: stringValue(metadata.duration) as AutopilotCampaignSettings["duration"],
    cadence: stringValue(metadata.cadence) as AutopilotCampaignSettings["cadence"],
    maxProspectsPerRun: numberValue(metadata.maxProspectsPerRun, 100),
    maxProspectsTotal: numberValue(metadata.maxProspectsTotal, 20),
    excludePreviouslyReviewed: booleanValue(metadata.excludePreviouslyReviewed, true),
    requireWrittenContact: booleanValue(metadata.requireWrittenContact, true),
    manualDmMode: booleanValue(metadata.manualDmMode, true),
    loomNotifications: booleanValue(metadata.loomNotifications, true),
    stopRules: {
      pauseOnProviderFailure: booleanValue(metadata.pauseOnProviderFailure, true),
      pauseOnBadFitRatePercent: numberValue(metadata.pauseOnBadFitRatePercent, 50),
      pauseAfterWeakPreviewCount: 0,
      stopWhenTotalProspectsReached: booleanValue(metadata.stopWhenTotalProspectsReached, true),
    },
  });
  return {
    jobId: stringValue(metadata.jobId),
    status: stringValue(metadata.status),
    settings,
  };
}

export function recoveredAutopilotSettingsFromJob(job: TopProspectJob): AutopilotCampaignSettings {
  return normalizeAutopilotCampaignSettings({
    campaignName: "Recovered Autopilot campaign",
    marketPresetId: "",
    customCities: job.input.rawCityInput || job.input.city,
    state: job.input.state,
    trade: job.input.trade,
    prospectType: job.input.prospectType,
    mode: job.input.mode,
    duration: "run_once",
    cadence: "manual_only",
    maxProspectsPerRun: job.input.businessesToScan,
    maxProspectsTotal: job.input.finalProspectsWanted,
    excludePreviouslyReviewed: job.input.excludePreviouslyReviewed,
    requireWrittenContact: job.input.outreachPreference === "written_only",
    manualDmMode: true,
    loomNotifications: true,
  });
}
