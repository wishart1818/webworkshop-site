"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import { DiscoveryFunnel } from "@/components/engine/DiscoveryFunnel";
import type { DiscoveryDiagnostics } from "@/lib/lead-discovery";
import {
  allCoreServiceTradesOption,
  previewStyleProfile,
  prospectPresenceLabels,
  tradeCategories,
  type ProspectClassification,
  type ProspectSearchType,
  type RecommendedContactMethod,
} from "@/lib/prospect-engine";
import type {
  OutreachPackageAction,
  OutreachPreference,
  ProspectMode,
  TopProspectJob,
  TopProspectResult,
  TopProspectWorkflowType,
} from "@/lib/top-prospects";
import { outreachPackageStatusLabel } from "@/lib/top-prospects";
import type { TopProspectJobFailureClassification } from "@/lib/top-prospect-diagnostics";

type Props = {
  onOpenProspect: (id: string) => void;
  onProspectsChanged: () => void;
};

type TopProspectApiPayload = {
  buildVersion?: string;
  classification?: string;
  error?: string;
  jobs?: TopProspectJob[];
  result?: TopProspectResult;
};

function legacyJobDiagnostics(job: TopProspectJob): DiscoveryDiagnostics {
  const notRecorded = {
    configured: null,
    queryExecuted: null,
    status: "not_recorded" as const,
    returnedCount: 0,
    withinRadiusCount: 0,
    afterDeduplicationCount: 0,
    usableWebsiteCount: 0,
  };
  return {
    rawProviderCount: job.discoveredCount,
    afterDistanceFilteringCount: job.discoveredCount,
    afterDuplicateFilteringCount: job.discoveredCount,
    afterQualificationFilteringCount: job.discoveredCount,
    returnedCount: job.discoveredCount,
    radiusKm: job.input.radiusKm,
    categorySignals: [],
    sourceCounts: { osm: 0, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
    providerDiagnostics: {
      osm: { ...notRecorded },
      azureMaps: { ...notRecorded },
      googlePlaces: { ...notRecorded },
      yelp: { ...notRecorded },
    },
    finalMergedCount: job.discoveredCount,
  };
}

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
  inactive_business: "Inactive business",
  duplicate_bad_fit: "Duplicate/bad fit",
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

const modeLabels: Record<ProspectMode, string> = {
  strict: "Strict Mode",
  growth: "Growth Mode",
  volume: "Volume Mode",
};

const modeDescriptions: Record<ProspectMode, string> = {
  strict: "Opportunity 60+, website 75 or lower, local brands only.",
  growth: "Opportunity 45+, website 90 or lower, local brands only.",
  volume: "Ranks every local business with a meaningful website improvement gap.",
};

const workflowLabels: Record<TopProspectWorkflowType, string> = {
  search: "Top Prospects Search",
  morning_batch: "Morning Prospect Batch",
};

const prospectTypeLabels: Record<ProspectSearchType, string> = {
  redesign: "Redesign Prospects",
  no_website_social_only: "No Website / Social Only",
  all: "All Prospect Types",
};

const classificationLabels: Record<ProspectClassification, string> = {
  website_redesign: "Website Redesign Prospect",
  no_website: "No Website Prospect",
  social_only: "Social-Only Prospect",
  listing_only: "Listing-Only Prospect",
  phone_only: "Phone-Only Prospect",
  not_enough_contact_info: "Not Enough Contact Info",
  national_large_brand: "National/Large Brand",
  duplicate_bad_fit: "Duplicate/Bad Fit",
};

const contactMethodLabels: Record<RecommendedContactMethod, string> = {
  send_email: "Send email",
  submit_contact_form: "Submit contact form",
  message_on_facebook: "Message on Facebook",
  message_on_social: "Message on social",
  call_first: "Call first",
  needs_manual_contact_research: "Needs manual contact research",
  do_not_contact: "Do not contact",
};

const outreachPreferenceLabels: Record<OutreachPreference, string> = {
  written_only: "Written outreach only",
  phone_allowed: "Phone allowed",
};

type ContactFilter = "all" | "email" | "form" | "social" | "hide_phone_only" | "send_ready" | "needs_research";

function matchesContactFilter(result: TopProspectResult, filter: ContactFilter) {
  if (filter === "all") return true;
  if (filter === "email") return Boolean(result.prospect.email);
  if (filter === "form") return Boolean(result.prospect.contactFormUrl);
  if (filter === "social") return result.prospect.recommendedContactMethod === "message_on_facebook" || result.prospect.recommendedContactMethod === "message_on_social";
  if (filter === "hide_phone_only") return result.prospect.classification !== "phone_only" && result.prospect.recommendedContactMethod !== "call_first";
  if (filter === "send_ready") return result.emailQuality.ready;
  return result.prospect.recommendedContactMethod === "needs_manual_contact_research" || result.emailQuality.readinessLabel === "Missing written contact method" || result.emailQuality.readinessLabel === "Phone-only / written outreach blocked";
}

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
  const [buildVersion, setBuildVersion] = useState("unknown");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [packageActioning, setPackageActioning] = useState("");
  const [promptResult, setPromptResult] = useState<TopProspectResult | null>(null);
  const [outreachResult, setOutreachResult] = useState<TopProspectResult | null>(null);
  const [selectedMode, setSelectedMode] = useState<ProspectMode>("growth");
  const [selectedProspectType, setSelectedProspectType] = useState<ProspectSearchType>("all");
  const [selectedWorkflow, setSelectedWorkflow] = useState<TopProspectWorkflowType>("search");
  const [selectedOutreachPreference, setSelectedOutreachPreference] = useState<OutreachPreference>("written_only");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const activeJob = jobs.find((job) => ["QUEUED", "RUNNING"].includes(job.status));
  const latestJob = activeJob ?? jobs[0];
  const best = jobs.find((job) => job.results.length)?.results[0];
  const queuedResults = latestJob ? [...latestJob.results, ...latestJob.reviewedNotRecommended] : [];
  const filteredResults = latestJob ? latestJob.results.filter((result) => matchesContactFilter(result, contactFilter)) : [];
  const filteredReviewedNotRecommended = latestJob ? latestJob.reviewedNotRecommended.filter((result) => matchesContactFilter(result, contactFilter)) : [];
  const preparedArtifacts = queuedResults.filter((result) => result.prospect.preview && result.prospect.outreach && result.buildPrompt).length;

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/engine/top-prospects", { cache: "no-store" });
      const payload = (await response.json()) as TopProspectApiPayload;
      if (!response.ok || !payload.jobs) throw new Error(apiError(payload, "Unable to load Top Prospects."));
      setJobs(payload.jobs);
      setBuildVersion(payload.buildVersion || "unknown");
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
          prospectType: form.get("prospectType"),
          mode: selectedMode,
          workflowType: selectedWorkflow,
          outreachPreference: selectedOutreachPreference,
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

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Clipboard access is unavailable. Open the prospect and review the saved artifacts instead.");
    }
  }

  async function copyPrompt(result: TopProspectResult) {
    await copyText(result.id, result.buildPrompt);
  }

  async function runPackageAction(result: TopProspectResult, action: OutreachPackageAction) {
    setPackageActioning(`${result.id}:${action}`);
    setError("");
    try {
      const response = await fetch(`/api/engine/top-prospects/results/${result.id}/package`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as TopProspectApiPayload;
      if (!response.ok || !payload.result) throw new Error(payload.error || "Unable to update Outreach Package.");
      if (outreachResult?.id === result.id) setOutreachResult(payload.result);
      await loadJobs();
      onProspectsChanged();
    } catch (packageError) {
      setError(packageError instanceof Error ? packageError.message : "Unable to update Outreach Package.");
    } finally {
      setPackageActioning("");
    }
  }

  function openPackageReview(result: TopProspectResult) {
    setOutreachResult(result);
    if (result.packageStatus === "PACKAGE_GENERATED") void runPackageAction(result, "ready_for_review");
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
          <div><h2>Find Top Prospects</h2><p>Analyze local businesses, score sales fit, and save ready-to-review previews, outreach drafts, and Lovable prompts.</p></div>
          <div className="engine-build-label"><span>Runs safely in saved batches</span><code>Build {buildVersion}</code></div>
        </div>
        <form onSubmit={startJob}>
          <label>Run as<select name="workflowType" onChange={(event) => setSelectedWorkflow(event.target.value as TopProspectWorkflowType)} value={selectedWorkflow}><option value="search">Top Prospects Search</option><option value="morning_batch">Morning Prospect Batch</option></select></label>
          <label>Outreach preference<select name="outreachPreference" onChange={(event) => setSelectedOutreachPreference(event.target.value as OutreachPreference)} value={selectedOutreachPreference}><option value="written_only">Written outreach only</option><option value="phone_allowed">Phone allowed</option></select></label>
          <label>Prospect type<select name="prospectType" onChange={(event) => setSelectedProspectType(event.target.value as ProspectSearchType)} value={selectedProspectType}><option value="redesign">Redesign Prospects</option><option value="no_website_social_only">No Website / Social Only</option><option value="all">All Prospect Types</option></select></label>
          <label>Prospect mode<select disabled={selectedProspectType === "no_website_social_only"} name="mode" onChange={(event) => setSelectedMode(event.target.value as ProspectMode)} value={selectedMode}><option value="strict">Strict Mode</option><option value="growth">Growth Mode</option><option value="volume">Volume Mode</option></select></label>
          <label>Trade<select defaultValue={allCoreServiceTradesOption} name="trade"><option value={allCoreServiceTradesOption}>{allCoreServiceTradesOption}</option>{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>City<input name="city" required /></label>
          <label>State<input maxLength={2} name="state" required /></label>
          <label>Radius<select defaultValue="50" name="radiusKm"><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label>
          <label>Businesses to scan<input defaultValue="100" max="100" min="5" name="businessesToScan" type="number" /></label>
          <label>Final prospects wanted<input defaultValue="20" max="25" min="1" name="finalProspectsWanted" type="number" /></label>
          <p className="engine-mode-note">{selectedProspectType === "no_website_social_only" ? <><b>No Website / Social Only:</b> Ranks active local businesses by presence gap, contactability, activity, and local fit.</> : selectedProspectType === "all" ? <><b>All Prospect Types:</b> Reviews redesign and no-website opportunities together, while preserving the correct scoring model for each.</> : <><b>{modeLabels[selectedMode]}:</b> {modeDescriptions[selectedMode]}</>} <b>{outreachPreferenceLabels[selectedOutreachPreference]}:</b> {selectedOutreachPreference === "written_only" ? "Email, contact form, or social message required before send-ready approval." : "Phone-first leads may be reviewed, but sending remains manual."} {selectedWorkflow === "morning_batch" ? "The batch continues in the background and saves every generated artifact." : ""}</p>
          <button className="engine-button engine-button--primary" disabled={starting || Boolean(activeJob)} type="submit">
            {starting ? "Starting" : activeJob ? "Search in progress" : selectedWorkflow === "morning_batch" ? "Start Morning Batch" : "Find Top Prospects"}
          </button>
        </form>
      </section>

      {error && <div className="engine-error-banner" role="alert"><div><b>Top Prospects needs attention</b><p>{error}</p></div></div>}

      {latestJob && (
        <section className="engine-panel engine-job-progress" aria-live="polite">
          <div className="engine-panel__head">
            <div><h2>{latestJob.input.trade} near {latestJob.input.city}, {latestJob.input.state}</h2><p>{latestJob.status === "COMPLETED" ? `${workflowLabels[latestJob.input.workflowType]} results and artifacts are ready for review.` : latestJob.status === "FAILED" ? "Processing stopped before completion. Review the diagnostic below." : "You can leave this page. Analysis and generated artifacts are saved after every batch."}</p></div>
            <span className={`engine-job-state engine-job-state--${latestJob.status.toLowerCase()}`}>{latestJob.status.toLowerCase()}</span>
          </div>
          <div className="engine-job-meta">
            <span>Job ID <code>{latestJob.id}</code></span>
            <span>Created <time dateTime={latestJob.createdAt}>{latestJob.createdAt}</time></span>
            <span>Updated <time dateTime={latestJob.updatedAt}>{latestJob.updatedAt}</time></span>
            <span>{latestJob.input.prospectType === "no_website_social_only" ? <>Scoring <b>Presence Gap + Sales Fit</b></> : <>Mode <b>{modeLabels[latestJob.input.mode]}</b></>}</span>
            <span>Type <b>{prospectTypeLabels[latestJob.input.prospectType]}</b></span>
            <span>Workflow <b>{workflowLabels[latestJob.input.workflowType]}</b></span>
            <span>Outreach <b>{outreachPreferenceLabels[latestJob.input.outreachPreference]}</b></span>
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
          <DiscoveryFunnel diagnostics={latestJob.discoveryDiagnostics ?? legacyJobDiagnostics(latestJob)} qualificationLabel={latestJob.input.prospectType === "no_website_social_only" ? "eligible no-website leads" : latestJob.input.prospectType === "all" ? "eligible prospects" : "usable websites"} />
          {skipText && <p className="engine-skip-summary">Skipped: {skipText}</p>}
        </section>
      )}

      {latestJob && queuedResults.length > 0 && (
        <section className="engine-panel engine-auto-queue">
          <div className="engine-panel__head"><div><h2>Auto Prospect Queue</h2><p>Complete Outreach Packages are stored for review. Sending remains manual and requires human approval.</p></div><span>{preparedArtifacts} prepared</span></div>
          <div className="engine-auto-queue__summary">
            <span><b>{queuedResults.length}</b> reviewed prospects</span>
            <span><b>{queuedResults.filter((result) => result.prospect.preview).length}</b> previews ready</span>
            <span><b>{queuedResults.filter((result) => result.prospect.outreach).length}</b> outreach drafts ready</span>
            <span><b>{queuedResults.filter((result) => result.packageStatus === "APPROVED_TO_SEND").length}</b> approved to send</span>
          </div>
        </section>
      )}

      {latestJob?.results.length ? (
        <section className="engine-panel engine-package-review">
          <div className="engine-panel__head">
            <div><h2>Outreach Package Review</h2><p>Review the business-specific preview, email, pitch, and builder handoff. Approve or skip without opening each prospect record.</p></div>
            <span>{latestJob.results.filter((result) => result.packageStatus === "READY_FOR_REVIEW").length} ready for review</span>
          </div>
          <ContactFilterBar contactFilter={contactFilter} setContactFilter={setContactFilter} />
          <div className="engine-package-review-grid">
            {filteredResults.map((result) => (
              <PackageReviewCard
                actioning={packageActioning}
                key={result.id}
                onAction={runPackageAction}
                onReview={openPackageReview}
                result={result}
              />
            ))}
          </div>
          {filteredResults.length === 0 && <EmptyState title="No packages match this contact filter" body="Choose a broader contact filter to review the rest of this batch." action={() => setContactFilter("all")} />}
        </section>
      ) : null}

      {best && <BestProspect result={best} onOpenProspect={onOpenProspect} />}

      {latestJob?.results.length ? (
        <section className="engine-panel engine-top-results">
          <div className="engine-panel__head"><div><h2>{latestJob.input.prospectType === "no_website_social_only" ? "No Website / Social Only Prospects" : latestJob.input.prospectType === "all" ? "Ranked Prospects Across All Types" : "Ranked Top Prospects"}</h2><p>{latestJob.input.prospectType === "no_website_social_only" ? "Kept separate from redesign prospects and ranked by presence gap, activity, contactability, and local fit." : latestJob.input.prospectType === "all" ? "Redesign and no-website opportunities are ranked together using the scoring model appropriate to each business." : `${modeLabels[latestJob.input.mode]} ranks qualified local businesses by a public-data sales heuristic, not verified revenue.`}</p></div><span>{latestJob.results.length} ready for review</span></div>
          {latestJob.status === "COMPLETED" && latestJob.results.length < latestJob.input.finalProspectsWanted && (
            <p className="engine-skip-summary">{latestJob.input.prospectType === "no_website_social_only" ? `Only ${latestJob.results.length} active no-website prospects found. Increase radius or scan count to find more.` : `Only ${latestJob.results.length} prospects matched ${modeLabels[latestJob.input.mode]}. Choose a broader prospect mode or adjust the next batch.`}</p>
          )}
          <ContactFilterBar contactFilter={contactFilter} setContactFilter={setContactFilter} />
          <div className="engine-top-table" role="table" aria-label="Top prospects">
            <div className="engine-top-table__head" role="row"><span>Rank / Business</span><span>Contact</span><span>Scores</span><span>Opportunity</span><span>Status</span><span>Actions</span></div>
            {filteredResults.map((result) => (
              <article key={result.id} role="row">
                <div><strong>#{result.rank ?? "Pending"} {result.prospect.businessName}</strong><span>{result.prospect.trade} · {result.prospect.city}, {result.prospect.state}</span><ProspectPresenceLink result={result} /></div>
                <div><span>{result.prospect.phone || "No public phone"}</span><span>{result.prospect.email || "No public email"}</span></div>
                <SalesScoreBreakdown result={result} />
                <div><b>{result.mainWeakness}</b><span>{result.whyMayBuy}</span><em>{result.pitchAngle}</em></div>
                <div><i className={`engine-package-state engine-package-state--${result.packageStatus.toLowerCase().replaceAll("_", "-")}`}>{outreachPackageStatusLabel(result.packageStatus)}</i><span>{result.prospect.status}</span></div>
                <div className="engine-result-actions">
                  <button className="engine-button" onClick={() => onOpenProspect(result.prospect.id)} type="button">Review</button>
                  <a className="engine-button" href={`/engine/previews/${result.prospect.id}`} target="_blank">Open preview</a>
                  <button className="engine-button" onClick={() => openPackageReview(result)} type="button">Review package</button>
                  <button className="engine-button" disabled={packageActioning.startsWith(`${result.id}:`) || result.packageStatus === "SENT"} onClick={() => void runPackageAction(result, "generate")} type="button">Generate Outreach Package</button>
                  <button className="engine-button" onClick={() => setPromptResult(result)} type="button">Open Lovable prompt</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : !latestJob || latestJob.status === "COMPLETED" ? (
        <section className="engine-panel"><EmptyState title="No ranked Top Prospects yet" body={latestJob ? latestJob.input.prospectType === "no_website_social_only" ? "No active, contactable no-website prospects matched this search. Increase radius or scan count." : `No prospects matched ${modeLabels[latestJob.input.mode]}. Choose a broader prospect mode or adjust the next batch.` : "Start a search to discover, qualify, analyze, and rank local contractor businesses."} /></section>
      ) : null}

      {latestJob?.reviewedNotRecommended.length ? (
        <section className="engine-panel engine-top-results">
          <div className="engine-panel__head"><div><h2>Reviewed but not recommended</h2><p>{latestJob.input.prospectType === "no_website_social_only" ? "Active no-website leads that did not meet the contactability or website-need threshold." : "Analyzed leads that did not meet the selected mode's sales-fit threshold."}</p></div><span>{latestJob.reviewedNotRecommended.length} reviewed</span></div>
          <div className="engine-top-table" role="table" aria-label="Reviewed but not recommended prospects">
            <div className="engine-top-table__head" role="row"><span>Reason / Business</span><span>Contact</span><span>Scores</span><span>Opportunity</span><span>Status</span><span>Actions</span></div>
            {filteredReviewedNotRecommended.map((result) => (
              <article key={result.id} role="row">
                <div><strong>{result.rejectionReason}</strong><span>{result.prospect.businessName}</span><span>{result.prospect.trade} · {result.prospect.city}, {result.prospect.state}</span><ProspectPresenceLink result={result} /></div>
                <div><span>{result.prospect.phone || "No public phone"}</span><span>{result.prospect.email || "No public email"}</span></div>
                <SalesScoreBreakdown result={result} />
                <div><b>{result.mainWeakness}</b><span>{result.whyMayBuy}</span></div>
                <div><i className={`engine-package-state engine-package-state--${result.packageStatus.toLowerCase().replaceAll("_", "-")}`}>{outreachPackageStatusLabel(result.packageStatus)}</i><span>{result.prospect.status}</span></div>
                <div className="engine-result-actions"><button className="engine-button" onClick={() => onOpenProspect(result.prospect.id)} type="button">Review</button><button className="engine-button" onClick={() => openPackageReview(result)} type="button">Review package</button><button className="engine-button" disabled={packageActioning.startsWith(`${result.id}:`) || result.packageStatus === "SENT"} onClick={() => void runPackageAction(result, "generate")} type="button">Generate Outreach Package</button><button className="engine-button" onClick={() => setPromptResult(result)} type="button">Open Lovable prompt</button></div>
              </article>
            ))}
          </div>
          {filteredReviewedNotRecommended.length === 0 && <EmptyState title="No reviewed leads match this contact filter" body="Choose a broader contact filter to inspect the remaining rejected leads." action={() => setContactFilter("all")} />}
        </section>
      ) : null}

      {promptResult && (
        <div className="engine-dialog-backdrop" onMouseDown={() => setPromptResult(null)}>
          <dialog aria-labelledby="build-prompt-title" className="engine-dialog engine-dialog--wide" onMouseDown={(event) => event.stopPropagation()} open>
            <header><div><p>Optional website builder handoff</p><h2 id="build-prompt-title">{promptResult.prospect.businessName} build prompt</h2></div><button aria-label="Close" onClick={() => setPromptResult(null)} type="button">Close</button></header>
            <div className="engine-build-prompt"><p>This copy-ready prompt works with Lovable, Bolt, v0, or a manual build. The in-engine preview works independently and the prompt avoids invented business claims.</p><pre>{promptResult.buildPrompt}</pre></div>
            <footer><a className="engine-button" href="https://lovable.dev/" rel="noreferrer" target="_blank">Open Lovable</a><a className="engine-button" href="https://bolt.new/" rel="noreferrer" target="_blank">Open Bolt</a><a className="engine-button" href="https://v0.dev/" rel="noreferrer" target="_blank">Open v0</a><button className="engine-button engine-button--primary" onClick={() => void copyPrompt(promptResult)} type="button">{copied === promptResult.id ? "Prompt copied" : "Copy build prompt"}</button></footer>
          </dialog>
        </div>
      )}

      {outreachResult?.prospect.outreach && (
        <div className="engine-dialog-backdrop" onMouseDown={() => setOutreachResult(null)}>
          <dialog aria-labelledby="outreach-draft-title" className="engine-dialog engine-dialog--wide" onMouseDown={(event) => event.stopPropagation()} open>
            <header><div><p>{outreachPackageStatusLabel(outreachResult.packageStatus)}</p><h2 id="outreach-draft-title">{outreachResult.prospect.businessName} Outreach Package</h2></div><button aria-label="Close" onClick={() => setOutreachResult(null)} type="button">Close</button></header>
            <div className="engine-package-dialog">
              <div className="engine-package-dialog__summary">
                <div><span>Recommended pitch angle</span><p>{outreachResult.pitchAngle}</p></div>
                <div><span>Prospect classification</span><p>{classificationLabels[outreachResult.prospect.classification]}</p></div>
                <div><span>Recommended contact</span><p>{contactMethodLabels[outreachResult.prospect.recommendedContactMethod]}</p></div>
                <div><span>Public preview link</span><a href={outreachResult.previewLink} rel="noreferrer" target="_blank">{outreachResult.previewLink}</a><small>Safe to include in a prospect email. Internal Prospect Engine pages remain protected.</small></div>
              </div>
              <section className="engine-email-quality" aria-label="Email quality checks">
                <div className="engine-copy-head"><h3>Email quality checks</h3><b className={outreachResult.emailQuality.ready ? "is-ready" : "needs-fixes"}>{outreachResult.emailQuality.readinessLabel}</b></div>
                <ul>
                  {outreachResult.emailQuality.checks.map((check) => (
                    <li className={check.passed ? "is-passed" : "is-failed"} key={check.key}>
                      <b>{check.passed ? "Pass" : "Fix"}</b>
                      <span>{check.label}</span>
                    </li>
                  ))}
                </ul>
                {!outreachResult.emailQuality.ready && <p className="engine-copy-warning">Email copy is blocked until this package is send-ready. Current blocker: {outreachResult.emailQuality.readinessLabel}.</p>}
              </section>
              <section><h3>Subject lines</h3><ul>{outreachResult.prospect.outreach.subjects.map((subject) => <li key={subject}>{subject}</li>)}</ul></section>
              <section><div className="engine-copy-head"><h3>Short email with preview</h3><button className="engine-button" disabled={!outreachResult.emailQuality.ready} onClick={() => void copyText(`${outreachResult.id}:short`, outreachResult.prospect.outreach!.concise)} type="button">{copied === `${outreachResult.id}:short` ? "Copied" : "Copy short email"}</button></div><pre>{outreachResult.prospect.outreach.concise}</pre></section>
              <section><div className="engine-copy-head"><h3>Detailed email with preview</h3><button className="engine-button" disabled={!outreachResult.emailQuality.ready} onClick={() => void copyText(`${outreachResult.id}:detailed`, outreachResult.prospect.outreach!.detailed)} type="button">{copied === `${outreachResult.id}:detailed` ? "Copied" : "Copy detailed email"}</button></div><pre>{outreachResult.prospect.outreach.detailed}</pre></section>
              <section><h3>Follow-ups</h3>{outreachResult.prospect.outreach.followUps.map((followUp, index) => <div className="engine-package-follow-up" key={followUp}><b>Follow-up {index + 1}</b><pre>{followUp}</pre></div>)}</section>
            </div>
            <footer>
              <button className="engine-button" disabled={packageActioning.startsWith(`${outreachResult.id}:`) || outreachResult.packageStatus === "SENT"} onClick={() => void runPackageAction(outreachResult, "skip")} type="button">Skip</button>
              <a className="engine-button" href={outreachResult.previewLink} rel="noreferrer" target="_blank">Open full preview</a>
              <button className="engine-button" onClick={() => { setPromptResult(outreachResult); setOutreachResult(null); }} type="button">Open build prompt</button>
              {outreachResult.packageStatus === "APPROVED_TO_SEND"
                ? <button className="engine-button engine-button--primary" disabled={packageActioning.startsWith(`${outreachResult.id}:`)} onClick={() => void runPackageAction(outreachResult, "mark_sent")} type="button">Mark Sent</button>
                : outreachResult.packageStatus !== "SENT" && outreachResult.packageStatus !== "SKIPPED"
                  ? <button className="engine-button engine-button--primary" disabled={packageActioning.startsWith(`${outreachResult.id}:`) || !outreachResult.emailQuality.ready} onClick={() => void runPackageAction(outreachResult, "approve")} type="button">Approve to Send</button>
                  : null}
            </footer>
          </dialog>
        </div>
      )}
    </div>
  );
}

function ContactFilterBar({
  contactFilter,
  setContactFilter,
}: {
  contactFilter: ContactFilter;
  setContactFilter: (filter: ContactFilter) => void;
}) {
  return (
    <div className="engine-contact-filters" aria-label="Contact filters">
      <label>Contact filter<select onChange={(event) => setContactFilter(event.target.value as ContactFilter)} value={contactFilter}>
        <option value="all">All contacts</option>
        <option value="email">Email available</option>
        <option value="form">Contact form available</option>
        <option value="social">Social message available</option>
        <option value="hide_phone_only">Hide phone-only leads</option>
        <option value="send_ready">Send-ready only</option>
        <option value="needs_research">Needs contact research</option>
      </select></label>
    </div>
  );
}

function PackageReviewCard({
  actioning,
  onAction,
  onReview,
  result,
}: {
  actioning: string;
  onAction: (result: TopProspectResult, action: OutreachPackageAction) => Promise<void>;
  onReview: (result: TopProspectResult) => void;
  result: TopProspectResult;
}) {
  const preview = result.prospect.preview;
  const profile = previewStyleProfile(result.prospect, preview);
  const busy = actioning.startsWith(`${result.id}:`);
  const generated = result.packageStatus !== "NOT_GENERATED" && result.packageStatus !== "SKIPPED";
  const reviewable = generated && result.packageStatus !== "SENT";
  const approvable = result.emailQuality.ready && (result.packageStatus === "PACKAGE_GENERATED" || result.packageStatus === "READY_FOR_REVIEW");
  const miniStyle = {
    "--package-primary": profile.primaryColor,
    "--package-accent": profile.accentColor,
    "--package-soft": profile.softSurfaceColor,
    "--package-ink": profile.inkColor,
  } as CSSProperties;
  const emailSummary = result.prospect.outreach?.concise.split("\n").filter(Boolean).slice(1, 3).join(" ") ?? "Generate the package to create the personalized email sequence.";

  return (
    <article className="engine-package-card">
      <header>
        <div><span>#{result.rank ?? "Pending"} {result.prospect.trade}</span><h3>{result.prospect.businessName}</h3></div>
        <i className={`engine-package-state engine-package-state--${result.packageStatus.toLowerCase().replaceAll("_", "-")}`}>{outreachPackageStatusLabel(result.packageStatus)}</i>
      </header>
      <div className="engine-package-mini-preview" style={miniStyle}>
        <span>{result.prospect.city}, {result.prospect.state}</span>
        <strong>{preview?.heroHeadline ?? `${result.prospect.trade} service made easier to trust.`}</strong>
        <i>{profile.ctaLabel}</i>
      </div>
      <div className="engine-package-card__copy">
        <span>Prospect type</span>
        <p><b>{classificationLabels[result.prospect.classification]}</b></p>
        <span>Recommended contact</span>
        <p>{contactMethodLabels[result.prospect.recommendedContactMethod]}</p>
        <span>Email quality</span>
        <p><b>{result.emailQuality.readinessLabel}</b></p>
        <span>Recommended pitch</span>
        <p>{result.pitchAngle}</p>
        <span>Email preview</span>
        <p>{emailSummary}</p>
      </div>
      <div className="engine-package-card__actions">
        <button className="engine-button" disabled={busy || result.packageStatus === "SENT"} onClick={() => void onAction(result, "generate")} type="button">Generate Outreach Package</button>
        <button className="engine-button" disabled={busy || !reviewable} onClick={() => onReview(result)} type="button">Review preview + email</button>
        {result.packageStatus === "APPROVED_TO_SEND"
          ? <button className="engine-button engine-button--primary" disabled={busy} onClick={() => void onAction(result, "mark_sent")} type="button">Mark Sent</button>
          : <button className="engine-button engine-button--primary" disabled={busy || !approvable} onClick={() => void onAction(result, "approve")} type="button">Approve</button>}
        <button className="engine-button" disabled={busy || result.packageStatus === "SENT" || result.packageStatus === "SKIPPED"} onClick={() => void onAction(result, "skip")} type="button">Skip</button>
      </div>
    </article>
  );
}

function BestProspect({ result, onOpenProspect }: { result: TopProspectResult; onOpenProspect: (id: string) => void }) {
  return (
    <section className="engine-best-prospect">
      <div><span>Best Prospect Today</span><h2>{result.prospect.businessName}</h2><p>{result.whyMayBuy}</p></div>
      <div><strong>{result.salesScores.weightedSalesScore}</strong><span>{result.presenceScores ? "Final Sales Score" : "Weighted Sales Score"}</span></div>
      <div><b>Recommended next action</b><p>Review the assessment and preview, verify the public contact details, then approve a personal outreach draft.</p><button className="engine-button engine-button--primary" onClick={() => onOpenProspect(result.prospect.id)} type="button">Review best prospect</button></div>
    </section>
  );
}

function SalesScoreBreakdown({ result }: { result: TopProspectResult }) {
  if (result.presenceScores) {
    return (
      <div className="engine-sales-score-grid">
        <span>Final sales score <b>{result.presenceScores.finalSalesScore}</b></span>
        <span>Website need <b>{result.presenceScores.websiteNeedScore}</b></span>
        <span>Online presence gap <b>{result.presenceScores.onlinePresenceGapScore}</b></span>
        <span>Contactability <b>{result.presenceScores.contactabilityScore}</b></span>
        <span>Business activity <b>{result.presenceScores.businessActivityScore}</b></span>
        <span>Local fit <b>{result.presenceScores.localFitScore}</b></span>
      </div>
    );
  }
  const scores = result.salesScores;
  return (
    <div className="engine-sales-score-grid">
      <span>Final weighted sales <b>{scores.weightedSalesScore}</b></span>
      <span>Website quality <b>{scores.websiteQualityScore}</b></span>
      <span>Opportunity <b>{result.opportunityScore}</b></span>
      <span>Revenue opportunity <b>{scores.revenueOpportunityScore}</b></span>
      <span>Contactability <b>{scores.contactabilityScore}</b></span>
      <span>Local competitiveness <b>{scores.localMarketCompetitivenessScore}</b></span>
      <span>AI replacement confidence <b>{scores.aiReplacementConfidenceScore}</b></span>
    </div>
  );
}

function ProspectPresenceLink({ result }: { result: TopProspectResult }) {
  const url = result.prospect.website || result.prospect.profileUrl;
  const presenceLabels = prospectPresenceLabels(result.prospect);
  return (
    <div className="engine-presence-summary">
      <span>{classificationLabels[result.prospect.classification]}</span>
      <span>{contactMethodLabels[result.prospect.recommendedContactMethod]}</span>
      {presenceLabels.map((label) => <i key={label}>{label}</i>)}
      {url ? <a href={safeWebsite(url)} rel="noreferrer" target="_blank">{result.prospect.website ? result.prospect.website : "Open public profile"}</a> : <span>No public profile link</span>}
    </div>
  );
}
