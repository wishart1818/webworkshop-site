import React from "react";
import type { DiscoveryDiagnostics, DiscoveryProviderCoverageStatus, DiscoveryProviderHealth } from "@/lib/lead-discovery";
import type { AuditEventView } from "@/lib/operational-controls";
import type { SystemSelfCheckReport } from "@/lib/system-self-check";
import { DiscoveryFunnel } from "@/components/engine/DiscoveryFunnel";

export type SystemPayload = {
  status: "ready" | "blocked" | "development";
  checks: Record<string, { configured: boolean; reachable?: boolean; message: string }>;
  auditEvents: AuditEventView[];
  selfCheck?: SystemSelfCheckReport | null;
  buildVersion?: string;
  providerCoverage?: DiscoveryProviderCoverageStatus;
  providerHealth?: DiscoveryProviderHealth[];
};
export type ProviderSmokeTestPayload = {
  query: string;
  createdOutreachPackages: boolean;
  sentOutreach: boolean;
  diagnostics: DiscoveryDiagnostics | null;
  sampleCount: number;
  safeError?: string;
};

type SystemWorkspaceProps = {
  system: SystemPayload | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onRunSelfCheck: () => void;
  onRunProviderSmokeTest: () => void;
  selfCheckRunning: boolean;
  providerSmokeTestRunning: boolean;
  providerSmokeTest: ProviderSmokeTestPayload | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}

function providerDiagnostic(smokeTest: ProviderSmokeTestPayload | null, provider: keyof DiscoveryDiagnostics["providerDiagnostics"]) {
  return smokeTest?.diagnostics?.providerDiagnostics?.[provider] ?? null;
}

function providerLaunchStatus(smokeTest: ProviderSmokeTestPayload | null, providerHealth: DiscoveryProviderHealth[], provider: "googlePlaces" | "yelp") {
  const health = providerHealth.find((item) => item.provider === provider);
  const diagnostic = providerDiagnostic(smokeTest, provider);
  const configured = diagnostic?.configured ?? health?.enabled ?? false;
  if (!configured) return "Missing";
  if (diagnostic && ["failed", "timed_out", "rate_limited"].includes(diagnostic.status)) return "Failing";
  return "Configured";
}

function smokeTestLaunchStatus(smokeTest: ProviderSmokeTestPayload | null) {
  if (!smokeTest) return "Not run";
  if (smokeTest.safeError) return "Failed";
  const google = providerDiagnostic(smokeTest, "googlePlaces");
  if (google?.configured && google.status === "succeeded" && google.returnedCount > 0) return "Passed";
  const attempted = Object.values(smokeTest.diagnostics?.providerDiagnostics ?? {}).filter((provider) => provider.queryExecuted);
  if (attempted.length && attempted.every((provider) => ["failed", "timed_out", "rate_limited"].includes(provider.status))) return "Failed";
  return "Failed";
}

function googleNextStep(smokeTest: ProviderSmokeTestPayload | null, providerHealth: DiscoveryProviderHealth[]) {
  const google = providerDiagnostic(smokeTest, "googlePlaces");
  const googleStatus = providerLaunchStatus(smokeTest, providerHealth, "googlePlaces");
  if (googleStatus === "Missing") return "Add GOOGLE_PLACES_API_KEY in Vercel, redeploy, then run Provider Smoke Test.";
  if (googleStatus === "Failing") {
    const reason = google?.failureType && google.failureType !== "none" ? google.failureType.replaceAll("_", " ") : google?.status?.replaceAll("_", " ") || "provider error";
    return `Google Places is configured but failing (${reason}). Check billing, Places API enablement, and API key restrictions, then run Provider Smoke Test again.`;
  }
  if (google?.status === "succeeded" && google.returnedCount > 0) return "Run a small Top Prospects test before Autopilot.";
  return "Run Provider Smoke Test and confirm Google Places succeeds before increasing scan count.";
}

function launchReadinessFor(system: SystemPayload, providerHealth: DiscoveryProviderHealth[], smokeTest: ProviderSmokeTestPayload | null, coverage?: DiscoveryProviderCoverageStatus) {
  const databaseReady = Boolean(system.checks.database?.reachable ?? system.checks.database?.configured);
  const authReady = Boolean(system.checks.authentication?.configured);
  const googleStatus = providerLaunchStatus(smokeTest, providerHealth, "googlePlaces");
  const yelpStatus = providerLaunchStatus(smokeTest, providerHealth, "yelp");
  const smokeStatus = smokeTestLaunchStatus(smokeTest);
  const google = providerDiagnostic(smokeTest, "googlePlaces");
  const autopilotSafety = system.selfCheck?.failed?.some((item) => /autopilot|auto email|outreach/i.test(item.label)) ? "Needs attention" : "Safe";
  const providerLevel = coverage?.level ?? "limited";
  const finalStatus = !databaseReady || !authReady || autopilotSafety !== "Safe"
    ? "Do not run Autopilot yet"
    : providerLevel === "broken"
      ? "Provider setup broken"
      : googleStatus === "Missing"
        ? "Waiting on Google Places"
        : googleStatus === "Failing"
          ? "Provider setup broken"
          : google?.status === "succeeded" && google.returnedCount > 0
            ? "Ready for small Top Prospects test"
            : "Waiting on Google Places";
  return {
    database: databaseReady ? "Ready" : "Not ready",
    auth: authReady ? "Ready" : "Not ready",
    providerCoverage: coverage?.label.replace(" provider setup", "") ?? "Limited",
    google: googleStatus,
    yelp: yelpStatus,
    smokeTest: smokeStatus,
    autopilotSafety,
    finalStatus,
    nextStep: googleNextStep(smokeTest, providerHealth),
  };
}

export function SystemWorkspace({ system, loading, error, onRefresh, onRunSelfCheck, onRunProviderSmokeTest, selfCheckRunning, providerSmokeTestRunning, providerSmokeTest }: SystemWorkspaceProps) {
  const providerHealth = system?.providerHealth ?? [];
  const providerCoverage = providerCoverageFromSmokeTest(providerSmokeTest, system?.providerCoverage);
  const launchReadiness = system ? launchReadinessFor(system, providerHealth, providerSmokeTest, providerCoverage) : null;
  return (
    <div className="engine-content">
      <section className="engine-system-head">
        <div>
          <span className={`engine-system-state engine-system-state--${system?.status ?? "development"}`}>
            {system?.status === "ready"
              ? "Core systems ready"
              : system?.status === "blocked"
                ? "Production blocked"
                : "Development mode"}
          </span>
          <h2>System readiness and audit activity</h2>
          <p>Review persistence, access control, provider configuration, and recent protected operations.</p>
        </div>
        <div className="engine-system-actions">
          <button className="engine-button" disabled={loading} onClick={onRefresh} type="button">
            {loading ? "Refreshing" : "Refresh status"}
          </button>
          <button className="engine-button engine-button--primary" disabled={selfCheckRunning} onClick={onRunSelfCheck} type="button">
            {selfCheckRunning ? "Running self-check" : "Run System Self-Check"}
          </button>
          <button className="engine-button" disabled={providerSmokeTestRunning} onClick={onRunProviderSmokeTest} type="button">
            {providerSmokeTestRunning ? "Running smoke test" : "Run Provider Smoke Test"}
          </button>
        </div>
      </section>

      {error ? (
        <div className="engine-system-empty is-error" role="alert">
          <h3>System status is unavailable</h3>
          <p>{error}</p>
          <button className="engine-button" disabled={loading} onClick={onRefresh} type="button">
            {loading ? "Retrying" : "Retry status check"}
          </button>
        </div>
      ) : system ? (
        <>
          <section className="engine-system-checks" aria-label="System readiness checks">
            {Object.entries(system.checks).map(([key, check]) => {
              const passing = check.reachable ?? check.configured;
              return (
                <article key={key}>
                  <i className={passing ? "is-passing" : "is-blocked"} aria-hidden="true" />
                  <div>
                    <h3>{formatLabel(key)}</h3>
                    <p>{check.message}</p>
                  </div>
                </article>
              );
            })}
          </section>
          {launchReadiness ? <LaunchReadinessCard buildVersion={system.buildVersion} readiness={launchReadiness} /> : null}
          <ProviderHealthPanel providerCoverage={providerCoverage} providerHealth={providerHealth} smokeTest={providerSmokeTest} />
          <SystemSelfCheckPanel report={system.selfCheck ?? null} running={selfCheckRunning} />
          <section className="engine-panel engine-audit-panel">
            <div className="engine-panel__head">
              <div>
                <h2>Recent operational audit</h2>
                <p>Protected discovery, analysis, prospect, and rate-limit events.</p>
              </div>
              <span>{system.auditEvents.length} events</span>
            </div>
            {system.auditEvents.length ? (
              <div className="engine-audit-list">
                {system.auditEvents.map((event) => (
                  <article key={event.id}>
                    <span className={`engine-audit-outcome engine-audit-outcome--${event.outcome}`}>
                      {event.outcome}
                    </span>
                    <div>
                      <b>{event.action.replaceAll("_", " ")}</b>
                      <p>{event.subject || "System operation"}</p>
                    </div>
                    <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                  </article>
                ))}
              </div>
            ) : (
              <div className="engine-system-empty">
                <h3>No audit events yet</h3>
                <p>Protected operations will appear here after prospects are created, analyzed, updated, or discovered.</p>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="engine-system-empty">
          <h3>Loading system status</h3>
          <p>Checking persistence, authentication, providers, and recent audit activity.</p>
        </div>
      )}
    </div>
  );
}

function LaunchReadinessCard({ buildVersion, readiness }: { buildVersion?: string; readiness: ReturnType<typeof launchReadinessFor> }) {
  const statusClass = readiness.finalStatus === "Ready for small Top Prospects test" ? "strong" : readiness.finalStatus === "Waiting on Google Places" ? "limited" : "broken";
  const checks = [
    ["Database", readiness.database],
    ["Auth", readiness.auth],
    ["Provider coverage", readiness.providerCoverage],
    ["Google Places", readiness.google],
    ["Yelp", readiness.yelp],
    ["Smoke test", readiness.smokeTest],
    ["Autopilot safety", readiness.autopilotSafety],
    ["Build version", buildVersion || "Not available"],
  ] as const;
  return (
    <section className={`engine-panel engine-launch-readiness engine-launch-readiness--${statusClass}`} aria-label="Launch Readiness">
      <div className="engine-panel__head">
        <div>
          <h2>Launch Readiness</h2>
          <p>One glance status before adding Google Places or starting a real Autopilot run.</p>
        </div>
        <span>{readiness.finalStatus}</span>
      </div>
      <dl className="engine-launch-readiness-grid">
        {checks.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="engine-launch-next-step">
        <b>Next Step</b>
        <p>{readiness.nextStep}</p>
      </div>
      <div className="engine-recommended-live-test">
        <b>Recommended First Live Test</b>
        <ul>
          <li>Top Prospects test: Pressure Washing in Tampa, FL.</li>
          <li>Businesses to scan: 25. Final prospects wanted: 5.</li>
          <li>Written outreach only. Exclude previously reviewed prospects: on.</li>
          <li>Only run Autopilot after this small test succeeds.</li>
        </ul>
      </div>
    </section>
  );
}

function SystemSelfCheckPanel({ report, running }: { report: SystemSelfCheckReport | null; running: boolean }) {
  const statusClass = report?.overallStatus === "Healthy" ? "ready" : report?.overallStatus === "Blocking issue" ? "blocked" : "development";
  return (
    <section className="engine-panel engine-self-check" aria-label="System Self-Check">
      <div className="engine-panel__head">
        <div>
          <h2>System Self-Check</h2>
          <p>Safe internal audit for lead quality, previews, outreach, Loom, Autonomous Growth, Learning, and CSV/export gates. It never contacts prospects or changes outreach statuses.</p>
        </div>
        <span className={`engine-system-state engine-system-state--${statusClass}`}>{report?.overallStatus ?? (running ? "Running" : "Not run")}</span>
      </div>
      {report ? (
        <div className="engine-self-check__body">
          <p>Last run <time dateTime={report.lastRunAt}>{formatDate(report.lastRunAt)}</time></p>
          <div className="engine-self-check__summary">
            <span><b>{report.passed.length}</b> Passed checks</span>
            <span><b>{report.warnings.length}</b> Warnings</span>
            <span><b>{report.failed.length}</b> Failed checks</span>
          </div>
          <SelfCheckList title="Failed checks" items={report.failed} empty="No blocking issues found." />
          <SelfCheckList title="Warnings" items={report.warnings} empty="No warnings." />
          <SelfCheckList title="Passed checks" items={report.passed.slice(0, 12)} empty="No passed checks recorded." />
          {report.suggestedFixes.length ? (
            <div className="engine-self-check__fixes">
              <h3>Suggested fixes</h3>
              <ul>{report.suggestedFixes.map((fix) => <li key={fix}>{fix}</li>)}</ul>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="engine-system-empty">
          <h3>No self-check report yet</h3>
          <p>Run the System Self-Check to verify the full prospect, preview, outreach, Loom, autonomous, learning, and export workflow.</p>
        </div>
      )}
    </section>
  );
}

function providerHealthValue(value: boolean | null) {
  if (value === null) return "Not required";
  return value ? "Yes" : "No";
}

function providerCoverageDefaults(fallback?: DiscoveryProviderCoverageStatus) {
  return {
    googleConfigured: fallback?.googleConfigured ?? false,
    yelpConfigured: fallback?.yelpConfigured ?? false,
    azureOrBingConfigured: fallback?.azureOrBingConfigured ?? false,
  };
}

function providerCoverageFromSmokeTest(smokeTest: ProviderSmokeTestPayload | null, fallback?: DiscoveryProviderCoverageStatus): DiscoveryProviderCoverageStatus | undefined {
  if (!smokeTest?.diagnostics) return fallback;
  const defaults = providerCoverageDefaults(fallback);
  const google = smokeTest.diagnostics.providerDiagnostics.googlePlaces;
  const yelp = smokeTest.diagnostics.providerDiagnostics.yelp;
  const azure = smokeTest.diagnostics.providerDiagnostics.azureMaps;
  const attempted = Object.values(smokeTest.diagnostics.providerDiagnostics).filter((provider) => provider.queryExecuted);
  const allFailed = attempted.length > 0 && attempted.every((provider) => ["failed", "timed_out", "rate_limited"].includes(provider.status));
  if (allFailed) return { ...defaults, level: "broken" as const, label: "Broken provider setup", summary: "Provider requests were attempted, but no provider completed successfully.", recommendation: "Check provider configuration, environment variables, HTTP status, and rate limits before running more searches." };
  if (google.configured && google.status === "succeeded") return { ...defaults, googleConfigured: true, level: "strong" as const, label: "Strong provider setup", summary: "Google Places is configured and the latest provider check succeeded.", recommendation: "Run normal focused Top Prospects searches." };
  if ((google.configured && google.returnedCount >= 3) || (yelp.configured && yelp.returnedCount >= 3)) return { ...defaults, googleConfigured: Boolean(google.configured), yelpConfigured: Boolean(yelp.configured), level: "good" as const, label: "Good provider setup", summary: "Google Places or Yelp is configured and returning at least 3 records.", recommendation: "Run focused searches, then add the other provider when you want broader coverage." };
  return { ...defaults, googleConfigured: Boolean(google.configured), yelpConfigured: Boolean(yelp.configured), azureOrBingConfigured: Boolean(azure.configured), level: "limited" as const, label: "Limited provider setup", summary: azure.configured ? "Azure Maps/Bing is active, but Google Places and Yelp are not configured." : "Only backup provider coverage is available.", recommendation: "Provider coverage is limited. For better local business discovery, configure Google Places and/or Yelp." };
}

function ProviderHealthPanel({ providerCoverage, providerHealth, smokeTest }: { providerCoverage?: DiscoveryProviderCoverageStatus; providerHealth: DiscoveryProviderHealth[]; smokeTest: ProviderSmokeTestPayload | null }) {
  const coverage = providerCoverage ?? providerCoverageFromSmokeTest(smokeTest, undefined);
  const setupInstructions = [
    "Add GOOGLE_PLACES_API_KEY in Vercel Production.",
    "Redeploy latest production deployment.",
    "Run Provider Smoke Test.",
    "Confirm Google Places succeeds.",
    "Run small Top Prospects test.",
    "Then run Autopilot.",
  ].join("\n");
  return (
    <section className="engine-panel engine-provider-health" aria-label="Provider health">
      <div className="engine-panel__head">
        <div>
          <h2>Provider Health</h2>
          <p>Secret-safe configuration and latest provider smoke-test diagnostics. No outreach packages are created and nothing is sent.</p>
        </div>
        <span>{coverage?.label ?? `${providerHealth.filter((provider) => provider.enabled).length} enabled`}</span>
      </div>
      {coverage ? (
        <div className={`engine-provider-coverage engine-provider-coverage--${coverage.level}`} role="status">
          <div>
            <b>{coverage.recommendation}</b>
            <p>{coverage.summary}</p>
          </div>
          <dl>
            <div><dt>Best first</dt><dd>Google Places</dd></div>
            <div><dt>Optional second</dt><dd>Yelp</dd></div>
            <div><dt>Already active</dt><dd>{coverage.azureOrBingConfigured ? "Azure Maps/Bing" : "Azure Maps/Bing if configured"}</dd></div>
            <div><dt>Backup only</dt><dd>OpenStreetMap</dd></div>
          </dl>
          <ol>
            <li>Add <code>GOOGLE_PLACES_API_KEY</code> in Vercel Environment Variables.</li>
            <li>Add <code>YELP_API_KEY</code> in Vercel Environment Variables if using Yelp.</li>
            <li>Redeploy after adding env vars.</li>
            <li>Run Provider Smoke Test again.</li>
          </ol>
          <div className="engine-provider-setup-copy">
            <b>Copy Setup Instructions</b>
            <pre>{setupInstructions}</pre>
          </div>
        </div>
      ) : null}
      <div className="engine-provider-health-grid">
        {providerHealth.map((provider) => (
          <article key={provider.provider}>
            <header>
              <strong>{provider.label}</strong>
              <span>{provider.lastStatus === "not_run" ? "Not run" : provider.lastStatus.replaceAll("_", " ")}</span>
            </header>
            <dl>
              <div><dt>Enabled</dt><dd>{provider.enabled ? "Yes" : "No"}</dd></div>
              <div><dt>Required env var</dt><dd>{provider.requiredEnvVarName}</dd></div>
              <div><dt>Env var present</dt><dd>{providerHealthValue(provider.envVarPresent)}</dd></div>
              <div><dt>Can run without API key</dt><dd>{provider.canRunWithoutApiKey ? "Yes" : "No"}</dd></div>
              {provider.provider === "googlePlaces" ? <div><dt>Endpoint</dt><dd>{provider.endpointVersion ?? "New"}</dd></div> : null}
              <div><dt>Last attempted query</dt><dd>{provider.lastAttemptedQuery}</dd></div>
              <div><dt>Last HTTP status</dt><dd>{provider.lastHttpStatus}</dd></div>
              <div><dt>Failure type</dt><dd>{provider.failureType.replaceAll("_", " ")}</dd></div>
              <div><dt>Safe error</dt><dd>{provider.lastSafeErrorMessage}</dd></div>
            </dl>
          </article>
        ))}
      </div>
      {smokeTest ? (
        <div className="engine-provider-smoke-result">
          <h3>Provider Smoke Test</h3>
          <p>
            Query: {smokeTest.query}. Samples returned: {smokeTest.sampleCount}. Outreach packages created: {smokeTest.createdOutreachPackages ? "Yes" : "No"}. Outreach sent: {smokeTest.sentOutreach ? "Yes" : "No"}.
          </p>
          {smokeTest.safeError ? <p role="status">{smokeTest.safeError}</p> : null}
          {smokeTest.diagnostics ? <DiscoveryFunnel diagnostics={smokeTest.diagnostics} qualificationLabel="eligible smoke-test records" /> : null}
        </div>
      ) : null}
    </section>
  );
}

function SelfCheckList({ empty, items, title }: { empty: string; items: SystemSelfCheckReport["passed"]; title: string }) {
  return (
    <div className="engine-self-check__list">
      <h3>{title}</h3>
      {items.length ? items.map((item) => (
        <article className={`engine-self-check-item engine-self-check-item--${item.status}`} key={item.key}>
          <b>{item.label}</b>
          <p>{item.reason}</p>
          {item.suggestedFix ? <small>{item.suggestedFix}</small> : null}
        </article>
      )) : <p>{empty}</p>}
    </div>
  );
}
