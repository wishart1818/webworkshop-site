"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { DiscoveredLead } from "@/lib/lead-discovery";
import {
  activity,
  createProspect,
  prospectStatuses,
  scoreLabels,
  seedProspects,
  tradeCategories,
  withOutreach,
  withPreview,
  type Prospect,
  type ProspectStatus,
  type ScoreKey,
  type TradeCategory,
} from "@/lib/prospect-engine";

type WorkspaceTab = "Overview" | "Prospects" | "Pipeline";
type DetailTab = "Analysis" | "Outreach" | "Preview" | "Activity";
type SyncState = "loading" | "saved" | "saving" | "error";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

function safeWebsiteUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "#";
  } catch {
    return "#";
  }
}

function ScoreRing({ value }: { value: number }) {
  return (
    <span className="engine-score" style={{ "--score": `${value * 3.6}deg` } as React.CSSProperties}>
      <b>{value}</b>
    </span>
  );
}

export function ProspectEngine() {
  const [prospects, setProspects] = useState<Prospect[]>(seedProspects);
  const [selectedId, setSelectedId] = useState(seedProspects[0].id);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("Overview");
  const [detailTab, setDetailTab] = useState<DetailTab>("Analysis");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState<"All" | TradeCategory>("All");
  const [status, setStatus] = useState<"All" | ProspectStatus>("All");
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showLeadSearch, setShowLeadSearch] = useState(false);
  const [discoveredLeads, setDiscoveredLeads] = useState<DiscoveredLead[]>([]);
  const [discoveryState, setDiscoveryState] = useState<"idle" | "loading" | "error">("idle");
  const [discoveryError, setDiscoveryError] = useState("");
  const [note, setNote] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [syncError, setSyncError] = useState("");
  const [persistenceMode, setPersistenceMode] = useState<"memory" | "postgresql">("memory");
  const saveQueue = useRef<Promise<Prospect | null>>(Promise.resolve(null));

  useEffect(() => {
    async function loadProspects() {
      try {
        const response = await fetch("/api/engine/prospects", { cache: "no-store" });
        const payload = (await response.json()) as {
          prospects?: Prospect[];
          persistence?: "memory" | "postgresql";
          error?: string;
        };
        if (!response.ok || !payload.prospects) throw new Error(payload.error || "Unable to load prospects.");
        setProspects(payload.prospects);
        setSelectedId(payload.prospects[0]?.id ?? "");
        setPersistenceMode(payload.persistence ?? "memory");
        setSyncState("saved");
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Unable to load prospects.");
        setSyncState("error");
      }
    }
    void loadProspects();
  }, []);

  const selected = prospects.find((prospect) => prospect.id === selectedId) ?? prospects[0];
  const filtered = useMemo(
    () =>
      prospects
        .filter((prospect) => trade === "All" || prospect.trade === trade)
        .filter((prospect) => status === "All" || prospect.status === status)
        .filter((prospect) => `${prospect.businessName} ${prospect.city} ${prospect.state}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => b.priorityScore - a.priorityScore),
    [prospects, query, status, trade],
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
      const payload = (await response.json()) as { leads?: DiscoveredLead[]; error?: string };
      if (!response.ok || !payload.leads) throw new Error(payload.error || "Unable to discover leads.");
      setDiscoveredLeads(payload.leads);
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
        const payload = (await response.json()) as { prospect?: Prospect; error?: string };
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

  return (
    <div className="engine-shell">
      <aside className="engine-sidebar">
        <div className="engine-brand"><span>W</span><div><b>WebWorkshop</b><small>Prospect Engine</small></div></div>
        <nav aria-label="Prospect Engine">
          {(["Overview", "Prospects", "Pipeline"] as WorkspaceTab[]).map((tab) => (
            <button className={workspaceTab === tab ? "is-active" : ""} key={tab} onClick={() => setWorkspaceTab(tab)} type="button">
              {tab}
            </button>
          ))}
        </nav>
        <div className="engine-compliance">
          <b>Human approval required</b>
          <p>Outreach stays in draft until an operator approves it. No mass sending.</p>
        </div>
      </aside>

      <main className="engine-main">
        <header className="engine-topbar">
          <div><p>WebWorkshop sales workspace</p><h1>{workspaceTab}</h1></div>
          <div className="engine-topbar__actions">
            <div className={`engine-sync engine-sync--${syncState}`} role={syncState === "error" ? "alert" : "status"}>
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

        {workspaceTab === "Overview" && (
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
                  <li><b>Analyze the high-priority queue</b><span>{prospects.filter((item) => !item.analysis).length} websites still need review</span></li>
                  <li><b>Approve personal outreach</b><span>{prospects.filter((item) => item.outreach && !item.outreach.approved).length} drafts awaiting approval</span></li>
                  <li><b>Prepare visual concepts</b><span>{prospects.filter((item) => item.analysis && !item.preview).length} qualified leads need previews</span></li>
                </ol>
              </div>
            </section>
          </div>
        )}

        {workspaceTab === "Prospects" && (
          <div className="engine-content">
            <div className="engine-filters">
              <label className="engine-mobile-search"><span className="sr-only">Search prospects</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search prospects" value={query} /></label>
              <select aria-label="Filter by trade" onChange={(event) => setTrade(event.target.value as "All" | TradeCategory)} value={trade}><option>All</option>{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value as "All" | ProspectStatus)} value={status}><option>All</option>{prospectStatuses.map((item) => <option key={item}>{item}</option>)}</select>
              <span>{filtered.length} matching prospects</span>
            </div>
            <div className="engine-workspace">
              <section className="engine-panel engine-list-panel">
                <ProspectTable prospects={filtered} selectedId={selectedId} onSelect={setSelectedId} />
                {filtered.length === 0 && <EmptyState title="No prospects match these filters" body="Clear a filter or add a prospect to continue building the queue." action={() => { setTrade("All"); setStatus("All"); setQuery(""); }} />}
              </section>
              {selected ? <ProspectDetail prospect={selected} detailTab={detailTab} setDetailTab={setDetailTab} onAnalyze={analyzeSelected} onOutreach={() => updateSelected(withOutreach)} onPreview={() => updateSelected(withPreview)} onStatus={changeStatus} note={note} setNote={setNote} addNote={addNote} updateSelected={updateSelected} /> : <EmptyState title="Select a prospect" body="Choose a lead to review its analysis and outreach work." />}
            </div>
          </div>
        )}

        {workspaceTab === "Pipeline" && (
          <div className="engine-content engine-pipeline">
            {prospectStatuses.map((column) => (
              <section key={column}><header><h2>{column}</h2><span>{prospects.filter((prospect) => prospect.status === column).length}</span></header>
                <div>{prospects.filter((prospect) => prospect.status === column).map((prospect) => (
                  <button key={prospect.id} onClick={() => { setSelectedId(prospect.id); setWorkspaceTab("Prospects"); }} type="button">
                    <b>{prospect.businessName}</b><span>{prospect.trade} · {prospect.city}, {prospect.state}</span><em>{prospect.priorityScore} priority</em>
                  </button>
                ))}</div>
              </section>
            ))}
          </div>
        )}
      </main>

      {showDiscovery && <DiscoveryDialog onClose={() => setShowDiscovery(false)} onSubmit={addProspect} />}
      {showLeadSearch && <LeadSearchDialog existingWebsites={new Set(prospects.map((prospect) => prospect.website))} leads={discoveredLeads} state={discoveryState} error={discoveryError} onClose={() => setShowLeadSearch(false)} onDiscover={discoverLeads} onImport={importLead} />}
    </div>
  );
}

function ProspectTable({ prospects, selectedId, onSelect }: { prospects: Prospect[]; selectedId: string; onSelect: (id: string) => void }) {
  return <div className="engine-table" role="table" aria-label="Prospects"><div className="engine-table__head" role="row"><span>Prospect</span><span>Status</span><span>Website score</span><span>Priority</span></div>{prospects.map((prospect) => <button className={prospect.id === selectedId ? "is-selected" : ""} key={prospect.id} onClick={() => onSelect(prospect.id)} role="row" type="button"><span><b>{prospect.businessName}</b><small>{prospect.trade} · {prospect.city}, {prospect.state}</small></span><span><i className={`engine-status engine-status--${prospect.status.toLowerCase().replaceAll(" ", "-")}`}>{prospect.status}</i></span><span>{prospect.analysis ? `${prospect.analysis.overallScore}/100` : "Not analyzed"}</span><span><strong>{prospect.priorityScore}</strong></span></button>)}</div>;
}

function ProspectDetail({ prospect, detailTab, setDetailTab, onAnalyze, onOutreach, onPreview, onStatus, note, setNote, addNote, updateSelected }: { prospect: Prospect; detailTab: DetailTab; setDetailTab: (tab: DetailTab) => void; onAnalyze: () => void; onOutreach: () => void; onPreview: () => void; onStatus: (status: ProspectStatus) => void; note: string; setNote: (value: string) => void; addNote: (event: FormEvent) => void; updateSelected: (updater: (prospect: Prospect) => Prospect) => void }) {
  return <aside className="engine-detail">
    <header className="engine-detail__hero"><div className="engine-detail__identity"><span>{prospect.businessName.charAt(0)}</span><div><h2>{prospect.businessName}</h2><p>{prospect.trade} · {prospect.city}, {prospect.state}</p></div></div><ScoreRing value={prospect.priorityScore} /></header>
    <div className="engine-detail__meta"><a href={safeWebsiteUrl(prospect.website)} rel="noreferrer" target="_blank">Open website</a><a href={`tel:${prospect.phone}`}>{prospect.phone}</a><select aria-label="Pipeline status" onChange={(event) => onStatus(event.target.value as ProspectStatus)} value={prospect.status}>{prospectStatuses.map((item) => <option key={item}>{item}</option>)}</select></div>
    <nav className="engine-tabs" aria-label="Prospect detail">{(["Analysis", "Outreach", "Preview", "Activity"] as DetailTab[]).map((tab) => <button className={detailTab === tab ? "is-active" : ""} key={tab} onClick={() => setDetailTab(tab)} type="button">{tab}</button>)}</nav>
    <div className="engine-detail__body">
      {detailTab === "Analysis" && (prospect.analysis ? <AnalysisView prospect={prospect} onAnalyze={onAnalyze} /> : <EmptyState title="Website not analyzed yet" body="Run the scoring engine to identify strengths, conversion gaps, and redesign opportunity." action={onAnalyze} actionLabel="Analyze website" />)}
      {detailTab === "Outreach" && (prospect.outreach ? <OutreachView prospect={prospect} updateSelected={updateSelected} /> : <EmptyState title="No outreach draft yet" body="Generate a personal draft grounded in the website analysis. It will stay unsent until approved." action={onOutreach} actionLabel="Generate outreach" />)}
      {detailTab === "Preview" && (prospect.preview ? <PreviewView prospect={prospect} /> : <EmptyState title="No preview concept yet" body="Create a contractor-specific page structure, visual direction, trust strategy, and lead-capture plan." action={onPreview} actionLabel="Generate preview concept" />)}
      {detailTab === "Activity" && <ActivityView prospect={prospect} note={note} setNote={setNote} addNote={addNote} />}
    </div>
  </aside>;
}

function AnalysisView({ prospect, onAnalyze }: { prospect: Prospect; onAnalyze: () => void }) {
  const analysis = prospect.analysis!;
  return <div className="engine-stack"><div className="engine-analysis-summary"><ScoreRing value={analysis.overallScore} /><div><span className={`engine-opportunity engine-opportunity--${analysis.opportunityRating.toLowerCase()}`}>{analysis.opportunityRating} opportunity</span><p>{analysis.summary}</p></div></div><div className="engine-score-grid">{(Object.entries(analysis.scores) as [ScoreKey, number][]).map(([key, value]) => <div key={key}><span>{scoreLabels[key]}</span><b>{value}</b><i><em style={{ width: `${value}%` }} /></i></div>)}</div><section><h3>Recommended redesign direction</h3><p>{analysis.redesignDirection}</p></section><div className="engine-two-col"><section><h3>Strengths to reference</h3><ul>{analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>Conversion gaps</h3><ul>{analysis.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul></section></div><button className="engine-button" onClick={onAnalyze} type="button">Re-run analysis</button></div>;
}

function OutreachView({ prospect, updateSelected }: { prospect: Prospect; updateSelected: (updater: (prospect: Prospect) => Prospect) => void }) {
  const outreach = prospect.outreach!;
  return <div className="engine-stack"><div className={`engine-approval ${outreach.approved ? "is-approved" : ""}`}><div><b>{outreach.approved ? "Approved for personal sending" : "Human review required"}</b><p>{outreach.approved ? "This draft has been reviewed. Send it manually through your normal email workflow." : "Review facts, tone, and recipient details before approving."}</p></div><button className="engine-button engine-button--primary" onClick={() => updateSelected((item) => ({ ...item, outreach: { ...outreach, approved: !outreach.approved }, activities: [activity("outreach", outreach.approved ? "Outreach approval removed." : "Outreach approved for personal sending."), ...item.activities] }))} type="button">{outreach.approved ? "Remove approval" : "Approve draft"}</button></div><section><h3>Subject options</h3><ul>{outreach.subjects.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>Concise version</h3><pre>{outreach.concise}</pre></section><section><h3>Detailed version</h3><pre>{outreach.detailed}</pre></section><section><h3>Follow-up sequence</h3>{outreach.followUps.map((item, index) => <pre key={item}>Follow-up {index + 1}{`\n\n`}{item}</pre>)}</section></div>;
}

function PreviewView({ prospect }: { prospect: Prospect }) {
  const preview = prospect.preview!;
  return <div className="engine-stack"><section className="engine-preview-hero"><span>{prospect.trade} concept</span><h3>{preview.direction}</h3><p>{preview.hero}</p><button type="button">Request an estimate</button></section><section><h3>Homepage structure</h3><ol>{preview.homepageStructure.map((item) => <li key={item}>{item}</li>)}</ol></section><div className="engine-two-col"><section><h3>CTA strategy</h3><p>{preview.ctaStrategy}</p></section><section><h3>Trust strategy</h3><p>{preview.trustStrategy}</p></section><section><h3>Portfolio direction</h3><p>{preview.portfolioDirection}</p></section><section><h3>Lead capture</h3><p>{preview.leadCaptureStrategy}</p></section></div></div>;
}

function ActivityView({ prospect, note, setNote, addNote }: { prospect: Prospect; note: string; setNote: (value: string) => void; addNote: (event: FormEvent) => void }) {
  return <div className="engine-stack"><form className="engine-note" onSubmit={addNote}><label htmlFor="prospect-note">Add operator note</label><textarea id="prospect-note" onChange={(event) => setNote(event.target.value)} placeholder="Record call details, objections, or next steps." value={note} /><button className="engine-button engine-button--primary" type="submit">Add note</button></form>{prospect.notes.length > 0 && <section><h3>Notes</h3><ul>{prospect.notes.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}<section><h3>Activity history</h3><div className="engine-activity">{prospect.activities.map((item) => <div key={item.id}><i /><p><b>{item.label}</b><span>{formatDate(item.at)}</span></p></div>)}</div></section></div>;
}

function EmptyState({ title, body, action, actionLabel = "Clear filters" }: { title: string; body: string; action?: () => void; actionLabel?: string }) {
  return <div className="engine-empty"><span aria-hidden="true">+</span><h3>{title}</h3><p>{body}</p>{action && <button className="engine-button engine-button--primary" onClick={action} type="button">{actionLabel}</button>}</div>;
}

function DiscoveryDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="engine-dialog-backdrop" onMouseDown={onClose}><dialog aria-labelledby="discovery-title" className="engine-dialog" onMouseDown={(event) => event.stopPropagation()} open><header><div><p>Lead discovery</p><h2 id="discovery-title">Add a contractor prospect</h2></div><button aria-label="Close" onClick={onClose} type="button">×</button></header><form onSubmit={onSubmit}><div className="engine-form-grid"><label>Business name<input name="businessName" required /></label><label>Website<input name="website" placeholder="https://" required type="url" /></label><label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Business size<select name="sizeIndicator"><option>Small</option><option>Growing</option><option>Established</option></select></label><label>City<input name="city" required /></label><label>State<input maxLength={2} name="state" required /></label><label>Phone<input name="phone" required type="tel" /></label><label>Public email<input name="email" type="email" /></label><label className="engine-form-wide">Service area<input name="serviceArea" placeholder="City and nearby communities" required /></label></div><footer><button className="engine-button" onClick={onClose} type="button">Cancel</button><button className="engine-button engine-button--primary" type="submit">Add to discovery queue</button></footer></form></dialog></div>;
}

function LeadSearchDialog({ existingWebsites, leads, state, error, onClose, onDiscover, onImport }: { existingWebsites: Set<string>; leads: DiscoveredLead[]; state: "idle" | "loading" | "error"; error: string; onClose: () => void; onDiscover: (event: FormEvent<HTMLFormElement>) => void; onImport: (lead: DiscoveredLead) => void }) {
  return <div className="engine-dialog-backdrop" onMouseDown={onClose}><dialog aria-labelledby="lead-search-title" className="engine-dialog engine-dialog--wide" onMouseDown={(event) => event.stopPropagation()} open><header><div><p>Public-data discovery</p><h2 id="lead-search-title">Find contractor websites</h2></div><button aria-label="Close" onClick={onClose} type="button">×</button></header><form className="engine-discovery-form" onSubmit={onDiscover}><label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>City<input name="city" required /></label><label>State<input maxLength={2} name="state" required /></label><label>Radius<select name="radiusKm"><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label><button className="engine-button engine-button--primary" disabled={state === "loading"} type="submit">{state === "loading" ? "Searching" : "Find leads"}</button></form>{state === "error" && <p className="engine-dialog-error" role="alert">{error}</p>}<div className="engine-discovery-results">{leads.length === 0 && state !== "loading" ? <EmptyState title="No discovery results yet" body="Search one trade and location at a time. Results with usable public websites will appear here for review." /> : leads.map((lead) => { const exists = existingWebsites.has(lead.website); return <article key={lead.website}><div><b>{lead.businessName}</b><span>{lead.trade} · {lead.city}, {lead.state}</span><a href={lead.website} rel="noreferrer" target="_blank">{lead.website}</a></div><button className="engine-button" disabled={exists} onClick={() => onImport(lead)} type="button">{exists ? "Already added" : "Import prospect"}</button></article>; })}</div><footer><p>Searches are user-triggered, rate-limited, and return public map records with websites. Review every lead before outreach.</p><button className="engine-button" onClick={onClose} type="button">Close</button></footer></dialog></div>;
}
