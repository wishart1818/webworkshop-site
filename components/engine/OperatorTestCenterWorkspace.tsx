"use client";

import React from "react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import type { OperatorActionResult, OperatorTestCenterPayload } from "@/lib/operator-test-center";

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

function failedRecordOpenDetail(record: NonNullable<OperatorActionResult["readiness"]>["failedRecords"][number]) {
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
      setActiveView(action === "run_full_autonomous_readiness_test" ? "readiness" : "results");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Operator action failed safely.");
    } finally {
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
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("check_email_safety_gates")} type="button">Check Email Safety Gates</button>
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
            <div><dt>Failed records</dt><dd>{lastAction.readiness.failedRecords.length}</dd></div>
            <div><dt>Excluded records</dt><dd>{lastAction.readiness.excludedRecords.length}</dd></div>
            <div><dt>Optional / info</dt><dd>{lastAction.readiness.optional.length}</dd></div>
            <div><dt>Generated</dt><dd>{new Date(lastAction.readiness.generatedAt).toLocaleString()}</dd></div>
          </dl>
          {lastAction.readiness.failedRecords.length ? (
            <section className="engine-readiness-failed-records" aria-label="Failed records needing attention">
              <header>
                <div>
                  <span>Exact failed records</span>
                  <h3>Records needing attention</h3>
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
              ["Copy Failed Checks Only", lastAction.readiness.summaries.failedOnly],
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

      {activeView === "results" && lastAction?.packagePreview ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Test outreach package checks">
          <div className="engine-panel__head"><div><h2>Fake Test Outreach Package</h2><p>TEST / FAKE package, useful for checking current copy gates. It creates no real outreach activity.</p></div><span>{lastAction.packagePreview.subject}</span></div>
          <dl className="engine-operator-check-grid">
            <div><dt>First email link-free</dt><dd>{lastAction.packagePreview.firstEmailLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>First DM link-free</dt><dd>{lastAction.packagePreview.firstDmLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>Yes reply includes public preview</dt><dd>{lastAction.packagePreview.yesReplyIncludesPublicPreview ? "Yes" : "No"}</dd></div>
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
