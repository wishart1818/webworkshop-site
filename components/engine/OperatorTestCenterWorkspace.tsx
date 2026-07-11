"use client";

import React from "react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, LoadingState } from "@/components/engine/EngineStates";
import type { OperatorActionResult, OperatorTestCenterPayload } from "@/lib/operator-test-center";

type ActionState = "idle" | "running";

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function apiError(payload: { error?: string; message?: string }, fallback: string) {
  return payload.error || payload.message || fallback;
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

  if (loading) return <div className="engine-content"><LoadingState title="Loading Operator Test Center" body="Checking safe test actions, provider coverage, email gates, and the latest prospecting activity." /></div>;
  if (!payload) return <div className="engine-content"><EmptyState title="Operator Test Center unavailable" body={error || "Reload the engine and try again."} action={() => void load()} actionLabel="Retry" /></div>;
  const busy = actionState === "running";

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

      <section className="engine-operator-card-grid" aria-label="Operator status cards">
        {payload.statusCards.map((card) => (
          <article className={`engine-operator-card engine-operator-card--${card.status}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="engine-panel engine-operator-actions" aria-label="Safe test actions">
        <div className="engine-panel__head">
          <div>
            <h2>Safe test buttons</h2>
            <p>All tests are operator-only. Provider smoke tests create no packages. Internal emails go only to INTERNAL_NOTIFY_EMAIL. Internal texts go only to INTERNAL_NOTIFY_PHONE.</p>
          </div>
          <span>{busy ? "Running" : "Ready"}</span>
        </div>
        <div className="engine-operator-button-grid">
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("check_email_safety_gates")} type="button">Check Email Safety Gates</button>
          <button className="engine-button" disabled={busy} onClick={() => void runProviderSmokeTest()} type="button">Run Provider Smoke Test</button>
          <button className="engine-button engine-button--primary" disabled={busy} onClick={() => void runSmallTopProspectsTest()} type="button">Run Small Top Prospects Test</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("generate_test_package")} type="button">Generate One Test Outreach Package</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("send_internal_notification")} type="button">Send Internal Test Notification</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("send_internal_resend_test")} type="button">Send Internal Test Email Through Resend</button>
          <button className="engine-button" disabled={busy} onClick={() => void runOperatorAction("send_internal_sms_test")} type="button">Send Internal Test SMS</button>
        </div>
        <div className="engine-operator-safety-note">
          <b>Safety lock</b>
          <p>Prospect emails still obey OUTREACH_EMAIL_DISABLED, OUTREACH_AUTO_SEND_ENABLED, queue gates, public preview rules, suppression, cooldown, and approval status. SMS never goes to prospects. Full auto still requires OUTREACH_FULL_AUTO_SEND_ENABLED.</p>
        </div>
      </section>

      {lastAction?.packagePreview ? (
        <section className="engine-panel engine-operator-package-check" aria-label="Test outreach package checks">
          <div className="engine-panel__head"><div><h2>Test Outreach Package</h2><p>Fake internal package, useful for checking copy gates.</p></div><span>{lastAction.packagePreview.subject}</span></div>
          <dl className="engine-operator-check-grid">
            <div><dt>First email link-free</dt><dd>{lastAction.packagePreview.firstEmailLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>First DM link-free</dt><dd>{lastAction.packagePreview.firstDmLinkFree ? "Yes" : "No"}</dd></div>
            <div><dt>Yes reply includes public preview</dt><dd>{lastAction.packagePreview.yesReplyIncludesPublicPreview ? "Yes" : "No"}</dd></div>
            <div><dt>Preview link type</dt><dd>{lastAction.packagePreview.publicPreviewLink.includes("/p/") ? "Public /p/" : "Needs review"}</dd></div>
          </dl>
        </section>
      ) : null}

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
            ["SMS Notification Summary", payload.summaries.smsNotifications],
            ["Provider Diagnostics Summary", `${payload.summaries.providerDiagnostics}\n${providerSmokeSummary}`.trim()],
            ["Latest Top Prospects Run Summary", payload.summaries.latestTopProspectsRun],
            ["Latest Outreach Package Summary", payload.summaries.latestOutreachPackage],
            ["Next Debug Summary", payload.summaries.nextDebug],
          ] as const).map(([label, value]) => (
            <article key={label}>
              <header><h3>{label}</h3><button className="engine-button" onClick={() => void copyText(label, value)} type="button">Copy</button></header>
              <pre>{value}</pre>
            </article>
          ))}
        </div>
      </section>

      <details className="engine-panel engine-operator-technical">
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
    </div>
  );
}
