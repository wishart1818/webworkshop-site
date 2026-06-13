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
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
