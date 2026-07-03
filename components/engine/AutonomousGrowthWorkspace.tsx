"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import {
  autonomousFeedbackLabels,
  autonomousGrowthModeLabels,
  autonomousGrowthModes,
  csvEscape,
  outreachQueueStatuses,
  type AutonomousFeedbackLabel,
  type AutonomousGrowthDashboard,
  type AutonomousGrowthMode,
  type AutonomousGrowthSettings,
  type OutreachQueueItem,
  type OutreachQueueStatus,
} from "@/lib/autonomous-growth";
import { tradeCategories, type TradeCategory } from "@/lib/prospect-engine";

type ApiPayload = Partial<AutonomousGrowthDashboard> & {
  error?: string;
  item?: OutreachQueueItem;
  settings?: AutonomousGrowthSettings;
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
  const [dashboard, setDashboard] = useState<AutonomousGrowthDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/engine/autonomous-growth", { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.settings || !payload.metrics || !payload.queue || !payload.env) {
        throw new Error(apiError(payload, "Unable to load Autonomous Growth."));
      }
      setDashboard(payload as AutonomousGrowthDashboard);
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
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to update queue item.");
    } finally {
      setSaving(false);
    }
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

  const groupedQueue = useMemo(() => {
    const queue = dashboard?.queue ?? [];
    return {
      dryRun: queue.filter((item) => ["Draft", "Eligible", "Needs Review"].includes(item.status)),
      blocked: queue.filter((item) => ["Blocked", "Bad Fit", "Never Contact", "Opted Out", "Skipped"].includes(item.status)),
      sent: queue.filter((item) => ["Queued", "Sent", "Follow-up Needed", "Follow-up Sent", "Replied", "Positive Reply", "Not Interested"].includes(item.status)),
    };
  }, [dashboard?.queue]);

  if (loading) return <div className="engine-content"><LoadingState title="Loading Autonomous Growth" body="Checking settings, safety gates, and saved outreach queue items." /></div>;
  if (!dashboard) return <div className="engine-content"><EmptyState title="Autonomous Growth unavailable" body={error || "Reload the engine and try again."} action={() => void loadDashboard()} actionLabel="Retry" /></div>;

  const { env, metrics, queue, settings } = dashboard;
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
      {notice && <div className="engine-success-banner" role="status"><div><b>Settings updated</b><p>{notice}</p></div></div>}

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
        </div>
      </section>

      <QueueSection
        description="Generated packages waiting for review, copy, edit, or manual approval."
        items={groupedQueue.dryRun}
        onFeedback={recordFeedback}
        onRegenerate={regeneratePackage}
        onRewrite={rewriteOutreach}
        onStatus={updateStatus}
        title="Dry-run and review queue"
      />
      <QueueSection
        description="Leads blocked by contact rules, preview quality, unsupported claims, opt-out, or bad fit logic."
        items={groupedQueue.blocked}
        onFeedback={recordFeedback}
        onRegenerate={regeneratePackage}
        onRewrite={rewriteOutreach}
        onStatus={updateStatus}
        title="Blocked queue"
      />
      <QueueSection
        description="Items queued or manually marked through outreach follow-up states."
        items={groupedQueue.sent}
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

function Gate({ detail, label, passed }: { detail?: string; label: string; passed: boolean }) {
  return <div className={passed ? "is-passed" : "is-failed"}><b>{passed ? "Pass" : "Blocked"}</b><span>{label}</span>{detail ? <small>{detail}</small> : null}</div>;
}

function QueueSection({
  description,
  items,
  onRegenerate,
  onFeedback,
  onRewrite,
  onStatus,
  title,
}: {
  description: string;
  items: OutreachQueueItem[];
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
                <button className="engine-button" disabled={!item.topProspectResultId} onClick={() => void onRegenerate(item)} type="button">Regenerate with Fixes</button>
                <button className="engine-button" onClick={() => void onRewrite(item)} type="button">Rewrite Outreach</button>
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
          ))}
        </div>
      )}
    </section>
  );
}
