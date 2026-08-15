import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import {
  discoveryIdentityEvidenceSignal,
  type DiscoveryIdentityEvidence,
} from "../lib/prospect-identity-evidence";
import {
  latestProviderIdentityResolutionDiagnostic,
  resolveProviderIdentityCandidates,
} from "../lib/prospect-identity-resolution";
import { websiteFitAllowsAutonomousOutreach } from "../lib/prospect-qualification";
import { verifyProspectWebsiteWithSecondPass } from "../lib/prospect-verification-resolution";

const now = new Date("2026-08-14T16:00:00.000Z");

function evidence(overrides: Partial<DiscoveryIdentityEvidence> = {}): DiscoveryIdentityEvidence {
  return {
    source: "google",
    businessName: "Tampa Bay Pro Pressure Washing LLC",
    website: "",
    profileUrl: "https://www.google.com/maps/place/tampa-bay-pro",
    phone: "(813) 555-0147",
    address: "1420 Palm Avenue, Tampa, FL 33602",
    city: "Tampa",
    state: "FL",
    latitude: 27.9506,
    longitude: -82.4572,
    ...overrides,
  };
}

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    ...createProspect({
      businessName: "Tampa Bay Pro Pressure Washing",
      website: "",
      phone: "813-555-0147",
      email: "",
      city: "Tampa",
      state: "FL",
      trade: "Pressure Washing",
      serviceArea: "Tampa, FL",
      sizeIndicator: "Growing",
      status: "New",
      prospectType: "no_website_social_only",
    }),
    address: "1420 Palm Ave, Tampa, Florida 33602",
    prospectType: "no_website_social_only",
    activitySignals: [discoveryIdentityEvidenceSignal(evidence({ source: "bing", website: "", profileUrl: "" }))],
    createdAt: "2026-08-14T15:55:00.000Z",
    ...overrides,
  };
}

test("same normalized name plus exact phone and compatible location is a strong identity match", () => {
  const resolution = resolveProviderIdentityCandidates(prospect(), [evidence({ address: "", latitude: 27.9507, longitude: -82.4571 })]);

  assert.equal(resolution.status, "strong_match");
  assert.equal(resolution.confidenceSufficient, true);
  assert.ok(resolution.matchedSignals.includes("exact_phone"));
  assert.ok(resolution.matchedSignals.includes("close_coordinates"));
});

test("legal suffix differences plus exact phone and strongly normalized address are a strong match", () => {
  const resolution = resolveProviderIdentityCandidates(prospect(), [evidence()]);

  assert.equal(resolution.status, "strong_match");
  assert.ok(resolution.matchedSignals.includes("legal_suffix_equivalent_name"));
  assert.ok(resolution.matchedSignals.includes("exact_phone"));
  assert.ok(resolution.matchedSignals.includes("strong_address"));
});

test("same or similar names with conflicting phone or location fail closed", () => {
  const phoneConflict = resolveProviderIdentityCandidates(prospect(), [evidence({ phone: "727-555-0199" })]);
  const locationConflict = resolveProviderIdentityCandidates(prospect(), [evidence({
    phone: "",
    address: "900 Ocean Drive, Miami, FL 33139",
    city: "Miami",
    latitude: 25.7907,
    longitude: -80.1300,
  })]);

  assert.notEqual(phoneConflict.status, "strong_match");
  assert.ok(phoneConflict.conflictingSignals.includes("phone_conflict"));
  assert.notEqual(locationConflict.status, "strong_match");
  assert.ok(locationConflict.conflictingSignals.includes("address_conflict"));
  assert.ok(locationConflict.conflictingSignals.includes("city_state_conflict"));
  assert.ok(locationConflict.conflictingSignals.includes("coordinate_conflict"));
});

test("multiple plausible provider records remain same-name ambiguous", () => {
  const resolution = resolveProviderIdentityCandidates(prospect(), [
    evidence({ website: "https://tampabaypro.example/" }),
    evidence({ website: "https://tampabaypro-wash.example/" }),
  ]);

  assert.equal(resolution.status, "ambiguous");
  assert.equal(resolution.confidenceSufficient, false);
  assert.equal(resolution.plausibleCandidateCount, 2);
  assert.deepEqual(resolution.conflictingSignals, ["multiple_plausible_matches"]);
});

test("strong Google-associated 404 website establishes ownership only through the existing inactive-site verifier", async () => {
  const website = "https://tampabayflpressurewash.example/";
  let providerCalls = 0;
  let websiteCalls = 0;
  const result = await verifyProspectWebsiteWithSecondPass(prospect({
    activitySignals: [
      discoveryIdentityEvidenceSignal(evidence({ source: "bing", website: "", profileUrl: "" })),
      "discovery_identity_conflict:same_name",
    ],
  }), {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "places.googleapis.com") {
        providerCalls += 1;
        return new Response(JSON.stringify({ places: [{
          displayName: { text: "Tampa Bay Pro Pressure Washing LLC" },
          formattedAddress: "1420 Palm Avenue, Tampa, FL 33602, USA",
          nationalPhoneNumber: "(813) 555-0147",
          websiteUri: website,
          googleMapsUri: "https://www.google.com/maps/place/tampa-bay-pro",
          location: { latitude: 27.9506, longitude: -82.4572 },
          addressComponents: [
            { longText: "Tampa", types: ["locality"] },
            { shortText: "FL", types: ["administrative_area_level_1"] },
          ],
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      websiteCalls += 1;
      return new Response("<html><title>Not found</title><body>Not found</body></html>", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      });
    }) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 0,
  });

  assert.ok(providerCalls > 0);
  assert.ok(websiteCalls >= 2);
  assert.equal(result.result.report.status, "confirmed_inactive");
  assert.equal(result.result.report.ownershipDecision, "owned");
  assert.equal(result.result.prospect.fitDisposition, "broken_or_inactive_website");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.result.prospect), true);
  assert.equal(result.noSiteEnrichment?.providerWebsiteAcceptedAsOwned, true);
  assert.equal(latestProviderIdentityResolutionDiagnostic(result.result.prospect.activitySignals)?.providerWebsiteAcceptedAsOwned, true);
  assert.equal(result.result.prospect.outreach, undefined);
  assert.equal(result.result.prospect.preview, undefined);
});

test("a provider website from a weak identity match is not inferred as owned", async () => {
  const website = "https://wrong-pressure-washing.example/";
  const result = await verifyProspectWebsiteWithSecondPass(prospect(), {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "places.googleapis.com") {
        return new Response(JSON.stringify({ places: [{
          displayName: { text: "Tampa Bay Pro Pressure Washing LLC" },
          formattedAddress: "900 Ocean Drive, Miami, FL 33139",
          nationalPhoneNumber: "305-555-0199",
          websiteUri: website,
          location: { latitude: 25.7907, longitude: -80.1300 },
        }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      assert.fail("Weak provider identity must not dispatch a website verification request.");
    }) as typeof fetch,
    now: () => now,
  });

  assert.equal(result.result.prospect.website, "");
  assert.equal(result.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(result.noSiteEnrichment?.identityConfidenceSufficient, false);
  assert.equal(result.noSiteEnrichment?.providerWebsiteAcceptedAsOwned, false);
  assert.equal(result.result.prospect.outreach, undefined);
});

test("strong independent providers without websites feed the existing no-site rule even after a same-name flag", async () => {
  const result = await verifyProspectWebsiteWithSecondPass(prospect({
    activitySignals: [
      discoveryIdentityEvidenceSignal(evidence({ source: "bing", website: "", profileUrl: "" })),
      "discovery_identity_conflict:same_name",
    ],
  }), {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input) => {
      const url = new URL(String(input));
      assert.equal(url.hostname, "places.googleapis.com");
      return new Response(JSON.stringify({ places: [{
        displayName: { text: "Tampa Bay Pro Pressure Washing LLC" },
        formattedAddress: "1420 Palm Avenue, Tampa, FL 33602, USA",
        nationalPhoneNumber: "(813) 555-0147",
        googleMapsUri: "https://www.google.com/maps/place/tampa-bay-pro",
        location: { latitude: 27.9506, longitude: -82.4572 },
        addressComponents: [
          { longText: "Tampa", types: ["locality"] },
          { shortText: "FL", types: ["administrative_area_level_1"] },
        ],
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch,
    now: () => now,
  });

  assert.equal(result.result.report.status, "no_owned_website");
  assert.equal(result.result.prospect.fitDisposition, "no_owned_website");
  assert.deepEqual(result.noSiteEnrichment?.providerSources, ["bing", "google"]);
  assert.equal(result.noSiteEnrichment?.identityConfidenceSufficient, true);
  assert.equal(result.result.prospect.outreach, undefined);
  assert.equal(result.result.prospect.preview, undefined);
});

test("historical provider evidence remains human-review-only after a broken-site recheck", async () => {
  const website = "https://tampabayflpressurewash.example/";
  const old = prospect({
    website,
    prospectType: "redesign",
    createdAt: "2026-05-01T12:00:00.000Z",
    activitySignals: [discoveryIdentityEvidenceSignal(evidence({ website }))],
  });
  const result = await verifyProspectWebsiteWithSecondPass(old, {
    allowHistoricalNoSiteLookup: true,
    fetch: (async () => new Response("<html><title>Not found</title><body>Not found</body></html>", {
      status: 404,
      headers: { "Content-Type": "text/html" },
    })) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
  });

  assert.equal(result.result.report.status, "confirmed_inactive");
  assert.equal(result.result.report.ownershipDecision, "uncertain");
  assert.equal(result.outcome, "still_manual");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.result.prospect), false);
  assert.equal(latestProviderIdentityResolutionDiagnostic(result.result.prospect.activitySignals)?.evidenceCurrentForQualification, false);
  assert.equal(result.result.prospect.outreach, undefined);
  assert.equal(result.result.prospect.preview, undefined);
});
