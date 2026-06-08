import type { AuditEventView } from "@/lib/operational-controls";

export type SystemPayload = {
  status: "ready" | "blocked" | "development";
  checks: Record<string, { configured: boolean; reachable?: boolean; message: string }>;
  auditEvents: AuditEventView[];
};

type SystemWorkspaceProps = {
  system: SystemPayload | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
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

export function SystemWorkspace({ system, loading, error, onRefresh }: SystemWorkspaceProps) {
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
        <button className="engine-button" disabled={loading} onClick={onRefresh} type="button">
          {loading ? "Refreshing" : "Refresh status"}
        </button>
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
