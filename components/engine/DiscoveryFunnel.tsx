import React from "react";
import type { DiscoveryDiagnostics, DiscoveryProvider, DiscoveryProviderStatus } from "@/lib/lead-discovery";

const providerLabels: Record<DiscoveryProvider, string> = {
  osm: "OpenStreetMap",
  azureMaps: "Azure Maps",
  googlePlaces: "Google Places",
  yelp: "Yelp",
};

const statusLabels: Record<DiscoveryProviderStatus, string> = {
  not_recorded: "Not recorded",
  not_configured: "Not configured",
  succeeded: "Succeeded",
  failed: "Failed",
  timed_out: "Timed out",
  zero_results: "Zero results",
  rate_limited: "Rate limited",
};

const notRecorded = {
  configured: null,
  queryExecuted: null,
  status: "not_recorded",
  returnedCount: 0,
  withinRadiusCount: 0,
  afterDeduplicationCount: 0,
  usableWebsiteCount: 0,
} as const;

export function DiscoveryFunnel({ diagnostics, qualificationLabel = "usable websites" }: { diagnostics: DiscoveryDiagnostics; qualificationLabel?: string }) {
  const booleanLabel = (value: boolean | null) => value === null ? "Not recorded" : value ? "Yes" : "No";
  return (
    <section className="engine-discovery-diagnostics" aria-label="Discovery diagnostics">
      <div className="engine-discovery-funnel">
        <span><b>{diagnostics.rawProviderCount}</b> total provider records</span>
        <span><b>{diagnostics.afterDistanceFilteringCount}</b> within {diagnostics.radiusKm} km</span>
        <span><b>{diagnostics.finalMergedCount}</b> final merged records</span>
        <span><b>{diagnostics.afterQualificationFilteringCount}</b> {qualificationLabel}</span>
        <span><b>{diagnostics.returnedCount}</b> returned for review</span>
      </div>
      <div className="engine-provider-diagnostics" aria-label="Provider query diagnostics">
        <h3>Provider Diagnostics</h3>
        {(Object.keys(providerLabels) as DiscoveryProvider[]).map((provider) => {
          const diagnostic = diagnostics.providerDiagnostics?.[provider] ?? notRecorded;
          return (
            <article className="engine-provider-diagnostic" key={provider}>
              <header>
                <strong>{providerLabels[provider]}</strong>
                <span className={`engine-provider-status engine-provider-status--${diagnostic.status}`}>{statusLabels[diagnostic.status]}</span>
              </header>
              <dl>
                <div><dt>API key configured</dt><dd>{booleanLabel(diagnostic.configured)}</dd></div>
                <div><dt>Query executed</dt><dd>{booleanLabel(diagnostic.queryExecuted)}</dd></div>
                <div><dt>Raw records</dt><dd>{diagnostic.returnedCount}</dd></div>
                <div><dt>Within radius</dt><dd>{diagnostic.withinRadiusCount}</dd></div>
                <div><dt>After deduplication</dt><dd>{diagnostic.afterDeduplicationCount}</dd></div>
                <div><dt>Usable websites</dt><dd>{diagnostic.usableWebsiteCount}</dd></div>
                <div><dt>Retries</dt><dd>{diagnostic.retryCount ?? 0}</dd></div>
                <div><dt>HTTP status</dt><dd>{diagnostic.httpStatus ?? "None"}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
      {diagnostics.tradeDiagnostics?.length ? (
        <div className="engine-trade-diagnostics" aria-label="Trade discovery diagnostics">
          <h3>Trade Breakdown</h3>
          <div role="table" aria-label="Discovery diagnostics by trade">
            <div role="row"><span>Trade</span><span>Status</span><span>Rate limited</span><span>Retries</span><span>Raw</span><span>Returned</span></div>
            {diagnostics.tradeDiagnostics.map((trade) => (
              <div key={trade.trade} role="row">
                <strong>{trade.trade}</strong>
                <span>{trade.status ?? "completed"}</span>
                <span>{trade.rateLimitedProviders?.length ? trade.rateLimitedProviders.join(", ") : "None"}</span>
                <span>{trade.retryCount ?? 0}</span>
                <span>{trade.rawProviderCount}</span>
                <span>{trade.returnedCount}</span>
                {trade.skippedReason ? <small>{trade.skippedReason}</small> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
