"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import { AutonomousGrowthWorkspace } from "@/components/engine/AutonomousGrowthWorkspace";
import { DiscoveryFunnel } from "@/components/engine/DiscoveryFunnel";
import { ProspectDetail, type DetailTab } from "@/components/engine/ProspectDetail";
import { SystemWorkspace, type SystemPayload } from "@/components/engine/SystemWorkspace";
import { TopProspectsWorkspace } from "@/components/engine/TopProspectsWorkspace";
import type { DiscoveredLead, DiscoveryDiagnostics } from "@/lib/lead-discovery";
import {
  activity,
  createProspect,
  displayStateCode,
  displayTradeCategory,
  normalizeTradeCategory,
  prospectPresenceLabels,
  prospectWrittenContactMethodIsUsable,
  prospectSortOptions,
  prospectStatuses,
  sortProspects,
  titleCaseLocation,
  tradeCategories,
  withOutreach,
  withPresenceGapReview,
  withPreview,
  type Prospect,
  type ProspectSort,
  type ProspectStatus,
  type TradeCategory,
} from "@/lib/prospect-engine";

type WorkspaceTab = "Overview" | "Top Prospects" | "Prospects" | "Pipeline" | "Autonomous Growth" | "System";
type ContactFilter = "all" | "email" | "form" | "social" | "hide_phone_only" | "send_ready" | "needs_research";

function matchesContactFilter(prospect: Prospect, filter: ContactFilter) {
  if (filter === "all") return true;
  if (filter === "email") return Boolean(prospect.email);
  if (filter === "form") return Boolean(prospect.contactFormUrl);
  if (filter === "social") return prospect.recommendedContactMethod === "message_on_facebook" || prospect.recommendedContactMethod === "message_on_social";
  if (filter === "hide_phone_only") return prospect.classification !== "phone_only" && prospect.recommendedContactMethod !== "call_first";
  if (filter === "send_ready") return Boolean(prospect.outreach?.approved) && prospectWrittenContactMethodIsUsable(prospect);
  return prospect.recommendedContactMethod === "needs_manual_contact_research" || prospect.classification === "phone_only";
}
type SyncState = "loading" | "saved" | "saving" | "error";

function prospectLocationLine(prospect: Pick<Prospect, "trade" | "city" | "state">) {
  return `${displayTradeCategory(prospect.trade)} · ${titleCaseLocation(prospect.city)}, ${displayStateCode(prospect.state)}`;
}

export function ProspectEngine() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("Overview");
  const [detailTab, setDetailTab] = useState<DetailTab>("Analysis");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState<"All" | TradeCategory>("All");
  const [status, setStatus] = useState<"All" | ProspectStatus>("All");
  const [sort, setSort] = useState<ProspectSort>("priority");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showLeadSearch, setShowLeadSearch] = useState(false);
  const [discoveredLeads, setDiscoveredLeads] = useState<DiscoveredLead[]>([]);
  const [discoveryDiagnostics, setDiscoveryDiagnostics] = useState<DiscoveryDiagnostics | null>(null);
  const [discoveryState, setDiscoveryState] = useState<"idle" | "loading" | "error">("idle");
  const [discoveryError, setDiscoveryError] = useState("");
  const [note, setNote] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [syncError, setSyncError] = useState("");
  const [persistenceMode, setPersistenceMode] = useState<"memory" | "postgresql">("memory");
  const [system, setSystem] = useState<SystemPayload | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState("");
  const [selfCheckRunning, setSelfCheckRunning] = useState(false);
  const saveQueue = useRef<Promise<Prospect | null>>(Promise.resolve(null));

  const loadProspects = useCallback(async () => {
    setSyncState("loading");
    setSyncError("");
    try {
      const response = await fetch("/api/engine/prospects", { cache: "no-store" });
      const payload = (await response.json()) as {
        prospects?: Prospect[];
        persistence?: "memory" | "postgresql";
        error?: string;
      };
      if (!response.ok || !payload.prospects) throw new Error(payload.error || "Unable to load prospects.");
      setProspects(payload.prospects);
      setSelectedId((current) => payload.prospects?.some((prospect) => prospect.id === current) ? current : payload.prospects?.[0]?.id ?? "");
      setPersistenceMode(payload.persistence ?? "memory");
      setSyncState("saved");
    } catch (error) {
      setProspects([]);
      setSelectedId("");
      setSyncError(error instanceof Error ? error.message : "Unable to load prospects.");
      setSyncState("error");
    }
  }, []);

  useEffect(() => {
    void loadProspects();
  }, [loadProspects]);

  async function loadSystem() {
    setSystemLoading(true);
    setSystemError("");
    try {
      const response = await fetch("/api/engine/system", { cache: "no-store" });
      const payload = (await response.json()) as SystemPayload;
      if (!response.ok) throw new Error("Unable to load system status.");
      setSystem(payload);
    } catch (error) {
      setSystem(null);
      setSystemError(error instanceof Error ? error.message : "Unable to load system status.");
    } finally {
      setSystemLoading(false);
    }
  }

  useEffect(() => {
    if (workspaceTab === "System") void loadSystem();
  }, [workspaceTab]);

  const selected = prospects.find((prospect) => prospect.id === selectedId) ?? prospects[0];
  const prospectStateBlocked = prospects.length === 0 && (syncState === "loading" || syncState === "error");
  const filtered = useMemo(
    () =>
      sortProspects(
        prospects
          .filter((prospect) => trade === "All" || normalizeTradeCategory(prospect.trade) === trade)
          .filter((prospect) => status === "All" || prospect.status === status)
          .filter((prospect) => matchesContactFilter(prospect, contactFilter))
          .filter((prospect) => `${prospect.businessName} ${prospect.city} ${prospect.state}`.toLowerCase().includes(query.toLowerCase())),
      sort,
    ),
    [contactFilter, prospects, query, sort, status, trade],
  );

  const metrics = useMemo(
    () => ({
      total: prospects.length,
      high: prospects.filter((prospect) => prospect.priorityScore >= 70).length,
      contacted: prospects.filter((prospect) => ["Contacted", "Interested", "Proposal Sent"].includes(prospect.status)).length,
      won: prospects.filter((prospect) => prospect.status === "Closed Won").length,
    }),
    [prospects],
  );

  async function persistProspect(prospect: Prospect, method: "POST" | "PUT" = "PUT") {
    setSyncState("saving");
    setSyncError("");
    try {
      const response = await fetch("/api/engine/prospects", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prospect),
      });
      const payload = (await response.json()) as {
        prospect?: Prospect;
        persistence?: "memory" | "postgresql";
        error?: string;
      };
      if (!response.ok || !payload.prospect) throw new Error(payload.error || "Unable to save prospect.");
      setPersistenceMode(payload.persistence ?? "memory");
      setSyncState("saved");
      return payload.prospect;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to save prospect.");
      setSyncState("error");
      return null;
    }
  }

  function queuePersist(prospect: Prospect, method: "POST" | "PUT" = "PUT") {
    saveQueue.current = saveQueue.current.then(() => persistProspect(prospect, method));
    return saveQueue.current;
  }

  function updateSelected(updater: (prospect: Prospect) => Prospect) {
    setProspects((current) =>
      current.map((prospect) => {
        if (prospect.id !== selectedId) return prospect;
        const updated = updater(prospect);
        queueMicrotask(() => void queuePersist(updated));
        return updated;
      }),
    );
  }

  async function addProspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const prospect = createProspect({
      businessName: String(form.get("businessName")),
      website: String(form.get("website")),
      prospectType: String(form.get("website")).trim() ? "redesign" : "no_website_social_only",
      phone: String(form.get("phone")),
      email: String(form.get("email")),
      city: String(form.get("city")),
      state: String(form.get("state")).toUpperCase(),
      trade: String(form.get("trade")) as TradeCategory,
      serviceArea: String(form.get("serviceArea")),
      sizeIndicator: String(form.get("sizeIndicator")) as Prospect["sizeIndicator"],
      status: "New",
    });
    const saved = await queuePersist(prospect, "POST");
    if (!saved) return;
    setProspects((current) => [saved, ...current]);
    setSelectedId(saved.id);
    setShowDiscovery(false);
    setWorkspaceTab("Prospects");
    event.currentTarget.reset();
  }

  async function discoverLeads(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setDiscoveryState("loading");
    setDiscoveryError("");
    setDiscoveryDiagnostics(null);
    try {
      const response = await fetch("/api/engine/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          city: form.get("city"),
          state: form.get("state"),
          trade: form.get("trade"),
          radiusKm: Number(form.get("radiusKm")),
        }),
      });
      const payload = (await response.json()) as { leads?: DiscoveredLead[]; diagnostics?: DiscoveryDiagnostics; error?: string };
      if (!response.ok || !payload.leads) throw new Error(payload.error || "Unable to discover leads.");
      setDiscoveredLeads(payload.leads);
      setDiscoveryDiagnostics(payload.diagnostics ?? null);
      setDiscoveryState("idle");
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : "Unable to discover leads.");
      setDiscoveryState("error");
    }
  }

  async function importLead(lead: DiscoveredLead) {
    const prospect = createProspect({
      ...lead,
      sizeIndicator: "Growing",
      status: "New",
    });
    const saved = await queuePersist(prospect, "POST");
    if (!saved) return;
    setProspects((current) => [saved, ...current]);
    setSelectedId(saved.id);
    setDiscoveredLeads((current) => current.filter((item) => item.website !== lead.website));
  }

  function changeStatus(nextStatus: ProspectStatus) {
    updateSelected((prospect) => ({
      ...prospect,
      status: nextStatus,
      activities: [activity("status", `Pipeline status changed to ${nextStatus}.`), ...prospect.activities],
    }));
  }

  function addNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    updateSelected((prospect) => ({
      ...prospect,
      notes: [note.trim(), ...prospect.notes],
      activities: [activity("note", "Operator note added."), ...prospect.activities],
    }));
    setNote("");
  }

  function analyzeSelected() {
    if (!selected) return;
    setSyncState("saving");
    setSyncError("");
    saveQueue.current = saveQueue.current.then(async () => {
      try {
        const response = await fetch("/api/engine/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selected),
        });
        const payload = (await response.json()) as { prospect?: Prospect; error?: string; warning?: string };
        if (!response.ok || !payload.prospect) throw new Error(payload.error || "Unable to analyze website.");
        setProspects((current) => current.map((prospect) => (prospect.id === payload.prospect!.id ? payload.prospect! : prospect)));
        setSyncState("saved");
        return payload.prospect;
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Unable to analyze website.");
        setSyncState("error");
        return null;
      }
    });
  }

  async function runSelfCheck() {
    setSelfCheckRunning(true);
    setSystemError("");
    try {
      const response = await fetch("/api/engine/system/self-check", { method: "POST" });
      const payload = (await response.json()) as { selfCheck?: SystemPayload["selfCheck"]; error?: string };
      if (!response.ok || !payload.selfCheck) throw new Error(payload.error || "Unable to run System Self-Check.");
      await loadSystem();
      setSystem((current) => current ? { ...current, selfCheck: payload.selfCheck } : current);
    } catch (error) {
      setSystemError(error instanceof Error ? error.message : "Unable to run System Self-Check.");
    } finally {
      setSelfCheckRunning(false);
    }
  }

  function runPresenceGapSelected() {
    updateSelected((prospect) => withPresenceGapReview(
      prospect,
      prospect.websiteStatus === "unknown"
        ? prospect.website ? "broken_website" : "no_owned_website"
        : prospect.websiteStatus === "usable" ? "broken_website" : prospect.websiteStatus,
      prospect.websiteStatusDetail || (prospect.website ? "Website marked as having no usable owned site during manual review." : "No owned website detected."),
    ));
    setDetailTab("Analysis");
  }

  return (
    <div className="engine-shell">
      <aside className="engine-sidebar">
        <div className="engine-brand"><span>W</span><div><b>WebWorkshop</b><small>Prospect Engine</small></div></div>
        <nav aria-label="Prospect Engine">
          {(["Overview", "Top Prospects", "Prospects", "Pipeline", "Autonomous Growth", "System"] as WorkspaceTab[]).map((tab) => (
            <button className={workspaceTab === tab ? "is-active" : ""} key={tab} onClick={() => setWorkspaceTab(tab)} type="button">
              {tab}
            </button>
          ))}
        </nav>
        <div className="engine-compliance">
          <b>Human review and source terms</b>
          <p>Outreach stays in draft until approved. Analysis is user-triggered and robots-aware; review applicable site terms before running it.</p>
        </div>
      </aside>

      <main className="engine-main">
        <header className="engine-topbar">
          <div><p>WebWorkshop sales workspace</p><h1>{workspaceTab}</h1></div>
          <div className="engine-topbar__actions">
            <div className={`engine-sync engine-sync--${syncState}`} role="status">
              <i aria-hidden="true" />
              <span>
                {syncState === "loading"
                  ? "Loading"
                  : syncState === "saving"
                    ? "Saving"
                    : syncState === "error"
                      ? syncError
                      : persistenceMode === "postgresql"
                        ? "PostgreSQL synced"
                        : "Development memory"}
              </span>
            </div>
            <label className="engine-search"><span className="sr-only">Search prospects</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search prospects" value={query} /></label>
            <button className="engine-button" onClick={() => setShowLeadSearch(true)} type="button">Discover leads</button>
            <button className="engine-button engine-button--primary" onClick={() => setShowDiscovery(true)} type="button">Add prospect</button>
          </div>
        </header>

        {syncState === "error" && prospects.length > 0 && (
          <div className="engine-error-banner" role="alert">
            <div><b>Prospect data is not synced</b><p>{syncError}</p></div>
            <button className="engine-button" onClick={() => void loadProspects()} type="button">{prospects.length ? "Reload from server" : "Retry loading"}</button>
          </div>
        )}

        {workspaceTab !== "System" && prospectStateBlocked && (
          <div className="engine-content">
            {syncState === "loading"
              ? <LoadingState title="Loading prospect workspace" body="Retrieving the latest pipeline, analysis, outreach, and activity records." />
              : <EmptyState title="Prospects unavailable" body={syncError} action={() => void loadProspects()} actionLabel="Retry loading" />}
          </div>
        )}

        {workspaceTab === "Overview" && !prospectStateBlocked && (
          <div className="engine-content">
            <section className="engine-metrics" aria-label="Pipeline summary">
              {[
                ["Total prospects", metrics.total, "National-ready lead records"],
                ["High priority", metrics.high, "Strong redesign opportunity"],
                ["Active conversations", metrics.contacted, "Contacted through proposal"],
                ["Closed won", metrics.won, "Converted WebWorkshop clients"],
              ].map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
            </section>
            <section className="engine-overview-grid">
              <div className="engine-panel">
                <div className="engine-panel__head"><div><h2>Priority queue</h2><p>Ranked by website opportunity and business fit.</p></div><button onClick={() => setWorkspaceTab("Prospects")} type="button">View all</button></div>
                <ProspectTable prospects={filtered.slice(0, 5)} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setWorkspaceTab("Prospects"); }} />
              </div>
              <div className="engine-panel engine-focus">
                <div className="engine-panel__head"><div><h2>Today&apos;s focus</h2><p>Move the best-fit leads forward.</p></div></div>
                <ol>
                  <li><b>Analyze the high-priority queue</b><span>{prospects.filter((item) => item.prospectType === "redesign" && !item.analysis && item.websiteStatus === "unknown").length} websites still need review</span></li>
                  <li><b>Approve personal outreach</b><span>{prospects.filter((item) => item.outreach && !item.outreach.approved).length} drafts awaiting approval</span></li>
                  <li><b>Prepare visual concepts</b><span>{prospects.filter((item) => item.analysis && !item.preview).length} qualified leads need previews</span></li>
                </ol>
              </div>
            </section>
          </div>
        )}

        {workspaceTab === "Prospects" && !prospectStateBlocked && (
          <div className="engine-content">
            <div className="engine-filters">
              <label className="engine-mobile-search"><span className="sr-only">Search prospects</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search prospects" value={query} /></label>
              <select aria-label="Filter by trade" onChange={(event) => setTrade(event.target.value as "All" | TradeCategory)} value={trade}><option>All</option>{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value as "All" | ProspectStatus)} value={status}><option>All</option>{prospectStatuses.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter by contact method" onChange={(event) => setContactFilter(event.target.value as ContactFilter)} value={contactFilter}><option value="all">All contacts</option><option value="email">Email available</option><option value="form">Contact form available</option><option value="social">Social message available</option><option value="hide_phone_only">Hide phone-only leads</option><option value="send_ready">Send-ready only</option><option value="needs_research">Needs contact research</option></select>
              <select aria-label="Sort prospects" onChange={(event) => setSort(event.target.value as ProspectSort)} value={sort}>{prospectSortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              <span>{filtered.length} matching prospects</span>
            </div>
            <div className="engine-workspace">
              <section className="engine-panel engine-list-panel">
                <ProspectTable prospects={filtered} selectedId={selectedId} onSelect={setSelectedId} />
                {filtered.length === 0 && <EmptyState title="No prospects match these filters" body="Clear a filter or add a prospect to continue building the queue." action={() => { setTrade("All"); setStatus("All"); setContactFilter("all"); setQuery(""); }} />}
              </section>
              {selected ? <ProspectDetail prospect={selected} detailTab={detailTab} setDetailTab={setDetailTab} onAnalyze={analyzeSelected} onPresenceGap={runPresenceGapSelected} onOutreach={() => updateSelected(withOutreach)} onPreview={() => updateSelected(withPreview)} onStatus={changeStatus} note={note} setNote={setNote} addNote={addNote} updateSelected={updateSelected} /> : <EmptyState title="Select a prospect" body="Choose a lead to review its analysis and outreach work." />}
            </div>
          </div>
        )}

        {workspaceTab === "Top Prospects" && (
          <TopProspectsWorkspace
            onOpenProspect={(id) => { setSelectedId(id); setWorkspaceTab("Prospects"); }}
            onProspectsChanged={loadProspects}
          />
        )}

        {workspaceTab === "Pipeline" && !prospectStateBlocked && (
          <div className="engine-content engine-pipeline">
            {prospectStatuses.map((column) => (
              <section key={column}><header><h2>{column}</h2><span>{prospects.filter((prospect) => prospect.status === column).length}</span></header>
                <div>{prospects.filter((prospect) => prospect.status === column).map((prospect) => (
                  <button key={prospect.id} onClick={() => { setSelectedId(prospect.id); setWorkspaceTab("Prospects"); }} type="button">
                    <b>{prospect.businessName}</b><span>{prospectLocationLine(prospect)}</span><em>{prospect.priorityScore} priority</em>
                  </button>
                ))}</div>
              </section>
            ))}
          </div>
        )}

        {workspaceTab === "Autonomous Growth" && (
          <AutonomousGrowthWorkspace />
        )}

        {workspaceTab === "System" && (
          <SystemWorkspace
            error={systemError}
            loading={systemLoading}
            onRefresh={() => void loadSystem()}
            onRunSelfCheck={() => void runSelfCheck()}
            selfCheckRunning={selfCheckRunning}
            system={system}
          />
        )}
      </main>

      {showDiscovery && <DiscoveryDialog onClose={() => setShowDiscovery(false)} onSubmit={addProspect} />}
      {showLeadSearch && <LeadSearchDialog diagnostics={discoveryDiagnostics} existingWebsites={new Set(prospects.map((prospect) => prospect.website))} leads={discoveredLeads} state={discoveryState} error={discoveryError} onClose={() => setShowLeadSearch(false)} onDiscover={discoverLeads} onImport={importLead} />}
    </div>
  );
}

function ProspectTable({ prospects, selectedId, onSelect }: { prospects: Prospect[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="engine-table" role="table" aria-label="Prospects"><div className="engine-table__head" role="row"><span>Prospect</span><span>Status</span><span>Website / presence</span><span>Priority</span></div>{prospects.map((prospect) => { const labels = prospectPresenceLabels(prospect); const state = prospect.analysis ? `${prospect.analysis.overallScore}/100` : prospect.websiteStatus === "unknown" ? "Not analyzed" : prospect.websiteStatusDetail || "Presence Gap analysis"; return <button className={prospect.id === selectedId ? "is-selected" : ""} key={prospect.id} onClick={() => onSelect(prospect.id)} role="row" type="button"><span><b>{prospect.businessName}</b><small>{prospectLocationLine(prospect)}</small></span><span><i className={`engine-status engine-status--${prospect.status.toLowerCase().replaceAll(" ", "-")}`}>{prospect.status}</i></span><span className="engine-table-presence"><b>{state}</b>{labels.slice(0, 2).map((label) => <small key={label}>{label}</small>)}</span><span><strong>{prospect.priorityScore}</strong></span></button>; })}</div>;
}

function DiscoveryDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="engine-dialog-backdrop" onMouseDown={onClose}><dialog aria-labelledby="discovery-title" className="engine-dialog" onMouseDown={(event) => event.stopPropagation()} open><header><div><p>Lead discovery</p><h2 id="discovery-title">Add a contractor prospect</h2></div><button aria-label="Close" onClick={onClose} type="button">×</button></header><form onSubmit={onSubmit}><div className="engine-form-grid"><label>Business name<input name="businessName" required /></label><label>Website (optional)<input name="website" placeholder="https://" type="url" /></label><label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Business size<select name="sizeIndicator"><option>Small</option><option>Growing</option><option>Established</option></select></label><label>City<span>Enter one city at a time.</span><input name="city" required /></label><label>State<input maxLength={2} name="state" required /></label><label>Phone<input name="phone" required type="tel" /></label><label>Public email<input name="email" type="email" /></label><label className="engine-form-wide">Service area<input name="serviceArea" placeholder="City and nearby communities" required /></label></div><footer><button className="engine-button" onClick={onClose} type="button">Cancel</button><button className="engine-button engine-button--primary" type="submit">Add to discovery queue</button></footer></form></dialog></div>;
}

function LeadSearchDialog({ diagnostics, existingWebsites, leads, state, error, onClose, onDiscover, onImport }: { diagnostics: DiscoveryDiagnostics | null; existingWebsites: Set<string>; leads: DiscoveredLead[]; state: "idle" | "loading" | "error"; error: string; onClose: () => void; onDiscover: (event: FormEvent<HTMLFormElement>) => void; onImport: (lead: DiscoveredLead) => void }) {
  return <div className="engine-dialog-backdrop" onMouseDown={onClose}><dialog aria-labelledby="lead-search-title" className="engine-dialog engine-dialog--wide" onMouseDown={(event) => event.stopPropagation()} open><header><div><p>Public-data discovery</p><h2 id="lead-search-title">Find contractor websites</h2></div><button aria-label="Close" onClick={onClose} type="button">×</button></header><form className="engine-discovery-form" onSubmit={onDiscover}><label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>City<span>Enter one city at a time.</span><input name="city" required /></label><label>State<input maxLength={2} name="state" required /></label><label>Radius<select name="radiusKm"><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label><button className="engine-button engine-button--primary" disabled={state === "loading"} type="submit">{state === "loading" ? "Searching" : "Find leads"}</button></form>{state === "error" && <p className="engine-dialog-error" role="alert">{error}</p>}{diagnostics && <DiscoveryFunnel diagnostics={diagnostics} />}<div className="engine-discovery-results">{leads.length === 0 && state !== "loading" ? <EmptyState title="No discovery results yet" body="Search one trade and location at a time. Results with usable public websites will appear here for review." /> : leads.map((lead) => { const exists = existingWebsites.has(lead.website); return <article key={lead.website}><div><b>{lead.businessName}</b><span>{prospectLocationLine(lead)}</span>{lead.sources?.length ? <span>{lead.sourceConfidence ?? 0}% source confidence · {lead.sources.join(", ")}</span> : null}<a href={lead.website} rel="noreferrer" target="_blank">{lead.website}</a></div><button className="engine-button" disabled={exists} onClick={() => onImport(lead)} type="button">{exists ? "Already added" : "Import prospect"}</button></article>; })}</div><footer><p>Searches are user-triggered, rate-limited, and merge approved public-data sources. Review every lead before outreach.</p><button className="engine-button" onClick={onClose} type="button">Close</button></footer></dialog></div>;
}
