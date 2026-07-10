"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import {
  autonomousFeedbackLabels,
  autonomousGrowthModeLabels,
  autonomousGrowthModes,
  csvEscape,
  loomNeededTaskForQueueItem,
  outreachQueueStatuses,
  type AutonomousFeedbackLabel,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthMode,
  type AutonomousGrowthSettings,
  type OutreachQueueItem,
  type OutreachQueueStatus,
} from "@/lib/autonomous-growth";
import { allCoreServiceTradesOption, prospectSearchTypes, tradeCategories, type TradeCategory } from "@/lib/prospect-engine";
import {
  autopilotCadences,
  autopilotCampaignDraftStorageKey,
  autopilotDurations,
  autopilotMarketMismatchWarning,
  autopilotMarketTargets,
  autopilotOutreachStyles,
  autopilotProviderGuardrailWarnings,
  autopilotPresetFields,
  autopilotProviderRequestEstimate,
  autopilotQueueCsv,
  autopilotQueueKeys,
  autopilotQueueLabels,
  autopilotStartConfirmation,
  defaultAutopilotCampaignSettings,
  normalizeAutopilotCampaignSettings,
  recommendedFirstAutopilotRunSettings,
  topProspectsAutopilotPrefillStorageKey,
  type AutopilotActivityStatus,
  type AutopilotCampaignSettings,
  type AutopilotDashboard,
  type AutopilotQueueKey,
  type AutopilotSmokeTestResult,
  type AutopilotStopRules,
} from "@/lib/autopilot-campaign";
import { prospectModes, recommendedMarketPresets } from "@/lib/top-prospects";

type DashboardPayload = AutonomousGrowthDashboard & { autopilot: AutopilotDashboard };

type ApiPayload = Partial<DashboardPayload> & {
  error?: string;
  item?: OutreachQueueItem;
  settings?: AutonomousGrowthSettings;
  autopilot?: AutopilotDashboard;
  smokeTest?: AutopilotSmokeTestResult;
  sendResult?: { sent: boolean; blockedReasons: string[] };
  autoEmailBatch?: {
    attempted: number;
    sent: number;
    blocked: number;
    fullAutoEnabled: boolean;
    blockedReasons: Array<{ queueItemId: string; businessName: string; email: string; reasons: string[] }>;
  };
  suppression?: { matched: number; updated: number; reason: string };
  topProspectJobId?: string;
  topProspectJobWarning?: string;
};

function apiError(payload: ApiPayload, fallback: string) {
  return payload.error || fallback;
}

function textareaValue(values: string[]) {
  return values.join("\n");
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function queueCsv(queue: OutreachQueueItem[]) {
  const headers = [
    "business name",
    "trade",
    "city",
    "website",
    "email",
    "contact source",
    "preview link",
    "preview quality score",
    "status",
    "review score",
    "recommended action",
    "review summary",
    "feedback labels",
    "subject",
    "email body",
    "sent date",
    "reply status",
    "follow-up status",
    "notes",
    "bad fit reason",
    "blocked reason",
    "source/provider",
  ];
  const rows = queue.map((item) => [
    item.businessName,
    item.trade,
    item.city,
    item.website,
    item.email,
    item.contactSource,
    item.previewLink,
    item.previewQualityScore,
    item.status,
    item.reviewScore,
    item.recommendedNextAction,
    item.reviewSummary,
    item.feedbackLabels.join("; "),
    item.subjectLine,
    item.emailBody,
    item.sentDate,
    item.replyStatus,
    item.status.startsWith("Follow-up") ? item.status : "",
    item.notes,
    item.status === "Bad Fit" ? item.blockedReason : "",
    item.blockedReason,
    item.sourceProvider,
  ]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function downloadCsv(queue: OutreachQueueItem[]) {
  const blob = new Blob([queueCsv(queue)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `webworkshop-outreach-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadAutopilotCsv(autopilot: AutopilotDashboard) {
  const blob = new Blob([autopilotQueueCsv(autopilot.exportRows)], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `webworkshop-autopilot-queue-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function modeDescription(mode: AutonomousGrowthMode) {
  if (mode === "off") return "Nothing runs automatically.";
  if (mode === "dry_run") return "Finds, scores, generates previews and copy, then sends nothing.";
  if (mode === "manual_approval") return "Builds the queue and lets you approve, copy, edit, or mark sent manually. Sends nothing.";
  return "Pilot gate only. Email can send only when every env, cap, quality, and contact rule passes.";
}

function readinessLabel(item: OutreachQueueItem) {
  if (item.status === "Eligible" || item.status === "Queued") return "Ready after human review";
  if (item.status === "Blocked") return "Blocked";
  if (item.status === "Needs Review") return "Needs review";
  return item.status;
}

function formatList(values: string[], empty = "Not enough data yet") {
  return values.length ? values.join(", ") : empty;
}

function formatDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "date not recorded";
}

function profileFieldName(trade: string, field: "name" | "direction" | "strengths" | "cautions") {
  return `styleProfile__${encodeURIComponent(trade)}__${field}`;
}

export function AutonomousGrowthWorkspace() {
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/engine/autonomous-growth", { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.settings || !payload.metrics || !payload.queue || !payload.env || !payload.autopilot) {
        throw new Error(apiError(payload, "Unable to load Autonomous Growth."));
      }
      setDashboard(payload as DashboardPayload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Autonomous Growth.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    if (!["running", "starting_top_prospects", "top_prospects_running"].includes(dashboard?.autopilot.activity.status ?? "")) return;
    const activityTimer = window.setInterval(() => {
      void loadDashboard();
    }, 4000);
    return () => window.clearInterval(activityTimer);
  }, [dashboard?.autopilot.activity.status, loadDashboard]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dashboard) return;
    setSaving(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const styleProfiles = Object.fromEntries(Object.entries(dashboard.settings.styleProfiles).map(([trade, profile]) => [
      trade,
      {
        name: String(form.get(profileFieldName(trade, "name")) ?? profile.name).trim() || profile.name,
        direction: String(form.get(profileFieldName(trade, "direction")) ?? profile.direction).trim() || profile.direction,
        strengths: splitLines(form.get(profileFieldName(trade, "strengths"))),
        cautions: splitLines(form.get(profileFieldName(trade, "cautions"))),
      },
    ])) as AutonomousGrowthSettings["styleProfiles"];
    const settings: Partial<AutonomousGrowthSettings> = {
      mode: form.get("mode") as AutonomousGrowthMode,
      killSwitch: form.get("killSwitch") === "on",
      targetCities: splitLines(form.get("targetCities")),
      targetServiceAreas: splitLines(form.get("targetServiceAreas")),
      targetTrades: splitLines(form.get("targetTrades")) as TradeCategory[],
      excludedTrades: splitLines(form.get("excludedTrades")) as TradeCategory[],
      maxProspectsScannedPerDay: Number(form.get("maxProspectsScannedPerDay")),
      maxPreviewsGeneratedPerDay: Number(form.get("maxPreviewsGeneratedPerDay")),
      maxEmailsQueuedPerDay: Number(form.get("maxEmailsQueuedPerDay")),
      maxEmailsSentPerDay: Number(form.get("maxEmailsSentPerDay")),
      emailCooldownMinutes: Number(form.get("emailCooldownMinutes")),
      followUpsEnabled: form.get("followUpsEnabled") === "on",
      styleProfiles,
    };
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_settings", settings }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.settings) throw new Error(apiError(payload, "Unable to save Autonomous Growth settings."));
      setDashboard({ ...dashboard, settings: payload.settings });
      setNotice("Autonomous Growth settings saved. Sending remains gated by mode, kill switch, caps, and environment.");
      await loadDashboard();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save Autonomous Growth settings.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: OutreachQueueItem, status: OutreachQueueStatus) {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_queue_status", queueItemId: item.id, status }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.item) throw new Error(apiError(payload, "Unable to update queue item."));
      await loadDashboard();
      setNotice(status === "Prospect Said Yes" ? "Prospect said yes. A Loom Needed task was created and nothing was sent." : `${status} recorded. Nothing was sent automatically.`);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update queue item.");
    } finally {
      setSaving(false);
    }
  }

  async function copyText(key: string, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setNotice("Copied. This is still manual outreach only.");
  }

  async function regeneratePackage(item: OutreachQueueItem) {
    if (!item.topProspectResultId) {
      setError("This queue item is not connected to a Top Prospects result.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/engine/top-prospects/results/${item.topProspectResultId}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok) throw new Error(apiError(payload, "Unable to regenerate this Outreach Package."));
      await loadDashboard();
      setNotice("Preview and outreach package regenerated for review. Nothing was sent.");
    } catch (regenerateError) {
      setError(regenerateError instanceof Error ? regenerateError.message : "Unable to regenerate this Outreach Package.");
    } finally {
      setSaving(false);
    }
  }

  async function recordFeedback(item: OutreachQueueItem, feedbackLabel: AutonomousFeedbackLabel) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record_feedback", queueItemId: item.id, feedbackLabel }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.item) throw new Error(apiError(payload, "Unable to record feedback."));
      await loadDashboard();
      setNotice(`${feedbackLabel} feedback recorded. Safety gates remain unchanged.`);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "Unable to record feedback.");
    } finally {
      setSaving(false);
    }
  }

  async function rewriteOutreach(item: OutreachQueueItem) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite_outreach", queueItemId: item.id }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.item) throw new Error(apiError(payload, "Unable to rewrite outreach."));
      await loadDashboard();
      setNotice("Outreach rewritten for review. Nothing was sent.");
    } catch (rewriteError) {
      setError(rewriteError instanceof Error ? rewriteError.message : "Unable to rewrite outreach.");
    } finally {
      setSaving(false);
    }
  }

  async function sendQueuedEmail(item: OutreachQueueItem) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_queued_email", queueItemId: item.id }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.item || !payload.sendResult) throw new Error(apiError(payload, "Unable to send queued email."));
      await loadDashboard();
      setNotice(payload.sendResult.sent
        ? "Approved email was sent through Auto Email Pilot and logged. No forms, DMs, calls, or Looms were sent."
        : `Email was not sent: ${payload.sendResult.blockedReasons.join("; ")}`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send queued email.");
    } finally {
      setSaving(false);
    }
  }

  async function runFullAutoEmailBatch() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_full_auto_email_batch" }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.autoEmailBatch) throw new Error(apiError(payload, "Unable to run full auto email batch."));
      await loadDashboard();
      const batch = payload.autoEmailBatch;
      setNotice(batch.sent > 0
        ? `Full auto email batch sent ${batch.sent} approved email${batch.sent === 1 ? "" : "s"} and logged every action. Manual channels stayed manual.`
        : `Full auto email batch did not send: ${batch.blockedReasons.flatMap((item) => item.reasons).join("; ")}`);
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "Unable to run full auto email batch.");
    } finally {
      setSaving(false);
    }
  }

  async function recordSuppression(item: OutreachQueueItem, suppressionReason: "bounce" | "complaint" | "manual_suppression") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record_email_suppression", queueItemId: item.id, suppressionReason }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.suppression) throw new Error(apiError(payload, "Unable to record email suppression."));
      await loadDashboard();
      setNotice(`Email suppression recorded for ${payload.suppression.updated} queue item${payload.suppression.updated === 1 ? "" : "s"}. Nothing was sent.`);
    } catch (suppressionError) {
      setError(suppressionError instanceof Error ? suppressionError.message : "Unable to record email suppression.");
    } finally {
      setSaving(false);
    }
  }

  function autopilotSettingsFromForm(form: FormData): Partial<AutopilotCampaignSettings> {
    return {
      campaignName: String(form.get("campaignName") ?? defaultAutopilotCampaignSettings.campaignName),
      marketPresetId: String(form.get("marketPresetId") ?? defaultAutopilotCampaignSettings.marketPresetId),
      customCities: String(form.get("customCities") ?? ""),
      state: String(form.get("state") ?? defaultAutopilotCampaignSettings.state),
      trade: String(form.get("trade") ?? defaultAutopilotCampaignSettings.trade) as AutopilotCampaignSettings["trade"],
      prospectType: String(form.get("prospectType") ?? defaultAutopilotCampaignSettings.prospectType) as AutopilotCampaignSettings["prospectType"],
      mode: String(form.get("mode") ?? defaultAutopilotCampaignSettings.mode) as AutopilotCampaignSettings["mode"],
      outreachStyle: String(form.get("outreachStyle") ?? defaultAutopilotCampaignSettings.outreachStyle) as AutopilotCampaignSettings["outreachStyle"],
      duration: String(form.get("duration") ?? defaultAutopilotCampaignSettings.duration) as AutopilotCampaignSettings["duration"],
      cadence: String(form.get("cadence") ?? defaultAutopilotCampaignSettings.cadence) as AutopilotCampaignSettings["cadence"],
      maxProspectsPerRun: Number(form.get("maxProspectsPerRun")),
      maxPreviewsPerRun: Number(form.get("maxPreviewsPerRun")),
      maxProspectsTotal: Number(form.get("maxProspectsTotal")),
      excludePreviouslyReviewed: form.get("excludePreviouslyReviewed") === "on",
      requirePreviewQuality85: form.get("requirePreviewQuality85") === "on",
      requireWrittenContact: form.get("requireWrittenContact") === "on",
      manualDmMode: form.get("manualDmMode") === "on",
      loomNotifications: form.get("loomNotifications") === "on",
      stopRules: {
        pauseOnProviderFailure: form.get("pauseOnProviderFailure") === "on",
        pauseOnBadFitRatePercent: Number(form.get("pauseOnBadFitRatePercent")),
        pauseAfterWeakPreviewCount: Number(form.get("pauseAfterWeakPreviewCount")),
        stopWhenTotalProspectsReached: form.get("stopWhenTotalProspectsReached") === "on",
      },
    };
  }

  async function postAutopilot(action: string, body: Record<string, unknown> = {}, successMessage = "Autopilot updated. Nothing was sent.") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/autonomous-growth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.autopilot) throw new Error(apiError(payload, "Unable to update Autopilot."));
      await loadDashboard();
      if (payload.smokeTest) {
        setNotice(payload.smokeTest.passed
          ? "Fake Autopilot smoke test passed. Fixtures were sorted into safe queues and nothing was sent."
          : "Fake Autopilot smoke test found an issue. Review the Autopilot report.");
      } else if (payload.topProspectJobId) {
        setNotice(`${successMessage} Top Prospects job ${payload.topProspectJobId} started in the background.`);
      } else if (payload.topProspectJobWarning) {
        setNotice(`${successMessage} ${payload.topProspectJobWarning}`);
      } else {
        setNotice(successMessage);
      }
    } catch (autopilotError) {
      setError(autopilotError instanceof Error ? autopilotError.message : "Unable to update Autopilot.");
    } finally {
      setSaving(false);
    }
  }

  async function startAutopilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await postAutopilot(
      "start_autopilot",
      { autopilotSettings: autopilotSettingsFromForm(new FormData(event.currentTarget)) },
      "Autopilot campaign started in manual-safe mode. It prepared a report and sent nothing.",
    );
  }

  const groupedQueue = useMemo(() => {
    const queue = dashboard?.queue ?? [];
    const loomStatuses = ["Loom Needed", "Preview Needs Polish", "Ready for Loom", "Loom Recorded"] as OutreachQueueStatus[];
    return {
      loom: queue.filter((item) => loomStatuses.includes(item.status)),
      dryRun: queue.filter((item) => ["Draft", "Eligible", "Needs Review", "DM Draft", "First DM Sent"].includes(item.status)),
      blocked: queue.filter((item) => ["Blocked", "Bad Fit", "Never Contact", "Opted Out", "Bounced", "Complained", "Suppressed", "Skipped"].includes(item.status)),
      sent: queue.filter((item) => ["Queued", "Sent", "Loom Sent", "Pricing Requested", "Pricing Sent", "Follow-up Needed", "Follow-up Sent", "Replied", "Positive Reply", "Won", "Lost", "No Response", "Not Interested"].includes(item.status)),
    };
  }, [dashboard?.queue]);

  if (loading) return <div className="engine-content"><LoadingState title="Loading Autonomous Growth" body="Checking settings, safety gates, and saved outreach queue items." /></div>;
  if (!dashboard) return <div className="engine-content"><EmptyState title="Autonomous Growth unavailable" body={error || "Reload the engine and try again."} action={() => void loadDashboard()} actionLabel="Retry" /></div>;

  const { autopilot, env, metrics, queue, settings } = dashboard;
  const autoPilotBlocked = settings.mode !== "auto_email_pilot" || settings.killSwitch || env.emailKillSwitchEnabled || !env.autoSendEnabled || !env.hasResendApiKey || !env.hasFromEmail || !env.hasReplyToEmail || !env.hasPostalAddress;
  const sentEmailHistory = queue.filter((item) => item.status === "Sent" || item.sentDate);
  const suppressionHistory = queue.filter((item) => ["Opted Out", "Bounced", "Complained", "Suppressed", "Never Contact"].includes(item.status));
  const latestSentEmail = sentEmailHistory
    .toSorted((left, right) => Date.parse(right.sentDate || right.updatedAt) - Date.parse(left.sentDate || left.updatedAt))[0];
  const latestSuppression = suppressionHistory
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];

  return (
    <div className="engine-content engine-autonomous-growth">
      <section className="engine-panel engine-autonomous-hero">
        <div>
          <p>Safe autonomous prospecting</p>
          <h2>Autonomous Growth</h2>
          <span>{modeDescription(settings.mode)}</span>
        </div>
        <div className={`engine-autonomous-mode engine-autonomous-mode--${settings.mode.replaceAll("_", "-")}`}>
          <strong>{autonomousGrowthModeLabels[settings.mode]}</strong>
          <span>{settings.killSwitch ? "Kill switch on" : "Kill switch off"}</span>
          <small>{autoPilotBlocked ? "Auto Email Pilot is blocked by safety gates." : "Auto Email Pilot gates are configured."}</small>
        </div>
      </section>

      {error && <div className="engine-error-banner" role="alert"><div><b>Autonomous Growth needs attention</b><p>{error}</p></div></div>}
      {notice && <div className="engine-success-banner" role="status"><div><b>Autonomous Growth updated</b><p>{notice}</p></div></div>}
      {metrics.loomNeeded > 0 && (
        <div className="engine-loom-banner" role="status">
          <div><b>You have Loom walkthroughs to record.</b><p>{metrics.loomNeeded} prospect{metrics.loomNeeded === 1 ? "" : "s"} said yes and now need a manual video before the preview is sent.</p></div>
          <span>{metrics.loomNeeded} Loom Needed</span>
        </div>
      )}

      <AutopilotCampaignPanel
        autopilot={autopilot}
        disabled={saving}
        onDownload={() => downloadAutopilotCsv(autopilot)}
        onPause={() => void postAutopilot("pause_autopilot", {}, "Autopilot paused. No outreach was sent.")}
        onRefreshActivity={() => void loadDashboard()}
        onRetryHandoff={(settings) => void postAutopilot("retry_autopilot_handoff", { autopilotSettings: settings }, "Autopilot handoff retried. Nothing was sent.")}
        onResume={() => void postAutopilot("resume_autopilot", {}, "Autopilot resumed. No outreach was sent.")}
        onRunBatch={() => void postAutopilot("run_autopilot_batch", {}, "Autopilot batch report refreshed. Nothing was sent.")}
        onSmokeTest={() => void postAutopilot("run_fake_autopilot_smoke_test")}
        onStart={startAutopilot}
        onStop={() => void postAutopilot("stop_autopilot", {}, "Autopilot stopped. No outreach was sent.")}
      />

      <section className="engine-panel">
        <div className="engine-panel__head">
          <div><h2>Mode and safety settings</h2><p>Default mode is Off. Dry Run and Manual Approval generate work but never send automatically.</p></div>
          <button className="engine-button" onClick={() => downloadCsv(queue)} type="button">Export CSV</button>
        </div>
        <form className="engine-autonomous-settings" onSubmit={saveSettings}>
          <label>Outreach mode<select defaultValue={settings.mode} name="mode">{autonomousGrowthModes.map((mode) => <option key={mode} value={mode}>{autonomousGrowthModeLabels[mode]}</option>)}</select></label>
          <label className="engine-toggle"><input defaultChecked={settings.killSwitch} name="killSwitch" type="checkbox" />Global kill switch</label>
          <label>Target cities<textarea defaultValue={textareaValue(settings.targetCities)} name="targetCities" placeholder="Toledo&#10;Sylvania&#10;Perrysburg" /></label>
          <label>Target service areas<textarea defaultValue={textareaValue(settings.targetServiceAreas)} name="targetServiceAreas" placeholder="Northwest Ohio&#10;Lucas County" /></label>
          <label>Target trades<textarea defaultValue={textareaValue(settings.targetTrades)} name="targetTrades" placeholder={tradeCategories.join("\n")} /></label>
          <label>Excluded trades<textarea defaultValue={textareaValue(settings.excludedTrades)} name="excludedTrades" placeholder="Suppliers&#10;Distributors" /></label>
          <label>Prospects scanned/day<input defaultValue={settings.maxProspectsScannedPerDay} min="0" name="maxProspectsScannedPerDay" type="number" /></label>
          <label>Previews/day<input defaultValue={settings.maxPreviewsGeneratedPerDay} min="0" name="maxPreviewsGeneratedPerDay" type="number" /></label>
          <label>Emails queued/day<input defaultValue={settings.maxEmailsQueuedPerDay} min="0" name="maxEmailsQueuedPerDay" type="number" /></label>
          <label>Emails sent/day<input defaultValue={settings.maxEmailsSentPerDay} max="25" min="0" name="maxEmailsSentPerDay" type="number" /></label>
          <label>Cooldown minutes<input defaultValue={settings.emailCooldownMinutes} min="5" name="emailCooldownMinutes" type="number" /></label>
          <label className="engine-toggle"><input defaultChecked={settings.followUpsEnabled} name="followUpsEnabled" type="checkbox" />Enable conservative follow-ups</label>
          <div className="engine-style-profile-editor engine-form-wide">
            <div>
              <b>Editable trade style profiles</b>
              <p>These guide future preview direction. The learning engine can recommend changes, but it will not change profiles on its own.</p>
            </div>
            {Object.entries(settings.styleProfiles).map(([trade, profile]) => (
              <fieldset key={trade}>
                <legend>{trade}</legend>
                <label>Profile name<input defaultValue={profile.name} name={profileFieldName(trade, "name")} /></label>
                <label>Direction<textarea defaultValue={profile.direction} name={profileFieldName(trade, "direction")} /></label>
                <label>Strengths<textarea defaultValue={textareaValue(profile.strengths)} name={profileFieldName(trade, "strengths")} /></label>
                <label>Cautions<textarea defaultValue={textareaValue(profile.cautions)} name={profileFieldName(trade, "cautions")} /></label>
              </fieldset>
            ))}
          </div>
          <footer><button className="engine-button engine-button--primary" disabled={saving} type="submit">{saving ? "Saving" : "Save Autonomous Growth settings"}</button></footer>
        </form>
      </section>

      <section className="engine-metrics" aria-label="Autonomous Growth metrics">
        {[
          ["Prospects found today", metrics.prospectsFoundToday, "Queued from generated packages"],
          ["Previews generated", metrics.previewsGeneratedToday, "Public /p/ links only"],
          ["Email-ready leads", metrics.emailReadyLeads, "Still requires the configured mode"],
          ["Daily cap remaining", metrics.dailyCapRemaining, "Auto Email Pilot cap"],
          ["Blocked phone-only", metrics.blockedPhoneOnlyLeads, "Written outreach protection"],
          ["Average preview QA", `${metrics.averagePreviewQualityScore}/100`, "Self-review signal"],
          ["Average lead score", `${metrics.averageLeadScore}/100`, "Learning score"],
          ["Loom needed", metrics.loomNeeded, "Manual walkthroughs to record"],
          ["Loom recorded", metrics.loomRecorded, "Waiting to send manually"],
          ["Loom sent", metrics.loomSent, "Manual Loom messages marked sent"],
          ["Follow-ups due", metrics.followUpsDue, "Manual follow-up queue"],
          ["Replies", metrics.replies, `${metrics.replyRate}% reply rate`],
        ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
      </section>

      <section className="engine-panel engine-autonomous-history">
        <div className="engine-panel__head">
          <div>
            <h2>Email Send &amp; Suppression History</h2>
            <p>Operator audit snapshot for sent emails, queued sends, bounces, complaints, opt-outs, and manual suppressions. Forms, DMs, calls, and Looms are not sent from this history.</p>
          </div>
        </div>
        <div className="engine-metrics" aria-label="Email send and suppression history">
          {[
            ["Queued public-email sends", queue.filter((item) => item.status === "Queued" && item.contactSource === "Public email").length, "Eligible only after all send-ready gates pass"],
            ["Emails sent", sentEmailHistory.length, "Recorded by sent date and audit log"],
            ["Bounces", queue.filter((item) => item.status === "Bounced").length, "Blocked from future sending"],
            ["Complaints", queue.filter((item) => item.status === "Complained").length, "Blocked from future sending"],
            ["Opt-outs", queue.filter((item) => item.status === "Opted Out").length, "Never contact again"],
            ["Manual suppressions", queue.filter((item) => item.status === "Suppressed" || item.status === "Never Contact").length, "Operator emergency controls"],
          ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
        </div>
        <div className="engine-learning-summary">
          <article>
            <span>Latest sent email</span>
            <p>{latestSentEmail ? `${latestSentEmail.businessName} to ${latestSentEmail.email} on ${formatDate(latestSentEmail.sentDate || latestSentEmail.updatedAt)}` : "No sent email recorded yet."}</p>
          </article>
          <article>
            <span>Latest suppression</span>
            <p>{latestSuppression ? `${latestSuppression.status}: ${latestSuppression.businessName} (${latestSuppression.email || "no email"}) on ${formatDate(latestSuppression.updatedAt)}` : "No suppression event recorded yet."}</p>
          </article>
        </div>
      </section>

      <section className="engine-panel engine-autonomous-safety">
        <div className="engine-panel__head"><div><h2>Auto Email Pilot gates</h2><p>Email sending stays disabled unless every gate below passes. Contact forms, social DMs, and phone calls are never automated.</p></div></div>
        <div className="engine-safety-grid">
          <Gate label="Mode is Auto Email Pilot" passed={settings.mode === "auto_email_pilot"} />
          <Gate label="Global kill switch is off" passed={!settings.killSwitch} />
          <Gate label="OUTREACH_EMAIL_DISABLED is not true" passed={!env.emailKillSwitchEnabled} detail="Hard email stop" />
          <Gate label="OUTREACH_AUTO_SEND_ENABLED is true" passed={env.autoSendEnabled} />
          <Gate label="OUTREACH_FULL_AUTO_SEND_ENABLED is true" passed={env.fullAutoSendEnabled} detail="Required only for automatic batches" />
          <Gate label="Provider is configured" passed={env.sendProvider === "resend" && env.hasResendApiKey} detail={env.sendProvider} />
          <Gate label="Sender and reply-to are configured" passed={env.hasFromEmail && env.hasReplyToEmail} />
          <Gate label="Postal address is configured" passed={env.hasPostalAddress} />
          <Gate label="Only Queued public-email leads can send" passed detail="Forms, DMs, calls, and Looms stay manual." />
          <Gate label="Daily cap, cooldown, suppression, and audit logs enforced" passed />
          <Gate label="Optional Loom notification configured" passed={env.notifyOnLoomNeeded && env.hasNotifyEmail && env.hasNotifyFromEmail} detail="Internal only" />
        </div>
        <div className="engine-action-row">
          <button className="engine-button engine-button--danger" disabled={saving || env.emailKillSwitchEnabled || !env.fullAutoSendEnabled} onClick={() => void runFullAutoEmailBatch()} type="button">
            Run full auto email batch
          </button>
          <p>Fully automatic batch sending is separate from <b>Send approved email</b>. It stays off unless <code>OUTREACH_FULL_AUTO_SEND_ENABLED=true</code>, and <code>OUTREACH_EMAIL_DISABLED=true</code> stops all email sends immediately. Eligible batches still send only Queued public-email leads that pass suppression, cooldown, daily cap, public preview, opt-out, postal address, and audit gates.</p>
        </div>
      </section>

      <LoomQueueSection
        copied={copied}
        items={groupedQueue.loom}
        onCopy={copyText}
        onStatus={updateStatus}
      />
      <QueueSection
        copied={copied}
        description="Generated packages waiting for review, copy, edit, or manual approval."
        items={groupedQueue.dryRun}
        onCopy={copyText}
        onFeedback={recordFeedback}
        onRegenerate={regeneratePackage}
        onRewrite={rewriteOutreach}
        onSendEmail={sendQueuedEmail}
        onSuppressEmail={recordSuppression}
        onStatus={updateStatus}
        title="Dry-run and review queue"
      />
      <QueueSection
        copied={copied}
        description="Leads blocked by contact rules, preview quality, unsupported claims, opt-out, or bad fit logic."
        items={groupedQueue.blocked}
        onCopy={copyText}
        onFeedback={recordFeedback}
        onRegenerate={regeneratePackage}
        onRewrite={rewriteOutreach}
        onSendEmail={sendQueuedEmail}
        onSuppressEmail={recordSuppression}
        onStatus={updateStatus}
        title="Blocked queue"
      />
      <QueueSection
        copied={copied}
        description="Items queued or manually marked through outreach follow-up states."
        items={groupedQueue.sent}
        onCopy={copyText}
        onFeedback={recordFeedback}
        onRegenerate={regeneratePackage}
        onRewrite={rewriteOutreach}
        onSendEmail={sendQueuedEmail}
        onSuppressEmail={recordSuppression}
        onStatus={updateStatus}
        title="Send queue and sent log"
      />

      <section className="engine-panel engine-autonomous-insights engine-autonomous-learning">
        <div className="engine-panel__head"><div><h2>Learning &amp; Review</h2><p>Self-review reports and feedback patterns improve future recommendations, but never bypass hard safety blockers.</p></div></div>
        <div className="engine-learning-summary">
          <article>
            <span>Latest self-review summary</span>
            <p>{dashboard.learning.latestReview?.summary ?? "No self-review report yet. Generate Outreach Packages in Dry Run or Manual Approval to populate this."}</p>
          </article>
          <article>
            <span>Recommendations for next run</span>
            <p>{formatList(dashboard.learning.recommendationsForNextRun)}</p>
          </article>
        </div>
        <dl>
          <div><dt>Best trade</dt><dd>{metrics.bestTrade}</dd></div>
          <div><dt>Best subject line</dt><dd>{metrics.bestSubjectLine}</dd></div>
          <div><dt>Best outreach angle</dt><dd>{metrics.bestOutreachAngle}</dd></div>
          <div><dt>Won/lost prospects</dt><dd>{metrics.wonLostProspects}</dd></div>
          <div><dt>Positive reply rate</dt><dd>{metrics.positiveReplyRate}%</dd></div>
          <div><dt>Common failure reasons</dt><dd>{formatList(dashboard.learning.commonFailureReasons)}</dd></div>
          <div><dt>Best-performing trades</dt><dd>{formatList(dashboard.learning.bestPerformingTrades)}</dd></div>
          <div><dt>Worst-performing trades</dt><dd>{formatList(dashboard.learning.worstPerformingTrades)}</dd></div>
          <div><dt>Best cities/service areas</dt><dd>{formatList(dashboard.learning.bestPerformingCities)}</dd></div>
          <div><dt>Best outreach angles</dt><dd>{formatList(dashboard.learning.bestOutreachAngles)}</dd></div>
          <div><dt>Weakest outreach angles</dt><dd>{formatList(dashboard.learning.weakestOutreachAngles)}</dd></div>
          <div><dt>Recommended trades to prioritize</dt><dd>{formatList(dashboard.learning.recommendedTradesToPrioritize)}</dd></div>
          <div><dt>Recommended trades to pause</dt><dd>{formatList(dashboard.learning.recommendedTradesToPause)}</dd></div>
          <div><dt>Recommended preview improvements</dt><dd>{formatList(dashboard.learning.recommendedPreviewImprovements)}</dd></div>
          <div><dt>Recommended wording improvements</dt><dd>{formatList(dashboard.learning.recommendedWordingImprovements)}</dd></div>
        </dl>
        <div className="engine-reply-table" role="table" aria-label="Reply rate by trade">
          <div role="row"><span>Trade</span><span>Reply rate</span><span>Positive reply rate</span></div>
          {dashboard.learning.replyRateByTrade.length ? dashboard.learning.replyRateByTrade.map((entry) => (
            <div key={entry.trade} role="row"><span>{entry.trade}</span><span>{entry.replyRate}%</span><span>{entry.positiveReplyRate}%</span></div>
          )) : <p>No reply-rate data yet.</p>}
        </div>
      </section>
    </div>
  );
}

function optionLabel(value: string) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

const autopilotActivityStatusLabels: Record<AutopilotActivityStatus, string> = {
  not_started: "Not started",
  running: "Running",
  starting_top_prospects: "Starting Top Prospects job",
  top_prospects_running: "Top Prospects job running",
  completed: "Completed",
  completed_with_warnings: "Completed with warnings",
  paused: "Paused",
  failed: "Failed",
  failed_to_start: "Failed to start",
  failed_during_discovery: "Failed during discovery",
  timed_out_needs_attention: "Timed out / Needs attention",
  cancelled: "Cancelled / stopped",
};

const autopilotProviderStatusLabels: Record<string, string> = {
  completed: "Completed",
  failed: "Failed",
  fake_only: "Fake only",
  no_records: "No records returned",
  not_attempted: "Not attempted",
  not_configured: "Not configured",
  not_recorded: "Not recorded",
  partial_success: "Partial success",
  running: "Running",
  succeeded: "Completed",
  timed_out: "Timed out",
};

function providerActivityStatusLabel(status: string) {
  return autopilotProviderStatusLabels[status] ?? optionLabel(status);
}

const autopilotMarketPickerPresetIds = [
  "northwest-ohio",
  "florida",
  "texas-suburbs",
  "carolinas-tennessee-georgia",
  "ohio-midwest",
  "arizona-nevada",
] as const;

const autopilotQuickTrades = ["Landscaping", "Pressure Washing", "Cleaning", "Painting", "Concrete", "Roofing", "HVAC", "Plumbing"] as const;

function formatActivityTime(value: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

type AutopilotActionReasons = Record<"start" | "smoke" | "batch" | "pause" | "resume" | "stop", string[]>;

function autopilotActionReasons(autopilot: AutopilotDashboard, saving: boolean): AutopilotActionReasons {
  const { campaign, marketTargets } = autopilot;
  const { settings } = campaign;
  const effectivelyRunning = campaign.status === "running" && ["running", "starting_top_prospects", "top_prospects_running"].includes(autopilot.activity.status);
  const reasons: AutopilotActionReasons = {
    start: [],
    smoke: [],
    batch: [],
    pause: [],
    resume: [],
    stop: [],
  };
  if (saving) {
    for (const key of Object.keys(reasons) as Array<keyof AutopilotActionReasons>) reasons[key].push("saving in progress");
  }
  if (autopilot.environmentKillSwitchEnabled) {
    reasons.start.push("Autopilot is disabled by environment kill switch.");
    reasons.batch.push("Autopilot is disabled by environment kill switch.");
  }
  if (!autopilot.databaseConfigured) reasons.start.push("no database connection");
  if (!settings.marketPresetId && !settings.customCities.trim()) reasons.start.push("missing market");
  if (!marketTargets.length) reasons.start.push(settings.customCities.trim() ? "invalid city" : "missing market");
  if (!settings.trade) reasons.start.push("missing trade");
  if (!settings.excludePreviouslyReviewed || !settings.requirePreviewQuality85 || !settings.requireWrittenContact || !settings.manualDmMode) {
    reasons.start.push("safety setting required");
  }
  if (effectivelyRunning) reasons.start.push("campaign already running");
  if (!effectivelyRunning) reasons.pause.push("campaign is not running");
  if (campaign.status !== "paused") reasons.resume.push("campaign is not paused");
  if (campaign.status === "stopped") reasons.stop.push("campaign already stopped");
  return reasons;
}

function AutopilotActionRow({
  autopilot,
  disabled,
  formId,
  insideForm = false,
  onPause,
  onResume,
  onRunBatch,
  onSmokeTest,
  onStop,
}: {
  autopilot: AutopilotDashboard;
  disabled: boolean;
  formId: string;
  insideForm?: boolean;
  onPause: () => void;
  onResume: () => void;
  onRunBatch: () => void;
  onSmokeTest: () => void;
  onStop: () => void;
}) {
  const reasons = autopilotActionReasons(autopilot, disabled);
  const disabledSummary = [
    ["Start Autopilot", reasons.start],
    ["Run Fake Smoke Test", reasons.smoke],
    ["Run next batch now", reasons.batch],
    ["Pause", reasons.pause],
    ["Resume", reasons.resume],
    ["Stop", reasons.stop],
  ].filter(([, values]) => (values as string[]).length) as Array<[string, string[]]>;
  return (
    <div className="engine-autopilot-action-card">
      <div className="engine-autopilot-action-card__copy">
        <b>Campaign actions</b>
        <p>Start Autopilot prepares prospects, previews, scripts, and queues. It does not send emails, DMs, forms, phone calls, or Looms automatically.</p>
      </div>
      <div className="engine-autopilot-actions" aria-label="Autopilot Campaign actions">
        <button className="engine-button engine-button--primary" disabled={Boolean(reasons.start.length)} form={insideForm ? undefined : formId} title={reasons.start.join(", ")} type="submit">Start Autopilot</button>
        <button className="engine-button engine-autopilot-fake-button" disabled={Boolean(reasons.smoke.length)} onClick={onSmokeTest} title={reasons.smoke.join(", ")} type="button">
          <span>Run Fake Smoke Test</span>
          <small>Uses fake leads only. No provider calls. No outreach.</small>
        </button>
        <button className="engine-button" disabled={Boolean(reasons.batch.length)} onClick={onRunBatch} title={reasons.batch.join(", ")} type="button">Run next batch now</button>
        <button className="engine-button" disabled={Boolean(reasons.pause.length)} onClick={onPause} title={reasons.pause.join(", ")} type="button">Pause</button>
        <button className="engine-button" disabled={Boolean(reasons.resume.length)} onClick={onResume} title={reasons.resume.join(", ")} type="button">Resume</button>
        <button className="engine-button" disabled={Boolean(reasons.stop.length)} onClick={onStop} title={reasons.stop.join(", ")} type="button">Stop</button>
      </div>
      {disabledSummary.length ? (
        <ul className="engine-autopilot-disabled-reasons">
          {disabledSummary.map(([label, values]) => <li key={label}><b>{label}</b><span>{values.join(", ")}</span></li>)}
        </ul>
      ) : <p className="engine-autopilot-ready-note">All required safety settings are on. Start Autopilot will prepare work only.</p>}
    </div>
  );
}

function AutopilotLiveActivitySection({
  autopilot,
  disabled,
  onCopyRunSettings,
  onOpenTopProspects,
  onRefresh,
  onRetryHandoff,
  onStop,
}: {
  autopilot: AutopilotDashboard;
  disabled: boolean;
  onCopyRunSettings: () => void;
  onOpenTopProspects: () => void;
  onRefresh: () => void;
  onRetryHandoff: () => void;
  onStop: () => void;
}) {
  const { activity } = autopilot;
  const showHandoffActions = ["failed_to_start", "failed_during_discovery", "timed_out_needs_attention", "cancelled"].includes(activity.status);
  const metricCards = [
    ["Raw records", activity.rawRecordsFound],
    ["Duplicates removed", activity.duplicatesRemoved],
    ["Bad-fit blocked", activity.badFitLeadsBlocked],
    ["Phone-only blocked", activity.phoneOnlyLeadsBlocked],
    ["Websites scanned", activity.websitesScanned],
    ["Previews generated", activity.previewsGenerated],
    ["Previews passing QA", activity.previewsPassingQa],
    ["DM scripts generated", activity.dmScriptsGenerated],
    ["Email drafts generated", activity.emailDraftsGenerated],
  ] as const;
  return (
    <section className={`engine-autopilot-activity engine-autopilot-activity--${activity.status}`} aria-labelledby="autopilot-live-activity-title">
      <div className="engine-autopilot-activity__head">
        <div>
          <p>{activity.fakeOnly ? "Fake Smoke Test Activity — no providers, no outreach." : "Live campaign visibility"}</p>
          <h3 id="autopilot-live-activity-title">Autopilot Live Activity</h3>
          <span>Updates automatically while a run is active. Use Refresh Activity any time to pull the latest safe status.</span>
        </div>
        <div className="engine-autopilot-activity__buttons">
          {activity.topProspectJobId ? <button className="engine-button" disabled={disabled} onClick={onOpenTopProspects} type="button">Open Top Prospects job {activity.topProspectJobId}</button> : null}
          <button className="engine-button" disabled={disabled} onClick={onRefresh} type="button">Refresh Activity</button>
        </div>
      </div>

      <div className="engine-autopilot-activity-grid" aria-label="Autopilot current activity">
        <article>
          <span>Current status</span>
          <strong>{autopilotActivityStatusLabels[activity.status]}</strong>
          <p>{activity.currentStep}</p>
        </article>
        <article>
          <span>Current step</span>
          <strong>{activity.currentStep}</strong>
          <p>Last updated {formatActivityTime(activity.lastUpdatedAt)}</p>
        </article>
        <article>
          <span>City</span>
          <strong>{activity.currentCity || "Not active"}</strong>
          <p>Trade: {activity.currentTrade || autopilot.campaign.settings.trade}</p>
        </article>
        <article>
          <span>Provider</span>
          <strong>{activity.currentProvider || "Not active"}</strong>
          <p>{activity.fakeOnly ? "Fake run only" : "Provider details appear below when recorded."}</p>
        </article>
      </div>

      <div className="engine-autopilot-progress" aria-label={`Autopilot progress ${activity.progressPercent}%`}>
        <div><span style={{ width: `${activity.progressPercent}%` }} /></div>
        <b>{activity.progressPercent}%</b>
      </div>

      {activity.status === "not_started" ? (
        <p className="engine-autopilot-activity-empty">No Autopilot activity yet. Start Autopilot or run the fake smoke test to see live steps.</p>
      ) : null}

      <div className="engine-autopilot-activity-metrics" aria-label="Autopilot activity metrics">
        {metricCards.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      {activity.warnings.length ? (
        <div className="engine-autopilot-activity-alert engine-autopilot-activity-alert--warning" role="status">
          <b>Current warnings</b>
          <ul>{activity.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}
      {activity.errors.length ? (
        <div className="engine-autopilot-activity-alert engine-autopilot-activity-alert--error" role="alert">
          <b>Current errors</b>
          <ul>{activity.errors.map((activityError) => <li key={activityError}>{activityError}</li>)}</ul>
        </div>
      ) : null}

      {showHandoffActions ? (
        <div className="engine-autopilot-handoff-actions" aria-label="Autopilot handoff recovery actions">
          <div>
            <b>Top Prospects handoff did not complete</b>
            <p>Retry the protected job handoff, open Top Prospects with these exact settings, or copy the settings for manual troubleshooting.</p>
          </div>
          <div>
            <button className="engine-button engine-button--primary" disabled={disabled} onClick={onRetryHandoff} type="button">Retry Autopilot handoff</button>
            <button className="engine-button" disabled={disabled} onClick={onOpenTopProspects} type="button">{activity.topProspectJobId ? `Open Top Prospects job ${activity.topProspectJobId}` : "Open Top Prospects with same market/trade"}</button>
            <button className="engine-button" disabled={disabled} onClick={onStop} type="button">Stop Autopilot</button>
            <button className="engine-button" disabled={disabled} onClick={onCopyRunSettings} type="button">Copy run settings</button>
          </div>
        </div>
      ) : null}

      <div className="engine-autopilot-timeline" aria-label="Autopilot run log">
        <h4>Run log</h4>
        <ol>
          {activity.entries.map((entry) => (
            <li className={`engine-autopilot-timeline__item engine-autopilot-timeline__item--${entry.level}`} key={entry.id}>
              <time dateTime={entry.createdAt}>{formatActivityTime(entry.createdAt)}</time>
              <div>
                <b>{entry.label}</b>
                <span>{entry.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <details className="engine-autopilot-details">
        <summary>View details</summary>
        <div className="engine-autopilot-details__grid">
          <section>
            <h4>Top Prospects handoff</h4>
            {activity.topProspectJobId ? <p>Job ID: <code>{activity.topProspectJobId}</code></p> : <p>No Top Prospects job ID has been recorded for this activity.</p>}
            {activity.handoffDetails.length ? (
              <dl>
                {activity.handoffDetails.map((detail) => <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}
              </dl>
            ) : null}
          </section>
          <section>
            <h4>Run settings sent to Top Prospects</h4>
            <dl>
              <div><dt>Cities</dt><dd>{activity.topProspectsPrefill.city}</dd></div>
              <div><dt>State</dt><dd>{activity.topProspectsPrefill.state}</dd></div>
              <div><dt>Trade</dt><dd>{activity.topProspectsPrefill.trade}</dd></div>
              <div><dt>Businesses to scan</dt><dd>{activity.topProspectsPrefill.businessesToScan}</dd></div>
              <div><dt>Final prospects wanted</dt><dd>{activity.topProspectsPrefill.finalProspectsWanted}</dd></div>
              <div><dt>Prospect mode</dt><dd>{activity.topProspectsPrefill.mode}</dd></div>
              <div><dt>Outreach preference</dt><dd>{activity.topProspectsPrefill.outreachPreference}</dd></div>
              <div><dt>Exclude previously reviewed</dt><dd>{activity.topProspectsPrefill.excludePreviouslyReviewed ? "Yes" : "No"}</dd></div>
            </dl>
          </section>
          <section>
            <h4>Provider diagnostics</h4>
            {activity.providerDiagnostics.length ? activity.providerDiagnostics.map((provider) => (
              <dl key={provider.provider}>
                <div><dt>Provider</dt><dd>{provider.provider}</dd></div>
                <div><dt>Status</dt><dd>{providerActivityStatusLabel(provider.status)}</dd></div>
                <div><dt>Raw records</dt><dd>{provider.rawRecords}</dd></div>
                <div><dt>Within radius</dt><dd>{provider.withinRadius}</dd></div>
                <div><dt>After deduplication</dt><dd>{provider.afterDeduplication}</dd></div>
                <div><dt>Usable websites</dt><dd>{provider.usableWebsites}</dd></div>
              </dl>
            )) : <p>Provider diagnostics are not recorded yet.</p>}
          </section>
          <section>
            <h4>City breakdown</h4>
            {activity.cityBreakdown.length ? activity.cityBreakdown.map((city) => (
              <dl key={city.city}>
                <div><dt>City</dt><dd>{city.city}</dd></div>
                <div><dt>Status</dt><dd>{optionLabel(city.status)}</dd></div>
                <div><dt>Provider attempted</dt><dd>{city.providerAttempted}</dd></div>
                <div><dt>Raw records</dt><dd>{city.rawRecords}</dd></div>
                <div><dt>Usable records</dt><dd>{city.usableRecords}</dd></div>
                <div><dt>Skipped</dt><dd>{city.skipped}</dd></div>
                <div><dt>Qualified</dt><dd>{city.qualified}</dd></div>
                <div><dt>Blocked</dt><dd>{city.blocked}</dd></div>
                <div><dt>Reason</dt><dd>{city.reason}</dd></div>
              </dl>
            )) : <p>City progress has not been recorded yet.</p>}
          </section>
          <section>
            <h4>Blocked reasons</h4>
            {activity.blockedReasons.length ? (
              <ul>{activity.blockedReasons.map((blocked) => <li key={blocked.reason}><b>{blocked.count}</b><span>{blocked.reason}</span></li>)}</ul>
            ) : <p>No blocked reasons recorded yet.</p>}
          </section>
          <section>
            <h4>Queue routing</h4>
            <ul>
              {activity.queueRouting.map((queue) => <li key={queue.queue}><b>{queue.count}</b><span>{queue.label}</span></li>)}
            </ul>
          </section>
          <section>
            <h4>Next recommended run</h4>
            <p>{activity.nextRecommendedRun}</p>
          </section>
        </div>
      </details>
    </section>
  );
}

function AutopilotMarketPicker({
  settings,
  onRecommendedFirstRun,
  onSelectMarket,
  onSelectTrade,
}: {
  settings: AutopilotCampaignSettings;
  onRecommendedFirstRun: () => void;
  onSelectMarket: (presetId: string) => void;
  onSelectTrade: (presetId: string, trade: AutopilotCampaignSettings["trade"]) => void;
}) {
  const presets = autopilotMarketPickerPresetIds.flatMap((id) => {
    const preset = recommendedMarketPresets.find((item) => item.id === id);
    return preset ? [preset] : [];
  });
  return (
    <section className="engine-autopilot-market-picker" aria-labelledby="autopilot-market-picker-title">
      <div className="engine-autopilot-market-picker__head">
        <div>
          <h3 id="autopilot-market-picker-title">Choose Autopilot Market</h3>
          <p>Pick a market and optional trade here before starting. This only fills the campaign fields. You still need to click Start Autopilot.</p>
        </div>
        <button className="engine-button engine-button--primary" onClick={onRecommendedFirstRun} type="button">Recommended first real run: Florida + Pressure Washing</button>
      </div>
      <div className="engine-autopilot-market-picker__grid">
        {presets.map((preset) => {
          const quickTrades = autopilotQuickTrades.filter((trade) => preset.trades.includes(trade));
          const selected = settings.marketPresetId === preset.id;
          return (
            <article className={selected ? "is-selected" : ""} key={preset.id}>
              <header>
                <button className="engine-button" onClick={() => onSelectMarket(preset.id)} type="button">{preset.name}</button>
                {selected ? <span>Selected</span> : null}
              </header>
              <p>{preset.cities.slice(0, 4).map((city) => city.label).join("; ")}{preset.cities.length > 4 ? `, +${preset.cities.length - 4} more` : ""}</p>
              <div className="engine-autopilot-market-picker__trades" aria-label={`${preset.name} quick trades`}>
                {quickTrades.map((trade) => (
                  <button
                    className={selected && settings.trade === trade ? "engine-chip-button is-selected" : "engine-chip-button"}
                    key={`${preset.id}-${trade}`}
                    onClick={() => onSelectTrade(preset.id, trade)}
                    type="button"
                  >
                    {trade}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AutopilotCampaignPanel({
  autopilot,
  disabled,
  onDownload,
  onPause,
  onRefreshActivity,
  onRetryHandoff,
  onResume,
  onRunBatch,
  onSmokeTest,
  onStart,
  onStop,
}: {
  autopilot: AutopilotDashboard;
  disabled: boolean;
  onDownload: () => void;
  onPause: () => void;
  onRefreshActivity: () => void;
  onRetryHandoff: (settings: AutopilotCampaignSettings) => void;
  onResume: () => void;
  onRunBatch: () => void;
  onSmokeTest: () => void;
  onStart: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onStop: () => void;
}) {
  const { campaign } = autopilot;
  const [formSettings, setFormSettings] = useState<AutopilotCampaignSettings>(campaign.settings);
  const formId = "engine-autopilot-campaign-form";
  const settings = useMemo(() => normalizeAutopilotCampaignSettings(formSettings), [formSettings]);
  const formMarketTargets = useMemo(() => autopilotMarketTargets(settings), [settings]);
  const formMarketLabels = useMemo(() => formMarketTargets.map((target) => target.label), [formMarketTargets]);
  const formProviderRequestEstimate = useMemo(() => autopilotProviderRequestEstimate(settings), [settings]);
  const startConfirmation = useMemo(() => autopilotStartConfirmation(settings), [settings]);
  const marketMismatchWarning = useMemo(() => autopilotMarketMismatchWarning(settings), [settings]);
  const actionAutopilot = useMemo<AutopilotDashboard>(() => ({
    ...autopilot,
    campaign: { ...autopilot.campaign, settings },
    marketTargets: formMarketLabels,
    providerRequestEstimate: formProviderRequestEstimate,
  }), [autopilot, formMarketLabels, formProviderRequestEstimate, settings]);
  const providerGuardrailWarnings = useMemo(() => autopilotProviderGuardrailWarnings(
    settings,
    autopilot.providerCoverage,
    autopilot.activity,
    campaign.latestRunReport,
  ), [autopilot.activity, autopilot.providerCoverage, campaign.latestRunReport, settings]);

  useEffect(() => {
    setFormSettings(campaign.settings);
  }, [campaign.id, campaign.updatedAt, campaign.settings]);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(autopilotCampaignDraftStorageKey);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft) as Partial<AutopilotCampaignSettings>;
      setFormSettings((current) => normalizeAutopilotCampaignSettings({ ...current, ...draft }));
      window.localStorage.removeItem(autopilotCampaignDraftStorageKey);
    } catch {
      // Autopilot still works when browser storage is unavailable or stale.
    }
  }, []);

  function updateFormSetting<Key extends keyof AutopilotCampaignSettings>(key: Key, value: AutopilotCampaignSettings[Key]) {
    setFormSettings((current) => ({ ...current, [key]: value }));
  }

  function updateStopRule<Key extends keyof AutopilotStopRules>(key: Key, value: AutopilotStopRules[Key]) {
    setFormSettings((current) => ({ ...current, stopRules: { ...current.stopRules, [key]: value } }));
  }

  function updateMarketPreset(presetId: string) {
    const presetFields = autopilotPresetFields(presetId);
    setFormSettings((current) => normalizeAutopilotCampaignSettings({
      ...current,
      ...(presetFields ?? { marketPresetId: presetId }),
    }));
  }

  function updateMarketTrade(presetId: string, trade: AutopilotCampaignSettings["trade"]) {
    const presetFields = autopilotPresetFields(presetId);
    setFormSettings((current) => normalizeAutopilotCampaignSettings({
      ...current,
      ...(presetFields ?? { marketPresetId: presetId }),
      trade,
    }));
  }

  function applyRecommendedFirstRun() {
    setFormSettings(recommendedFirstAutopilotRunSettings());
  }

  function openTopProspectsWithSameSettings() {
    try {
      window.localStorage.setItem(topProspectsAutopilotPrefillStorageKey, JSON.stringify(autopilot.activity.topProspectsPrefill));
    } catch {
      // The user can still copy settings if browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent("webworkshop:open-engine-tab", { detail: { tab: "top-prospects" } }));
    window.location.hash = "top-prospects";
  }

  async function copyRunSettings() {
    const prefill = autopilot.activity.topProspectsPrefill;
    const text = [
      `City: ${prefill.city}`,
      `State: ${prefill.state}`,
      `Trade: ${prefill.trade}`,
      `Businesses to scan: ${prefill.businessesToScan}`,
      `Final prospects wanted: ${prefill.finalProspectsWanted}`,
      `Prospect type: ${prefill.prospectType}`,
      `Prospect mode: ${prefill.mode}`,
      `Outreach preference: ${prefill.outreachPreference}`,
      `Exclude previously reviewed: ${prefill.excludePreviouslyReviewed ? "on" : "off"}`,
    ].join("\n");
    await navigator.clipboard.writeText(text);
  }

  return (
    <section className="engine-panel engine-autopilot-campaign" aria-labelledby="autopilot-campaign-title">
      <div className="engine-panel__head">
        <div>
          <h2 id="autopilot-campaign-title">Autopilot Campaign</h2>
          <p>One-click campaign setup for discovery, scoring, package generation, review queues, and next-run reports. It never sends email, DMs, contact forms, phone calls, or Looms automatically.</p>
        </div>
        <div className={`engine-autopilot-status engine-autopilot-status--${campaign.status}`}>
          <b>{optionLabel(campaign.status)}</b>
          <span>{campaign.latestRunReport ? `${campaign.latestRunReport.prospectsQualified} reviewable prospects in latest report` : "No batch report yet"}</span>
        </div>
      </div>

      <AutopilotMarketPicker
        settings={settings}
        onRecommendedFirstRun={applyRecommendedFirstRun}
        onSelectMarket={updateMarketPreset}
        onSelectTrade={updateMarketTrade}
      />

      <div className="engine-autopilot-start-confirmation" role="status">
        <b>Start Autopilot with:</b>
        <span>Market: {startConfirmation.market}{startConfirmation.citySummary ? ` (${startConfirmation.citySummary})` : ""}</span>
        <span>Trade: {startConfirmation.trade}</span>
        <span>Duration: {startConfirmation.duration}</span>
        <strong>{startConfirmation.safety}</strong>
        <span>Emails: manual/review only</span>
        <span>Social DMs: manual only</span>
        <span>Contact forms: never automated</span>
        <span>Phone calls: never automated</span>
        <span>Looms: manual only</span>
      </div>
      {marketMismatchWarning ? (
        <div className="engine-autopilot-market-warning" role="alert">
          {marketMismatchWarning}
        </div>
      ) : null}
      {providerGuardrailWarnings.length ? (
        <div className="engine-autopilot-provider-warning" role="alert">
          <b>Provider coverage is limited. Run Provider Smoke Test or a small Top Prospects test before starting Autopilot.</b>
          <ul>{providerGuardrailWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      ) : null}
      {autopilot.environmentKillSwitchEnabled ? (
        <div className="engine-autopilot-provider-warning" role="alert">
          <b>Autopilot is disabled by environment kill switch.</b>
          <p>Saved batches and manual review stay available, but new Autopilot runs cannot start until <code>AUTOPILOT_DISABLED</code> is not set to <code>true</code>.</p>
        </div>
      ) : null}

      <AutopilotActionRow
        autopilot={actionAutopilot}
        disabled={disabled}
        formId={formId}
        onPause={onPause}
        onResume={onResume}
        onRunBatch={onRunBatch}
        onSmokeTest={onSmokeTest}
        onStop={onStop}
      />

      <AutopilotLiveActivitySection
        autopilot={autopilot}
        disabled={disabled}
        onCopyRunSettings={() => void copyRunSettings()}
        onOpenTopProspects={openTopProspectsWithSameSettings}
        onRefresh={onRefreshActivity}
        onRetryHandoff={() => onRetryHandoff(settings)}
        onStop={onStop}
      />

      <div className="engine-autopilot-summary">
        <article><span>Markets</span><strong>{formMarketLabels.length}</strong><p>{formMarketLabels.slice(0, 4).join(", ") || "Preset not selected"}</p></article>
        <article><span>Provider load</span><strong>{formProviderRequestEstimate}</strong><p>{formProviderRequestEstimate > 20 ? "This may take longer and use more provider requests." : "Estimated requests for the next run."}</p></article>
        <article><span>Trade</span><strong>{settings.trade}</strong><p>One trade at a time is recommended for better review quality.</p></article>
        <article><span>Safety</span><strong>No auto-send</strong><p>Manual/social-safe mode stays on by default.</p></article>
      </div>

      <form className="engine-autopilot-form" id={formId} onSubmit={onStart}>
        <label>Campaign name<input name="campaignName" onChange={(event) => updateFormSetting("campaignName", event.target.value)} value={formSettings.campaignName} /></label>
        <label>Market preset<select name="marketPresetId" onChange={(event) => updateMarketPreset(event.target.value)} value={formSettings.marketPresetId}>
          {recommendedMarketPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select></label>
        <label className="engine-form-wide">Custom cities<textarea name="customCities" onChange={(event) => updateFormSetting("customCities", event.target.value)} placeholder="Toledo, OH; Sylvania, OH; Perrysburg, OH" value={formSettings.customCities} /></label>
        <label>Fallback state<input maxLength={2} name="state" onChange={(event) => updateFormSetting("state", event.target.value.toUpperCase())} value={formSettings.state} /></label>
        <label>Trade<select name="trade" onChange={(event) => updateFormSetting("trade", event.target.value as AutopilotCampaignSettings["trade"])} value={formSettings.trade}>
          {[...tradeCategories, allCoreServiceTradesOption].map((trade) => <option key={trade} value={trade}>{trade}</option>)}
        </select><small>New users should start with Landscaping, Pressure Washing, Cleaning, Painting, or Concrete before All Core Service Trades.</small></label>
        <label>Prospect type<select name="prospectType" onChange={(event) => updateFormSetting("prospectType", event.target.value as AutopilotCampaignSettings["prospectType"])} value={formSettings.prospectType}>
          {prospectSearchTypes.map((type) => <option key={type} value={type}>{type === "all" ? "All Prospect Types" : optionLabel(type)}</option>)}
        </select></label>
        <label>Prospect mode<select name="mode" onChange={(event) => updateFormSetting("mode", event.target.value as AutopilotCampaignSettings["mode"])} value={formSettings.mode}>
          {prospectModes.map((mode) => <option key={mode} value={mode}>{optionLabel(mode)}</option>)}
        </select></label>
        <label>Outreach style<select name="outreachStyle" onChange={(event) => updateFormSetting("outreachStyle", event.target.value as AutopilotCampaignSettings["outreachStyle"])} value={formSettings.outreachStyle}>
          {autopilotOutreachStyles.map((style) => <option key={style} value={style}>{style === "manual_social_safe" ? "Manual/social-safe" : optionLabel(style)}</option>)}
        </select></label>
        <label>Duration<select name="duration" onChange={(event) => updateFormSetting("duration", event.target.value as AutopilotCampaignSettings["duration"])} value={formSettings.duration}>
          {autopilotDurations.map((duration) => <option key={duration} value={duration}>{duration === "run_once" ? "Run once" : optionLabel(duration)}</option>)}
        </select></label>
        <label>Cadence<select name="cadence" onChange={(event) => updateFormSetting("cadence", event.target.value as AutopilotCampaignSettings["cadence"])} value={formSettings.cadence}>
          {autopilotCadences.map((cadence) => <option key={cadence} value={cadence}>{cadence === "manual_only" ? "Manual only" : optionLabel(cadence)}</option>)}
        </select></label>
        <label>Max prospects/run<input min="5" name="maxProspectsPerRun" onChange={(event) => updateFormSetting("maxProspectsPerRun", Number(event.target.value))} type="number" value={formSettings.maxProspectsPerRun} /></label>
        <label>Max previews/run<input min="0" name="maxPreviewsPerRun" onChange={(event) => updateFormSetting("maxPreviewsPerRun", Number(event.target.value))} type="number" value={formSettings.maxPreviewsPerRun} /></label>
        <label>Max prospects total<input min="1" name="maxProspectsTotal" onChange={(event) => updateFormSetting("maxProspectsTotal", Number(event.target.value))} type="number" value={formSettings.maxProspectsTotal} /></label>
        <label className="engine-toggle"><input checked={formSettings.excludePreviouslyReviewed} name="excludePreviouslyReviewed" onChange={(event) => updateFormSetting("excludePreviouslyReviewed", event.target.checked)} type="checkbox" />Exclude previously reviewed prospects</label>
        <label className="engine-toggle"><input checked={formSettings.requirePreviewQuality85} name="requirePreviewQuality85" onChange={(event) => updateFormSetting("requirePreviewQuality85", event.target.checked)} type="checkbox" />Require preview QA 85+</label>
        <label className="engine-toggle"><input checked={formSettings.requireWrittenContact} name="requireWrittenContact" onChange={(event) => updateFormSetting("requireWrittenContact", event.target.checked)} type="checkbox" />Require written contact</label>
        <label className="engine-toggle"><input checked={formSettings.manualDmMode} name="manualDmMode" onChange={(event) => updateFormSetting("manualDmMode", event.target.checked)} type="checkbox" />Manual DM mode</label>
        <label className="engine-toggle"><input checked={formSettings.loomNotifications} name="loomNotifications" onChange={(event) => updateFormSetting("loomNotifications", event.target.checked)} type="checkbox" />Dashboard Loom notifications</label>
        <label className="engine-toggle"><input checked={formSettings.stopRules.pauseOnProviderFailure} name="pauseOnProviderFailure" onChange={(event) => updateStopRule("pauseOnProviderFailure", event.target.checked)} type="checkbox" />Pause on provider failure</label>
        <label>Pause if bad-fit rate exceeds %<input max="100" min="10" name="pauseOnBadFitRatePercent" onChange={(event) => updateStopRule("pauseOnBadFitRatePercent", Number(event.target.value))} type="number" value={formSettings.stopRules.pauseOnBadFitRatePercent} /></label>
        <label>Pause after weak previews<input min="1" name="pauseAfterWeakPreviewCount" onChange={(event) => updateStopRule("pauseAfterWeakPreviewCount", Number(event.target.value))} type="number" value={formSettings.stopRules.pauseAfterWeakPreviewCount} /></label>
        <label className="engine-toggle"><input checked={formSettings.stopRules.stopWhenTotalProspectsReached} name="stopWhenTotalProspectsReached" onChange={(event) => updateStopRule("stopWhenTotalProspectsReached", event.target.checked)} type="checkbox" />Stop at total prospect cap</label>
        <footer className="engine-autopilot-form-footer">
          <AutopilotActionRow
            autopilot={actionAutopilot}
            disabled={disabled}
            formId={formId}
            insideForm
            onPause={onPause}
            onResume={onResume}
            onRunBatch={onRunBatch}
            onSmokeTest={onSmokeTest}
            onStop={onStop}
          />
          <button className="engine-button" disabled={!autopilot.exportRows.length} onClick={onDownload} type="button">Export CSV</button>
        </footer>
      </form>

      <div className="engine-autopilot-queues" aria-label="Autopilot queue summary">
        <p className="engine-autopilot-queue-note">
          Queues: Ready for Manual DM, Needs Preview Review, Loom Needed, Email Draft Ready, Blocked / Bad Fit, Needs Human Research. No email, form, social, phone, or Loom outreach is sent automatically.
          {autopilot.queueCountsSource === "latest_run_report" ? " Counts shown below come from the latest run report. Fake smoke-test counts do not create saved outreach items." : " Counts shown below come from saved outreach queue items."}
        </p>
        {autopilotQueueKeys.map((key) => (
          <article key={key}>
            <span>{autopilotQueueLabels[key]}</span>
            <strong>{campaign.queueCounts[key]}</strong>
            <p>{queueHelpText(key)}</p>
          </article>
        ))}
      </div>

      <div className="engine-autopilot-report-grid">
        <section>
          <h3>Run report</h3>
          {campaign.latestRunReport ? (
            <dl>
              <div><dt>Latest status</dt><dd>{optionLabel(campaign.latestRunReport.status)}</dd></div>
              <div><dt>Discovered</dt><dd>{campaign.latestRunReport.prospectsDiscovered}</dd></div>
              <div><dt>Qualified</dt><dd>{campaign.latestRunReport.prospectsQualified}</dd></div>
              <div><dt>Packages</dt><dd>{campaign.latestRunReport.packagesGenerated}</dd></div>
              <div><dt>Next recommendation</dt><dd>{campaign.latestRunReport.nextRunRecommendation}</dd></div>
            </dl>
          ) : <p>No Autopilot batch has run yet. Start Autopilot or run the fake smoke test to create a report.</p>}
        </section>
        <section>
          <h3>Dashboard notifications</h3>
          <ul>
            {campaign.notifications.map((notification) => (
              <li className={`engine-autopilot-notice engine-autopilot-notice--${notification.level}`} key={notification.id}>
                <b>{notification.title}</b>
                <span>{notification.body}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function queueHelpText(key: AutopilotQueueKey) {
  if (key === "readyForManualDm") return "Social/manual prospects with link-free first DM copy.";
  if (key === "needsPreviewReview") return "Preview or copy needs polish before outreach.";
  if (key === "loomNeeded") return "Prospects who said yes and need a manual Loom.";
  if (key === "emailDraftReady") return "Written outreach draft exists, still needs review.";
  if (key === "blockedBadFit") return "Hard blockers, bad fit, or written-contact rules.";
  return "Needs a person to research a usable contact path.";
}

function Gate({ detail, label, passed }: { detail?: string; label: string; passed: boolean }) {
  return <div className={passed ? "is-passed" : "is-failed"}><b>{passed ? "Pass" : "Blocked"}</b><span>{label}</span>{detail ? <small>{detail}</small> : null}</div>;
}

function CopyScriptButton({
  copied,
  copyKey,
  label,
  onCopy,
  value,
}: {
  copied: string;
  copyKey: string;
  label: string;
  onCopy: (key: string, value: string) => Promise<void>;
  value: string;
}) {
  return <button className="engine-button" disabled={!value.trim()} onClick={() => void onCopy(copyKey, value)} type="button">{copied === copyKey ? "Copied" : label}</button>;
}

function LoomQueueSection({
  copied,
  items,
  onCopy,
  onStatus,
}: {
  copied: string;
  items: OutreachQueueItem[];
  onCopy: (key: string, value: string) => Promise<void>;
  onStatus: (item: OutreachQueueItem, status: OutreachQueueStatus) => Promise<void>;
}) {
  return (
    <section className="engine-panel engine-loom-queue">
      <div className="engine-panel__head">
        <div><h2>Loom Needed Queue</h2><p>Prospects who said yes. Polish the preview if needed, record a manual Loom, then send the Loom and preview manually.</p></div>
        <span>{items.length} Loom task{items.length === 1 ? "" : "s"}</span>
      </div>
      {items.length === 0 ? <EmptyState title="No Loom walkthroughs waiting" body="Mark a prospect as Prospect Said Yes to create a Loom Needed task." /> : (
        <div className="engine-loom-task-grid">
          {items.map((item) => {
            const task = loomNeededTaskForQueueItem(item);
            return (
              <article className="engine-loom-task" key={item.id}>
                <header>
                  <div><span>{task.trade} in {task.city}</span><h3>{task.businessName}</h3></div>
                  <i className={`engine-package-state engine-package-state--${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</i>
                </header>
                <div className="engine-loom-task__facts">
                  <div><b>Public preview</b>{task.previewLink ? <a href={task.previewLink} rel="noreferrer" target="_blank">{task.previewLink}</a> : <span>Missing public preview link</span>}</div>
                  <div><b>Preview quality</b><span>{task.previewQuality}</span></div>
                  <div><b>Send rule</b><span>Manual DM, manual Loom, no automatic sending.</span></div>
                </div>
                <section className="engine-loom-checklist">
                  <h4>Review-before-Loom checklist</h4>
                  <ul>
                    {task.checklist.map((check) => (
                      <li className={check.passed ? "is-passed" : "is-failed"} key={check.key}>
                        <b>{check.passed ? "Pass" : "Fix"}</b>
                        <span>{check.label}</span>
                        {!check.passed && <small>{check.fix}</small>}
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="engine-loom-fixes">
                  <h4>Preview fix notes</h4>
                  {task.fixNotes.length ? <ul>{task.fixNotes.map((note) => <li key={note}>{note}</li>)}</ul> : <p>No preview polish notes recorded.</p>}
                </section>
                <section className="engine-loom-recommendation" aria-label={`${task.businessName} Loom recommendation`}>
                  <h4>{task.recommendation.title}</h4>
                  <p>{task.recommendation.whyRecommended}</p>
                  <dl>
                    <div><dt>Current-site issue to show</dt><dd>{task.recommendation.currentSiteIssue}</dd></div>
                    <div><dt>Preview improvement to show</dt><dd>{task.recommendation.previewImprovement}</dd></div>
                    <div><dt>Public preview link</dt><dd>{task.recommendation.previewLink ? <a href={task.recommendation.previewLink} rel="noreferrer" target="_blank">{task.recommendation.previewLink}</a> : "Generate a public /p/ preview first."}</dd></div>
                  </dl>
                  <ul>{task.recommendation.talkingPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                </section>
                <section className="engine-script-grid" aria-label={`${task.businessName} copyable Loom scripts`}>
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:yes`} label="Copy yes reply" onCopy={onCopy} value={task.scripts.yesReply} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:loom-script`} label="Copy Loom script" onCopy={onCopy} value={task.scripts.loomScript} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:loom-send`} label="Copy Loom send message" onCopy={onCopy} value={task.scripts.sendAfterLoom} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:pricing`} label="Copy $49/month pricing" onCopy={onCopy} value={task.scripts.pricingReply} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:higher-support`} label="Copy $79 option" onCopy={onCopy} value={task.scripts.higherSupportReply} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:starter`} label="Copy $500 starter" onCopy={onCopy} value={task.scripts.starterPageReply} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:follow-up`} label="Copy follow-up" onCopy={onCopy} value={task.scripts.followUpAfterLoom} />
                  <CopyScriptButton copied={copied} copyKey={`${item.id}:not-interested`} label="Copy not interested reply" onCopy={onCopy} value={task.scripts.notInterestedReply} />
                </section>
                <footer className="engine-loom-actions">
                  <button className="engine-button" onClick={() => void onStatus(item, "Preview Needs Polish")} type="button">Preview Needs Polish</button>
                  <button className="engine-button engine-button--primary" disabled={!task.canMarkReadyForLoom} onClick={() => void onStatus(item, "Ready for Loom")} type="button">Ready for Loom</button>
                  <button className="engine-button" onClick={() => void onStatus(item, "Loom Recorded")} type="button">Loom Recorded</button>
                  <button className="engine-button" onClick={() => void onStatus(item, "Loom Sent")} type="button">Loom Sent</button>
                  <button className="engine-button" onClick={() => void onStatus(item, "Follow-up Needed")} type="button">Follow-up Needed</button>
                  <button className="engine-button" onClick={() => void onStatus(item, "Pricing Requested")} type="button">Pricing Requested</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function QueueSection({
  copied,
  description,
  items,
  onCopy,
  onRegenerate,
  onFeedback,
  onRewrite,
  onSendEmail,
  onSuppressEmail,
  onStatus,
  title,
}: {
  copied: string;
  description: string;
  items: OutreachQueueItem[];
  onCopy: (key: string, value: string) => Promise<void>;
  onFeedback: (item: OutreachQueueItem, feedbackLabel: AutonomousFeedbackLabel) => Promise<void>;
  onRegenerate: (item: OutreachQueueItem) => Promise<void>;
  onRewrite: (item: OutreachQueueItem) => Promise<void>;
  onSendEmail: (item: OutreachQueueItem) => Promise<void>;
  onSuppressEmail: (item: OutreachQueueItem, reason: "bounce" | "complaint" | "manual_suppression") => Promise<void>;
  onStatus: (item: OutreachQueueItem, status: OutreachQueueStatus) => Promise<void>;
  title: string;
}) {
  return (
    <section className="engine-panel engine-autonomous-queue">
      <div className="engine-panel__head"><div><h2>{title}</h2><p>{description}</p></div><span>{items.length} items</span></div>
      {items.length === 0 ? <EmptyState title={`No ${title.toLowerCase()} items`} body="Generated Outreach Packages will appear here after the next qualified Top Prospects run." /> : (
        <div className="engine-autonomous-table" role="table" aria-label={title}>
          <div className="engine-autonomous-table__head" role="row"><span>Business</span><span>Self-review</span><span>Contact</span><span>Status</span><span>Actions</span></div>
          {items.map((item) => (
            <QueueItemRow
              copied={copied}
              item={item}
              key={item.id}
              onCopy={onCopy}
              onFeedback={onFeedback}
              onRegenerate={onRegenerate}
              onRewrite={onRewrite}
              onSendEmail={onSendEmail}
              onSuppressEmail={onSuppressEmail}
              onStatus={onStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function QueueItemRow({
  copied,
  item,
  onCopy,
  onFeedback,
  onRegenerate,
  onRewrite,
  onSendEmail,
  onSuppressEmail,
  onStatus,
}: {
  copied: string;
  item: OutreachQueueItem;
  onCopy: (key: string, value: string) => Promise<void>;
  onFeedback: (item: OutreachQueueItem, feedbackLabel: AutonomousFeedbackLabel) => Promise<void>;
  onRegenerate: (item: OutreachQueueItem) => Promise<void>;
  onRewrite: (item: OutreachQueueItem) => Promise<void>;
  onSendEmail: (item: OutreachQueueItem) => Promise<void>;
  onSuppressEmail: (item: OutreachQueueItem, reason: "bounce" | "complaint" | "manual_suppression") => Promise<void>;
  onStatus: (item: OutreachQueueItem, status: OutreachQueueStatus) => Promise<void>;
}) {
  const scripts = loomNeededTaskForQueueItem(item).scripts;
  return (
    <article key={item.id} role="row">
      <div><b>{item.businessName}</b><span>{item.trade} in {item.city}</span><small>{item.sourceProvider}</small></div>
      <div>
        <strong>{item.reviewScore || item.previewQualityScore}/100</strong>
        <span>{item.recommendedNextAction}</span>
        <small>{item.reviewSummary || readinessLabel(item)}</small>
        {item.detectedIssues.length ? <small>Issues: {item.detectedIssues.slice(0, 3).join("; ")}</small> : null}
        {item.improvementSuggestions.length ? <small>Suggestions: {item.improvementSuggestions.slice(0, 3).join("; ")}</small> : null}
        {item.blockedReason ? <small>{item.blockedReason}</small> : null}
      </div>
      <div><span>{item.email || "No public email"}</span><span>{item.contactSource}</span></div>
      <div><i className={`engine-package-state engine-package-state--${item.status.toLowerCase().replaceAll(" ", "-")}`}>{item.status}</i><span>{item.subjectLine}</span></div>
      <div className="engine-result-actions">
        {item.previewLink ? <a className="engine-button" href={item.previewLink} rel="noreferrer" target="_blank">Open preview</a> : null}
        <CopyScriptButton copied={copied} copyKey={`${item.id}:first-dm`} label="Copy first DM" onCopy={onCopy} value={item.dmScript || scripts.firstDm} />
        <CopyScriptButton copied={copied} copyKey={`${item.id}:soft-dm`} label="Copy softer DM" onCopy={onCopy} value={scripts.softerFirstDm} />
        <CopyScriptButton copied={copied} copyKey={`${item.id}:yes-reply`} label="Copy yes reply" onCopy={onCopy} value={scripts.yesReply} />
        <CopyScriptButton copied={copied} copyKey={`${item.id}:pricing-reply`} label="Copy pricing reply" onCopy={onCopy} value={scripts.pricingReply} />
        <button className="engine-button" disabled={!item.topProspectResultId} onClick={() => void onRegenerate(item)} type="button">Regenerate with Fixes</button>
        <button className="engine-button" onClick={() => void onRewrite(item)} type="button">Rewrite Outreach</button>
        <button className="engine-button" onClick={() => void onStatus(item, "DM Draft")} type="button">DM Draft</button>
        <button className="engine-button" onClick={() => void onStatus(item, "First DM Sent")} type="button">First DM Sent</button>
        {item.status === "Queued" ? <button className="engine-button engine-button--primary" onClick={() => void onSendEmail(item)} type="button">Send approved email</button> : null}
        <button className="engine-button engine-button--primary" onClick={() => void onStatus(item, "Prospect Said Yes")} type="button">Prospect Said Yes</button>
        <button className="engine-button" disabled={!item.email} onClick={() => void onSuppressEmail(item, "bounce")} type="button">Mark bounced</button>
        <button className="engine-button" disabled={!item.email} onClick={() => void onSuppressEmail(item, "complaint")} type="button">Mark complained</button>
        <button className="engine-button" disabled={!item.email} onClick={() => void onSuppressEmail(item, "manual_suppression")} type="button">Suppress email</button>
        <button className="engine-button" onClick={() => void onStatus(item, "Eligible")} type="button">Mark reviewed</button>
        <button className="engine-button" onClick={() => void onStatus(item, "Skipped")} type="button">Skip</button>
        <div className="engine-feedback-controls">
          <span>Feedback</span>
          <select
            aria-label={`Record feedback for ${item.businessName}`}
            defaultValue=""
            onChange={(event) => {
              const value = event.target.value as AutonomousFeedbackLabel;
              event.currentTarget.value = "";
              if (value) void onFeedback(item, value);
            }}
          >
            <option value="">Mark feedback</option>
            {autonomousFeedbackLabels.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
          {item.feedbackLabels.length ? <small>{item.feedbackLabels.join(", ")}</small> : null}
        </div>
        {item.regenerationPlan.length ? <small>Regeneration plan: {item.regenerationPlan.join("; ")}</small> : null}
        {item.rewritePlan.length ? <small>Rewrite plan: {item.rewritePlan.join("; ")}</small> : null}
        <select aria-label={`Change status for ${item.businessName}`} onChange={(event) => void onStatus(item, event.target.value as OutreachQueueStatus)} value={item.status}>
          {outreachQueueStatuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </div>
    </article>
  );
}
