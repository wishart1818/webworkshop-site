import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeDiscoveryCandidates,
  type DiscoveryProviderDiagnostic,
  type DiscoveryProviderDiagnostics,
} from "../lib/lead-discovery";
import { createProspect } from "../lib/prospect-engine";
import {
  authoritativeNoOwnedWebsiteEvidence,
  discoveryIdentityEvidenceSignal,
} from "../lib/prospect-identity-evidence";
import {
  combineCityDiscoveryResults,
  waitingStatusForDiscovery,
} from "../lib/top-prospect-worker";

const now = new Date("2026-08-10T14:30:00.000Z");

function providerDiagnostic(
  status: DiscoveryProviderDiagnostic["status"],
  returnedCount: number,
  configured: boolean | null = true,
): DiscoveryProviderDiagnostic {
  return {
    configured,
    queryExecuted: status === "not_configured" ? false : true,
    status,
    returnedCount,
    withinRadiusCount: 0,
    afterDeduplicationCount: 0,
    usableWebsiteCount: 0,
  };
}

function providerDiagnostics(overrides: Partial<DiscoveryProviderDiagnostics> = {}): DiscoveryProviderDiagnostics {
  return {
    osm: providerDiagnostic("zero_results", 0),
    azureMaps: providerDiagnostic("succeeded", 0),
    googlePlaces: providerDiagnostic("succeeded", 0),
    yelp: providerDiagnostic("not_configured", 0, false),
    ...overrides,
  };
}

function noSiteProspect(profileUrl: string) {
  const googleEvidence = discoveryIdentityEvidenceSignal({
    source: "google",
    businessName: "Precision Cleaning",
    website: "",
    profileUrl,
    phone: "469-555-0199",
    address: "120 Main Street, McKinney, TX",
    city: "McKinney",
    state: "TX",
    latitude: 33.1972,
    longitude: -96.6398,
    observedAt: now.toISOString(),
  });
  const bingEvidence = discoveryIdentityEvidenceSignal({
    source: "bing",
    businessName: "Precision Cleaning",
    website: "",
    profileUrl: "",
    phone: "(469) 555-0199",
    address: "120 Main St, McKinney, TX",
    city: "McKinney",
    state: "TX",
    latitude: 33.1972,
    longitude: -96.6398,
    observedAt: now.toISOString(),
  });
  const prospect = createProspect({
    businessName: "Precision Cleaning",
    website: "",
    profileUrl,
    phone: "469-555-0199",
    email: "",
    city: "McKinney",
    state: "TX",
    trade: "Cleaning",
    serviceArea: "McKinney, TX",
    sizeIndicator: "Growing",
    prospectType: "no_website_social_only",
    status: "New",
    activitySignals: [googleEvidence, bingEvidence],
  });
  prospect.createdAt = now.toISOString();
  return prospect;
}

test("Google Maps business profile can corroborate no-owned-website evidence without becoming an owned site", () => {
  const decision = authoritativeNoOwnedWebsiteEvidence(
    noSiteProspect("https://www.google.com/maps/place/Precision+Cleaning"),
    now,
  );
  assert.equal(decision.verified, true);
  assert.deepEqual(new Set(decision.sources), new Set(["bing", "google"]));
  assert.match(decision.explanation, /provider-attested public business profile/i);
});

test("generic Google URLs and one-source evidence remain insufficient for no-owned-website", () => {
  const generic = authoritativeNoOwnedWebsiteEvidence(
    noSiteProspect("https://www.google.com/maps"),
    now,
  );
  assert.equal(generic.verified, false);
  assert.equal(generic.reasonCode, "public_presence_incomplete");

  const oneSource = noSiteProspect("https://www.google.com/maps/place/Precision+Cleaning");
  oneSource.activitySignals = oneSource.activitySignals.filter((signal) => {
    if (!signal.startsWith("discovery_identity_evidence:")) return true;
    const decoded = JSON.parse(Buffer.from(signal.slice("discovery_identity_evidence:".length), "base64url").toString("utf8")) as { source?: string };
    return decoded.source === "google";
  });
  const oneSourceDecision = authoritativeNoOwnedWebsiteEvidence(oneSource, now);
  assert.equal(oneSourceDecision.verified, false);
  assert.equal(oneSourceDecision.reasonCode, "identity_incomplete");
});

test("no-site discovery preserves the pre-qualification funnel and real owned-website counts", () => {
  const result = mergeDiscoveryCandidates({
    latitude: 33.1972,
    longitude: -96.6398,
    city: "McKinney",
    state: "TX",
    trade: "Cleaning",
    radiusKm: 25,
    limit: 20,
    prospectType: "no_website_social_only",
    candidates: [
      {
        source: "google",
        businessName: "Precision Cleaning",
        profileUrl: "https://www.google.com/maps/place/Precision+Cleaning",
        phone: "469-555-0199",
        address: "120 Main Street, McKinney, TX",
        city: "McKinney",
        state: "TX",
        latitude: 33.1972,
        longitude: -96.6398,
        reviewCount: 22,
      },
      {
        source: "bing",
        businessName: "Precision Cleaning",
        phone: "469-555-0199",
        address: "120 Main St, McKinney, TX",
        city: "McKinney",
        state: "TX",
        latitude: 33.1972,
        longitude: -96.6398,
      },
      {
        source: "google",
        businessName: "Bright Cleaning",
        website: "https://brightcleaning.example",
        profileUrl: "https://www.google.com/maps/place/Bright+Cleaning",
        phone: "469-555-0100",
        city: "McKinney",
        state: "TX",
        latitude: 33.20,
        longitude: -96.64,
        reviewCount: 12,
      },
    ],
    sourceCounts: { osm: 0, google: 2, bing: 1, yelp: 0, yellowPages: 0 },
    providerDiagnostics: providerDiagnostics({
      azureMaps: providerDiagnostic("succeeded", 1),
      googlePlaces: providerDiagnostic("succeeded", 2),
    }),
  });

  assert.equal(result.diagnostics.rawProviderCount, 3);
  assert.equal(result.diagnostics.afterDuplicateFilteringCount, 2);
  assert.equal(result.diagnostics.finalMergedCount, 2);
  assert.equal(result.diagnostics.afterQualificationFilteringCount, 1);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0]?.businessName, "Precision Cleaning");
  assert.equal(result.diagnostics.qualificationBreakdown?.ownedWebsiteCandidates, 1);
  assert.equal(result.diagnostics.qualificationBreakdown?.noOwnedWebsiteCandidates, 1);
  assert.equal(result.diagnostics.qualificationBreakdown?.requestedTypeMismatch, 1);
  assert.equal(result.diagnostics.providerDiagnostics.googlePlaces.usableWebsiteCount, 1);
});

test("successful providers plus zero eligible no-site matches complete as partial rather than provider error", () => {
  const result = mergeDiscoveryCandidates({
    latitude: 33.1972,
    longitude: -96.6398,
    city: "McKinney",
    state: "TX",
    trade: "Cleaning",
    radiusKm: 25,
    limit: 20,
    prospectType: "no_website_social_only",
    candidates: [
      {
        source: "google",
        businessName: "Bright Cleaning",
        website: "https://brightcleaning.example",
        profileUrl: "https://www.google.com/maps/place/Bright+Cleaning",
        phone: "469-555-0100",
        city: "McKinney",
        state: "TX",
        latitude: 33.20,
        longitude: -96.64,
      },
      {
        source: "bing",
        businessName: "Bright Cleaning",
        website: "https://brightcleaning.example",
        phone: "469-555-0100",
        city: "McKinney",
        state: "TX",
        latitude: 33.20,
        longitude: -96.64,
      },
    ],
    sourceCounts: { osm: 0, google: 1, bing: 1, yelp: 0, yellowPages: 0 },
    providerDiagnostics: providerDiagnostics({
      osm: { ...providerDiagnostic("failed", 0), httpStatus: 504, failureType: "http_error" },
      azureMaps: providerDiagnostic("succeeded", 1),
      googlePlaces: providerDiagnostic("succeeded", 1),
    }),
  });

  assert.equal(result.leads.length, 0);
  assert.equal(result.diagnostics.afterDuplicateFilteringCount, 1);
  assert.equal(result.diagnostics.qualificationBreakdown?.requestedTypeMismatch, 1);
  assert.equal(waitingStatusForDiscovery(result), "COMPLETED_WITH_PARTIAL_RESULTS");

  const combined = combineCityDiscoveryResults({
    radiusKm: 25,
    limit: 20,
    cityTargets: [{ city: "McKinney", state: "TX", label: "McKinney, TX" }],
    excludePreviouslyReviewed: true,
    results: [{
      target: { city: "McKinney", state: "TX", label: "McKinney, TX" },
      requestedCount: 20,
      result,
    }],
  });
  assert.equal(combined.diagnostics.finalMergedCount, 1);
  assert.equal(combined.diagnostics.afterDuplicateFilteringCount, 1);
  assert.equal(combined.diagnostics.cityDiagnostics?.[0]?.status, "partial");
  assert.match(combined.diagnostics.cityDiagnostics?.[0]?.safeReason ?? "", /providers returned business records/i);
});

test("zero leads with no successful provider records still fails after discovery", () => {
  const result = mergeDiscoveryCandidates({
    latitude: 33.1972,
    longitude: -96.6398,
    city: "McKinney",
    state: "TX",
    trade: "Cleaning",
    radiusKm: 25,
    limit: 20,
    prospectType: "no_website_social_only",
    candidates: [],
    sourceCounts: { osm: 0, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
    providerDiagnostics: providerDiagnostics({
      osm: { ...providerDiagnostic("failed", 0), httpStatus: 504, failureType: "http_error" },
      azureMaps: providerDiagnostic("failed", 0),
      googlePlaces: providerDiagnostic("failed", 0),
    }),
  });
  assert.equal(waitingStatusForDiscovery(result), "FAILED_AFTER_DISCOVERY");
});
