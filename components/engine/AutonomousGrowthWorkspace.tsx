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
  autopilotDurations,
  autopilotOutreachStyles,
  autopilotQueueCsv,
  autopilotQueueKeys,
  autopilotQueueLabels,
  defaultAutopilotCampaignSettings,
  type AutopilotCampaignSettings,
  type AutopilotDashboard,
  type AutopilotQueueKey,
  type AutopilotSmokeTestResult,
} from "@/lib/autopilot-campaign";
import { prospectModes, recommendedMarketPresets } from "@/lib/top-prospects";

type DashboardPayload = AutonomousGrowthDashboard & { autopilot: AutopilotDashboard };

type ApiPayload = Partial<DashboardPayload> & {
  error?: string;
  item?: OutreachQueueItem;
  settings?: AutonomousGrowthSettings;
  autopilot?: AutopilotDashboard;
  smokeTest?: AutopilotSmokeTestResult;
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
      blocked: queue.filter((item) => ["Blocked", "Bad Fit", "Never Contact", "Opted Out", "Skipped"].includes(item.status)),
      sent: queue.filter((item) => ["Queued", "Sent", "Loom Sent", "Pricing Requested", "Pricing Sent", "Follow-up Needed", "Follow-up Sent", "Replied", "Positive Reply", "Won", "Lost", "No Response", "Not Interested"].includes(item.status)),
    };
  }, [dashboard?.queue]);

  if (loading) return <div className="engine-content"><LoadingState title="Loading Autonomous Growth" body="Checking settings, safety gates, and saved outreach queue items." /></div>;
  if (!dashboard) return <div className="engine-content"><EmptyState title="Autonomous Growth unavailable" body={error || "Reload the engine and try again."} action={() => void loadDashboard()} actionLabel="Retry" /></div>;

  const { autopilot, env, metrics, queue, settings } = dashboard;
  const autoPilotBlocked = settings.mode !== "auto_email_pilot" || settings.killSwitch || !env.autoSendEnabled || !env.hasResendApiKey || !env.hasFromEmail || !env.hasReplyToEmail || !env.hasPostalAddress;

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

      <section className="engine-panel engine-autonomous-safety">
        <div className="engine-panel__head"><div><h2>Auto Email Pilot gates</h2><p>Email sending stays disabled unless every gate below passes. Contact forms, social DMs, and phone calls are never automated.</p></div></div>
        <div className="engine-safety-grid">
          <Gate label="Mode is Auto Email Pilot" passed={settings.mode === "auto_email_pilot"} />
          <Gate label="Global kill switch is off" passed={!settings.killSwitch} />
          <Gate label="OUTREACH_AUTO_SEND_ENABLED is true" passed={env.autoSendEnabled} />
          <Gate label="Provider is configured" passed={env.sendProvider === "resend" && env.hasResendApiKey} detail={env.sendProvider} />
          <Gate label="Sender and reply-to are configured" passed={env.hasFromEmail && env.hasReplyToEmail} />
          <Gate label="Postal address is configured" passed={env.hasPostalAddress} />
          <Gate label="Optional Loom notification configured" passed={env.notifyOnLoomNeeded && env.hasNotifyEmail && env.hasNotifyFromEmail} detail="Internal only" />
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

function AutopilotCampaignPanel({
  autopilot,
  disabled,
  onDownload,
  onPause,
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
  onResume: () => void;
  onRunBatch: () => void;
  onSmokeTest: () => void;
  onStart: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onStop: () => void;
}) {
  const { campaign } = autopilot;
  const settings = campaign.settings;
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

      <div className="engine-autopilot-summary">
        <article><span>Markets</span><strong>{autopilot.marketTargets.length}</strong><p>{autopilot.marketTargets.slice(0, 4).join(", ") || "Preset not selected"}</p></article>
        <article><span>Provider load</span><strong>{autopilot.providerRequestEstimate}</strong><p>{autopilot.providerRequestEstimate > 20 ? "This may take longer and use more provider requests." : "Estimated requests for the next run."}</p></article>
        <article><span>Trade</span><strong>{settings.trade}</strong><p>One trade at a time is recommended for better review quality.</p></article>
        <article><span>Safety</span><strong>No auto-send</strong><p>Manual/social-safe mode stays on by default.</p></article>
      </div>

      <form className="engine-autopilot-form" onSubmit={onStart}>
        <label>Campaign name<input defaultValue={settings.campaignName} name="campaignName" /></label>
        <label>Market preset<select defaultValue={settings.marketPresetId} name="marketPresetId">
          {recommendedMarketPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
        </select></label>
        <label className="engine-form-wide">Custom cities<textarea defaultValue={settings.customCities} name="customCities" placeholder="Toledo, OH; Sylvania, OH; Perrysburg, OH" /></label>
        <label>Fallback state<input defaultValue={settings.state} maxLength={2} name="state" /></label>
        <label>Trade<select defaultValue={settings.trade} name="trade">
          {[...tradeCategories, allCoreServiceTradesOption].map((trade) => <option key={trade} value={trade}>{trade}</option>)}
        </select><small>New users should start with Landscaping, Pressure Washing, Cleaning, Painting, or Concrete before All Core Service Trades.</small></label>
        <label>Prospect type<select defaultValue={settings.prospectType} name="prospectType">
          {prospectSearchTypes.map((type) => <option key={type} value={type}>{type === "all" ? "All Prospect Types" : optionLabel(type)}</option>)}
        </select></label>
        <label>Prospect mode<select defaultValue={settings.mode} name="mode">
          {prospectModes.map((mode) => <option key={mode} value={mode}>{optionLabel(mode)}</option>)}
        </select></label>
        <label>Outreach style<select defaultValue={settings.outreachStyle} name="outreachStyle">
          {autopilotOutreachStyles.map((style) => <option key={style} value={style}>{style === "manual_social_safe" ? "Manual/social-safe" : optionLabel(style)}</option>)}
        </select></label>
        <label>Duration<select defaultValue={settings.duration} name="duration">
          {autopilotDurations.map((duration) => <option key={duration} value={duration}>{duration === "run_once" ? "Run once" : optionLabel(duration)}</option>)}
        </select></label>
        <label>Cadence<select defaultValue={settings.cadence} name="cadence">
          {autopilotCadences.map((cadence) => <option key={cadence} value={cadence}>{cadence === "manual_only" ? "Manual only" : optionLabel(cadence)}</option>)}
        </select></label>
        <label>Max prospects/run<input defaultValue={settings.maxProspectsPerRun} min="5" name="maxProspectsPerRun" type="number" /></label>
        <label>Max previews/run<input defaultValue={settings.maxPreviewsPerRun} min="0" name="maxPreviewsPerRun" type="number" /></label>
        <label>Max prospects total<input defaultValue={settings.maxProspectsTotal} min="1" name="maxProspectsTotal" type="number" /></label>
        <label className="engine-toggle"><input defaultChecked={settings.excludePreviouslyReviewed} name="excludePreviouslyReviewed" type="checkbox" />Exclude previously reviewed prospects</label>
        <label className="engine-toggle"><input defaultChecked={settings.requirePreviewQuality85} name="requirePreviewQuality85" type="checkbox" />Require preview QA 85+</label>
        <label className="engine-toggle"><input defaultChecked={settings.requireWrittenContact} name="requireWrittenContact" type="checkbox" />Require written contact</label>
        <label className="engine-toggle"><input defaultChecked={settings.manualDmMode} name="manualDmMode" type="checkbox" />Manual DM mode</label>
        <label className="engine-toggle"><input defaultChecked={settings.loomNotifications} name="loomNotifications" type="checkbox" />Dashboard Loom notifications</label>
        <label className="engine-toggle"><input defaultChecked={settings.stopRules.pauseOnProviderFailure} name="pauseOnProviderFailure" type="checkbox" />Pause on provider failure</label>
        <label>Pause if bad-fit rate exceeds %<input defaultValue={settings.stopRules.pauseOnBadFitRatePercent} max="100" min="10" name="pauseOnBadFitRatePercent" type="number" /></label>
        <label>Pause after weak previews<input defaultValue={settings.stopRules.pauseAfterWeakPreviewCount} min="1" name="pauseAfterWeakPreviewCount" type="number" /></label>
        <label className="engine-toggle"><input defaultChecked={settings.stopRules.stopWhenTotalProspectsReached} name="stopWhenTotalProspectsReached" type="checkbox" />Stop at total prospect cap</label>
        <footer className="engine-autopilot-actions">
          <button className="engine-button engine-button--primary" disabled={disabled} type="submit">Start Autopilot</button>
          <button className="engine-button" disabled={disabled || campaign.status !== "running"} onClick={onPause} type="button">Pause</button>
          <button className="engine-button" disabled={disabled || campaign.status !== "paused"} onClick={onResume} type="button">Resume</button>
          <button className="engine-button" disabled={disabled || campaign.status === "stopped"} onClick={onStop} type="button">Stop</button>
          <button className="engine-button" disabled={disabled} onClick={onRunBatch} type="button">Run next batch now</button>
          <button className="engine-button" disabled={disabled} onClick={onSmokeTest} type="button">Run Fake Autopilot Smoke Test</button>
          <button className="engine-button" disabled={!autopilot.exportRows.length} onClick={onDownload} type="button">Export CSV</button>
        </footer>
      </form>

      <div className="engine-autopilot-queues" aria-label="Autopilot queue summary">
        <p className="engine-autopilot-queue-note">Queues: Ready for Manual DM, Needs Preview Review, Loom Needed, Email Draft Ready, Blocked / Bad Fit, Needs Human Research. No email, form, social, phone, or Loom outreach is sent automatically.</p>
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
  onStatus,
}: {
  copied: string;
  item: OutreachQueueItem;
  onCopy: (key: string, value: string) => Promise<void>;
  onFeedback: (item: OutreachQueueItem, feedbackLabel: AutonomousFeedbackLabel) => Promise<void>;
  onRegenerate: (item: OutreachQueueItem) => Promise<void>;
  onRewrite: (item: OutreachQueueItem) => Promise<void>;
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
        <button className="engine-button engine-button--primary" onClick={() => void onStatus(item, "Prospect Said Yes")} type="button">Prospect Said Yes</button>
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
