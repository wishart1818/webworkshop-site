"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import { DiscoveryFunnel } from "@/components/engine/DiscoveryFunnel";
import { tradeCategories } from "@/lib/prospect-engine";
import type { TopProspectJob, TopProspectResult } from "@/lib/top-prospects";
import type { TopProspectJobFailureClassification } from "@/lib/top-prospect-diagnostics";

type Props = {
  onOpenProspect: (id: string) => void;
  onProspectsChanged: () => void;
};

type TopProspectApiPayload = {
  classification?: string;
  error?: string;
  jobs?: TopProspectJob[];
};

function apiError(payload: TopProspectApiPayload, fallback: string) {
  const message = payload.error || fallback;
  return payload.classification ? `${message} Diagnostic: ${payload.classification}.` : message;
}

const skipReasonLabels: Record<string, string> = {
  already_strong_website: "Already strong website",
  national_large_brand: "National/large brand",
  low_redesign_opportunity: "Low redesign opportunity",
  weak_sales_fit: "Weak sales fit",
  no_usable_contact_path: "No usable contact path",
  below_final_cutoff: "Below final cutoff",
  duplicate: "Duplicate",
  already_contacted: "Already contacted",
  broken_or_inactive_website: "Broken or inactive website",
};

function skipReasonLabel(reason: string) {
  return skipReasonLabels[reason] ?? reason.replaceAll("_", " ");
}

const failureLabels: Record<TopProspectJobFailureClassification, string> = {
  discovery_provider_error: "Discovery provider error",
  geocoding_error: "Geocoding error",
  radius_filter_error: "Radius filter error",
  database_error: "Database error",
  worker_timeout: "Worker timeout",
  unexpected_exception: "Unexpected exception",
};

function jobProgress(job: TopProspectJob) {
  if (job.status === "COMPLETED") return 100;
  if (job.stage === "DISCOVER") return 5;
  return Math.min(98, Math.round((job.scannedCount / Math.max(1, job.discoveredCount)) * 100));
}

function safeWebsite(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

export function TopProspectsWorkspace({ onOpenProspect, onProspectsChanged }: Props) {
  const [jobs, setJobs] = useState<TopProspectJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [promptResult, setPromptResult] = useState<TopProspectResult | null>(null);
  const activeJob = jobs.find((job) => ["QUEUED", "RUNNING"].includes(job.status));
  const latestJob = activeJob ?? jobs[0];
  const best = jobs.find((job) => job.results.length)?.results[0];

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/engine/top-prospects", { cache: "no-store" });
      const payload = (await response.json()) as TopProspectApiPayload;
      if (!response.ok || !payload.jobs) throw new Error(apiError(payload, "Unable to load Top Prospects."));
      setJobs(payload.jobs);
      setError("");
      if (payload.jobs[0]?.status === "COMPLETED") onProspectsChanged();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Top Prospects.");
    } finally {
      setLoading(false);
    }
  }, [onProspectsChanged]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (!activeJob) return;
    const timer = window.setInterval(() => void loadJobs(), 4_000);
    return () => window.clearInterval(timer);
  }, [activeJob, loadJobs]);

  async function startJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStarting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/engine/top-prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: form.get("trade"),
          city: form.get("city"),
          state: form.get("state"),
          radiusKm: Number(form.get("radiusKm")),
          businessesToScan: Number(form.get("businessesToScan")),
          finalProspectsWanted: Number(form.get("finalProspectsWanted")),
        }),
      });
      const payload = (await response.json()) as TopProspectApiPayload;
      if (!response.ok) throw new Error(apiError(payload, "Unable to start Top Prospects."));
      await loadJobs();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start Top Prospects.");
    } finally {
      setStarting(false);
    }
  }

  async function resumeJob(jobId: string) {
    setError("");
    const response = await fetch(`/api/engine/top-prospects/${jobId}/run`, { method: "POST" });
    if (!response.ok) setError("Unable to resume processing.");
    await loadJobs();
  }

  async function copyPrompt(result: TopProspectResult) {
    try {
      await navigator.clipboard.writeText(result.buildPrompt);
      setCopied(result.id);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard access is unavailable. Open the prospect and review the saved artifacts instead.");
    }
  }

  const skipText = useMemo(
    () => latestJob ? Object.entries(latestJob.skipSummary).map(([reason, count]) => `${count} ${skipReasonLabel(reason)}`).join(" / ") : "",
    [latestJob],
  );

  if (loading) return <div className="engine-content"><LoadingState title="Loading Top Prospects" body="Retrieving saved searches, progress, and ranked opportunities." /></div>;

  return (
    <div className="engine-content engine-top-prospects">
      <section className="engine-panel engine-top-prospect-launcher">
        <div className="engine-panel__head">
          <div><h2>Find Top Prospects</h2><p>Scan public business records, analyze qualified websites, and return the strongest manual-outreach opportunities.</p></div>
          <span>Runs safely in saved batches</span>
        </div>
        <form onSubmit={startJob}>
          <label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>City<input name="city" required /></label>
          <label>State<input maxLength={2} name="state" required /></label>
          <label>Radius<select name="radiusKm"><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label>
          <label>Businesses to scan<input defaultValue="50" max="100" min="5" name="businessesToScan" type="number" /></label>
          <label>Final prospects wanted<input defaultValue="10" max="25" min="1" name="finalProspectsWanted" type="number" /></label>
          <button className="engine-button engine-button--primary" disabled={starting || Boolean(activeJob)} type="submit">
            {starting ? "Starting" : activeJob ? "Search in progress" : "Find Top Prospects"}
          </button>
        </form>
      </section>

      {error && <div className="engine-error-banner" role="alert"><div><b>Top Prospects needs attention</b><p>{error}</p></div></div>}

      {latestJob && (
        <section className="engine-panel engine-job-progress" aria-live="polite">
          <div className="engine-panel__head">
            <div><h2>{latestJob.input.trade} near {latestJob.input.city}, {latestJob.input.state}</h2><p>{latestJob.status === "COMPLETED" ? "Ranked results are ready for review." : latestJob.status === "FAILED" ? "Processing stopped before completion. Review the diagnostic below." : "You can leave this page. Progress is saved after every batch."}</p></div>
            <span className={`engine-job-state engine-job-state--${latestJob.status.toLowerCase()}`}>{latestJob.status.toLowerCase()}</span>
          </div>
          <div className="engine-progress-track"><i style={{ width: `${jobProgress(latestJob)}%` }} /></div>
          <div className="engine-job-stats">
            <span><b>{latestJob.discoveredCount}</b> discovered</span>
            <span><b>{latestJob.scannedCount}</b> scanned</span>
            <span><b>{latestJob.qualifiedCount}</b> qualified</span>
            <span><b>{latestJob.skippedCount}</b> skipped</span>
            {["QUEUED", "RUNNING"].includes(latestJob.status) && <button className="engine-button" onClick={() => void resumeJob(latestJob.id)} type="button">Run next saved batch</button>}
            {latestJob.status === "FAILED" && <button className="engine-button" onClick={() => void resumeJob(latestJob.id)} type="button">Retry from last saved business</button>}
          </div>
          {latestJob.status === "FAILED" && latestJob.failureClassification && (
            <div className="engine-job-failure" role="alert">
              <b>{failureLabels[latestJob.failureClassification]}</b>
              <p>{latestJob.errorMessage}</p>
              <code>{latestJob.failureClassification}</code>
            </div>
          )}
          {latestJob.discoveryDiagnostics && <DiscoveryFunnel diagnostics={latestJob.discoveryDiagnostics} />}
          {skipText && <p className="engine-skip-summary">Skipped: {skipText}</p>}
        </section>
      )}

      {best && <BestProspect result={best} onOpenProspect={onOpenProspect} />}

      {latestJob?.results.length ? (
        <section className="engine-panel engine-top-results">
          <div className="engine-panel__head"><div><h2>Ranked Top Prospects</h2><p>Opportunity Score measures likely sales fit separately from website quality.</p></div><span>{latestJob.results.length} ready for review</span></div>
          {latestJob.status === "COMPLETED" && latestJob.results.length < latestJob.input.finalProspectsWanted && (
            <p className="engine-skip-summary">Only {latestJob.results.length} strong prospects found. Increase radius or scan count to find more.</p>
          )}
          <div className="engine-top-table" role="table" aria-label="Top prospects">
            <div className="engine-top-table__head" role="row"><span>Rank / Business</span><span>Contact</span><span>Scores</span><span>Opportunity</span><span>Status</span><span>Actions</span></div>
            {latestJob.results.map((result) => (
              <article key={result.id} role="row">
                <div><strong>#{result.rank ?? "Pending"} {result.prospect.businessName}</strong><a href={safeWebsite(result.prospect.website)} rel="noreferrer" target="_blank">{result.prospect.website}</a></div>
                <div><span>{result.prospect.phone || "No public phone"}</span><span>{result.prospect.email || "No public email"}</span></div>
                <div><span>Website <b>{result.prospect.analysis?.overallScore ?? "-"}</b></span><span>Opportunity <b>{result.opportunityScore}</b></span></div>
                <div><b>{result.mainWeakness}</b><span>{result.whyMayBuy}</span><em>{result.pitchAngle}</em></div>
                <div><i className={`engine-status engine-status--${result.prospect.status.toLowerCase().replaceAll(" ", "-")}`}>{result.prospect.status}</i></div>
                <div className="engine-result-actions">
                  <button className="engine-button" onClick={() => onOpenProspect(result.prospect.id)} type="button">Review</button>
                  <a className="engine-button" href={`/engine/previews/${result.prospect.id}`} target="_blank">Open preview</a>
                  <button className="engine-button" onClick={() => setPromptResult(result)} type="button">Generate Website Build Prompt</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : !latestJob || latestJob.status === "COMPLETED" ? (
        <section className="engine-panel"><EmptyState title="No ranked Top Prospects yet" body={latestJob ? "Only 0 strong prospects found. Increase radius or scan count to find more." : "Start a search to discover, qualify, analyze, and rank local contractor businesses."} /></section>
      ) : null}

      {latestJob?.reviewedNotRecommended.length ? (
        <section className="engine-panel engine-top-results">
          <div className="engine-panel__head"><div><h2>Reviewed but not recommended</h2><p>Analyzed leads that did not meet the default sales-fit threshold.</p></div><span>{latestJob.reviewedNotRecommended.length} reviewed</span></div>
          <div className="engine-top-table" role="table" aria-label="Reviewed but not recommended prospects">
            <div className="engine-top-table__head" role="row"><span>Reason / Business</span><span>Contact</span><span>Scores</span><span>Opportunity</span><span>Status</span><span>Actions</span></div>
            {latestJob.reviewedNotRecommended.map((result) => (
              <article key={result.id} role="row">
                <div><strong>{result.rejectionReason}</strong><span>{result.prospect.businessName}</span><a href={safeWebsite(result.prospect.website)} rel="noreferrer" target="_blank">{result.prospect.website}</a></div>
                <div><span>{result.prospect.phone || "No public phone"}</span><span>{result.prospect.email || "No public email"}</span></div>
                <div><span>Website <b>{result.prospect.analysis?.overallScore ?? "-"}</b></span><span>Opportunity <b>{result.opportunityScore}</b></span></div>
                <div><b>{result.mainWeakness}</b><span>{result.whyMayBuy}</span></div>
                <div><i className={`engine-status engine-status--${result.prospect.status.toLowerCase().replaceAll(" ", "-")}`}>{result.prospect.status}</i></div>
                <div className="engine-result-actions"><button className="engine-button" onClick={() => onOpenProspect(result.prospect.id)} type="button">Review</button></div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {promptResult && (
        <div className="engine-dialog-backdrop" onMouseDown={() => setPromptResult(null)}>
          <dialog aria-labelledby="build-prompt-title" className="engine-dialog engine-dialog--wide" onMouseDown={(event) => event.stopPropagation()} open>
            <header><div><p>Website builder handoff</p><h2 id="build-prompt-title">{promptResult.prospect.businessName} build prompt</h2></div><button aria-label="Close" onClick={() => setPromptResult(null)} type="button">×</button></header>
            <div className="engine-build-prompt"><p>Review this prompt before using it in Lovable, Bolt, v0, Replit, or another website builder. It avoids invented business claims.</p><pre>{promptResult.buildPrompt}</pre></div>
            <footer><button className="engine-button" onClick={() => setPromptResult(null)} type="button">Close</button><button className="engine-button engine-button--primary" onClick={() => void copyPrompt(promptResult)} type="button">{copied === promptResult.id ? "Prompt copied" : "Copy build prompt"}</button></footer>
          </dialog>
        </div>
      )}
    </div>
  );
}

function BestProspect({ result, onOpenProspect }: { result: TopProspectResult; onOpenProspect: (id: string) => void }) {
  return (
    <section className="engine-best-prospect">
      <div><span>Best Prospect Today</span><h2>{result.prospect.businessName}</h2><p>{result.whyMayBuy}</p></div>
      <div><strong>{result.opportunityScore}</strong><span>Opportunity Score</span></div>
      <div><b>Recommended next action</b><p>Review the analysis and preview, verify the public contact details, then approve a personal outreach draft.</p><button className="engine-button engine-button--primary" onClick={() => onOpenProspect(result.prospect.id)} type="button">Review best prospect</button></div>
    </section>
  );
}
