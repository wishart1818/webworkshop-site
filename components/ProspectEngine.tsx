"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import { AutonomousGrowthWorkspace } from "@/components/engine/AutonomousGrowthWorkspace";
import { DiscoveryFunnel } from "@/components/engine/DiscoveryFunnel";
import { CommandActivityWorkspace, OperatorCommandBar } from "@/components/engine/OperatorCommandBar";
import { OperatorTestCenterWorkspace } from "@/components/engine/OperatorTestCenterWorkspace";
import { ProspectDetail, publicPreviewUrlForProspect, type DetailTab } from "@/components/engine/ProspectDetail";
import { SystemWorkspace, type ProviderSmokeTestPayload, type SystemPayload } from "@/components/engine/SystemWorkspace";
import { TopProspectsWorkspace } from "@/components/engine/TopProspectsWorkspace";
import { applyManualCallSuppression, buildManualCallsQueue, callQueueResolutionState, callQueueSummaryLabels, pendingManualCallsCount, type ManualCallQueueItem } from "@/lib/calls-queue";
import type { DiscoveredLead, DiscoveryDiagnostics } from "@/lib/lead-discovery";
import {
  buildProspectFunnel,
  prospectAttributeKeys,
  prospectExclusiveBucketKeys,
  prospectFunnelLabels,
  prospectMatchesFunnelFilter,
  type ProspectFunnelFilterKey,
} from "@/lib/prospect-funnel";
import {
  activity,
  createProspect,
  displayStateCode,
  displayTradeCategory,
  normalizeTradeCategory,
  PREVIEW_GENERATOR_VERSION,
  prospectPresenceLabels,
  prospectWrittenContactMethodIsUsable,
  previewRegenerationBlockReason,
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

type WorkspaceTab = "Overview" | "Top Prospects" | "Prospects" | "Calls" | "Pipeline" | "Autonomous Growth" | "Operator Test Center" | "System" | "Command Activity";
type ContactFilter = "all" | "email" | "form" | "social" | "hide_phone_only" | "send_ready" | "needs_research";
type DensityMode = "compact" | "comfortable";
type ProspectView = "all" | "review" | "email" | "manual" | "blocked" | "contacted";
type PipelineView = "board" | "followups" | "replies" | "wonLost";
type PreviewActionMessage = { tone: "success" | "error"; text: string };

const workspaceTabs: WorkspaceTab[] = ["Overview", "Top Prospects", "Prospects", "Calls", "Pipeline", "Autonomous Growth", "Operator Test Center", "System", "Command Activity"];
const primaryMobileTabs: WorkspaceTab[] = ["Overview", "Prospects", "Pipeline"];
const moreMobileTabs: WorkspaceTab[] = ["Top Prospects", "Calls", "Autonomous Growth", "Operator Test Center", "System", "Command Activity"];

const workspaceIcons: Record<WorkspaceTab, string> = {
  Overview: "O",
  "Top Prospects": "T",
  Prospects: "P",
  Calls: "C",
  Pipeline: "B",
  "Autonomous Growth": "A",
  "Operator Test Center": "Q",
  System: "S",
  "Command Activity": "L",
};

const prospectViewLabels: Record<ProspectView, string> = {
  all: "All Prospects",
  review: "Review Needed",
  email: "Email Ready",
  manual: "Manual Contact",
  blocked: "Blocked",
  contacted: "Contacted",
};

const pipelineViewLabels: Record<PipelineView, string> = {
  board: "Board",
  followups: "Follow-ups",
  replies: "Replies",
  wonLost: "Won / Lost",
};

function shortActionLabel(label: string) {
  if (/email-ready|qualified|draft/i.test(label)) return "Review";
  if (/manual call|call/i.test(label)) return "Calls";
  if (/scan|Top Prospects/i.test(label)) return "Scan";
  if (/preview/i.test(label)) return "Previews";
  if (/follow/i.test(label)) return "Follow-ups";
  if (/Autopilot/i.test(label)) return "Autopilot";
  if (/readiness/i.test(label)) return "Test";
  if (/provider/i.test(label)) return "Smoke test";
  if (/Add/i.test(label)) return "Add";
  return "Open";
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [density, setDensity] = useState<DensityMode>("compact");
  const [prospectView, setProspectView] = useState<ProspectView>("all");
  const [pipelineView, setPipelineView] = useState<PipelineView>("board");
  const [detailTab, setDetailTab] = useState<DetailTab>("Analysis");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState<"All" | TradeCategory>("All");
  const [status, setStatus] = useState<"All" | ProspectStatus>("All");
  const [sort, setSort] = useState<ProspectSort>("priority");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("all");
  const [funnelFilter, setFunnelFilter] = useState<ProspectFunnelFilterKey | "all">("all");
  const [showFunnelDiagnostics, setShowFunnelDiagnostics] = useState(false);
  const [showDiscovery, setShowDiscovery] = useState(false);
  const [showLeadSearch, setShowLeadSearch] = useState(false);
  const [discoveredLeads, setDiscoveredLeads] = useState<DiscoveredLead[]>([]);
  const [discoveryDiagnostics, setDiscoveryDiagnostics] = useState<DiscoveryDiagnostics | null>(null);
  const [discoveryState, setDiscoveryState] = useState<"idle" | "loading" | "error">("idle");
  const [discoveryError, setDiscoveryError] = useState("");
  const [note, setNote] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("loading");
  const [syncError, setSyncError] = useState("");
  const [previewRegeneratingId, setPreviewRegeneratingId] = useState("");
  const [previewActionMessage, setPreviewActionMessage] = useState<PreviewActionMessage | null>(null);
  const [persistenceMode, setPersistenceMode] = useState<"memory" | "postgresql">("memory");
  const [system, setSystem] = useState<SystemPayload | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemError, setSystemError] = useState("");
  const [selfCheckRunning, setSelfCheckRunning] = useState(false);
  const [providerSmokeTestRunning, setProviderSmokeTestRunning] = useState(false);
  const [providerSmokeTest, setProviderSmokeTest] = useState<ProviderSmokeTestPayload | null>(null);
  const [commandActivityVersion, setCommandActivityVersion] = useState(0);
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

  useEffect(() => {
    const savedDensity = window.localStorage.getItem("webworkshop-engine-density");
    if (savedDensity === "compact" || savedDensity === "comfortable") setDensity(savedDensity);
    const savedTab = window.localStorage.getItem("webworkshop-engine-tab");
    if (workspaceTabs.includes(savedTab as WorkspaceTab)) setWorkspaceTab(savedTab as WorkspaceTab);
    const savedProspectView = window.localStorage.getItem("webworkshop-prospect-view");
    if (savedProspectView && Object.hasOwn(prospectViewLabels, savedProspectView)) setProspectView(savedProspectView as ProspectView);
    const savedPipelineView = window.localStorage.getItem("webworkshop-pipeline-view");
    if (savedPipelineView && Object.hasOwn(pipelineViewLabels, savedPipelineView)) setPipelineView(savedPipelineView as PipelineView);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("webworkshop-engine-density", density);
  }, [density]);

  useEffect(() => {
    window.localStorage.setItem("webworkshop-engine-tab", workspaceTab);
  }, [workspaceTab]);

  useEffect(() => {
    window.localStorage.setItem("webworkshop-prospect-view", prospectView);
  }, [prospectView]);

  useEffect(() => {
    window.localStorage.setItem("webworkshop-pipeline-view", pipelineView);
  }, [pipelineView]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "operator-test-center") setWorkspaceTab("Operator Test Center");
  }, []);

  useEffect(() => {
    function openEngineTab(event: Event) {
      const detail = (event as CustomEvent<{ tab?: string }>).detail;
      if (detail?.tab === "top-prospects") setWorkspaceTab("Top Prospects");
      if (detail?.tab === "operator-test-center") setWorkspaceTab("Operator Test Center");
    }
    function openEngineRecord(event: Event) {
      const detail = (event as CustomEvent<{ tab?: string; prospectId?: string; detailTab?: DetailTab }>).detail;
      if (detail?.tab === "top-prospects") setWorkspaceTab("Top Prospects");
      if (detail?.tab === "prospects") setWorkspaceTab("Prospects");
      if (detail?.prospectId) {
        setTrade("All");
        setStatus("All");
        setContactFilter("all");
        setFunnelFilter("all");
        setQuery("");
        setSelectedId(detail.prospectId);
      }
      if (detail?.detailTab) setDetailTab(detail.detailTab);
    }
    window.addEventListener("webworkshop:open-engine-tab", openEngineTab);
    window.addEventListener("webworkshop:open-engine-record", openEngineRecord);
    return () => {
      window.removeEventListener("webworkshop:open-engine-tab", openEngineTab);
      window.removeEventListener("webworkshop:open-engine-record", openEngineRecord);
    };
  }, []);

  const prospectStateBlocked = prospects.length === 0 && (syncState === "loading" || syncState === "error");
  const filtered = useMemo(
    () =>
      sortProspects(
        prospects
          .filter((prospect) => trade === "All" || normalizeTradeCategory(prospect.trade) === trade)
          .filter((prospect) => status === "All" || prospect.status === status)
          .filter((prospect) => matchesContactFilter(prospect, contactFilter))
          .filter((prospect) => prospectMatchesFunnelFilter(prospect, funnelFilter))
          .filter((prospect) => `${prospect.businessName} ${prospect.city} ${prospect.state}`.toLowerCase().includes(query.toLowerCase())),
      sort,
    ),
    [contactFilter, funnelFilter, prospects, query, sort, status, trade],
  );

  const prospectFunnel = useMemo(() => buildProspectFunnel(prospects), [prospects]);
  const callsQueue = useMemo(() => buildManualCallsQueue(prospects), [prospects]);
  const pendingCalls = useMemo(() => pendingManualCallsCount(prospects), [prospects]);
  const selected = filtered.find((prospect) => prospect.id === selectedId) ?? null;
  const activeFilterChips = [
    query ? { key: "query", label: `Search: ${query}`, clear: () => setQuery("") } : null,
    trade !== "All" ? { key: "trade", label: `Trade: ${displayTradeCategory(trade)}`, clear: () => setTrade("All") } : null,
    status !== "All" ? { key: "status", label: `Status: ${status}`, clear: () => setStatus("All") } : null,
    contactFilter !== "all" ? { key: "contact", label: `Contact: ${contactFilter.replaceAll("_", " ")}`, clear: () => setContactFilter("all") } : null,
    funnelFilter !== "all" ? { key: "funnel", label: `${prospectFunnelLabels[funnelFilter]}`, clear: () => setFunnelFilter("all") } : null,
  ].filter((chip): chip is { clear: () => void; key: string; label: string } => Boolean(chip));

  const metrics = useMemo(
    () => ({
      replies: prospects.filter((prospect) => ["Interested", "Proposal Sent"].includes(prospect.status)).length,
      followUps: prospects.filter((prospect) => prospect.status === "Contacted").length,
    }),
    [prospects],
  );

  const nextAction = useMemo(() => {
    const emailReady = prospectFunnel.currentInventory.emailReady;
    const reviewReady = prospectFunnel.currentInventory.readyForReview;
    const previewIssues = prospects.filter((prospect) => prospect.analysis && !prospect.preview).length;
    const unapprovedOutreach = prospects.filter((prospect) => prospect.outreach && !prospect.outreach.approved).length;
    if (workspaceTab === "Overview") {
      if (emailReady > 0) return { label: `Review ${emailReady} email-ready prospect${emailReady === 1 ? "" : "s"}`, action: () => { setWorkspaceTab("Prospects"); applyProspectView("email"); } };
      if (pendingCalls > 0) return { label: `Process ${pendingCalls} manual call${pendingCalls === 1 ? "" : "s"}`, action: () => setWorkspaceTab("Calls") };
      return { label: "Start next prospect scan", action: () => setWorkspaceTab("Top Prospects") };
    }
    if (workspaceTab === "Prospects") {
      if (reviewReady > 0) return { label: `Review ${reviewReady} ready prospect${reviewReady === 1 ? "" : "s"}`, action: () => applyProspectView("review") };
      if (previewIssues > 0) return { label: `Fix ${previewIssues} preview issue${previewIssues === 1 ? "" : "s"}`, action: () => applyProspectView("review") };
      return { label: "Add a prospect", action: () => setShowDiscovery(true) };
    }
    if (workspaceTab === "Top Prospects") return { label: "Run focused Top Prospects scan", action: () => undefined };
    if (workspaceTab === "Calls") return { label: pendingCalls > 0 ? `Call ${pendingCalls} pending lead${pendingCalls === 1 ? "" : "s"}` : "Review prospect queue", action: () => pendingCalls > 0 ? undefined : setWorkspaceTab("Prospects") };
    if (workspaceTab === "Pipeline") return { label: "Check follow-ups", action: () => setPipelineView("followups") };
    if (workspaceTab === "Autonomous Growth") return { label: "Review Autopilot status", action: () => undefined };
    if (workspaceTab === "Operator Test Center") return { label: "Run readiness test", action: () => undefined };
    if (workspaceTab === "System") return { label: "Run provider smoke test", action: () => void runProviderSmokeTest() };
    if (workspaceTab === "Command Activity") return { label: "Review latest command", action: () => undefined };
    return { label: unapprovedOutreach > 0 ? `Approve ${unapprovedOutreach} draft${unapprovedOutreach === 1 ? "" : "s"}` : "Review prospects", action: () => setWorkspaceTab("Prospects") };
  }, [pendingCalls, prospectFunnel, prospects, workspaceTab]);

  useEffect(() => {
    if (selectedId && !filtered.some((prospect) => prospect.id === selectedId)) setSelectedId("");
  }, [filtered, selectedId]);

  function openFunnelFilter(filter: ProspectFunnelFilterKey) {
    setFunnelFilter(filter);
    setTrade("All");
    setStatus("All");
    setContactFilter("all");
    setQuery("");
    setProspectView("all");
    setWorkspaceTab("Prospects");
    setMobileMoreOpen(false);
  }

  function openAllProspects() {
    setFunnelFilter("all");
    setTrade("All");
    setStatus("All");
    setContactFilter("all");
    setQuery("");
    setProspectView("all");
    setWorkspaceTab("Prospects");
    setMobileMoreOpen(false);
  }

  function navigateWorkspace(tab: WorkspaceTab) {
    setWorkspaceTab(tab);
    setMobileMoreOpen(false);
  }

  function applyProspectView(view: ProspectView) {
    setProspectView(view);
    setTrade("All");
    setQuery("");
    if (view === "all") {
      setStatus("All");
      setContactFilter("all");
      setFunnelFilter("all");
    }
    if (view === "review") {
      setStatus("All");
      setContactFilter("all");
      setFunnelFilter("ready_for_review");
    }
    if (view === "email") {
      setStatus("All");
      setContactFilter("email");
      setFunnelFilter("ready_email");
    }
    if (view === "manual") {
      setStatus("All");
      setContactFilter("needs_research");
      setFunnelFilter("all");
    }
    if (view === "blocked") {
      setStatus("All");
      setContactFilter("all");
      setFunnelFilter("bad_fit");
    }
    if (view === "contacted") {
      setStatus("Contacted");
      setContactFilter("all");
      setFunnelFilter("all");
    }
  }

  function clearAllProspectFilters() {
    setTrade("All");
    setStatus("All");
    setContactFilter("all");
    setFunnelFilter("all");
    setQuery("");
    setProspectView("all");
  }

  useEffect(() => {
    if (workspaceTab !== "Prospects") return;
    if (!selectedId) return;
    if (filtered.some((prospect) => prospect.id === selectedId)) return;
    setSelectedId("");
  }, [filtered, selectedId, workspaceTab]);

  function applyCommandNavigation(navigation: {
    tab?: WorkspaceTab;
    query?: string;
    contactFilter?: ContactFilter;
    funnelFilter?: ProspectFunnelFilterKey | string;
    prospectId?: string;
  }) {
    if (navigation.tab) setWorkspaceTab(navigation.tab);
    if (navigation.query !== undefined) setQuery(navigation.query);
    if (navigation.contactFilter) setContactFilter(navigation.contactFilter);
    if (navigation.funnelFilter) setFunnelFilter(navigation.funnelFilter as ProspectFunnelFilterKey);
    if (navigation.prospectId) setSelectedId(navigation.prospectId);
    if (navigation.tab === "Prospects") {
      setTrade("All");
      setStatus("All");
    }
  }

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

  function updateProspectById(id: string, updater: (prospect: Prospect) => Prospect) {
    setProspects((current) =>
      current.map((prospect) => {
        if (prospect.id !== id) return prospect;
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

  async function runProviderSmokeTest() {
    setProviderSmokeTestRunning(true);
    setSystemError("");
    try {
      const response = await fetch("/api/engine/system/provider-smoke-test", { method: "POST" });
      const payload = (await response.json()) as { smokeTest?: ProviderSmokeTestPayload; error?: string };
      if (!response.ok || !payload.smokeTest) throw new Error(payload.error || "Unable to run provider smoke test.");
      setProviderSmokeTest(payload.smokeTest);
    } catch (error) {
      setSystemError(error instanceof Error ? error.message : "Unable to run provider smoke test.");
    } finally {
      setProviderSmokeTestRunning(false);
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

  async function regenerateSelectedOutreach() {
    if (!selected) return;
    setSyncState("saving");
    setSyncError("");
    try {
      const response = await fetch("/api/engine/outreach-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_prospect_outreach", prospectId: selected.id }),
      });
      const payload = (await response.json()) as { updatedProspect?: Prospect; error?: string };
      if (!response.ok || !payload.updatedProspect) throw new Error(payload.error || "Unable to regenerate outreach.");
      setProspects((current) => current.map((prospect) => prospect.id === payload.updatedProspect!.id ? payload.updatedProspect! : prospect));
      setSyncState("saved");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to regenerate outreach.");
      setSyncState("error");
    }
  }

  async function regenerateSelectedPreview(feedback = "", targetProspect?: Prospect) {
    const target = targetProspect ?? selected;
    if (!target) return;
    if (previewRegeneratingId === target.id) return;
    const blockReason = previewRegenerationBlockReason(target);
    if (blockReason) {
      setDetailTab("Preview");
      setSelectedId(target.id);
      setPreviewActionMessage({ tone: "error", text: `Preview regeneration blocked: ${blockReason}. Nothing was sent.` });
      return;
    }
    setSyncState("saving");
    setSyncError("");
    setPreviewRegeneratingId(target.id);
    setPreviewActionMessage(null);
    try {
      const response = await fetch("/api/engine/outreach-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_prospect_preview", prospectId: target.id, feedback }),
      });
      const payload = (await response.json()) as {
        updatedProspect?: Prospect;
        previewVersion?: string;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.updatedProspect) throw new Error(payload.error || "Unable to regenerate preview.");
      const saved = payload.updatedProspect;
      setProspects((current) => current.map((prospect) => prospect.id === saved.id ? saved : prospect));
      setSelectedId(saved.id);
      setDetailTab("Preview");
      setSyncState("saved");
      setPreviewActionMessage({ tone: "success", text: payload.message || `Preview regenerated with ${payload.previewVersion ?? PREVIEW_GENERATOR_VERSION}. Linked review package refreshed. Nothing was sent.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to regenerate preview.";
      setSyncError(message);
      setPreviewActionMessage({ tone: "error", text: `${message} Existing public preview was preserved.` });
      setSyncState("error");
    } finally {
      setPreviewRegeneratingId("");
    }
  }

  async function createSelectedReviewPackage() {
    if (!selected) return;
    setSyncState("saving");
    setSyncError("");
    try {
      const response = await fetch("/api/engine/outreach-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_autonomous_review_package", prospectId: selected.id }),
      });
      const payload = (await response.json()) as { queueItem?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to create review package.");
      await loadProspects();
      setSyncState("saved");
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Unable to create review package.");
      setSyncState("error");
    }
  }

  return (
    <div className={`engine-shell engine-density--${density} ${sidebarCollapsed ? "engine-shell--nav-collapsed" : ""}`}>
      <aside className="engine-sidebar">
        <div className="engine-brand"><span>W</span><div><b>WebWorkshop</b><small>Prospect Engine</small></div></div>
        <button className="engine-nav-collapse" aria-pressed={sidebarCollapsed} onClick={() => setSidebarCollapsed((current) => !current)} type="button">
          {sidebarCollapsed ? "Expand" : "Collapse"}
        </button>
        <nav aria-label="Prospect Engine" className="engine-desktop-nav">
          {workspaceTabs.map((tab) => (
            <button className={workspaceTab === tab ? "is-active" : ""} key={tab} onClick={() => navigateWorkspace(tab)} type="button">
              <i aria-hidden="true">{workspaceIcons[tab]}</i>
              <span>{tab === "Operator Test Center" ? "Test Center" : tab}</span>
              {tab === "Calls" && pendingCalls > 0 ? <b className="engine-nav-badge" aria-label={`${pendingCalls} pending manual calls`}>{pendingCalls}</b> : null}
            </button>
          ))}
        </nav>
        <div className="engine-compliance">
          <b>Safety status</b>
          <p>Email review required. DMs, forms, calls, Looms, and SMS stay manual only.</p>
        </div>
      </aside>

      <main className="engine-main">
        <header className="engine-topbar">
          <div className="engine-page-title"><p>WebWorkshop sales workspace</p><h1>{workspaceTab}</h1></div>
          <label className="engine-search engine-search--global"><span className="sr-only">Search prospects</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search prospects" value={query} /></label>
          <CompactSafetyStatus pendingCalls={pendingCalls} persistenceMode={persistenceMode} syncState={syncState} />
          <div className="engine-topbar__actions">
            {syncState === "error" ? (
            <div className="engine-sync engine-sync--error" role="status">
              <i aria-hidden="true" />
              <span>{syncError || "Sync needs attention"}</span>
            </div>
            ) : null}
            <label className="engine-density-toggle">
              <span>Density</span>
              <select aria-label="Interface density" onChange={(event) => setDensity(event.target.value as DensityMode)} value={density}>
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
            <ActionMenu label="More">
              <button onClick={() => setShowLeadSearch(true)} type="button">Discover leads</button>
              <button onClick={() => setShowDiscovery(true)} type="button">Add prospect</button>
              <button onClick={() => navigateWorkspace("Operator Test Center")} type="button">Open Test Center</button>
              <button onClick={() => navigateWorkspace("System")} type="button">Open System</button>
            </ActionMenu>
            <button className="engine-button engine-button--primary" onClick={nextAction.action} type="button">
              <span className="engine-action-label-full">{nextAction.label}</span>
              <span className="engine-action-label-short">{shortActionLabel(nextAction.label)}</span>
            </button>
          </div>
        </header>
        {previewActionMessage ? (
          <div className={`engine-toast engine-toast--${previewActionMessage.tone}`} role={previewActionMessage.tone === "error" ? "alert" : "status"}>
            {previewActionMessage.text}
          </div>
        ) : null}

        <OperatorCommandBar
          onNavigate={applyCommandNavigation}
          onReceiptsChanged={() => setCommandActivityVersion((current) => current + 1)}
        />

        {syncState === "error" && prospects.length > 0 && (
          <div className="engine-error-banner" role="alert">
            <div><b>Prospect data is not synced</b><p>{syncError}</p></div>
            <button className="engine-button" onClick={() => void loadProspects()} type="button">{prospects.length ? "Reload from server" : "Retry loading"}</button>
          </div>
        )}

        {workspaceTab !== "System" && workspaceTab !== "Operator Test Center" && prospectStateBlocked && (
          <div className="engine-content">
            {syncState === "loading"
              ? <LoadingState title="Loading prospect workspace" body="Retrieving the latest pipeline, analysis, outreach, and activity records." />
              : <EmptyState title="Prospects unavailable" body={syncError} action={() => void loadProspects()} actionLabel="Retry loading" />}
          </div>
        )}

        {workspaceTab === "Overview" && !prospectStateBlocked && (
          <div className="engine-content">
            <section className="engine-next-action-card" aria-label="Recommended next action">
              <div>
                <span>Next action</span>
                <h2>{nextAction.label}</h2>
                <details>
                  <summary>Why this action?</summary>
                  <p>{prospectFunnel.recommendation}</p>
                </details>
              </div>
              <button className="engine-button engine-button--primary" onClick={nextAction.action} type="button">{nextAction.label}</button>
            </section>
            <section className="engine-overview-cards" aria-label="Operational dashboard">
              <MetricCard label="Email Ready" value={prospectFunnel.currentInventory.emailReady} detail="Review drafts" onClick={() => { setWorkspaceTab("Prospects"); applyProspectView("email"); }} />
              <MetricCard label="Manual DM" value={prospectFunnel.currentInventory.facebookReady + prospectFunnel.currentInventory.instagramReady} detail="Social paths" onClick={() => { setWorkspaceTab("Prospects"); setContactFilter("social"); setFunnelFilter("all"); setProspectView("all"); }} />
              <MetricCard label="Phone Only" value={prospectFunnel.exclusiveBuckets.phone_only} detail="Blocked from written send" onClick={() => openFunnelFilter("phone_only")} />
              <MetricCard label="Blocked / Suppressed" value={prospectFunnel.exclusiveBuckets.bad_fit + prospectFunnel.exclusiveBuckets.suppressed_do_not_contact} detail="Do not contact" onClick={() => openFunnelFilter("bad_fit")} />
              <MetricCard label="Replies" value={metrics.replies} detail="Interested or proposal" onClick={() => { setWorkspaceTab("Pipeline"); setPipelineView("replies"); }} />
              <MetricCard label="Follow-ups" value={metrics.followUps} detail="Contacted leads" onClick={() => { setWorkspaceTab("Pipeline"); setPipelineView("followups"); }} />
            </section>
            <ProspectFunnelCard
              funnel={prospectFunnel}
              pendingCalls={pendingCalls}
              onOpenAll={openAllProspects}
              onOpenCalls={() => setWorkspaceTab("Calls")}
              onOpenFilter={openFunnelFilter}
              onToggleDiagnostics={() => setShowFunnelDiagnostics((current) => !current)}
              showDiagnostics={showFunnelDiagnostics}
            />
            <section className="engine-overview-grid">
              <div className="engine-panel">
                <div className="engine-panel__head"><div><h2>Priority queue</h2><p>Ranked by website opportunity and business fit.</p></div><button onClick={() => setWorkspaceTab("Prospects")} type="button">View all</button></div>
                <ProspectTable prospects={filtered.slice(0, 5)} selectedId={selectedId} previewRegeneratingId={previewRegeneratingId} onRegeneratePreview={regenerateSelectedPreview} onSelect={(id) => { setSelectedId(id); setWorkspaceTab("Prospects"); }} />
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
            <SectionTabs
              active={prospectView}
              ariaLabel="Prospect views"
              labels={prospectViewLabels}
              onChange={(view) => applyProspectView(view as ProspectView)}
            />
            <details className="engine-filter-drawer" open>
              <summary>Filters <span>{filtered.length} results</span></summary>
            <div className="engine-filters">
              <label className="engine-mobile-search"><span className="sr-only">Search prospects</span><input onChange={(event) => setQuery(event.target.value)} placeholder="Search prospects" value={query} /></label>
              <select aria-label="Filter by trade" onChange={(event) => setTrade(event.target.value as "All" | TradeCategory)} value={trade}><option>All</option>{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter by status" onChange={(event) => setStatus(event.target.value as "All" | ProspectStatus)} value={status}><option>All</option>{prospectStatuses.map((item) => <option key={item}>{item}</option>)}</select>
              <select aria-label="Filter by contact method" onChange={(event) => setContactFilter(event.target.value as ContactFilter)} value={contactFilter}><option value="all">All contacts</option><option value="email">Email available</option><option value="form">Contact form available</option><option value="social">Social message available</option><option value="hide_phone_only">Hide phone-only leads</option><option value="send_ready">Send-ready only</option><option value="needs_research">Needs contact research</option></select>
              <select aria-label="Filter by prospect funnel bucket" onChange={(event) => setFunnelFilter(event.target.value as ProspectFunnelFilterKey | "all")} value={funnelFilter}>
                <option value="all">All prospects</option>
                <optgroup label="Exclusive current disposition">
                  {prospectExclusiveBucketKeys.map((key) => <option key={key} value={key}>{prospectFunnelLabels[key]}</option>)}
                </optgroup>
                <optgroup label="Overlapping attributes">
                  {prospectAttributeKeys.map((key) => <option key={key} value={key}>{prospectFunnelLabels[key]}</option>)}
                </optgroup>
              </select>
              <select aria-label="Sort prospects" onChange={(event) => setSort(event.target.value as ProspectSort)} value={sort}>{prospectSortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              <span>{filtered.length} matching prospects</span>
              {activeFilterChips.length ? (
                <div className="engine-filter-summary" aria-label="Active prospect filters">
                  {activeFilterChips.map((chip) => <button key={chip.key} onClick={chip.clear} type="button">{chip.label}<span aria-hidden="true">x</span></button>)}
                </div>
              ) : null}
              {activeFilterChips.length ? <button className="engine-button" onClick={clearAllProspectFilters} type="button">Clear filters</button> : null}
            </div>
            </details>
            <div className="engine-workspace">
              <section className="engine-panel engine-list-panel">
                <ProspectTable prospects={filtered} selectedId={selectedId} previewRegeneratingId={previewRegeneratingId} onRegeneratePreview={regenerateSelectedPreview} onSelect={setSelectedId} />
                {filtered.length === 0 && <EmptyState title="No prospects match these filters" body="Clear a filter or add a prospect to continue building the queue." action={() => { setTrade("All"); setStatus("All"); setContactFilter("all"); setQuery(""); }} />}
              </section>
              {selected ? <ProspectDetail prospect={selected} detailTab={detailTab} setDetailTab={setDetailTab} onAnalyze={analyzeSelected} onPresenceGap={runPresenceGapSelected} onOutreach={() => updateSelected(withOutreach)} onRegenerateOutreach={regenerateSelectedOutreach} onRegeneratePreview={regenerateSelectedPreview} onCreateReviewPackage={createSelectedReviewPackage} onPreview={() => updateSelected(withPreview)} onStatus={changeStatus} previewRegenerating={previewRegeneratingId === selected.id} note={note} setNote={setNote} addNote={addNote} updateSelected={updateSelected} onClose={() => setSelectedId("")} /> : <EmptyState title={filtered.length ? "Select a prospect" : "No selected prospect"} body={filtered.length ? "Choose a lead to review its analysis and outreach work." : "No record is open because the current filters have no matching prospects."} />}
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
          <div className="engine-content">
            <SectionTabs
              active={pipelineView}
              ariaLabel="Pipeline views"
              labels={pipelineViewLabels}
              onChange={(view) => setPipelineView(view as PipelineView)}
            />
            <div className="engine-pipeline">
              {prospectStatuses
                .filter((column) => {
                  if (pipelineView === "board") return true;
                  if (pipelineView === "followups") return ["Contacted", "Interested", "Proposal Sent"].includes(column);
                  if (pipelineView === "replies") return ["Interested", "Proposal Sent"].includes(column);
                  return ["Closed Won", "Closed Lost"].includes(column);
                })
                .map((column) => (
                <section key={column}><header><h2>{column}</h2><span>{prospects.filter((prospect) => prospect.status === column).length}</span></header>
                  <div>{prospects.filter((prospect) => prospect.status === column).map((prospect) => (
                  <button key={prospect.id} onClick={() => { setSelectedId(prospect.id); setWorkspaceTab("Prospects"); }} type="button">
                    <b>{prospect.businessName}</b><span>{prospectLocationLine(prospect)}</span><em>{prospect.priorityScore} priority</em>
                  </button>
                  ))}</div>
                </section>
              ))}
            </div>
          </div>
        )}

        {workspaceTab === "Calls" && !prospectStateBlocked && (
          <CallsWorkspace
            calls={callsQueue}
            onOpenProspect={(id) => { setSelectedId(id); setWorkspaceTab("Prospects"); setDetailTab("Activity"); }}
            onUpdateProspect={updateProspectById}
          />
        )}

        {workspaceTab === "Autonomous Growth" && (
          <AutonomousGrowthWorkspace />
        )}

        {workspaceTab === "Operator Test Center" && (
          <OperatorTestCenterWorkspace />
        )}

        {workspaceTab === "Command Activity" && (
          <CommandActivityWorkspace key={commandActivityVersion} />
        )}

        {workspaceTab === "System" && (
          <SystemWorkspace
            error={systemError}
            loading={systemLoading}
            onRefresh={() => void loadSystem()}
            onRunProviderSmokeTest={() => void runProviderSmokeTest()}
            onRunSelfCheck={() => void runSelfCheck()}
            providerSmokeTest={providerSmokeTest}
            providerSmokeTestRunning={providerSmokeTestRunning}
            selfCheckRunning={selfCheckRunning}
            system={system}
          />
        )}
      </main>

      {showDiscovery && <DiscoveryDialog onClose={() => setShowDiscovery(false)} onSubmit={addProspect} />}
      {showLeadSearch && <LeadSearchDialog diagnostics={discoveryDiagnostics} existingWebsites={new Set(prospects.map((prospect) => prospect.website))} leads={discoveredLeads} state={discoveryState} error={discoveryError} onClose={() => setShowLeadSearch(false)} onDiscover={discoverLeads} onImport={importLead} />}
      <MobileBottomNav
        activeTab={workspaceTab}
        callsCount={pendingCalls}
        moreOpen={mobileMoreOpen}
        onCloseMore={() => setMobileMoreOpen(false)}
        onNavigate={navigateWorkspace}
        onToggleMore={() => setMobileMoreOpen((current) => !current)}
      />
    </div>
  );
}

function ActionMenu({ children, label }: { children: ReactNode | ((close: () => void) => ReactNode); label: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <details className="engine-action-menu" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      <div>{typeof children === "function" ? children(close) : children}</div>
    </details>
  );
}

function MobileBottomNav({
  activeTab,
  callsCount,
  moreOpen,
  onCloseMore,
  onNavigate,
  onToggleMore,
}: {
  activeTab: WorkspaceTab;
  callsCount: number;
  moreOpen: boolean;
  onCloseMore: () => void;
  onNavigate: (tab: WorkspaceTab) => void;
  onToggleMore: () => void;
}) {
  const moreActive = moreMobileTabs.includes(activeTab);
  return (
    <>
      {moreOpen ? <button aria-label="Close more navigation" className="engine-mobile-more-backdrop" onClick={onCloseMore} type="button" /> : null}
      <nav className="engine-mobile-bottom-nav" aria-label="Mobile Prospect Engine">
        {primaryMobileTabs.map((tab) => (
          <button aria-current={activeTab === tab ? "page" : undefined} className={activeTab === tab ? "is-active" : ""} key={tab} onClick={() => onNavigate(tab)} type="button">
            <i aria-hidden="true">{workspaceIcons[tab]}</i>
            <span>{tab}</span>
          </button>
        ))}
        <button aria-expanded={moreOpen} aria-haspopup="dialog" aria-current={moreActive ? "page" : undefined} className={moreActive || moreOpen ? "is-active" : ""} onClick={onToggleMore} type="button">
          <i aria-hidden="true">M</i>
          <span>More</span>
        </button>
      </nav>
      <div aria-hidden={!moreOpen} aria-label="More engine destinations" className={`engine-mobile-more-sheet ${moreOpen ? "is-open" : ""}`} role="dialog">
        <header>
          <div>
            <b>More</b>
            <p>Advanced engine workspaces</p>
          </div>
          <button aria-label="Close more navigation" onClick={onCloseMore} type="button">Close</button>
        </header>
        <div>
          {moreMobileTabs.map((tab) => (
            <button aria-current={activeTab === tab ? "page" : undefined} className={activeTab === tab ? "is-active" : ""} key={tab} onClick={() => onNavigate(tab)} type="button">
              <i aria-hidden="true">{workspaceIcons[tab]}</i>
              <span>{tab === "Operator Test Center" ? "Test Center" : tab}</span>
              {tab === "Calls" && callsCount > 0 ? <b>{callsCount}</b> : null}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function MetricCard({
  detail,
  label,
  onClick,
  value,
}: {
  detail: string;
  label: string;
  onClick: () => void;
  value: number;
}) {
  return (
    <button className="engine-metric-card" onClick={onClick} type="button">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}

function CompactSafetyStatus({
  pendingCalls,
  persistenceMode,
  syncState,
}: {
  pendingCalls: number;
  persistenceMode: "memory" | "postgresql";
  syncState: SyncState;
}) {
  return (
    <details className="engine-compact-safety">
      <summary>
        <span className={`engine-system-dot engine-system-dot--${syncState}`} aria-hidden="true" />
        <b>{persistenceMode === "postgresql" ? "PostgreSQL synced" : "Memory mode"}</b>
        <small>Manual outreach</small>
        {pendingCalls > 0 ? <i>{pendingCalls}</i> : null}
      </summary>
      <div>
        <dl>
          <div><dt>Email mode</dt><dd>Manual review</dd></div>
          <div><dt>Full auto</dt><dd>Off unless env gate passes</dd></div>
          <div><dt>DMs/forms/calls/Looms</dt><dd>Manual only</dd></div>
          <div><dt>Notifications</dt><dd>{pendingCalls} pending call{pendingCalls === 1 ? "" : "s"}</dd></div>
        </dl>
      </div>
    </details>
  );
}

function SectionTabs<T extends string>({
  active,
  ariaLabel,
  labels,
  onChange,
}: {
  active: T;
  ariaLabel: string;
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="engine-section-tabs" aria-label={ariaLabel} role="tablist">
      {(Object.keys(labels) as T[]).map((key) => (
        <button
          aria-selected={active === key}
          className={active === key ? "is-active" : ""}
          key={key}
          onClick={() => onChange(key)}
          role="tab"
          type="button"
        >
          {labels[key]}
        </button>
      ))}
    </div>
  );
}

function CallsWorkspace({
  calls,
  onOpenProspect,
  onUpdateProspect,
}: {
  calls: ManualCallQueueItem[];
  onOpenProspect: (id: string) => void;
  onUpdateProspect: (id: string, updater: (prospect: Prospect) => Prospect) => void;
}) {
  function recordCallAction(item: ManualCallQueueItem, label: string, status?: ProspectStatus) {
    onUpdateProspect(item.prospect.id, (prospect) => ({
      ...prospect,
      status: status ?? prospect.status,
      activities: [activity("status", label), ...prospect.activities],
      notes: label === "Manual call note added." ? prospect.notes : [`Calls queue: ${label}`, ...prospect.notes],
    }));
  }

  function markDoNotContact(item: ManualCallQueueItem) {
    onUpdateProspect(item.prospect.id, applyManualCallSuppression);
  }

  const pending = calls.filter((item) => item.pending);
  return (
    <div className="engine-content engine-calls-workspace">
      <section className="engine-panel engine-calls-hero">
        <div>
          <span>Manual phone queue</span>
          <h2>Calls</h2>
          <p>This is a last-resort queue for unusually strong phone-only prospects. It never auto-calls, never texts prospects, and never treats a phone number as SMS permission.</p>
        </div>
        <dl>
          <div><dt>Pending high-priority calls</dt><dd>{pending.length}</dd></div>
          <div><dt>Total call candidates</dt><dd>{calls.length}</dd></div>
          <div><dt>Resolved or future follow-up</dt><dd>{calls.length - pending.length}</dd></div>
        </dl>
      </section>
      {calls.length === 0 ? (
        <EmptyState title="No high-priority manual calls" body="Ordinary phone-only prospects stay blocked. A prospect appears here only when opportunity, activity, and phone-only criteria are unusually strong." />
      ) : (
        <div className="engine-calls-grid">
          {calls.map((item) => {
            const prospect = item.prospect;
            const resolutionState = callQueueResolutionState(prospect);
            const labels = callQueueSummaryLabels(prospect);
            return (
              <article className={`engine-call-card engine-call-card--${resolutionState}`} key={prospect.id}>
                <header>
                  <div>
                    <span>{prospectLocationLine(prospect)}</span>
                    <h3>{prospect.businessName}</h3>
                  </div>
                  <b>{item.pending ? "Pending" : "Resolved"}</b>
                </header>
                <div className="engine-call-card__labels">
                  {labels.map((label) => <span key={label}>{label}</span>)}
                </div>
                <dl className="engine-call-card__facts">
                  <div><dt>Call value tier</dt><dd>{item.valueTier}</dd></div>
                  <div><dt>Call state</dt><dd>{resolutionState}</dd></div>
                  <div><dt>Phone</dt><dd>{prospect.phone}</dd></div>
                  <div><dt>Reviews</dt><dd>{prospect.reviewCount || "Not recorded"}</dd></div>
                  <div><dt>Rating</dt><dd>{prospect.rating || "Not recorded"}</dd></div>
                  <div><dt>Website status</dt><dd>{prospect.websiteStatusDetail || prospect.websiteStatus.replaceAll("_", " ")}</dd></div>
                  <div><dt>Opportunity score</dt><dd>{prospect.priorityScore}</dd></div>
                  <div><dt>Service area</dt><dd>{prospect.serviceArea || "Not recorded"}</dd></div>
                </dl>
                <section>
                  <h4>Why this is worth calling</h4>
                  <ul>{item.worthCallingReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </section>
                <section>
                  <h4>Why no written path is available</h4>
                  <ul>{item.noWrittenPathReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                </section>
                <section>
                  <h4>Next manual action</h4>
                  <p>{item.nextCallAction}</p>
                </section>
                <section>
                  <h4>Recommended pitch angle</h4>
                  <p>{item.recommendedPitchAngle}</p>
                </section>
                <section>
                  <h4>Recent call activity</h4>
                  <ul>{[...prospect.notes, ...prospect.activities.map((entry) => entry.label)].slice(0, 4).map((entry) => <li key={entry}>{entry}</li>)}</ul>
                </section>
                <section>
                  <h4>Call script</h4>
                  <pre>{item.callScript}</pre>
                </section>
                <footer className="engine-call-actions">
                  <a className="engine-button engine-button--primary" href={`tel:${prospect.phone}`}>Call</a>
                  <button className="engine-button" onClick={() => void navigator.clipboard.writeText(item.callScript)} type="button">Copy Call Script</button>
                  {prospect.profileUrl ? <a className="engine-button" href={prospect.profileUrl} rel="noreferrer" target="_blank">Open Google Business profile</a> : null}
                  {prospect.website ? <a className="engine-button" href={prospect.website} rel="noreferrer" target="_blank">Open Website</a> : null}
                  <button className="engine-button" onClick={() => onOpenProspect(prospect.id)} type="button">Add Notes</button>
                  <button className="engine-button" onClick={() => recordCallAction(item, "Marked interested after manual call.", "Interested")} type="button">Mark Interested</button>
                  <button className="engine-button" onClick={() => recordCallAction(item, "Marked called manually.", "Contacted")} type="button">Mark Called</button>
                  <button className="engine-button" onClick={() => recordCallAction(item, "Call Back requested or due.")} type="button">Mark Call Back</button>
                  <button className="engine-button" onClick={() => recordCallAction(item, "No Answer. Follow-up call due.")} type="button">Mark No Answer</button>
                  <button className="engine-button" onClick={() => recordCallAction(item, "Marked not interested after manual call.", "Closed Lost")} type="button">Mark Not Interested</button>
                  <button className="engine-button" onClick={() => markDoNotContact(item)} type="button">Mark Do Not Contact</button>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProspectFunnelCard({
  funnel,
  pendingCalls,
  onOpenAll,
  onOpenCalls,
  onOpenFilter,
  onToggleDiagnostics,
  showDiagnostics,
}: {
  funnel: ReturnType<typeof buildProspectFunnel>;
  pendingCalls: number;
  onOpenAll: () => void;
  onOpenCalls: () => void;
  onOpenFilter: (filter: ProspectFunnelFilterKey) => void;
  onToggleDiagnostics: () => void;
  showDiagnostics: boolean;
}) {
  const CountButton = ({ count, detail, filter, label, onClick }: { count: number; detail?: string; filter?: ProspectFunnelFilterKey; label: string; onClick?: () => void }) => (
    <button className="engine-funnel-count" onClick={onClick || (() => filter ? onOpenFilter(filter) : onOpenAll())} type="button">
      <span>{label}</span>
      <strong>{count}</strong>
      {detail ? <small>{detail}</small> : null}
    </button>
  );
  const inventory = funnel.currentInventory;
  const removed = funnel.diagnostics.removedAtEachStage;
  const dispositionOrder = [
    "ready_email",
    "ready_facebook",
    "ready_instagram",
    "ready_contact_form",
    "needs_manual_research",
    "phone_only",
    "website_already_strong",
    "bad_fit",
    "suppressed_do_not_contact",
    "already_contacted",
    "duplicate",
    "other_not_actionable",
  ] as const;
  return (
    <section className="engine-panel engine-prospect-funnel" aria-label="Prospect Funnel">
      <div className="engine-panel__head">
        <div>
          <h2>Prospect Funnel</h2>
          <p>{funnel.recommendation}</p>
        </div>
        <button className="engine-button" onClick={onToggleDiagnostics} type="button">Explain Prospect Counts</button>
      </div>
      <div className="engine-funnel-flow" aria-label="Exclusive Current-Disposition Funnel">
        <div className="engine-funnel-section-head">
          <h3>Exclusive Current-Disposition Funnel</h3>
          <p>Every prospect appears in exactly one primary bucket. These counts reconcile to total prospects.</p>
        </div>
        <div className="engine-funnel-reconciliation" role="status">
          <div><span>Total prospects</span><b>{funnel.diagnostics.totalProspects}</b></div>
          <div><span>Sum of exclusive buckets</span><b>{funnel.diagnostics.exclusiveTotal}</b></div>
          <div><span>Difference</span><b>{funnel.diagnostics.difference}</b></div>
          <p>{funnel.diagnostics.reconciles ? "Difference = 0. Funnel reconciles." : "Difference is not zero. Review the classifier before trusting this funnel."}</p>
        </div>
        <div className="engine-funnel-split">
          {dispositionOrder.map((filter) => (
            <CountButton
              count={funnel.exclusiveBuckets[filter]}
              detail="Primary bucket"
              filter={filter}
              key={filter}
              label={prospectFunnelLabels[filter]}
            />
          ))}
        </div>
      </div>
      <div className="engine-current-inventory" aria-label="Current Inventory">
        <h3>Current Inventory</h3>
        {[
          { label: "Total prospects", value: inventory.totalProspects, onClick: onOpenAll },
          { label: "Qualified prospects", value: inventory.qualifiedProspects, filter: "qualified" as const },
          { label: "Qualified unsent", value: inventory.qualifiedUnsent, filter: "qualified_unsent" as const },
          { label: "Email ready", value: inventory.emailReady, filter: "ready_email" as const },
          { label: "Facebook ready", value: inventory.facebookReady, filter: "ready_facebook" as const },
          { label: "Instagram ready", value: inventory.instagramReady, filter: "ready_instagram" as const },
          { label: "Contact form ready", value: inventory.contactFormReady, filter: "ready_contact_form" as const },
          { label: "Calls queue", value: pendingCalls, onClick: onOpenCalls },
          { label: "Needs manual research", value: inventory.needsManualResearch, filter: "needs_manual_research" as const },
          { label: "Already contacted", value: inventory.alreadyContacted, filter: "already_contacted" as const },
          { label: "Bad fit / blocked", value: funnel.exclusiveBuckets.bad_fit, filter: "bad_fit" as const },
          { label: "Suppressed", value: inventory.suppressed, filter: "suppressed_do_not_contact" as const },
          { label: "High priority", value: inventory.highPriority, filter: "high_priority" as const },
        ].map((item) => <CountButton count={item.value} detail="Open matching records" filter={"filter" in item ? item.filter : undefined} key={item.label} label={item.label} onClick={"onClick" in item ? item.onClick : undefined} />)}
      </div>
      <div className="engine-funnel-exclusions" aria-label="Overlapping prospect attributes">
        <div className="engine-funnel-section-head">
          <h3>Overlapping Attributes</h3>
          <p>These counts can overlap. They explain traits, not funnel stages, so do not add them together.</p>
        </div>
        {prospectAttributeKeys.map((filter) => (
          <CountButton count={funnel.attributes[filter]} key={filter} filter={filter} label={prospectFunnelLabels[filter]} />
        ))}
      </div>
      {showDiagnostics ? (
        <div className="engine-funnel-diagnostics">
          <h3>Explain Prospect Counts</h3>
          <p>Total prospects <b>{funnel.diagnostics.totalProspects}</b>. Sum of exclusive primary buckets <b>{funnel.diagnostics.exclusiveTotal}</b>. Difference <b>{funnel.diagnostics.difference}</b>: {funnel.diagnostics.reconciles ? "counts match" : "needs review"}.</p>
          <dl>
            <div><dt>Duplicate</dt><dd>{removed.duplicate}</dd></div>
            <div><dt>Bad fit</dt><dd>{removed.badFit}</dd></div>
            <div><dt>Needs manual research</dt><dd>{removed.needsManualResearch}</dd></div>
            <div><dt>Strong website</dt><dd>{removed.strongWebsite}</dd></div>
            <div><dt>Suppressed</dt><dd>{removed.suppressed}</dd></div>
            <div><dt>Contacted</dt><dd>{removed.contacted}</dd></div>
            <div><dt>Phone only</dt><dd>{removed.phoneOnly}</dd></div>
            <div><dt>Qualified</dt><dd>{removed.qualified}</dd></div>
            <div><dt>Ready for outreach</dt><dd>{removed.readyForOutreach}</dd></div>
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function prospectContactPathLabel(prospect: Prospect) {
  if (prospect.email) return "Email found";
  if (prospect.quoteFormUrl) return "Quote form";
  if (prospect.contactFormUrl) return "Contact form";
  if (prospect.facebookUrl || prospect.instagramUrl || prospect.linkedinUrl) return "Social path";
  if (prospect.phone) return "Phone only";
  return "Needs research";
}

function prospectNextActionLabel(prospect: Prospect) {
  if (!prospect.analysis && prospect.websiteStatus === "unknown") return "Analyze";
  if (!prospect.preview) return "Generate preview";
  if (!prospect.outreach) return "Generate outreach";
  if (!prospect.outreach.approved) return "Review draft";
  if (!prospectWrittenContactMethodIsUsable(prospect)) return "Verify contact";
  return "Review";
}

function ProspectTable({
  prospects,
  selectedId,
  previewRegeneratingId,
  onRegeneratePreview,
  onSelect,
}: {
  prospects: Prospect[];
  selectedId: string;
  previewRegeneratingId: string;
  onRegeneratePreview: (feedback?: string, prospect?: Prospect) => Promise<void>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="engine-table" role="table" aria-label="Prospects">
      <div className="engine-table__head" role="row"><span>Prospect</span><span>Contact</span><span>Status</span><span>Score</span><span>Next</span></div>
      {prospects.map((prospect) => {
        const labels = prospectPresenceLabels(prospect);
        const state = prospect.analysis ? `${prospect.analysis.overallScore}/100 website` : prospect.websiteStatus === "unknown" ? "Not analyzed" : prospect.websiteStatusDetail || "Presence Gap";
        const publicPreviewUrl = publicPreviewUrlForProspect(prospect);
        return (
          <article className={prospect.id === selectedId ? "is-selected" : ""} key={prospect.id} role="row">
            <button className="engine-table-main" onClick={() => onSelect(prospect.id)} type="button">
              <span><b>{prospect.businessName}</b><small>{prospectLocationLine(prospect)}</small></span>
              <span className="engine-table-presence"><b>{state}</b>{labels.slice(0, 2).map((label) => <small key={label}>{label}</small>)}</span>
            </button>
            <span className="engine-table-contact">{prospectContactPathLabel(prospect)}</span>
            <span><i className={`engine-status engine-status--${prospect.status.toLowerCase().replaceAll(" ", "-")}`}>{prospect.status}</i></span>
            <span><strong>{prospect.priorityScore}</strong></span>
            <span className="engine-row-actions">
              <button className="engine-button engine-button--primary" onClick={() => onSelect(prospect.id)} type="button">Review</button>
              {publicPreviewUrl ? <a className="engine-button" href={publicPreviewUrl} rel="noreferrer" target="_blank">Open Preview</a> : null}
              <ActionMenu label="More">
                {(close) => (
                  <>
                    <button onClick={() => { close(); onSelect(prospect.id); }} type="button">Open detail</button>
                    <button onClick={() => { close(); onSelect(prospect.id); }} type="button">{prospectNextActionLabel(prospect)}</button>
                    <button onClick={() => { close(); onSelect(prospect.id); }} type="button">Rewrite outreach</button>
                    <button
                      disabled={previewRegeneratingId === prospect.id}
                      onClick={() => {
                        close();
                        onSelect(prospect.id);
                        void onRegeneratePreview("", prospect);
                      }}
                      type="button"
                    >
                      {previewRegeneratingId === prospect.id ? "Regenerating" : "Regenerate with fixes"}
                    </button>
                    <button onClick={() => { close(); onSelect(prospect.id); }} type="button">Mark reviewed</button>
                    <button onClick={() => { close(); onSelect(prospect.id); }} type="button">Suppress</button>
                    <button onClick={() => { close(); onSelect(prospect.id); }} type="button">Add feedback</button>
                  </>
                )}
              </ActionMenu>
            </span>
          </article>
        );
      })}
    </div>
  );
}

function DiscoveryDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="engine-dialog-backdrop" onMouseDown={onClose}><dialog aria-labelledby="discovery-title" className="engine-dialog" onMouseDown={(event) => event.stopPropagation()} open><header><div><p>Lead discovery</p><h2 id="discovery-title">Add a contractor prospect</h2></div><button aria-label="Close" onClick={onClose} type="button">×</button></header><form onSubmit={onSubmit}><div className="engine-form-grid"><label>Business name<input name="businessName" required /></label><label>Website (optional)<input name="website" placeholder="https://" type="url" /></label><label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Business size<select name="sizeIndicator"><option>Small</option><option>Growing</option><option>Established</option></select></label><label>City<span>Enter one city at a time.</span><input name="city" required /></label><label>State<input maxLength={2} name="state" required /></label><label>Phone<input name="phone" required type="tel" /></label><label>Public email<input name="email" type="email" /></label><label className="engine-form-wide">Service area<input name="serviceArea" placeholder="City and nearby communities" required /></label></div><footer><button className="engine-button" onClick={onClose} type="button">Cancel</button><button className="engine-button engine-button--primary" type="submit">Add to discovery queue</button></footer></form></dialog></div>;
}

function LeadSearchDialog({ diagnostics, existingWebsites, leads, state, error, onClose, onDiscover, onImport }: { diagnostics: DiscoveryDiagnostics | null; existingWebsites: Set<string>; leads: DiscoveredLead[]; state: "idle" | "loading" | "error"; error: string; onClose: () => void; onDiscover: (event: FormEvent<HTMLFormElement>) => void; onImport: (lead: DiscoveredLead) => void }) {
  return <div className="engine-dialog-backdrop" onMouseDown={onClose}><dialog aria-labelledby="lead-search-title" className="engine-dialog engine-dialog--wide" onMouseDown={(event) => event.stopPropagation()} open><header><div><p>Public-data discovery</p><h2 id="lead-search-title">Find contractor websites</h2></div><button aria-label="Close" onClick={onClose} type="button">×</button></header><form className="engine-discovery-form" onSubmit={onDiscover}><label>Trade<select name="trade">{tradeCategories.map((item) => <option key={item}>{item}</option>)}</select></label><label>City<span>Enter one city at a time.</span><input name="city" required /></label><label>State<input maxLength={2} name="state" required /></label><label>Radius<select name="radiusKm"><option value="10">10 km</option><option value="25">25 km</option><option value="50">50 km</option></select></label><button className="engine-button engine-button--primary" disabled={state === "loading"} type="submit">{state === "loading" ? "Searching" : "Find leads"}</button></form>{state === "error" && <p className="engine-dialog-error" role="alert">{error}</p>}{diagnostics && <DiscoveryFunnel diagnostics={diagnostics} />}<div className="engine-discovery-results">{leads.length === 0 && state !== "loading" ? <EmptyState title="No discovery results yet" body="Search one trade and location at a time. Results with usable public websites will appear here for review." /> : leads.map((lead) => { const exists = existingWebsites.has(lead.website); return <article key={lead.website}><div><b>{lead.businessName}</b><span>{prospectLocationLine(lead)}</span>{lead.sources?.length ? <span>{lead.sourceConfidence ?? 0}% source confidence · {lead.sources.join(", ")}</span> : null}<a href={lead.website} rel="noreferrer" target="_blank">{lead.website}</a></div><button className="engine-button" disabled={exists} onClick={() => onImport(lead)} type="button">{exists ? "Already added" : "Import prospect"}</button></article>; })}</div><footer><p>Searches are user-triggered, rate-limited, and merge approved public-data sources. Review every lead before outreach.</p><button className="engine-button" onClick={onClose} type="button">Close</button></footer></dialog></div>;
}
