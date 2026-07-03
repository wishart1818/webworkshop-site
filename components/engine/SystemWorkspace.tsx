import React from "react";
import type { AuditEventView } from "@/lib/operational-controls";
import type { SystemSelfCheckReport } from "@/lib/system-self-check";

export type SystemPayload = {
  status: "ready" | "blocked" | "development";
  checks: Record<string, { configured: boolean; reachable?: boolean; message: string }>;
  auditEvents: AuditEventView[];
  selfCheck?: SystemSelfCheckReport | null;
};

type SystemWorkspaceProps = {
  system: SystemPayload | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onRunSelfCheck: () => void;
  selfCheckRunning: boolean;
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

export function SystemWorkspace({ system, loading, error, onRefresh, onRunSelfCheck, selfCheckRunning }: SystemWorkspaceProps) {
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
