import type { DiscoveryDiagnostics } from "@/lib/lead-discovery";

export function DiscoveryFunnel({ diagnostics }: { diagnostics: DiscoveryDiagnostics }) {
  return (
    <div className="engine-discovery-funnel" aria-label="Discovery funnel">
      <span><b>{diagnostics.rawProviderCount}</b> provider records</span>
      <span><b>{diagnostics.afterDistanceFilteringCount}</b> within {diagnostics.radiusKm} km</span>
      <span><b>{diagnostics.afterDuplicateFilteringCount}</b> unique records</span>
      <span><b>{diagnostics.afterQualificationFilteringCount}</b> usable websites</span>
      <span><b>{diagnostics.returnedCount}</b> returned for review</span>
    </div>
  );
}
