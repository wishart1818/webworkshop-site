import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { discoveryDiagnosticsFromJson, type DiscoveryDiagnostics } from "../lib/lead-discovery";
import { inspectManualReviewTriageCandidate } from "../lib/manual-review-triage";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import {
  latestNoSiteEnrichmentDiagnostic,
  verifyProspectWebsiteWithSecondPass,
} from "../lib/prospect-verification-resolution";

const now = new Date("2026-08-14T14:00:00.000Z");
const phone = "561-555-0142";
const address = "120 Ocean Avenue, Jupiter, FL 33458";

function providerEvidence(source: "bing" | "google", overrides: Partial<{
  businessName: string;
  website: string;
  profileUrl: string;
  phone: string;
  address: string;
}> = {}) {
  return discoveryIdentityEvidenceSignal({
    source,
    businessName: overrides.businessName ?? "Coastal Bright Pressure Washing",
    website: overrides.website ?? "",
    profileUrl: overrides.profileUrl ?? (source === "google" ? "https://www.google.com/maps/place/coastal-bright" : ""),
    phone: overrides.phone ?? phone,
    address: overrides.address ?? address,
    city: "Jupiter",
    state: "FL",
    latitude: 26.9342,
    longitude: -80.0942,
  });
}

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    ...createProspect({
      businessName: "Coastal Bright Pressure Washing",
      website: "",
      phone,
      email: "",
      city: "Jupiter",
      state: "FL",
      trade: "Pressure Washing",
      serviceArea: "Jupiter, FL",
      sizeIndicator: "Growing",
      status: "New",
      prospectType: "no_website_social_only",
    }),
    address,
    prospectType: "no_website_social_only",
    activitySignals: [providerEvidence("bing")],
    createdAt: "2026-08-14T13:55:00.000Z",
    ...overrides,
  };
}

function googlePlacesResponse(input: string | URL | Request, init: RequestInit | undefined, place: Record<string, unknown>) {
  assert.equal(String(input), "https://places.googleapis.com/v1/places:searchText");
  assert.equal(init?.method, "POST");
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("X-Goog-Api-Key"), "google-test-key");
  return new Response(JSON.stringify({ places: [place] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function businessHtml() {
  return `<!doctype html><html><head><title>Coastal Bright Pressure Washing | Jupiter</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav><h1>Coastal Bright Pressure Washing</h1>
    <p>Residential pressure washing, house washing, and concrete cleaning for Jupiter homeowners.</p>
    <a href="tel:+15615550142">(561) 555-0142</a><form><button>Request an estimate</button></form>
    <img src="/project.jpg" alt="Pressure washing project" /></body></html>`;
}

test("exact Google corroboration with an owned website runs shared verification and blocks a no-site conclusion", async () => {
  let websiteRequests = 0;
  const ownedWebsite = "https://coastalbright.example/";
  const result = await verifyProspectWebsiteWithSecondPass(prospect(), {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "places.googleapis.com") {
        return googlePlacesResponse(input, init, {
          displayName: { text: "Coastal Bright Pressure Washing" },
          formattedAddress: `${address}, USA`,
          nationalPhoneNumber: phone,
          websiteUri: ownedWebsite,
          googleMapsUri: "https://www.google.com/maps/place/coastal-bright",
          location: { latitude: 26.9342, longitude: -80.0942 },
          addressComponents: [
            { longText: "Jupiter", types: ["locality"] },
            { shortText: "FL", types: ["administrative_area_level_1"] },
          ],
        });
      }
      assert.equal(url.hostname, "coastalbright.example");
      websiteRequests += 1;
      return new Response(businessHtml(), { status: 200, headers: { "Content-Type": "text/html" } });
    }) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 0,
  });

  assert.ok(websiteRequests > 0);
  assert.equal(result.noSiteEnrichment?.outcome, "owned_website_found");
  assert.equal(result.result.report.status, "usable");
  assert.equal(result.result.report.ownershipDecision, "owned");
  assert.notEqual(result.result.prospect.fitDisposition, "no_owned_website");
  assert.equal(result.result.prospect.outreach, undefined);
  assert.equal(result.result.prospect.preview, undefined);
  assert.equal(latestNoSiteEnrichmentDiagnostic(result.result.prospect.activitySignals)?.outcome, "owned_website_found");
});

test("two exact independent providers without a website feed the unchanged no-site evidence rule", async () => {
  const value = prospect({
    businessName: "Pressure Washing Services LLC",
    activitySignals: [providerEvidence("bing", { businessName: "Pressure Washing Services LLC" })],
  });
  const result = await verifyProspectWebsiteWithSecondPass(value, {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input, init) => googlePlacesResponse(input, init, {
      displayName: { text: "Pressure Washing Services LLC" },
      formattedAddress: `${address}, USA`,
      nationalPhoneNumber: phone,
      googleMapsUri: "https://www.google.com/maps/place/pressure-washing-services",
      location: { latitude: 26.9342, longitude: -80.0942 },
      addressComponents: [
        { longText: "Jupiter", types: ["locality"] },
        { shortText: "FL", types: ["administrative_area_level_1"] },
      ],
    })) as typeof fetch,
    now: () => now,
  });

  assert.equal(result.noSiteEnrichment?.outcome, "probable_no_owned_website");
  assert.deepEqual(result.noSiteEnrichment?.providerSources, ["bing", "google"]);
  assert.equal(result.result.report.status, "no_owned_website");
  assert.equal(result.result.prospect.outreach, undefined);
  assert.equal(result.result.prospect.preview, undefined);
});

test("similar Google identity with mismatching phone and address remains unresolved", async () => {
  const result = await verifyProspectWebsiteWithSecondPass(prospect(), {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input, init) => googlePlacesResponse(input, init, {
      displayName: { text: "Coastal Bright Pressure Washing" },
      formattedAddress: "999 Other Road, Miami, FL 33101",
      nationalPhoneNumber: "305-555-0199",
      websiteUri: "https://wrong-business.example/",
      googleMapsUri: "https://www.google.com/maps/place/wrong-business",
    })) as typeof fetch,
    now: () => now,
  });

  assert.equal(result.noSiteEnrichment?.outcome, "unresolved");
  assert.equal(result.result.prospect.website, "");
  assert.equal(result.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.doesNotMatch(result.noSiteEnrichment?.websiteCandidate ?? "", /wrong-business/);
});

test("a known parked business domain uses existing broken-site verification", async () => {
  const website = "https://coastalbright.example/";
  const value = prospect({
    website,
    prospectType: "redesign",
    activitySignals: [providerEvidence("google", { website })],
  });
  const result = await verifyProspectWebsiteWithSecondPass(value, {
    fetch: (async () => new Response("<html><title>Domain parked</title><body>This domain is parked and for sale.</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxVerificationAttempts: 4,
  });

  assert.equal(result.result.report.status, "confirmed_broken");
  assert.equal(result.result.prospect.fitDisposition, "broken_or_inactive_website");
  assert.equal(result.result.prospect.outreach, undefined);
});

test("historical manual records can run a targeted lookup without making stale no-site evidence autonomous", async () => {
  let googleCalls = 0;
  const old = prospect({ createdAt: "2026-06-01T00:00:00.000Z" });
  const fetchImpl: typeof fetch = async (input, init) => {
    googleCalls += 1;
    return googlePlacesResponse(input, init, {
      displayName: { text: "Coastal Bright Pressure Washing" },
      formattedAddress: `${address}, USA`,
      nationalPhoneNumber: phone,
      googleMapsUri: "https://www.google.com/maps/place/coastal-bright",
      location: { latitude: 26.9342, longitude: -80.0942 },
      addressComponents: [
        { longText: "Jupiter", types: ["locality"] },
        { shortText: "FL", types: ["administrative_area_level_1"] },
      ],
    });
  };

  const normal = await verifyProspectWebsiteWithSecondPass(old, {
    googlePlacesApiKey: "google-test-key",
    fetch: fetchImpl,
    now: () => now,
  });
  assert.equal(googleCalls, 0);
  assert.equal(normal.result.prospect.fitDisposition, "inconclusive_requires_review");

  const historical = await verifyProspectWebsiteWithSecondPass(old, {
    googlePlacesApiKey: "google-test-key",
    fetch: fetchImpl,
    now: () => now,
    allowHistoricalNoSiteLookup: true,
  });
  assert.ok(googleCalls > 0);
  assert.equal(historical.noSiteEnrichment?.outcome, "unresolved");
  assert.equal(historical.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(historical.result.prospect.outreach, undefined);
  assert.equal(historical.result.prospect.preview, undefined);
});

test("persisted manual opportunities reuse targeted enrichment without generating artifacts", async () => {
  const ownedWebsite = "https://coastalbright.example/";
  const old = prospect({ createdAt: "2026-06-01T00:00:00.000Z" });
  const inspected = await inspectManualReviewTriageCandidate(old, [], {
    googlePlacesApiKey: "google-test-key",
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      if (url.hostname === "places.googleapis.com") {
        return googlePlacesResponse(input, init, {
          displayName: { text: "Coastal Bright Pressure Washing" },
          formattedAddress: `${address}, USA`,
          nationalPhoneNumber: phone,
          websiteUri: ownedWebsite,
          googleMapsUri: "https://www.google.com/maps/place/coastal-bright",
          location: { latitude: 26.9342, longitude: -80.0942 },
          addressComponents: [
            { longText: "Jupiter", types: ["locality"] },
            { shortText: "FL", types: ["administrative_area_level_1"] },
          ],
        });
      }
      return new Response(businessHtml(), { status: 200, headers: { "Content-Type": "text/html" } });
    }) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 0,
  });

  assert.equal(inspected.record.triageOutcome, "still_manual");
  assert.ok(inspected.record.candidateUrlsConsidered.includes(ownedWebsite));
  assert.match(inspected.record.humanExplanation, /deeper result|verification/i);
  assert.equal(inspected.proposedProspect, null);
  assert.equal(old.website, "");
  assert.equal(old.outreach, undefined);
  assert.equal(old.preview, undefined);
});

test("Top Prospects diagnostics retain bounded enrichment evidence for operator display", () => {
  const diagnostic = {
    version: "no-site-enrichment-v1" as const,
    outcome: "owned_website_found" as const,
    reason: "An exact Google identity match supplied an owned website.",
    checkedAt: now.toISOString(),
    providerSources: ["bing", "google"] as Array<"bing" | "google">,
    websiteCandidate: "https://coastalbright.example/",
    websiteVerificationStatus: "usable",
    websiteFitDisposition: "adequate_existing_website",
  };
  const payload = {
    rawProviderCount: 1,
    afterDistanceFilteringCount: 1,
    afterDuplicateFilteringCount: 1,
    afterQualificationFilteringCount: 1,
    returnedCount: 1,
    radiusKm: 50,
    categorySignals: [],
    sourceCounts: { osm: 0, google: 0, bing: 1, yelp: 0, yellowPages: 0 },
    providerDiagnostics: Object.fromEntries([
      "osm",
      "azureMaps",
      "googlePlaces",
      "yelp",
    ].map((provider) => [provider, {
      configured: null,
      queryExecuted: null,
      status: "not_recorded",
      returnedCount: 0,
      withinRadiusCount: 0,
      afterDeduplicationCount: 0,
      usableWebsiteCount: 0,
    }])) as DiscoveryDiagnostics["providerDiagnostics"],
    finalMergedCount: 1,
    websiteEnrichmentRecords: [{
      prospectId: "prospect-1",
      businessName: "Coastal Bright Pressure Washing",
      trade: "Pressure Washing",
      city: "Jupiter",
      state: "FL",
      ...diagnostic,
    }],
  } satisfies DiscoveryDiagnostics;

  const parsed = discoveryDiagnosticsFromJson({ leads: [], diagnostics: payload });
  assert.equal(parsed?.websiteEnrichmentRecords?.length, 1);
  assert.equal(parsed?.websiteEnrichmentRecords?.[0]?.outcome, "owned_website_found");
  assert.match(parsed?.websiteEnrichmentRecords?.[0]?.reason ?? "", /exact Google identity match/i);
});

test("Top Prospects surfaces persisted enrichment outcomes without adding an outreach action", () => {
  const source = readFileSync(new URL("../components/engine/TopProspectsWorkspace.tsx", import.meta.url), "utf8");
  const sectionStart = source.indexOf('aria-label="Owned website corroboration"');
  const sectionEnd = source.indexOf('aria-label="Manual Opportunity Review"', sectionStart);
  const section = source.slice(sectionStart, sectionEnd);

  assert.ok(sectionStart >= 0);
  assert.match(source, /Owned website found/);
  assert.match(source, /Probable no owned website/);
  assert.match(source, /Broken or inactive website/);
  assert.match(section, /No independent exact match/);
  assert.match(section, /generated no package and sent nothing/);
  assert.doesNotMatch(section, /Approve|Queue|Generate|Send email/);
});
