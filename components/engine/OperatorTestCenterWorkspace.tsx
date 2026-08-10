"use client";

import React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import type { OperatorActionResult, OperatorTestCenterPayload } from "@/lib/operator-test-center";
import type { FullLegacyCleanupReport } from "@/lib/full-legacy-website-cleanup";
import type { ManualReviewTriageReport } from "@/lib/manual-review-triage";

type ActionState = "idle" | "running";
type TestCenterView = "readiness" | "safeTests" | "results" | "diagnostics";

const testCenterViewLabels: Record<TestCenterView, string> = {
  readiness: "Readiness",
  safeTests: "Safe Tests",
  results: "Results",
  diagnostics: "Diagnostics",
};

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function apiError(payload: { error?: string; message?: string }, fallback: string) {
  return payload.error || payload.message || fallback;
}

const fullLegacyCleanupStorageKey = "webworkshop-full-legacy-cleanup-run";
const fullLegacyCleanupMaximumClientSteps = 100;
const manualReviewTriageStorageKey = "webworkshop-manual-review-triage-run";

async function fullLegacyCleanupRequest(
  action: string,
  reference: Partial<Pick<FullLegacyCleanupReport, "auditRunId" | "accessToken">> = {},
  confirmation = "",
) {
  const response = await fetch("/api/engine/website-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...reference, ...(confirmation ? { confirmation } : {}) }),
  });
  const body = await response.json() as FullLegacyCleanupReport & { error?: string };
  if (!response.ok || !body.auditRunId) throw new Error(apiError(body, "Full Legacy Cleanup failed safely."));
  return body;
}

async function manualReviewTriageRequest(
  action: string,
  reference: Partial<Pick<ManualReviewTriageReport, "auditRunId" | "accessToken">> = {},
  confirmation = "",
) {
  const response = await fetch("/api/engine/website-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...reference, ...(confirmation ? { confirmation } : {}) }),
  });
  const body = await response.json() as ManualReviewTriageReport & { error?: string };
  if (!response.ok || !body.auditRunId) throw new Error(apiError(body, "Manual Review Triage failed safely."));
  return body;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function failedRecordOpenDetail(record: { openAction: "prospect_outreach" | "prospect_preview" | "top_prospects" | "queue_review"; prospectId: string }) {
  if (record.openAction === "top_prospects") return { tab: "top-prospects" };
  if (record.openAction === "prospect_preview") return { tab: "prospects", prospectId: record.prospectId, detailTab: "Preview" };
  if (record.openAction === "queue_review") return { tab: "prospects", prospectId: record.prospectId, detailTab: "Activity" };
  return { tab: "prospects", prospectId: record.prospectId, detailTab: "Outreach" };
}

function TestCenterTabs({ active, onChange }: { active: TestCenterView; onChange: (value: TestCenterView) => void }) {
  return (
    <div className="engine-section-tabs engine-section-tabs--sticky" role="tablist" aria-label="Operator Test Center views">
      {(Object.keys(testCenterViewLabels) as TestCenterView[]).map((key) => (
        <button
          aria-selected={active === key}
          className={active === key ? "is-active" : ""}
          key={key}
          onClick={() => onChange(key)}
          role="tab"
          type="button"
        >
          {testCenterViewLabels[key]}
        </button>
      ))}
    </div>
  );
}

export function OperatorTestCenterWorkspace() {
  const [payload, setPayload] = useState<OperatorTestCenterPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [lastAction, setLastAction] = useState<OperatorActionResult | null>(null);
  const [copied, setCopied] = useState("");
  const [providerSmokeSummary, setProviderSmokeSummary] = useState("");
  const [activeView, setActiveView] = useState<TestCenterView>("readiness");
  const [repairConfirmationOpen, setRepairConfirmationOpen] = useState(false);
  const [pilotConfirmationOpen, setPilotConfirmationOpen] = useState(false);
  const [pilotConfirmation, setPilotConfirmation] = useState("");
  const [emergencyStopConfirmationOpen, setEmergencyStopConfirmationOpen] = useState(false);
  const [websiteRepairConfirmationOpen, setWebsiteRepairConfirmationOpen] = useState(false);
  const [websiteRepairConfirmation, setWebsiteRepairConfirmation] = useState("");
  const [websiteAuditProspectId, setWebsiteAuditProspectId] = useState("");
  const [selectedWebsiteRepairProspectIds, setSelectedWebsiteRepairProspectIds] = useState<string[]>([]);
  const websiteAuditRequestInFlight = useRef(false);
  const [fullLegacyCleanup, setFullLegacyCleanup] = useState<FullLegacyCleanupReport | null>(null);
  const [fullLegacyCleanupConfirmationOpen, setFullLegacyCleanupConfirmationOpen] = useState(false);
  const [fullLegacyCleanupConfirmation, setFullLegacyCleanupConfirmation] = useState("");
  const fullLegacyCleanupRequestInFlight = useRef(false);
  const [manualReviewTriage, setManualReviewTriage] = useState<ManualReviewTriageReport | null>(null);
  const [manualReviewTriageConfirmationOpen, setManualReviewTriageConfirmationOpen] = useState(false);
  const [manualReviewTriageConfirmation, setManualReviewTriageConfirmation] = useState("");
  const manualReviewTriageRequestInFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/engine/operator-test-center", { cache: "no-store" });
      const body = (await response.json()) as OperatorTestCenterPayload & { error?: string };
      if (!response.ok || !body.statusCards) throw new Error(apiError(body, "Unable to load Operator Test Center."));
      setPayload(body);
    } catch (loadError) {
      setPayload(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load Operator Test Center.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const savedView = window.localStorage.getItem("webworkshop-test-center-view");
    if (savedView && Object.hasOwn(testCenterViewLabels, savedView)) setActiveView(savedView as TestCenterView);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("webworkshop-test-center-view", activeView);
  }, [activeView]);

  const rememberFullLegacyCleanup = useCallback((report: FullLegacyCleanupReport) => {
    setFullLegacyCleanup(report);
    window.localStorage.setItem(fullLegacyCleanupStorageKey, JSON.stringify({
      auditRunId: report.auditRunId,
      accessToken: report.accessToken,
    }));
  }, []);

  const driveFullLegacyCleanup = useCallback(async (initial: FullLegacyCleanupReport) => {
    let current = initial;
    let steps = 0;
    while (current.status === "AUDITING" || current.status === "APPLYING") {
      steps += 1;
      if (steps > fullLegacyCleanupMaximumClientSteps) {
        throw new Error("Full Legacy Cleanup paused at the client safety limit. Resume the persisted run to continue safely.");
      }
      const previousProgress = current.status === "AUDITING" ? current.inspectedCount : current.appliedCount;
      current = await fullLegacyCleanupRequest(
        current.status === "AUDITING" ? "continue_full_legacy_cleanup" : "continue_full_legacy_cleanup_apply",
        current,
      );
      rememberFullLegacyCleanup(current);
      const nextProgress = current.status === "AUDITING" ? current.inspectedCount : current.appliedCount;
      if (current.status === "AUDITING" || current.status === "APPLYING") {
        await wait(nextProgress === previousProgress ? 500 : 80);
      }
    }
    return current;
  }, [rememberFullLegacyCleanup]);

  useEffect(() => {
    const saved = window.localStorage.getItem(fullLegacyCleanupStorageKey);
    if (!saved || fullLegacyCleanupRequestInFlight.current) return;
    let reference: { auditRunId: string; accessToken: string };
    try {
      reference = JSON.parse(saved) as { auditRunId: string; accessToken: string };
    } catch {
      window.localStorage.removeItem(fullLegacyCleanupStorageKey);
      return;
    }
    if (!reference.auditRunId || !reference.accessToken) return;
    fullLegacyCleanupRequestInFlight.current = true;
    setActionState("running");
    setActiveView("results");
    void fullLegacyCleanupRequest("get_full_legacy_cleanup", reference)
      .then((report) => {
        rememberFullLegacyCleanup(report);
        return driveFullLegacyCleanup(report);
      })
      .then(() => setActiveView("results"))
      .catch((resumeError) => {
        const message = resumeError instanceof Error ? resumeError.message : "Unable to resume Full Legacy Cleanup safely.";
        if (/invalid|expired/i.test(message)) window.localStorage.removeItem(fullLegacyCleanupStorageKey);
        setError(message);
      })
      .finally(() => {
        fullLegacyCleanupRequestInFlight.current = false;
        setActionState("idle");
      });
  }, [driveFullLegacyCleanup, rememberFullLegacyCleanup]);

  async function runFullLegacyCleanup(options: { apply?: boolean } = {}) {
    if (fullLegacyCleanupRequestInFlight.current) return;
    fullLegacyCleanupRequestInFlight.current = true;
    setActionState("running");
    setActiveView("results");
    setError("");
    setNotice("");
    try {
      const resumable = fullLegacyCleanup
        && (fullLegacyCleanup.status === "AUDITING" || fullLegacyCleanup.status === "APPLYING");
      const initial = options.apply
        ? await fullLegacyCleanupRequest(
          "apply_full_legacy_cleanup",
          fullLegacyCleanup ?? {},
          fullLegacyCleanupConfirmation,
        )
        : resumable
          ? await fullLegacyCleanupRequest("get_full_legacy_cleanup", fullLegacyCleanup)
          : await fullLegacyCleanupRequest("start_full_legacy_cleanup");
      rememberFullLegacyCleanup(initial);
      const completed = await driveFullLegacyCleanup(initial);
      setActiveView("results");
      setFullLegacyCleanupConfirmationOpen(false);
      setFullLegacyCleanupConfirmation("");
      setNotice(completed.status === "APPLIED"
        ? `${completed.appliedCount} verified website record(s) repaired. Nothing was sent.`
        : `Full Legacy Cleanup inspected ${completed.inspectedCount} candidate(s). Nothing was changed or sent.`);
      await load();
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Full Legacy Cleanup failed safely.");
    } finally {
      fullLegacyCleanupRequestInFlight.current = false;
      setActionState("idle");
    }
  }

  const rememberManualReviewTriage = useCallback((report: ManualReviewTriageReport) => {
    setManualReviewTriage(report);
    window.localStorage.setItem(manualReviewTriageStorageKey, JSON.stringify({
      auditRunId: report.auditRunId,
      accessToken: report.accessToken,
    }));
  }, []);

  const driveManualReviewTriage = useCallback(async (initial: ManualReviewTriageReport) => {
    let current = initial;
    let steps = 0;
    while (current.status === "AUDITING" || current.status === "APPLYING") {
      steps += 1;
      if (steps > fullLegacyCleanupMaximumClientSteps) {
        throw new Error("Manual Review Triage paused at the client safety limit. Resume the persisted run to continue safely.");
      }
      const previousProgress = current.status === "AUDITING" ? current.inspectedCount : current.appliedCount;
      current = await manualReviewTriageRequest(
        current.status === "AUDITING" ? "continue_manual_review_triage" : "continue_manual_review_triage_apply",
        current,
      );
      rememberManualReviewTriage(current);
      const nextProgress = current.status === "AUDITING" ? current.inspectedCount : current.appliedCount;
      if (current.status === "AUDITING" || current.status === "APPLYING") {
        await wait(nextProgress === previousProgress ? 500 : 80);
      }
    }
    return current;
  }, [rememberManualReviewTriage]);

  useEffect(() => {
    const saved = window.localStorage.getItem(manualReviewTriageStorageKey);
    if (!saved || manualReviewTriageRequestInFlight.current) return;
    let reference: { auditRunId: string; accessToken: string };
    try {
      reference = JSON.parse(saved) as { auditRunId: string; accessToken: string };
    } catch {
      window.localStorage.removeItem(manualReviewTriageStorageKey);
      return;
    }
    if (!reference.auditRunId || !reference.accessToken) return;
    manualReviewTriageRequestInFlight.current = true;
    setActionState("running");
    setActiveView("results");
    void manualReviewTriageRequest("get_manual_review_triage", reference)
      .then((report) => {
        rememberManualReviewTriage(report);
        return driveManualReviewTriage(report);
      })
      .catch((resumeError) => {
        const message = resumeError instanceof Error ? resumeError.message : "Unable to resume Manual Review Triage safely.";
        if (/invalid|expired/i.test(message)) window.localStorage.removeItem(manualReviewTriageStorageKey);
        setError(message);
      })
      .finally(() => {
        manualReviewTriageRequestInFlight.current = false;
        setActionState("idle");
      });
  }, [driveManualReviewTriage, rememberManualReviewTriage]);

  async function runManualReviewTriage(options: { apply?: boolean } = {}) {
    if (manualReviewTriageRequestInFlight.current) return;
    manualReviewTriageRequestInFlight.current = true;
    setActionState("running");
    setActiveView("results");
    setError("");
    setNotice("");
    try {
      const resumable = manualReviewTriage
        && (manualReviewTriage.status === "AUDITING" || manualReviewTriage.status === "APPLYING");
      const initial = options.apply
        ? await manualReviewTriageRequest(
          "apply_manual_review_triage",
          manualReviewTriage ?? {},
          manualReviewTriageConfirmation,
        )
        : resumable
          ? await manualReviewTriageRequest("get_manual_review_triage", manualReviewTriage)
          : await manualReviewTriageRequest("start_manual_review_triage");
      rememberManualReviewTriage(initial);
      const completed = await driveManualReviewTriage(initial);
      setManualReviewTriageConfirmationOpen(false);
      setManualReviewTriageConfirmation("");
      setNotice(completed.status === "APPLIED"
        ? `${completed.appliedCount} reviewed website-only triage result(s) applied. Nothing was sent.`
        : `Manual Review Triage inspected ${completed.inspectedCount} unresolved prospect(s). Nothing was changed or sent.`);
      await load();
    } catch (triageError) {
      setError(triageError instanceof Error ? triageError.message : "Manual Review Triage failed safely.");
    } finally {
      manualReviewTriageRequestInFlight.current = false;
      setActionState("idle");
    }
  }

  async function runOperatorAction(action: string) {
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/operator-test-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = (await response.json()) as OperatorActionResult & { error?: string };
      if (!response.ok) throw new Error(apiError(body, "Operator action failed safely."));
      setLastAction(body);
      setNotice(body.message);
      setActiveView(
        action === "run_full_autonomous_readiness_test"
        || action === "run_safe_readiness_repair"
        || action === "run_controlled_outreach_launch_readiness"
        || action === "validate_controlled_pilot_send"
          ? "readiness"
          : "results",
      );
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Operator action failed safely.");
    } finally {
      setActionState("idle");
    }
  }

  async function confirmSafeReadinessRepair() {
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/operator-test-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_safe_readiness_repair", confirmed: true }),
      });
      const body = (await response.json()) as OperatorActionResult & { error?: string };
      if (!response.ok) throw new Error(apiError(body, "Safe readiness repair failed without sending outreach."));
      setLastAction(body);
      setNotice(body.message);
      setRepairConfirmationOpen(false);
      setActiveView("readiness");
      await load();
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : "Safe readiness repair failed without sending outreach.");
    } finally {
      setActionState("idle");
    }
  }

  async function confirmControlledPilotActivation() {
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/operator-test-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enable_controlled_email_pilot",
          confirmation: pilotConfirmation,
        }),
      });
      const body = (await response.json()) as OperatorActionResult & { error?: string };
      setLastAction(body);
      setActiveView("readiness");
      if (!response.ok || !body.controlledActivation?.activated) {
        throw new Error(apiError(body, "Controlled Email Pilot was not activated."));
      }
      setNotice(body.message);
      setPilotConfirmation("");
      setPilotConfirmationOpen(false);
      await load();
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Controlled Email Pilot was not activated.");
    } finally {
      setActionState("idle");
    }
  }

  async function confirmEmergencyStop() {
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/operator-test-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "disable_all_prospect_email_sending" }),
      });
      const body = (await response.json()) as OperatorActionResult & { error?: string };
      if (!response.ok || !body.emergencyStop?.disabled) {
        throw new Error(apiError(body, "Prospect email emergency stop failed safely."));
      }
      setLastAction(body);
      setNotice(body.message);
      setEmergencyStopConfirmationOpen(false);
      setActiveView("readiness");
      await load();
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Prospect email emergency stop failed safely.");
    } finally {
      setActionState("idle");
    }
  }

  async function runWebsiteRecordAudit(options: {
    apply?: boolean;
    offset?: number;
    prospectId?: string;
  } = {}) {
    if (websiteAuditRequestInFlight.current) return;
    websiteAuditRequestInFlight.current = true;
    const apply = options.apply === true;
    const reviewedBatch = lastAction?.websiteRepair;
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/website-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: apply ? "apply_existing_record_repair" : "audit_existing_records",
          ...(apply ? {
            confirmation: websiteRepairConfirmation,
            reviewToken: reviewedBatch?.reviewToken ?? "",
            offset: reviewedBatch?.offset,
            limit: reviewedBatch?.batchSize,
            selectedProspectIds: selectedWebsiteRepairProspectIds,
          } : {
            offset: options.offset ?? 0,
            ...(options.prospectId ? { prospectId: options.prospectId } : {}),
            ...(!options.prospectId && reviewedBatch?.scope === "batch" ? { limit: reviewedBatch.batchSize } : {}),
          }),
        }),
      });
      const body = (await response.json()) as NonNullable<OperatorActionResult["websiteRepair"]> & { error?: string };
      if (!response.ok || !body.mode) throw new Error(apiError(body, "Website-record audit failed safely."));
      setLastAction({
        ok: true,
        message: apply
          ? `Verified website repair updated ${body.changed} record(s). Nothing was sent.`
          : body.scope === "exact_prospect"
            ? `Website verification dry run inspected prospect ${body.exactProspectId}. Nothing was changed or sent.`
            : `Website verification dry run inspected ${body.rangeStart}-${body.rangeEnd} of ${body.candidates} legacy candidate(s). Nothing was changed or sent.`,
        websiteRepair: body,
      });
      setNotice(apply
        ? `Verified website repair updated ${body.changed} record(s). Nothing was sent.`
        : body.scope === "exact_prospect"
          ? `Website verification dry run inspected prospect ${body.exactProspectId}. Nothing was changed or sent.`
          : `Website verification dry run inspected ${body.rangeStart}-${body.rangeEnd} of ${body.candidates} legacy candidate(s). Nothing was changed or sent.`);
      setWebsiteRepairConfirmationOpen(false);
      setWebsiteRepairConfirmation("");
      setSelectedWebsiteRepairProspectIds([]);
      setActiveView("results");
      await load();
    } catch (auditError) {
      setError(auditError instanceof Error ? auditError.message : "Website-record audit failed safely.");
    } finally {
      websiteAuditRequestInFlight.current = false;
      setActionState("idle");
    }
  }

  async function runProviderSmokeTest() {
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/system/provider-smoke-test", { method: "POST" });
      const body = (await response.json()) as { smokeTest?: { sampleCount: number; createdOutreachPackages: boolean; sentOutreach: boolean; safeError?: string }; error?: string };
      if (!response.ok || !body.smokeTest) throw new Error(apiError(body, "Provider Smoke Test failed safely."));
      setProviderSmokeSummary([
        `Samples: ${body.smokeTest.sampleCount}`,
        `Outreach packages created: ${body.smokeTest.createdOutreachPackages ? "Yes" : "No"}`,
        `Outreach sent: ${body.smokeTest.sentOutreach ? "Yes" : "No"}`,
        body.smokeTest.safeError ? `Safe error: ${body.smokeTest.safeError}` : "",
      ].filter(Boolean).join("\n"));
      setNotice("Provider Smoke Test finished. It created no outreach packages and sent nothing.");
      setActiveView("diagnostics");
      await load();
    } catch (smokeError) {
      setError(smokeError instanceof Error ? smokeError.message : "Provider Smoke Test failed safely.");
    } finally {
      setActionState("idle");
    }
  }

  async function runSmallTopProspectsTest() {
    if (!payload) return;
    setActionState("running");
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/engine/top-prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: payload.safeTestInput.trade,
          city: payload.safeTestInput.city,
          state: payload.safeTestInput.state,
          radiusKm: payload.safeTestInput.radiusKm,
          businessesToScan: payload.safeTestInput.businessesToScan,
          finalProspectsWanted: payload.safeTestInput.finalProspectsWanted,
          prospectType: "all",
          mode: "growth",
          workflowType: "search",
          outreachPreference: "written_only",
          excludePreviouslyReviewed: true,
        }),
      });
      const body = (await response.json()) as { jobId?: string; error?: string };
      if (!response.ok || !body.jobId) throw new Error(apiError(body, "Unable to start the small Top Prospects test."));
      setNotice(`Small Top Prospects test started. Job ID: ${body.jobId}. No outreach will be sent automatically.`);
      await load();
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "Unable to start the small Top Prospects test.");
    } finally {
      setActionState("idle");
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      setError("Copy failed. Select the summary text manually and copy it.");
    }
  }

  function openEngineRecord(detail: { tab?: string; prospectId?: string; detailTab?: string }) {
    window.dispatchEvent(new CustomEvent("webworkshop:open-engine-record", { detail }));
  }

  if (loading) return <div className="engine-content"><LoadingState title="Loading Operator Test Center" body="Checking safe test actions, provider coverage, email gates, and the latest prospecting activity." /></div>;
  if (!payload) return <div className="engine-content"><EmptyState title="Operator Test Center unavailable" body={error || "Reload the engine and try again."} action={() => void load()} actionLabel="Retry" /></div>;
  const busy = actionState === "running";
  const reviewedWebsiteRepair = lastAction?.websiteRepair;
  const selectedWebsiteRepairRecords = reviewedWebsiteRepair?.records.filter((record) => (
    selectedWebsiteRepairProspectIds.includes(record.prospectId)
  )) ?? [];
  const highConfidenceExclusionIds = reviewedWebsiteRepair?.scope === "batch"
    ? reviewedWebsiteRepair.records
      .filter((record) => record.selectionEligible && record.highConfidenceExclusionEligible)
      .map((record) => record.prospectId)
    : [];
  const regenerationSummaryText = lastAction?.regeneration ? [
    lastAction.regeneration.message,
    `Copy version: ${lastAction.regeneration.copyVersion}`,
    `Updated: ${lastAction.regeneration.updated}`,
    `Skipped: ${lastAction.regeneration.skipped}`,
    Object.entries(lastAction.regeneration.skippedReasons).map(([reason, count]) => `${count} skipped because ${reason}`).join("\n"),
  ].filter(Boolean).join("\n") : "";

  return (
    <div className="engine-content engine-operator-test-center">
      <section className="engine-operator-sticky" aria-label="Operator current status">
        <div>
          <span>Operator Test Center</span>
          <h2>{payload.nextRecommendedTest}</h2>
          <p>No prospect email, DM, form, phone call, or Loom is sent by this page.</p>
        </div>
        <button className="engine-button" disabled={loading || busy} onClick={() => void load()} type="button">Refresh</button>
      </section>

      {error ? <div className="engine-error-banner" role="alert"><div><b>Operator Test Center needs attention</b><p>{error}</p></div></div> : null}
      {notice ? <div className="engine-success-banner" role="status"><div><b>Safe test completed</b><p>{notice}</p></div></div> : null}

      <TestCenterTabs active={activeView} onChange={setActiveView} />

      {activeView === "readiness" ? (
      <section className="engine-operator-card-grid" aria-label="Operator status cards">
        {payload.statusCards.map((card) => (
          <article className={`engine-operator-card engine-operator-card--${card.status}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>
      ) : null}

      {activeView === "results" ? (
      <section className="engine-panel engine-operator-copy" aria-label="Latest Safe Test Results">
        <div className="engine-panel__head">
          <div>
            <h2>Latest Safe Test Results</h2>
            <p>Persisted, secret-safe results loaded on Refresh. Provider smoke tests create no packages and send nothing.</p>
          </div>
          <span>Persisted audit</span>
        </div>
        <div className="engine-operator-summary-grid">
          {([
            ["Provider Smoke Test", payload.latestSafeTestResults.providerSmokeTest],
            ["Internal Notification Test", payload.latestSafeTestResults.internalNotificationTest],
            ["Internal Resend Test", payload.latestSafeTestResults.internalResendTest],
            ["Full Readiness Test", payload.latestSafeTestResults.fullReadinessTest],
          ] as const).map(([label, value]) => (
            <article key={label}>
              <header>
                <h3>{label}</h3>
                <button className="engine-button" onClick={() => void copyText(label, value)} type="button">Copy</button>
              </header>
              <pre>{value}</pre>
            </article>
          ))}
        </div>
      </section>
      ) : null}

      {activeView === "safeTests" ? (
      <section className="engine-panel engine-operator-actions" aria-label="Safe test actions">
        <div className="engine-panel__head">
          <div>
            <h2>Safe test buttons</h2>
            <p>All tests are operator-only. Provider smoke tests create no packages. Internal emails go only to INTERNAL_NOTIFY_EMAIL. Internal texts go only to INTERNAL_NOTIFY_PHONE.</p>
          </div>
          <span>{busy ? "Running" : "Ready"}</span>
        </div>
        <div className="engine-operator-button-grid">
          <button className="engine-button engine-button--primary engine-operator-master-button" disabled={busy} onClick={() => void runOperatorAction("run_full_autonomous_readiness_test")} type="button">Run Full Autonomous Readiness Test</button>
          <button className="engine-button" disabled={busy} onClick={() => setRepairConfirmationOpen(true)} type="button">Repair Readiness Issues Safely</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("check_email_safety_gates")} type="button">Check Email Safety Gates</button>
          <button className="engine-button engine-button--primary" disabled={busy} onClick={() => void runOperatorAction("run_controlled_outreach_launch_readiness")} type="button">Controlled Outreach Launch Readiness</button>
          <button
            className="engine-button"
            disabled={busy || lastAction?.controlledReadiness?.activationEnabled !== true}
            onClick={() => setPilotConfirmationOpen(true)}
            type="button"
          >
            Enable Controlled Email Pilot
          </button>
          <button className="engine-button engine-button--danger" disabled={busy} onClick={() => setEmergencyStopConfirmationOpen(true)} type="button">Disable All Prospect Email Sending</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("validate_controlled_pilot_send")} type="button">Validate First Pilot Send</button>
          <button className="engine-button" disabled={busy} onClick={() => void runWebsiteRecordAudit()} type="button">Audit Legacy Website Records</button>
          <button className="engine-button" disabled={busy} onClick={() => void runProviderSmokeTest()} type="button">Run Provider Smoke Test</button>
          <button className="engine-button engine-button--primary" disabled={busy} onClick={() => void runSmallTopProspectsTest()} type="button">Run Small Top Prospects Test</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("generate_test_package")} type="button">Generate One Fake Test Outreach Package</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("regenerate_unsent_outreach_copy")} type="button">Regenerate Unsent Outreach Copy</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("run_smart_backfill_test")} type="button">Run Smart Backfill Test</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("run_market_scout_dry_run")} type="button">Run Market Scout Dry Run</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("run_smart_autonomous_dry_run")} type="button">Run Smart Autonomous Dry Run</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("simulate_next_24_hours")} type="button">Simulate Next 24 Hours</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("send_internal_notification")} type="button">Send Internal Test Notification</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("send_internal_resend_test")} type="button">Send Internal Test Email Through Resend</button>
        </div>
        <section className="engine-operator-safety-note" aria-labelledby="full-legacy-cleanup-title">
          <div className="engine-panel__head">
            <div>
              <b id="full-legacy-cleanup-title">Full Legacy Website Cleanup</b>
              <p>Audit the entire current legacy inventory in resumable 20-record chunks, then review one consolidated safe-exclusion list. Audit sends nothing and changes no records.</p>
            </div>
            <span>{fullLegacyCleanup?.status ? statusLabel(fullLegacyCleanup.status) : "Ready"}</span>
          </div>
          <button
            aria-busy={busy && fullLegacyCleanupRequestInFlight.current}
            className="engine-button engine-button--primary"
            disabled={busy}
            onClick={() => void runFullLegacyCleanup()}
            type="button"
          >
            {busy && fullLegacyCleanupRequestInFlight.current ? <span aria-hidden="true" className="engine-button__spinner" /> : null}
            {busy && fullLegacyCleanupRequestInFlight.current
              ? "Scanning legacy records..."
              : fullLegacyCleanup?.status === "AUDITING" || fullLegacyCleanup?.status === "APPLYING"
                ? "Resume Full Legacy Cleanup"
                : "Run Full Legacy Cleanup"}
          </button>
        </section>
        <section className="engine-operator-safety-note" aria-labelledby="manual-review-triage-title">
          <div className="engine-panel__head">
            <div>
              <b id="manual-review-triage-title">Manual Review Triage</b>
              <p>Run one persisted, resumable deeper-evidence pass for current unresolved prospects. The audit changes nothing, creates no package, grants no approval, and sends nothing.</p>
            </div>
            <span>{manualReviewTriage?.status ? statusLabel(manualReviewTriage.status) : "Ready"}</span>
          </div>
          <button
            aria-busy={busy && manualReviewTriageRequestInFlight.current}
            className="engine-button engine-button--primary"
            disabled={busy}
            onClick={() => void runManualReviewTriage()}
            type="button"
          >
            {busy && manualReviewTriageRequestInFlight.current ? <span aria-hidden="true" className="engine-button__spinner" /> : null}
            {busy && manualReviewTriageRequestInFlight.current
              ? "Triaging unresolved prospects..."
              : manualReviewTriage?.status === "AUDITING" || manualReviewTriage?.status === "APPLYING"
                ? "Resume Manual Review Triage"
                : "Run Manual Review Triage"}
          </button>
        </section>
        <div className="engine-operator-safety-note">
          <b>Inspect one legacy prospect</b>
          <p>Enter an exact prospect ID to run the same website/contact revalidation for that record only. This action is read-only and cannot be applied.</p>
          <label className="engine-field">
            <span>Prospect ID</span>
            <input
              autoComplete="off"
              onChange={(event) => setWebsiteAuditProspectId(event.target.value)}
              placeholder="Exact prospect ID"
              value={websiteAuditProspectId}
            />
          </label>
          <button
            className="engine-button"
            disabled={busy || !websiteAuditProspectId.trim()}
            onClick={() => void runWebsiteRecordAudit({ prospectId: websiteAuditProspectId.trim() })}
            type="button"
          >
            Audit Exact Prospect
          </button>
        </div>
        {repairConfirmationOpen ? (
          <section aria-labelledby="safe-readiness-repair-title" className="engine-operator-safety-note" role="alertdialog">
            <b id="safe-readiness-repair-title">Confirm safe readiness repair</b>
            <p>The workflow will rerun readiness, repair only eligible unsent and uncontacted records, and rerun Email Safety Gates.</p>
            <ul>
              <li>No outreach will be sent.</li>
              <li>No settings, caps, or environment variables will change.</li>
              <li>Suppression and contact history will be preserved.</li>
              <li>No prospect will be approved and no preview will be built.</li>
              <li>Ambiguous records will remain for manual review.</li>
            </ul>
            <div className="engine-inline-actions">
              <button className="engine-button engine-button--primary" disabled={busy} onClick={() => void confirmSafeReadinessRepair()} type="button">
                {busy ? "Repairing safely..." : "Confirm Safe Repair"}
              </button>
              <button className="engine-button" disabled={busy} onClick={() => setRepairConfirmationOpen(false)} type="button">Cancel</button>
            </div>
          </section>
        ) : null}
        {pilotConfirmationOpen && lastAction?.controlledReadiness ? (
          <section aria-labelledby="controlled-pilot-confirmation-title" className="engine-operator-safety-note" role="alertdialog">
            <b id="controlled-pilot-confirmation-title">Confirm Controlled Email Pilot</b>
            <p>This changes only the existing database mode and safety caps. It does not approve or send an email.</p>
            <ul>
              <li>Daily cap: 1.</li>
              <li>Manual approval required: Yes.</li>
              <li>Full autonomous sending: Disabled.</li>
              <li>First-touch permission email only, with no preview link.</li>
              <li>No automatic preview, form, DM, call, SMS, Loom, or follow-up.</li>
              <li>Emergency stop remains available.</li>
            </ul>
            <label className="engine-field">
              <span>Type {lastAction.controlledReadiness.activationConfirmation}</span>
              <input
                autoComplete="off"
                onChange={(event) => setPilotConfirmation(event.target.value)}
                value={pilotConfirmation}
              />
            </label>
            <div className="engine-inline-actions">
              <button
                className="engine-button engine-button--primary"
                disabled={busy || pilotConfirmation !== lastAction.controlledReadiness.activationConfirmation}
                onClick={() => void confirmControlledPilotActivation()}
                type="button"
              >
                {busy ? "Enabling controlled pilot..." : "Enable Controlled Email Pilot"}
              </button>
              <button className="engine-button" disabled={busy} onClick={() => setPilotConfirmationOpen(false)} type="button">Cancel</button>
            </div>
          </section>
        ) : null}
        {emergencyStopConfirmationOpen ? (
          <section aria-labelledby="prospect-email-stop-title" className="engine-operator-safety-note" role="alertdialog">
            <b id="prospect-email-stop-title">Disable all prospect email sending?</b>
            <p>This immediately turns the database kill switch on and mode off. Records and audit history are preserved.</p>
            <div className="engine-inline-actions">
              <button className="engine-button engine-button--danger" disabled={busy} onClick={() => void confirmEmergencyStop()} type="button">
                {busy ? "Disabling prospect email..." : "Disable All Prospect Email Sending"}
              </button>
              <button className="engine-button" disabled={busy} onClick={() => setEmergencyStopConfirmationOpen(false)} type="button">Cancel</button>
            </div>
          </section>
        ) : null}
        <div className="engine-operator-safety-note">
          <b>Safety lock</b>
          <p>Prospect emails still obey OUTREACH_EMAIL_DISABLED, OUTREACH_AUTO_SEND_ENABLED, queue gates, public preview rules, suppression, cooldown, and approval status. Internal email notifications remain separate from prospect outreach. Full auto still requires OUTREACH_FULL_AUTO_SEND_ENABLED.</p>
        </div>
      </section>
      ) : null}

      {activeView === "readiness" && lastAction?.readiness ? (
        <section className="engine-panel engine-autonomous-readiness" aria-label="Full Autonomous Readiness Test result">
          <div className="engine-autonomous-readiness__summary">
            <div>
              <span>Full Autonomous Readiness Test</span>
              <h2>{lastAction.readiness.finalReadinessStatus}</h2>
              <p>{lastAction.readiness.overallStatus}</p>
              <p>{lastAction.readiness.nextSafestAction}</p>
            </div>
            <div className="engine-autonomous-readiness__badges">
              <b>Dry Run: {lastAction.readiness.dryRunManualRouting.status}</b>
              <b>Full Auto Email: {lastAction.readiness.fullAutoEmail.status}</b>
              <b>Manual Email Test: {lastAction.readiness.manualEmailTest.status}</b>
              <b>Auto Email Pilot: {lastAction.readiness.autoEmailPilot.status}</b>
            </div>
          </div>
          <dl className="engine-operator-check-grid">
            <div><dt>Passed</dt><dd>{lastAction.readiness.passed.length}</dd></div>
            <div><dt>Failed</dt><dd>{lastAction.readiness.failed.length}</dd></div>
            <div><dt>Blocking records</dt><dd>{lastAction.readiness.failedRecords.length}</dd></div>
            <div><dt>Autonomously eligible</dt><dd>{lastAction.readiness.autonomouslyEligibleRecords}</dd></div>
            <div><dt>Evidence review</dt><dd>{lastAction.readiness.evidenceReviewRecords.length}</dd></div>
            <div><dt>Informational outdated drafts</dt><dd>{lastAction.readiness.outdatedCopyRecords.length}</dd></div>
            <div><dt>Excluded records</dt><dd>{lastAction.readiness.excludedRecords.length}</dd></div>
            <div><dt>Optional / info</dt><dd>{lastAction.readiness.optional.length}</dd></div>
            <div><dt>Generated</dt><dd>{new Date(lastAction.readiness.generatedAt).toLocaleString()}</dd></div>
          </dl>
          {lastAction.repair ? (
            <section className="engine-readiness-failed-records" aria-label="Safe readiness repair receipt">
              <header>
                <div>
                  <span>Persisted operator receipt</span>
                  <h3>Safe readiness repair</h3>
                </div>
                <b>{lastAction.repair.finalEmailSafetyStatus}</b>
              </header>
              <dl className="engine-operator-check-grid">
                <div><dt>Inspected</dt><dd>{lastAction.repair.recordsInspected.length}</dd></div>
                <div><dt>Auto-fixed</dt><dd>{lastAction.repair.recordsAutoFixed.length}</dd></div>
                <div><dt>Removed from email eligibility</dt><dd>{lastAction.repair.recordsRemovedFromEligibility.length}</dd></div>
                <div><dt>Manual review</dt><dd>{lastAction.repair.recordsRequiringManualReview.length}</dd></div>
                <div><dt>Outreach sent</dt><dd>0</dd></div>
              </dl>
              <div>
                {lastAction.repair.recordsInspected.map((record) => (
                  <article key={`${record.packageId}:${record.classification}`}>
                    <span>{statusLabel(record.classification)}</span>
                    <h4>{record.businessName}</h4>
                    <p>{record.failureCategories.join(", ")}</p>
                    <p><b>Action:</b> {record.actionTaken}</p>
                  </article>
                ))}
              </div>
              <p>{lastAction.repair.finalEmailSafetySummary}</p>
              <p><b>Safety:</b> No emails, DMs, forms, calls, or Looms were sent. Settings were unchanged, and suppression/contact history was preserved.</p>
            </section>
          ) : null}
          {lastAction.readiness.failedRecords.length ? (
            <section className="engine-readiness-failed-records" aria-label="Blocking records needing attention">
              <header>
                <div>
                  <span>Blocking failures</span>
                  <h3>Blocking records needing attention</h3>
                </div>
                <b>{lastAction.readiness.failedRecords.length}</b>
              </header>
              <div>
                {lastAction.readiness.failedRecords.map((record) => (
                  <article key={record.id}>
                    <span>{record.category}</span>
                    <h4>{record.businessName}</h4>
                    <p>{record.reason}</p>
                    <p><b>Next:</b> {record.correction}</p>
                    <button className="engine-button" onClick={() => openEngineRecord(failedRecordOpenDetail(record))} type="button">Open record</button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {lastAction.readiness.evidenceReviewRecords.length ? (
            <section className="engine-readiness-failed-records engine-readiness-info-records" aria-label="Legacy and evidence review records">
              <header>
                <div>
                  <span>Not autonomously eligible</span>
                  <h3>Legacy and evidence review</h3>
                </div>
                <b>{lastAction.readiness.evidenceReviewRecords.length}</b>
              </header>
              <div>
                {lastAction.readiness.evidenceReviewRecords.map((record) => (
                  <article key={record.id}>
                    <span>{statusLabel(record.evidenceState)}</span>
                    <h4>{record.businessName}</h4>
                    <p>{record.reason}</p>
                    <p><b>Next:</b> {record.correction}</p>
                    <button className="engine-button" onClick={() => openEngineRecord(failedRecordOpenDetail(record))} type="button">Open record</button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {lastAction.readiness.outdatedCopyRecords.length ? (
            <section className="engine-readiness-failed-records engine-readiness-info-records" aria-label="Informational outdated drafts">
              <header>
                <div>
                  <span>Non-blocking information</span>
                  <h3>Informational outdated drafts</h3>
                </div>
                <b>{lastAction.readiness.outdatedCopyRecords.length}</b>
              </header>
              <div>
                {lastAction.readiness.outdatedCopyRecords.map((record) => (
                  <article key={record.id}>
                    <span>Manual draft, not a readiness failure</span>
                    <h4>{record.businessName}</h4>
                    <p><b>Prospect:</b> {record.prospectId || "Not linked"}</p>
                    <p><b>Package:</b> {record.packageId}</p>
                    <p><b>Current:</b> {record.currentCopyVersion} · {record.currentStatus} · {record.contactSource}</p>
                    <p><b>Evidence:</b> {statusLabel(record.evidenceState)}</p>
                    <p><b>Proposed:</b> {record.proposedChange}</p>
                    <button className="engine-button" onClick={() => openEngineRecord(failedRecordOpenDetail(record))} type="button">Open record</button>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
          {lastAction.readiness.excludedRecords.length ? (
            <details className="engine-autonomous-readiness__details">
              <summary>Excluded historical/non-actionable records</summary>
              <div className="engine-autonomous-readiness__check-list">
                {lastAction.readiness.excludedRecords.map((record) => (
                  <article className="engine-autonomous-readiness__check engine-autonomous-readiness__check--info" key={record.id}>
                    <span>{record.category}</span>
                    <h3>{record.businessName}</h3>
                    <p>{record.excludedReason}</p>
                    <p>Not evaluated for Manual Email Test or Auto Email Pilot readiness.</p>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
          <div className="engine-operator-summary-grid engine-autonomous-readiness__copies">
            {([
              ["Copy Full Autonomous Readiness Summary", lastAction.readiness.summaries.full],
              ["Copy Readiness Records Summary", lastAction.readiness.summaries.failedOnly],
              ["Copy Next Fix Summary", lastAction.readiness.summaries.nextFix],
              ["Copy Safe-To-Test Summary", lastAction.readiness.summaries.safeToTest],
              ["Copy Debug Summary", lastAction.readiness.summaries.debug],
            ] as const).map(([label, value]) => (
              <article key={label}>
                <header>
                  <h3>{label.replace("Copy ", "")}</h3>
                  <button className="engine-button" onClick={() => void copyText(label, value)} type="button">{label}</button>
                </header>
                <pre>{value}</pre>
              </article>
            ))}
          </div>
          <details className="engine-autonomous-readiness__details" open={lastAction.readiness.failed.length > 0}>
            <summary>View pass/fail details</summary>
            <div className="engine-autonomous-readiness__check-list">
              {lastAction.readiness.checks.map((check) => (
                <article className={`engine-autonomous-readiness__check engine-autonomous-readiness__check--${check.status}`} key={check.key}>
                  <span>{check.category}</span>
                  <h3>{check.label}</h3>
                  <p>{check.detail}</p>
                  {check.fix ? <p><b>Next:</b> {check.fix}</p> : null}
                </article>
              ))}
            </div>
          </details>
          <details className="engine-autonomous-readiness__details">
            <summary>What this test did not do</summary>
            <ul>
              {lastAction.readiness.notDone.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </details>
        </section>
      ) : null}

      {activeView === "readiness" && lastAction?.controlledReadiness ? (
        <section className="engine-panel engine-autonomous-readiness" aria-label="Controlled Outreach Launch Readiness result">
          <div className="engine-autonomous-readiness__summary">
            <div>
              <span>Controlled Outreach Launch Readiness</span>
              <h2>{lastAction.controlledReadiness.status}</h2>
              <p>Activation sends nothing. A real prospect still must be manually selected, reviewed, approved, and sent through the existing one-at-a-time provider path.</p>
            </div>
            <div className="engine-autonomous-readiness__badges">
              <b>Daily cap: 1</b>
              <b>Manual approval: Required</b>
              <b>Full auto: Disabled</b>
              <b>Outreach sent by check: 0</b>
            </div>
          </div>
          <dl className="engine-operator-check-grid">
            <div><dt>Required checks</dt><dd>{lastAction.controlledReadiness.checks.filter((check) => check.required).length}</dd></div>
            <div><dt>Failed</dt><dd>{lastAction.controlledReadiness.failedChecks.length}</dd></div>
            <div><dt>Production URL</dt><dd>{lastAction.controlledReadiness.productionUrl || "Not identified"}</dd></div>
            <div><dt>Deployment commit</dt><dd>{lastAction.controlledReadiness.deploymentCommit.slice(0, 12) || "Not identified"}</dd></div>
          </dl>
          {lastAction.controlledReadiness.emailPreview ? (
            <section className="engine-readiness-failed-records" aria-label="Exact controlled pilot email">
              <header>
                <div>
                  <span>Manual first-prospect candidate</span>
                  <h3>{lastAction.controlledReadiness.emailPreview.prospect}</h3>
                </div>
                <b>{lastAction.controlledReadiness.emailPreview.approvalState}</b>
              </header>
              <dl className="engine-operator-check-grid">
                <div><dt>Recipient</dt><dd>{lastAction.controlledReadiness.emailPreview.recipient}</dd></div>
                <div><dt>Email source</dt><dd>{lastAction.controlledReadiness.emailPreview.sourceUrl}</dd></div>
                <div><dt>Extraction</dt><dd>{statusLabel(lastAction.controlledReadiness.emailPreview.extractionMethod)}</dd></div>
                <div><dt>Copy version</dt><dd>{lastAction.controlledReadiness.emailPreview.copyVersion}</dd></div>
                <div><dt>Generated</dt><dd>{lastAction.controlledReadiness.emailPreview.generatedAt}</dd></div>
                <div><dt>Daily cap</dt><dd>1</dd></div>
              </dl>
              <article>
                <span>Exact unsent first-touch email</span>
                <h4>{lastAction.controlledReadiness.emailPreview.subject}</h4>
                <pre>{lastAction.controlledReadiness.emailPreview.body}</pre>
                <p><b>Why eligible:</b> {lastAction.controlledReadiness.emailPreview.eligibilityReason}</p>
              </article>
            </section>
          ) : null}
          <div className="engine-operator-summary-grid">
            <article>
              <header><h3>Activation changes</h3></header>
              <ul>{lastAction.controlledReadiness.settingsThatWillChange.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <header><h3>Remains disabled</h3></header>
              <ul>{lastAction.controlledReadiness.settingsThatRemainDisabled.map((item) => <li key={item}>{item}</li>)}</ul>
            </article>
            <article>
              <header><h3>Emergency rollback</h3></header>
              <p>{lastAction.controlledReadiness.rollbackInstructions}</p>
            </article>
          </div>
          <details className="engine-autonomous-readiness__details" open={lastAction.controlledReadiness.failedChecks.length > 0}>
            <summary>View controlled-launch evidence</summary>
            <div className="engine-autonomous-readiness__check-list">
              {lastAction.controlledReadiness.checks.map((check) => (
                <article
                  className={`engine-autonomous-readiness__check engine-autonomous-readiness__check--${check.passed ? "passed" : check.required ? "failed" : "info"}`}
                  key={check.key}
                >
                  <span>{check.category}</span>
                  <h3>{check.label}</h3>
                  <p>{check.detail}</p>
                </article>
              ))}
            </div>
          </details>
          {lastAction.controlledActivation ? (
            <div className={lastAction.controlledActivation.activated ? "engine-success-banner" : "engine-error-banner"} role="status">
              <div>
                <b>{lastAction.controlledActivation.activated ? "Controlled pilot enabled" : "Activation blocked"}</b>
                <p>{lastAction.controlledActivation.message}</p>
                <p>Outreach sent by activation: 0.</p>
              </div>
            </div>
          ) : null}
          {lastAction.emergencyStop ? (
            <div className="engine-success-banner" role="status">
              <div>
                <b>Prospect email sending disabled</b>
                <p>{lastAction.emergencyStop.message}</p>
                <p>In-progress requests reported: {lastAction.emergencyStop.sendsInProgress}. Records and audit history were preserved.</p>
              </div>
            </div>
          ) : null}
          {lastAction.postSendValidation ? (
            <section className="engine-readiness-failed-records" aria-label="Controlled pilot post-send validation">
              <header>
                <div>
                  <span>Post-send validation</span>
                  <h3>{lastAction.postSendValidation.status}</h3>
                </div>
                <b>{lastAction.postSendValidation.sentToday} sent today</b>
              </header>
              <p>{lastAction.postSendValidation.issues.join(" ") || "Exactly one approved message, one provider ID, and one provider-success audit were recorded. The daily cap is exhausted."}</p>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeView === "readiness" && lastAction?.emergencyStop && !lastAction.controlledReadiness ? (
        <section className="engine-panel engine-autonomous-readiness" aria-label="Prospect email emergency stop result">
          <div className="engine-success-banner" role="status">
            <div>
              <b>All new prospect email sending is disabled</b>
              <p>{lastAction.emergencyStop.message}</p>
              <p>In-progress requests reported: {lastAction.emergencyStop.sendsInProgress}. Records and audit history were preserved. Nothing was sent by this action.</p>
            </div>
          </div>
        </section>
      ) : null}

      {activeView === "readiness" && lastAction?.postSendValidation && !lastAction.controlledReadiness ? (
        <section className="engine-panel engine-autonomous-readiness" aria-label="Controlled pilot post-send validation">
          <div className="engine-autonomous-readiness__summary">
            <div>
              <span>Post-send validation</span>
              <h2>{lastAction.postSendValidation.status}</h2>
              <p>{lastAction.postSendValidation.issues.join(" ") || "Exactly one approved message, provider ID, and provider-success audit were recorded."}</p>
            </div>
            <div className="engine-autonomous-readiness__badges">
              <b>Sent today: {lastAction.postSendValidation.sentToday}</b>
              <b>Daily cap exhausted: {lastAction.postSendValidation.dailyCapExhausted ? "Yes" : "No"}</b>
              <b>Full auto disabled: {lastAction.postSendValidation.fullAutonomousSendingDisabled ? "Yes" : "No"}</b>
            </div>
          </div>
        </section>
      ) : null}

      {activeView === "results" && manualReviewTriage ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Manual Review Triage">
          <div className="engine-panel__head">
            <div>
              <span>Manual Review Triage</span>
              <h2>{manualReviewTriage.status === "AUDITING"
                ? `Inspecting ${manualReviewTriage.inspectedCount} / ${manualReviewTriage.totalCandidates} unresolved prospects...`
                : manualReviewTriage.status === "APPLYING"
                  ? `Applying ${manualReviewTriage.appliedCount} / ${manualReviewTriage.applicableCount} reviewed results...`
                  : manualReviewTriage.status === "READY"
                    ? "Evidence review ready"
                    : manualReviewTriage.status === "APPLIED" ? "Reviewed triage results applied" : statusLabel(manualReviewTriage.status)}</h2>
              <p>Every result uses the shared website-identity and fit rules. Reviewable means human review only; it never means approved or send-ready.</p>
            </div>
            <span>Nothing sent</span>
          </div>
          <progress
            aria-label={manualReviewTriage.status === "APPLYING" ? "Manual Review Triage Apply progress" : "Manual Review Triage progress"}
            max={manualReviewTriage.status === "APPLYING" ? Math.max(1, manualReviewTriage.applicableCount) : Math.max(1, manualReviewTriage.totalCandidates)}
            value={manualReviewTriage.status === "APPLYING" ? manualReviewTriage.appliedCount : manualReviewTriage.inspectedCount}
          />
          <dl className="engine-operator-check-grid">
            <div><dt>Inspected</dt><dd>{manualReviewTriage.inspectedCount} / {manualReviewTriage.totalCandidates}</dd></div>
            <div><dt>Safe exclusions</dt><dd>{manualReviewTriage.safeExclusionCount}</dd></div>
            <div><dt>Reviewable rebuild</dt><dd>{manualReviewTriage.reviewableRebuildCount}</dd></div>
            <div><dt>Still manual</dt><dd>{manualReviewTriage.stillManualCount}</dd></div>
            <div><dt>Protected</dt><dd>{manualReviewTriage.protectedCount}</dd></div>
            <div><dt>Applied</dt><dd>{manualReviewTriage.appliedCount}</dd></div>
          </dl>
          {manualReviewTriage.status === "READY" ? (
            <div className="engine-inline-actions">
              <button
                className="engine-button engine-button--primary"
                disabled={busy || manualReviewTriage.applicableCount === 0}
                onClick={() => setManualReviewTriageConfirmationOpen(true)}
                type="button"
              >
                Review {manualReviewTriage.applicableCount} applicable result(s)
              </button>
              <span>{manualReviewTriage.applicableCount === 0
                ? "No authoritative website-only changes are available."
                : "Apply rechecks current Prospect, queue, suppression, reply, and provider protections without crawling."}</span>
            </div>
          ) : null}
          {manualReviewTriageConfirmationOpen && manualReviewTriage.status === "READY" ? (
            <section aria-labelledby="manual-review-triage-confirmation-title" className="engine-operator-safety-note" role="alertdialog">
              <b id="manual-review-triage-confirmation-title">Apply {manualReviewTriage.applicableCount} reviewed website-only result(s)?</b>
              <p>Only the named server-side reviewed website fields may change. Contact data and history are preserved; stale approval is removed where required. No package is created and nothing is sent.</p>
              <ul>
                {manualReviewTriage.records.filter((record) => record.selectionEligible).map((record) => (
                  <li key={record.prospectId}><b>{record.businessName}</b>: {statusLabel(record.triageOutcome)}. {record.humanExplanation}</li>
                ))}
              </ul>
              <label className="engine-field">
                <span>Type APPLY REVIEWED TRIAGE RESULTS</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setManualReviewTriageConfirmation(event.target.value)}
                  value={manualReviewTriageConfirmation}
                />
              </label>
              <div className="engine-inline-actions">
                <button
                  aria-busy={busy}
                  className="engine-button engine-button--primary"
                  disabled={busy || manualReviewTriageConfirmation !== "APPLY REVIEWED TRIAGE RESULTS"}
                  onClick={() => void runManualReviewTriage({ apply: true })}
                  type="button"
                >
                  {busy ? <span aria-hidden="true" className="engine-button__spinner" /> : null}
                  {busy ? "Applying reviewed results..." : "Apply Reviewed Results"}
                </button>
                <button className="engine-button" disabled={busy} onClick={() => setManualReviewTriageConfirmationOpen(false)} type="button">Cancel</button>
              </div>
            </section>
          ) : null}
          {(["safe_exclusion", "reviewable_rebuild_opportunity", "still_manual", "protected_ineligible"] as const).map((outcome) => {
            const records = manualReviewTriage.records.filter((record) => record.triageOutcome === outcome);
            if (!records.length) return null;
            return (
              <details key={outcome} open={outcome === "safe_exclusion" || outcome === "reviewable_rebuild_opportunity"}>
                <summary>{records.length} {statusLabel(outcome)} record(s)</summary>
                <div className="engine-operator-summary-grid">
                  {records.map((record) => (
                    <article key={record.prospectId}>
                      <h3>{record.businessName}</h3>
                      <p><b>Location:</b> {[record.city, record.state].filter(Boolean).join(", ") || "Not recorded"} · {record.trade}</p>
                      <p><b>Stored website:</b> {record.storedWebsite || "None"}</p>
                      <p><b>Candidate/canonical:</b> {record.candidateWebsite || "Not established"}</p>
                      <p><b>Fit:</b> {statusLabel(record.currentDisposition)} {"->"} {statusLabel(record.proposedDisposition)}</p>
                      <p><b>Reason:</b> {statusLabel(record.reasonCode)}</p>
                      <p>{record.humanExplanation}</p>
                      <p><b>Identity:</b> {record.websiteIdentityConfidence}. <b>Fit confidence:</b> {record.fitConfidence}.</p>
                      <p><b>Contact paths:</b> {record.contactPathState}</p>
                      {record.firstPartyEvidence.length ? <p><b>First-party evidence:</b> {record.firstPartyEvidence.join("; ")}</p> : null}
                      {record.evidenceSummary.length ? <p><b>Evidence:</b> {record.evidenceSummary.join("; ")}</p> : null}
                      <p><b>Next action:</b> {record.recommendedOperatorAction}</p>
                    </article>
                  ))}
                </div>
              </details>
            );
          })}
          {Object.keys(manualReviewTriage.reasonCounts).length ? (
            <details>
              <summary>Reason counts</summary>
              <ul>{Object.entries(manualReviewTriage.reasonCounts).map(([reason, count]) => <li key={reason}><b>{statusLabel(reason)}:</b> {count}</li>)}</ul>
            </details>
          ) : null}
          {manualReviewTriage.errorMessage ? <div className="engine-error-banner" role="alert"><div><b>Triage needs review</b><p>{manualReviewTriage.errorMessage}</p></div></div> : null}
          {manualReviewTriage.partialApplyRequiresReview ? <p><b>Partial completion:</b> Earlier bounded atomic groups committed safely; remaining records require a fresh triage audit.</p> : null}
        </section>
      ) : null}

      {activeView === "results" && fullLegacyCleanup ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Full Legacy Website Cleanup">
          <div className="engine-panel__head">
            <div>
              <span>Full Legacy Website Cleanup</span>
              <h2>{fullLegacyCleanup.status === "AUDITING"
                ? `Scanning ${fullLegacyCleanup.inspectedCount} / ${fullLegacyCleanup.totalCandidates} candidates...`
                : fullLegacyCleanup.status === "APPLYING"
                  ? `Applying ${fullLegacyCleanup.appliedCount} / ${fullLegacyCleanup.safeExclusionCount} verified exclusions...`
                  : fullLegacyCleanup.status === "APPLIED"
                    ? "Cleanup applied"
                    : fullLegacyCleanup.status === "READY" ? "Consolidated review ready" : statusLabel(fullLegacyCleanup.status)}</h2>
              <p>Only exact, high-confidence first-party website exclusions can be applied. Contact data, notes, activities, suppression, and outreach history remain untouched.</p>
            </div>
            <span>Nothing sent</span>
          </div>
          <progress
            aria-label={fullLegacyCleanup.status === "APPLYING" ? "Verified exclusion Apply progress" : "Legacy website audit progress"}
            max={fullLegacyCleanup.status === "APPLYING" ? Math.max(1, fullLegacyCleanup.safeExclusionCount) : Math.max(1, fullLegacyCleanup.totalCandidates)}
            value={fullLegacyCleanup.status === "APPLYING" ? fullLegacyCleanup.appliedCount : fullLegacyCleanup.inspectedCount}
          />
          <dl className="engine-operator-check-grid">
            <div><dt>Inspected</dt><dd>{fullLegacyCleanup.inspectedCount} / {fullLegacyCleanup.totalCandidates}</dd></div>
            <div><dt>Safe exclusions</dt><dd>{fullLegacyCleanup.safeExclusionCount}</dd></div>
            <div><dt>Manual review</dt><dd>{fullLegacyCleanup.manualReviewCount}</dd></div>
            <div><dt>Protected</dt><dd>{fullLegacyCleanup.protectedCount}</dd></div>
            <div><dt>Applied</dt><dd>{fullLegacyCleanup.appliedCount}</dd></div>
            <div><dt>Apply strategy</dt><dd>{fullLegacyCleanup.applyMode === "whole_set_atomic" ? "One atomic transaction" : `Atomic groups of ${fullLegacyCleanup.applyGroupSize}`}</dd></div>
          </dl>
          {fullLegacyCleanup.status === "READY" ? (
            <div className="engine-inline-actions">
              <button
                className="engine-button engine-button--primary"
                disabled={busy || fullLegacyCleanup.safeExclusionCount === 0}
                onClick={() => setFullLegacyCleanupConfirmationOpen(true)}
                type="button"
              >
                Review {fullLegacyCleanup.safeExclusionCount} verified exclusion(s)
              </button>
              <span>{fullLegacyCleanup.safeExclusionCount === 0 ? "No verified exclusions require repair." : "One confirmation applies this reviewed set."}</span>
            </div>
          ) : null}
          {fullLegacyCleanupConfirmationOpen && fullLegacyCleanup.status === "READY" ? (
            <section aria-labelledby="full-legacy-cleanup-confirmation-title" className="engine-operator-safety-note" role="alertdialog">
              <b id="full-legacy-cleanup-confirmation-title">Apply {fullLegacyCleanup.safeExclusionCount} verified website exclusion(s)?</b>
              <p>Only reviewed website state will be updated. Contact fields, notes, activities, suppression, and outreach history remain intact. Nothing will be sent.</p>
              <ul>
                {fullLegacyCleanup.safeExclusions.map((record) => (
                  <li key={record.prospectId}>
                    <b>{record.businessName}</b>: {record.disposition.replaceAll("_", " ")} at {record.canonicalWebsite}. {record.identitySummary}
                  </li>
                ))}
              </ul>
              <label className="engine-field">
                <span>Type REPAIR VERIFIED WEBSITE RECORDS</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setFullLegacyCleanupConfirmation(event.target.value)}
                  value={fullLegacyCleanupConfirmation}
                />
              </label>
              <div className="engine-inline-actions">
                <button
                  aria-busy={busy}
                  className="engine-button engine-button--primary"
                  disabled={busy || fullLegacyCleanupConfirmation !== "REPAIR VERIFIED WEBSITE RECORDS"}
                  onClick={() => void runFullLegacyCleanup({ apply: true })}
                  type="button"
                >
                  {busy ? <span aria-hidden="true" className="engine-button__spinner" /> : null}
                  {busy ? "Applying verified exclusions..." : "Apply All Verified Exclusions"}
                </button>
                <button className="engine-button" disabled={busy} onClick={() => setFullLegacyCleanupConfirmationOpen(false)} type="button">Cancel</button>
              </div>
            </section>
          ) : null}
          {fullLegacyCleanup.safeExclusions.length ? (
            <details open={fullLegacyCleanup.status === "READY"}>
              <summary>{fullLegacyCleanup.safeExclusions.length} safe verified exclusion(s)</summary>
              <div className="engine-operator-summary-grid">
                {fullLegacyCleanup.safeExclusions.map((record) => (
                  <article key={record.prospectId}>
                    <h3>{record.businessName}</h3>
                    <p><b>Canonical website:</b> {record.canonicalWebsite}</p>
                    <p><b>Disposition:</b> {record.disposition.replaceAll("_", " ")}</p>
                    <p>{record.identitySummary}</p>
                    <p>{record.reason}</p>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
          {Object.keys(fullLegacyCleanup.manualReasonCounts).length ? (
            <details>
              <summary>Manual-review reasons</summary>
              <ul>
                {Object.entries(fullLegacyCleanup.manualReasonCounts).map(([reason, count]) => (
                  <li key={reason}><b>{reason.replaceAll("_", " ")}:</b> {count}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {fullLegacyCleanup.remainingCandidatesAfter !== null ? (
            <p><b>Legacy candidates:</b> {fullLegacyCleanup.remainingCandidatesBefore} {"->"} {fullLegacyCleanup.remainingCandidatesAfter}. Nothing was sent.</p>
          ) : null}
          {fullLegacyCleanup.errorMessage ? <div className="engine-error-banner" role="alert"><div><b>Cleanup needs review</b><p>{fullLegacyCleanup.errorMessage}</p></div></div> : null}
          {fullLegacyCleanup.partialApplyRequiresReview ? <p><b>Partial completion:</b> Earlier atomic groups committed safely; remaining records require a fresh audit before any additional Apply.</p> : null}
        </section>
      ) : null}

      {activeView === "results" && lastAction?.websiteRepair ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Existing website record audit">
          <div className="engine-panel__head">
            <div>
              <h2>Existing Website Record {lastAction.websiteRepair.mode === "dry_run" ? "Dry Run" : "Repair"}</h2>
              <p>Only bounded verification evidence is used. Protected records retain their contact, suppression, and activity history.</p>
            </div>
            <span>Nothing sent</span>
          </div>
          <dl className="engine-operator-check-grid">
            <div><dt>Inspected</dt><dd>{lastAction.websiteRepair.inspected}</dd></div>
            <div><dt>Candidates</dt><dd>{lastAction.websiteRepair.candidates}</dd></div>
            <div><dt>Remaining</dt><dd>{lastAction.websiteRepair.remainingCandidates}</dd></div>
            <div><dt>Range</dt><dd>{lastAction.websiteRepair.rangeStart}-{lastAction.websiteRepair.rangeEnd} of {lastAction.websiteRepair.candidates}</dd></div>
            <div><dt>Batch</dt><dd>{lastAction.websiteRepair.scope === "batch" ? `${lastAction.websiteRepair.currentPage} of ${lastAction.websiteRepair.totalPages}` : "Exact prospect"}</dd></div>
            <div><dt>Changed</dt><dd>{lastAction.websiteRepair.changed}</dd></div>
            <div><dt>Protected</dt><dd>{lastAction.websiteRepair.skippedProtected}</dd></div>
            <div><dt>Mode</dt><dd>{statusLabel(lastAction.websiteRepair.mode)}</dd></div>
          </dl>
          {lastAction.websiteRepair.scope === "batch" ? (
            <>
              <div className="engine-inline-actions" aria-label="Legacy website audit selection controls">
                <button
                  className="engine-button engine-button--primary"
                  disabled={busy || lastAction.websiteRepair.mode !== "dry_run" || highConfidenceExclusionIds.length === 0}
                  onClick={() => setSelectedWebsiteRepairProspectIds(highConfidenceExclusionIds)}
                  type="button"
                >
                  Select high-confidence exclusions
                </button>
                <button
                  className="engine-button"
                  disabled={busy || selectedWebsiteRepairProspectIds.length === 0}
                  onClick={() => setSelectedWebsiteRepairProspectIds([])}
                  type="button"
                >
                  Clear selection
                </button>
                <button
                  className="engine-button"
                  disabled={busy || lastAction.websiteRepair.mode !== "dry_run" || selectedWebsiteRepairProspectIds.length === 0}
                  onClick={() => setWebsiteRepairConfirmationOpen(true)}
                  type="button"
                >
                  Review selected repairs
                </button>
                <span>{selectedWebsiteRepairProspectIds.length} selected</span>
              </div>
              <div className="engine-inline-actions" aria-label="Legacy website audit batch navigation">
                <button
                  className="engine-button"
                  disabled={busy || lastAction.websiteRepair.previousOffset === null}
                  onClick={() => void runWebsiteRecordAudit({ offset: lastAction.websiteRepair?.previousOffset ?? 0 })}
                  type="button"
                >
                  Previous batch
                </button>
                <button
                  className="engine-button engine-button--primary"
                  disabled={busy || lastAction.websiteRepair.nextOffset === null}
                  onClick={() => void runWebsiteRecordAudit({ offset: lastAction.websiteRepair?.nextOffset ?? 0 })}
                  type="button"
                >
                  Next batch
                </button>
              </div>
            </>
          ) : null}
          {websiteRepairConfirmationOpen && lastAction.websiteRepair.scope === "batch" ? (
            <section aria-labelledby="website-repair-confirmation-title" className="engine-operator-safety-note" role="alertdialog">
              <b id="website-repair-confirmation-title">Apply {selectedWebsiteRepairRecords.length} selected website-record repair(s)?</b>
              <p>Only the records listed below will be submitted against this exact signed snapshot. Website exclusions persist only the reviewed website state; contact fields, activities, and notes stay intact. Stale approval is revoked and nothing is sent.</p>
              <ul>
                {selectedWebsiteRepairRecords.map((record) => (
                  <li key={record.prospectId}>
                    <b>{record.businessName}</b> ({record.prospectId}): {statusLabel(record.proposedOutcome)} / {statusLabel(record.proposedDisposition)}
                  </li>
                ))}
              </ul>
              <label className="engine-field">
                <span>Type REPAIR VERIFIED WEBSITE RECORDS</span>
                <input
                  autoComplete="off"
                  onChange={(event) => setWebsiteRepairConfirmation(event.target.value)}
                  value={websiteRepairConfirmation}
                />
              </label>
              <div className="engine-inline-actions">
                <button
                  aria-busy={busy}
                  className="engine-button engine-button--primary"
                  disabled={busy || selectedWebsiteRepairRecords.length === 0 || websiteRepairConfirmation !== "REPAIR VERIFIED WEBSITE RECORDS"}
                  onClick={() => void runWebsiteRecordAudit({ apply: true })}
                  type="button"
                >
                  {busy ? "Applying selected repairs..." : "Apply Selected Repairs"}
                </button>
                <button className="engine-button" disabled={busy} onClick={() => setWebsiteRepairConfirmationOpen(false)} type="button">Cancel</button>
              </div>
            </section>
          ) : null}
          <div className="engine-operator-summary-grid">
            {lastAction.websiteRepair.records.map((record) => (
              <article key={record.prospectId}>
                <header>
                  <h3>{record.businessName}</h3>
                  {lastAction.websiteRepair?.scope === "batch" && lastAction.websiteRepair.mode === "dry_run" ? (
                    <label className="engine-field">
                      <span>{record.selectionEligible
                        ? "Select record"
                        : record.protectedReason
                          ? "Protected"
                          : record.alreadyCurrent
                            ? "Already current / no repair required"
                            : "No mutable change"}</span>
                      <input
                        aria-label={`Select ${record.businessName} for website-record repair`}
                        checked={selectedWebsiteRepairProspectIds.includes(record.prospectId)}
                        disabled={busy || !record.selectionEligible}
                        onChange={(event) => setSelectedWebsiteRepairProspectIds((current) => (
                          event.target.checked
                            ? [...current, record.prospectId]
                            : current.filter((prospectId) => prospectId !== record.prospectId)
                        ))}
                        type="checkbox"
                      />
                    </label>
                  ) : null}
                </header>
                <p><b>Prospect status:</b> {record.currentProspectStatus}</p>
                <p><b>Queue status:</b> {record.currentQueueStatuses.join(", ") || "No queue package"}</p>
                <p><b>Website fit:</b> {statusLabel(record.currentDisposition)} {"->"} {statusLabel(record.proposedDisposition)}</p>
                <p>{record.oldStatus} {"->"} {record.proposedStatus}</p>
                <p>{record.evidence}</p>
                <p><b>Business identity sufficient:</b> {record.businessIdentitySufficient ? "Yes" : "No"}</p>
                <p><b>Website evidence:</b> {record.websiteEvidenceSufficient ? "Sufficient" : "Incomplete"} ({record.websiteEvidenceConfidence} confidence)</p>
                <p><b>Diagnostic contact evidence sufficient:</b> {record.contactEvidenceSufficient ? "Yes" : "No"} (not required for website exclusion)</p>
                <p><b>Proposed outcome:</b> {statusLabel(record.proposedOutcome)}</p>
                {record.highConfidenceExclusionEligible ? <p><b>Shortcut eligibility:</b> High-confidence exclusion</p> : null}
                <p><b>Reason:</b> {record.exactReason}</p>
                <p><b>Production mutation later required:</b> {record.productionMutationRequired ? "Yes, only after separate confirmation" : "No"}</p>
                {record.fieldChanges.length ? (
                  <details>
                    <summary>Old and proposed values</summary>
                    <ul>
                      {record.fieldChanges.map((change) => (
                        <li key={change.field}><b>{change.field}:</b> {change.oldValue} {"->"} {change.proposedValue}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                {record.changedFields.length ? <p><b>Proposed fields:</b> {record.changedFields.join(", ")}</p> : null}
                {record.newlyFoundContactPaths.length ? <p><b>Read-only contact discoveries:</b> {record.newlyFoundContactPaths.join(", ")} (not persisted by website exclusion repair)</p> : null}
                {record.protectedReason ? <p><b>Left unchanged:</b> {record.protectedReason}</p> : null}
              </article>
            ))}
          </div>
          <p><b>Safety:</b> No outreach was sent. Website exclusions preserve contact state, revoke stale approval, and return changed queue records to human review.</p>
        </section>
      ) : null}

      {activeView === "results" && lastAction?.packagePreview ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Test outreach package checks">
          <div className="engine-panel__head"><div><h2>Fake Test Outreach Package</h2><p>TEST / FAKE package, useful for checking current copy gates. It creates no real outreach activity.</p></div><span>{lastAction.packagePreview.subject}</span></div>
          <dl className="engine-operator-check-grid">
            <div><dt>First email link-free</dt><dd>{lastAction.packagePreview.firstEmailLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>First DM link-free</dt><dd>{lastAction.packagePreview.firstDmLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>Yes reply stays link-free</dt><dd>{lastAction.packagePreview.yesReplyLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>Preview link type</dt><dd>{lastAction.packagePreview.publicPreviewLink.includes("/p/") ? "Public /p/" : "Needs review"}</dd></div>
          </dl>
          {lastAction.fakePackage ? (
            <div className="engine-operator-summary-grid">
              <article>
                <header>
                  <h3>{lastAction.fakePackage.label}: {lastAction.fakePackage.businessName}</h3>
                  <button className="engine-button" onClick={() => void copyText("Fake Package Summary", lastAction.fakePackage?.fullSummary ?? "")} type="button">Copy Fake Package Summary</button>
                </header>
                <p>{lastAction.fakePackage.tradeCity}</p>
                <p>Recommended contact path: {lastAction.fakePackage.recommendedContactPath}</p>
                <p>Copy version: {lastAction.fakePackage.copyVersion}</p>
              </article>
              {lastAction.fakePackage.scripts.map((script) => (
                <article key={script.label}>
                  <header>
                    <h3>{script.label}</h3>
                    <button className="engine-button" onClick={() => void copyText(script.label, script.body)} type="button">Copy</button>
                  </header>
                  <pre>{script.body}</pre>
                </article>
              ))}
              <article>
                <header>
                  <h3>Safety Summary</h3>
                  <button className="engine-button" onClick={() => void copyText("Safety Summary", lastAction.fakePackage?.safetySummary ?? "")} type="button">Copy</button>
                </header>
                <pre>{lastAction.fakePackage.safetySummary}</pre>
              </article>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeView === "results" && lastAction?.simulation ? (
        <section className="engine-panel engine-operator-package-check" aria-label="24-hour autonomous simulation">
          <div className="engine-panel__head">
            <div>
              <h2>Simulate Next 24 Hours</h2>
              <p>Dry run only. It does not send, submit, call, text prospects, record Looms, change env flags, or modify contact history.</p>
            </div>
            <button className="engine-button" onClick={() => void copyText("24-hour simulation", lastAction.simulation?.summary ?? "")} type="button">Copy Simulation Summary</button>
          </div>
          <dl className="engine-operator-check-grid">
            <div><dt>Existing first</dt><dd>{lastAction.simulation.counts.existingProspectsCheckedFirst}</dd></div>
            <div><dt>Email review</dt><dd>{lastAction.simulation.counts.emailReview}</dd></div>
            <div><dt>Social DM review</dt><dd>{lastAction.simulation.counts.socialDmReview}</dd></div>
            <div><dt>Contact form review</dt><dd>{lastAction.simulation.counts.contactFormReview}</dd></div>
            <div><dt>Phone-call queue</dt><dd>{lastAction.simulation.counts.phoneCallQueue}</dd></div>
            <div><dt>Manual research</dt><dd>{lastAction.simulation.counts.manualResearch}</dd></div>
            <div><dt>Blocked</dt><dd>{lastAction.simulation.counts.blocked}</dd></div>
            <div><dt>Suppressed</dt><dd>{lastAction.simulation.counts.suppressed}</dd></div>
          </dl>
          <div className="engine-operator-summary-grid">
            {([
              ["Timeline", lastAction.simulation.timeline],
              ["Would do", lastAction.simulation.wouldDo],
              ["Would require operator action", lastAction.simulation.wouldRequireOperatorAction],
              ["Would not do", lastAction.simulation.wouldNotDo],
              ["Blocked by safety gates", lastAction.simulation.blockedBySafetyGates],
            ] as const).map(([label, values]) => (
              <article key={label}>
                <header><h3>{label}</h3></header>
                <ul>{values.map((value) => <li key={value}>{value}</li>)}</ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeView === "results" && lastAction?.regeneration ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Outreach copy regeneration result">
          <div className="engine-panel__head">
            <div>
              <h2>Outreach Copy Regeneration</h2>
              <p>Only unsent, uncontacted, written-contact packages are eligible. Nothing was sent.</p>
            </div>
            <span>{lastAction.regeneration.copyVersion}</span>
          </div>
          <dl className="engine-operator-check-grid">
            <div><dt>Packages regenerated</dt><dd>{lastAction.regeneration.updated}</dd></div>
            <div><dt>Packages skipped</dt><dd>{lastAction.regeneration.skipped}</dd></div>
            <div><dt>Old unsent needing regeneration</dt><dd>{lastAction.regeneration.oldUnsentPackagesNeedingRegeneration}</dd></div>
            <div><dt>Safety</dt><dd>No sends, no log rewrites</dd></div>
          </dl>
          <details>
            <summary>Packages skipped with reasons</summary>
            <pre>{Object.entries(lastAction.regeneration.skippedReasons).map(([reason, count]) => `${count} skipped because ${reason}`).join("\n") || "No skipped packages."}</pre>
          </details>
          <details>
            <summary>Updated packages</summary>
            <pre>{lastAction.regeneration.updatedItems.join("\n") || "No packages updated."}</pre>
          </details>
          <button className="engine-button" onClick={() => void copyText("Regeneration Summary", regenerationSummaryText)} type="button">Copy Regeneration Summary</button>
        </section>
      ) : null}

      {activeView === "results" && lastAction?.smartGrowth ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Smart Growth test result">
          <div className="engine-panel__head">
            <div>
              <h2>Smart Growth Test Result</h2>
              <p>Dry-run operator intelligence. It checks stored prospects and recommendations without sending or submitting anything.</p>
            </div>
            <span>{lastAction.smartGrowth.dryRun ? "Dry run" : "Manual queue update"}</span>
          </div>
          <dl className="engine-operator-check-grid">
            <div><dt>Existing unsent found</dt><dd>{lastAction.smartGrowth.summary.existingUnsentProspectsFound}</dd></div>
            <div><dt>Copy refreshed</dt><dd>{lastAction.smartGrowth.summary.copyRefreshedCount}</dd></div>
            <div><dt>Packages generated</dt><dd>{lastAction.smartGrowth.summary.packagesGeneratedCount}</dd></div>
            <div><dt>Best market/trade</dt><dd>{lastAction.smartGrowth.summary.bestMarketTradeRecommendation}</dd></div>
          </dl>
          <div className="engine-operator-summary-grid">
            <article>
              <header>
                <h3>Smart Recommendation Summary</h3>
                <button className="engine-button" onClick={() => void copyText("Smart Recommendation Summary", lastAction.smartGrowth?.smartGrowth.copySummaries.nextBestMove ?? "")} type="button">Copy</button>
              </header>
              <pre>{lastAction.smartGrowth.smartGrowth.copySummaries.nextBestMove}</pre>
            </article>
            <article>
              <header>
                <h3>Smart Run Summary</h3>
                <button className="engine-button" onClick={() => void copyText("Smart Run Summary", lastAction.smartGrowth?.summary.summaryText ?? "")} type="button">Copy</button>
              </header>
              <pre>{lastAction.smartGrowth.summary.summaryText}</pre>
            </article>
          </div>
        </section>
      ) : null}

      {activeView === "results" ? (
      <section className="engine-panel engine-operator-copy" aria-label="Copy summaries">
        <div className="engine-panel__head">
          <div>
            <h2>Copy summaries</h2>
            <p>Paste these into ChatGPT, Codex, or Claude without exposing secrets.</p>
          </div>
          <span>{copied ? `${copied} copied` : "Secret-safe"}</span>
        </div>
        <div className="engine-operator-summary-grid">
          {([
            ["Full Status Summary", payload.summaries.fullStatus],
            ["Email Safety Summary", payload.summaries.emailSafety],
            ["Regeneration Summary", payload.summaries.regenerationSummary],
            ["Smart Recommendation Summary", payload.summaries.smartRecommendation],
            ["Provider Diagnostics Summary", `${payload.summaries.providerDiagnostics}\n${providerSmokeSummary}`.trim()],
            ["Latest Top Prospects Run Summary", payload.summaries.latestTopProspectsRun],
            ["Latest Outreach Package Summary", payload.summaries.latestOutreachPackage],
            ["Next Debug Summary", payload.summaries.nextDebug],
          ] as const).map(([label, value]) => (
            <article key={label}>
              <header>
                <h3>{label}</h3>
                <div className="engine-operator-summary-actions">
                  {label === "Latest Top Prospects Run Summary" ? <button className="engine-button" disabled={!payload.latestLinks.topProspectsRunJobId} onClick={() => openEngineRecord({ tab: "top-prospects" })} type="button">Open run</button> : null}
                  {label === "Latest Outreach Package Summary" ? <button className="engine-button" disabled={!payload.latestLinks.outreachPackageProspectId} onClick={() => openEngineRecord({ tab: "prospects", prospectId: payload.latestLinks.outreachPackageProspectId, detailTab: "Outreach" })} type="button">Open package</button> : null}
                  {label === "Latest Outreach Package Summary" ? <button className="engine-button" disabled={!payload.latestLinks.outreachPackageProspectId} onClick={() => openEngineRecord({ tab: "prospects", prospectId: payload.latestLinks.outreachPackageProspectId, detailTab: "Preview" })} type="button">Open prospect preview</button> : null}
                  <button className="engine-button" onClick={() => void copyText(label, value)} type="button">Copy</button>
                </div>
              </header>
              <pre>{value}</pre>
            </article>
          ))}
        </div>
      </section>
      ) : null}

      {activeView === "diagnostics" ? (
      <details className="engine-panel engine-operator-technical" open>
        <summary>Show technical details</summary>
        <div className="engine-operator-provider-list">
          {payload.providerHealth.map((provider) => (
            <article key={provider.provider}>
              <b>{provider.label}</b>
              <p>Enabled: {provider.enabled ? "Yes" : "No"}. Env var present: {provider.envVarPresent === null ? "Not required" : provider.envVarPresent ? "Yes" : "No"}. Status: {statusLabel(provider.lastStatus)}.</p>
              {provider.provider === "googlePlaces" ? <p>Endpoint: {provider.endpointVersion ?? "New"}</p> : null}
              {provider.lastSafeErrorMessage ? <p>Safe error: {provider.lastSafeErrorMessage}</p> : null}
            </article>
          ))}
        </div>
      </details>
      ) : null}
    </div>
  );
}
