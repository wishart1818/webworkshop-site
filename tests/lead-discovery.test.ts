import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTradeDiscoveryQueries,
  discoverContractorsWithDiagnostics,
  discoveryDiagnosticsFromJson,
  discoveryLeadsFromJson,
  mergeDiscoveryCandidates,
  processDiscoveryElements,
  resetDiscoveryThrottleForTests,
  type DiscoveredLead,
  type DiscoveryResult,
} from "../lib/lead-discovery";
import { TopProspectStageError } from "../lib/top-prospect-diagnostics";

test("roofing discovery combines exact craft and business-name signals without a provider result cap", () => {
  const queries = buildTradeDiscoveryQueries("Roofing", 10_000, 41.6528, -83.5379);

  assert.match(queries.primary, /craft"="roofer/);
  assert.doesNotMatch(queries.primary, /name"~/);
  assert.match(queries.enrichment ?? "", /name"~"roof\|roofing",i/);
  assert.doesNotMatch(queries.enrichment ?? "", /operator|contact:website/);
  assert.match(queries.primary, /around:10000,41\.6528,-83\.5379/);
  assert.match(queries.primary, /out tags center;/);
  assert.doesNotMatch(queries.primary, /out tags center \d+/);
});

test("discovery diagnostics expose provider, distance, duplicate, qualification, and returned counts", () => {
  const result = processDiscoveryElements({
    latitude: 41.6528,
    longitude: -83.5379,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 10,
    limit: 50,
    elements: [
      { type: "node", id: 1, lat: 41.65, lon: -83.54, tags: { name: "Local Roofing", website: "localroofing.example", phone: "555-0100" } },
      { type: "way", id: 2, center: { lat: 41.651, lon: -83.541 }, tags: { name: "Local Roofing Office", website: "https://www.localroofing.example/contact" } },
      { type: "node", id: 3, lat: 41.86, lon: -83.54, tags: { name: "Far Roofing", website: "https://far.example" } },
      { type: "node", id: 4, lat: 41.66, lon: -83.54, tags: { name: "No Website Roofing" } },
      { type: "node", id: 5, lat: 41.66, lon: -83.55, tags: { name: "Closed Roofing", website: "https://closed.example", disused: "yes" } },
      { type: "way", id: 6, tags: { name: "Missing Center Roofing", website: "https://missing-center.example", email: "hello@example.com" } },
    ],
  });

  assert.equal(result.diagnostics.rawProviderCount, 6);
  assert.equal(result.diagnostics.afterDistanceFilteringCount, 5);
  assert.equal(result.diagnostics.afterDuplicateFilteringCount, 3);
  assert.equal(result.diagnostics.afterQualificationFilteringCount, 2);
  assert.equal(result.diagnostics.returnedCount, 2);
  assert.deepEqual(result.diagnostics.categorySignals, ["craft=roofer", "name~roof|roofing"]);
  assert.deepEqual(result.diagnostics.sourceCounts, { osm: 6, google: 0, bing: 0, yelp: 0, yellowPages: 0 });
  assert.equal(result.diagnostics.providerDiagnostics.osm.status, "succeeded");
  assert.equal(result.diagnostics.providerDiagnostics.osm.canRunWithoutApiKey, true);
  assert.equal(result.diagnostics.providerDiagnostics.osm.envVarName, "Not required");
  assert.equal(result.diagnostics.providerDiagnostics.azureMaps.envVarName, "AZURE_MAPS_API_KEY or BING_MAPS_API_KEY");
  assert.equal(result.diagnostics.providerDiagnostics.googlePlaces.envVarPresent, false);
  assert.equal(result.diagnostics.finalMergedCount, 3);
  assert.deepEqual(result.leads.map((lead) => lead.businessName), ["Local Roofing", "Missing Center Roofing"]);
});

test("Toledo roofing discovery can return dozens when the provider supplies them", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  let overpassQuery = "";
  const events: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes("nominatim")) {
      return new Response(JSON.stringify([{ lat: "41.6528", lon: "-83.5379" }]), { status: 200 });
    }
    overpassQuery = String(init?.body);
    if (overpassQuery.includes("name")) return new Response("provider timeout", { status: 504 });
    return new Response(JSON.stringify({
      elements: Array.from({ length: 40 }, (_, index) => ({
        type: "node",
        id: index + 1,
        lat: 41.6528,
        lon: -83.5379,
        tags: {
          name: `Toledo Roofing ${index + 1}`,
          website: `https://toledo-roofing-${index + 1}.example`,
          phone: `555-${String(index + 1).padStart(4, "0")}`,
        },
      })),
    }), { status: 200 });
  };
  resetDiscoveryThrottleForTests();
  try {
    const result = await discoverContractorsWithDiagnostics({
      city: "Toledo",
      state: "OH",
      trade: "Roofing",
      radiusKm: 10,
      limit: 50,
      logger(event) {
        events.push(event);
      },
    });

    const geocodeUrl = new URL(requestedUrls[0]);
    assert.equal(geocodeUrl.searchParams.get("q"), "Toledo, OH, USA");
    assert.equal(geocodeUrl.searchParams.get("countrycodes"), "us");
    assert.match(decodeURIComponent(overpassQuery), /around:10000,41\.6528,-83\.5379/);
    assert.equal(result.diagnostics.rawProviderCount, 40);
    assert.equal(result.diagnostics.returnedCount, 40);
    assert.equal(result.leads.length, 40);
    assert.deepEqual(events, [
      "provider_queried",
      "provider_returned_count",
      "provider_queried",
      "provider_enrichment_failed",
      "filtering_started",
      "provider_diagnostics",
      "provider_diagnostics",
      "provider_diagnostics",
      "provider_diagnostics",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    resetDiscoveryThrottleForTests();
  }
});

test("multi-source discovery merges business identity and prioritizes enriched leads", () => {
  const result = mergeDiscoveryCandidates({
    latitude: 41.6528,
    longitude: -83.5379,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 50,
    limit: 50,
    sourceCounts: { osm: 2, google: 1, bing: 1, yelp: 2, yellowPages: 1 },
    candidates: [
      { source: "osm", businessName: "North Coast Roofing LLC", website: "northcoastroofing.example", latitude: 41.65, longitude: -83.54 },
      { source: "google", businessName: "North Coast Roofing", phone: "(419) 555-0100", rating: 4.8, reviewCount: 87, recentReviewCount: 4 },
      { source: "yelp", businessName: "North Coast Roofing", phone: "419-555-0100", rating: 4.5, reviewCount: 61 },
      { source: "bing", businessName: "Maumee Roof Repair", website: "https://maumeeroof.example", phone: "419-555-0200" },
      { source: "yellowPages", businessName: "Maumee Roof Repair Inc", email: "sales@maumeeroof.example", phone: "419-555-0200" },
      { source: "yelp", businessName: "Directory Only Roofing", phone: "419-555-0300", reviewCount: 12 },
      { source: "osm", businessName: "Closed Roofing", website: "https://closed.example", inactive: true },
    ],
  });

  assert.equal(result.diagnostics.rawProviderCount, 7);
  assert.equal(result.diagnostics.finalMergedCount, 3);
  assert.equal(result.diagnostics.afterQualificationFilteringCount, 2);
  assert.deepEqual(result.diagnostics.sourceCounts, { osm: 2, google: 1, bing: 1, yelp: 2, yellowPages: 1 });
  assert.deepEqual(result.leads.map((lead) => lead.businessName), ["North Coast Roofing LLC", "Maumee Roof Repair"]);
  assert.deepEqual(result.leads[0].sources, ["osm", "google", "yelp"]);
  assert.equal(result.leads[1].email, "sales@maumeeroof.example");
  assert.ok((result.leads[0].sourceConfidence ?? 0) > (result.leads[1].sourceConfidence ?? 0));
});

test("discovery marks institutional, supplier, and mismatched businesses as bad fit", () => {
  const result = mergeDiscoveryCandidates({
    latitude: 41.65,
    longitude: -83.54,
    city: "toledo",
    state: "oh",
    trade: "Electrical",
    radiusKm: 50,
    limit: 50,
    candidates: [
      { source: "osm", businessName: "Campus Electrical Operations", website: "https://facilities.example.edu/electrical", phone: "419-555-0100" },
      { source: "bing", businessName: "Toledo Electrical Equipment Supply", website: "https://toledo-electrical-supply.example", phone: "419-555-0200" },
      { source: "google", businessName: "BrightWire Electric", website: "https://saunatimes.example", phone: "419-555-0300" },
      { source: "yelp", businessName: "Neighborhood Electrical Repair", website: "https://neighborhood-electric.example", phone: "419-555-0400" },
    ],
  });

  const byName = new Map(result.leads.map((lead) => [lead.businessName, lead]));
  assert.equal(byName.get("Campus Electrical Operations")?.classification, "duplicate_bad_fit");
  assert.equal(byName.get("Toledo Electrical Equipment Supply")?.classification, "duplicate_bad_fit");
  assert.equal(byName.get("BrightWire Electric")?.classification, "duplicate_bad_fit");
  assert.equal(byName.get("Neighborhood Electrical Repair")?.classification, "website_redesign");
  assert.equal(byName.get("Campus Electrical Operations")?.inactive, true);
  assert.equal(byName.get("Neighborhood Electrical Repair")?.inactive, false);
  assert.ok(result.leads.every((lead) => lead.city === "Toledo" && lead.state === "OH" && lead.trade === "Electrical"));
});

test("No Website / Social Only discovery keeps active businesses and classifies contact readiness", () => {
  const candidates = [
    { source: "google" as const, businessName: "Social Only Roofing", website: "https://facebook.com/social-roofing", profileUrl: "https://facebook.com/social-roofing", phone: "419-555-0100", reviewCount: 28, rating: 4.7 },
    { source: "yelp" as const, businessName: "Directory Only Roofing", phone: "419-555-0200", reviewCount: 12 },
    { source: "osm" as const, businessName: "Owned Website Roofing", website: "https://owned.example", phone: "419-555-0300", reviewCount: 20 },
    { source: "osm" as const, businessName: "No Activity Roofing", phone: "419-555-0400" },
    { source: "google" as const, businessName: "No Phone Roofing", reviewCount: 10 },
  ];
  const result = mergeDiscoveryCandidates({
    candidates,
    latitude: 41.65,
    longitude: -83.54,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 50,
    limit: 50,
    prospectType: "no_website_social_only",
  });

  assert.deepEqual(result.leads.map((lead) => lead.businessName), ["Social Only Roofing", "Directory Only Roofing", "No Phone Roofing"]);
  assert.ok(result.leads.every((lead) => lead.prospectType === "no_website_social_only" && lead.website === ""));
  assert.match(result.leads[0].profileUrl, /facebook/);
  assert.equal(result.leads[0].classification, "social_only");
  assert.equal(result.leads[0].recommendedContactMethod, "message_on_facebook");
  assert.equal(result.leads[1].classification, "phone_only");
  assert.equal(result.leads[1].recommendedContactMethod, "needs_manual_contact_research");
  assert.equal(result.leads[2].classification, "not_enough_contact_info");
  assert.equal(result.leads[2].recommendedContactMethod, "do_not_contact");
});

test("third-party directory URLs are not treated as owned websites or send-ready contacts", () => {
  const result = mergeDiscoveryCandidates({
    candidates: [
      {
        source: "google",
        businessName: "Heritage Landscaping and Design",
        website: "https://hub.biz/heritage-landscaping-and-design",
        phone: "419-555-0200",
        reviewCount: 8,
        rating: 4.2,
      },
    ],
    latitude: 41.65,
    longitude: -83.54,
    city: "Toledo",
    state: "OH",
    trade: "Landscaping",
    radiusKm: 50,
    limit: 50,
    prospectType: "all",
  });

  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].website, "");
  assert.match(result.leads[0].profileUrl, /hub\.biz/);
  assert.equal(result.leads[0].prospectType, "no_website_social_only");
  assert.equal(result.leads[0].classification, "listing_only");
  assert.equal(result.leads[0].recommendedContactMethod, "needs_manual_contact_research");
  assert.ok(result.leads[0].activitySignals?.includes("third_party_listing_only"));
});

test("All Prospect Types discovery returns redesign and no-website opportunities together", () => {
  const result = mergeDiscoveryCandidates({
    candidates: [
      { source: "osm", businessName: "Owned Website Roofing", website: "https://owned.example", phone: "419-555-0100" },
      { source: "yelp", businessName: "Listing Only Roofing", profileUrl: "https://www.yelp.com/biz/listing-only", phone: "419-555-0200", reviewCount: 14 },
    ],
    latitude: 41.65,
    longitude: -83.54,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 50,
    limit: 50,
    prospectType: "all",
  });

  assert.deepEqual(result.leads.map((lead) => [lead.businessName, lead.prospectType, lead.classification]), [
    ["Owned Website Roofing", "redesign", "website_redesign"],
    ["Listing Only Roofing", "no_website_social_only", "listing_only"],
  ]);
});

test("configured licensed sources enrich OSM discovery without becoming required", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    AZURE_MAPS_API_KEY: process.env.AZURE_MAPS_API_KEY,
    BING_MAPS_API_KEY: process.env.BING_MAPS_API_KEY,
    YELP_API_KEY: process.env.YELP_API_KEY,
    YELLOW_PAGES_API_URL: process.env.YELLOW_PAGES_API_URL,
  };
  process.env.GOOGLE_PLACES_API_KEY = "google-test-key";
  process.env.AZURE_MAPS_API_KEY = "azure-test-key";
  delete process.env.BING_MAPS_API_KEY;
  process.env.YELP_API_KEY = "yelp-test-key";
  process.env.YELLOW_PAGES_API_URL = "https://directory.example/search";
  const providerLogs: Array<Record<string, boolean | number | string>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("nominatim")) return new Response(JSON.stringify([{ lat: "41.6528", lon: "-83.5379" }]), { status: 200 });
    if (url.includes("overpass")) {
      return new Response(JSON.stringify({ elements: [{ type: "node", id: 1, tags: { name: "Enriched Roofing", website: "enriched.example" } }] }), { status: 200 });
    }
    if (url.includes("googleapis")) {
      assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "google-test-key");
      return new Response(JSON.stringify({ places: [{ displayName: { text: "Enriched Roofing" }, nationalPhoneNumber: "419-555-0100", rating: 4.9, userRatingCount: 120 }] }), { status: 200 });
    }
    if (url.includes("atlas.microsoft")) {
      assert.match(url, /subscription-key=azure-test-key/);
      return new Response(JSON.stringify({ results: [{ poi: { name: "Bing Roofing", url: "bingroofing.example" }, position: { lat: 41.65, lon: -83.54 } }] }), { status: 200 });
    }
    if (url.includes("yelp")) return new Response(JSON.stringify({ businesses: [{ name: "Enriched Roofing", review_count: 90, rating: 4.7 }] }), { status: 200 });
    if (url.includes("directory.example")) return new Response(JSON.stringify({ results: [{ name: "Directory Roofing", website: "directoryroofing.example", email: "hello@directoryroofing.example" }] }), { status: 200 });
    return new Response("unavailable", { status: 503 });
  };
  resetDiscoveryThrottleForTests();
  try {
    const result = await discoverContractorsWithDiagnostics({
      city: "Toledo",
      state: "OH",
      trade: "Roofing",
      radiusKm: 50,
      limit: 50,
      logger(event, metadata) {
        if (event === "provider_diagnostics") providerLogs.push(metadata);
      },
    });

    assert.deepEqual(result.diagnostics.sourceCounts, { osm: 2, google: 1, bing: 1, yelp: 1, yellowPages: 1 });
    assert.equal(result.diagnostics.providerDiagnostics.osm.status, "succeeded");
    assert.equal(result.diagnostics.providerDiagnostics.osm.canRunWithoutApiKey, true);
    assert.equal(result.diagnostics.providerDiagnostics.azureMaps.status, "succeeded");
    assert.equal(result.diagnostics.providerDiagnostics.azureMaps.query, "Roofing near Toledo, OH");
    assert.equal(result.diagnostics.providerDiagnostics.azureMaps.envVarPresent, true);
    assert.equal(result.diagnostics.providerDiagnostics.googlePlaces.status, "succeeded");
    assert.equal(result.diagnostics.providerDiagnostics.yelp.status, "succeeded");
    assert.equal(result.diagnostics.finalMergedCount, 3);
    assert.equal(result.leads.length, 3);
    assert.deepEqual(result.leads[0].sources, ["osm", "google", "yelp"]);
    const azureLog = providerLogs.find((entry) => entry.provider === "azureMaps");
    assert.equal(azureLog?.configured, true);
    assert.equal(azureLog?.queryExecuted, true);
    assert.equal(azureLog?.status, "succeeded");
    assert.equal(azureLog?.rawRecordsReturned, 1);
    assert.equal(azureLog?.query, "Roofing near Toledo, OH");
    assert.equal(azureLog?.envVarName, "AZURE_MAPS_API_KEY or BING_MAPS_API_KEY");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetDiscoveryThrottleForTests();
  }
});

test("provider throttling retries HTTP 429 and records retry diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    DISCOVERY_PROVIDER_DELAY_MS: process.env.DISCOVERY_PROVIDER_DELAY_MS,
  };
  process.env.GOOGLE_PLACES_API_KEY = "google-test-key";
  process.env.DISCOVERY_PROVIDER_DELAY_MS = "0";
  let googleCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim")) return new Response(JSON.stringify([{ lat: "41.6528", lon: "-83.5379" }]), { status: 200 });
    if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    if (url.includes("googleapis")) {
      googleCalls += 1;
      return googleCalls === 1
        ? new Response("slow down", { status: 429, headers: { "retry-after": "0" } })
        : new Response(JSON.stringify({ places: [{ displayName: { text: "Retry Roofing" }, websiteUri: "retryroofing.example" }] }), { status: 200 });
    }
    return new Response("unavailable", { status: 503 });
  };
  resetDiscoveryThrottleForTests();
  try {
    const result = await discoverContractorsWithDiagnostics({ city: "Toledo", state: "OH", trade: "Roofing", radiusKm: 25, limit: 10 });

    assert.equal(googleCalls, 2);
    assert.equal(result.diagnostics.providerDiagnostics.googlePlaces.status, "succeeded");
    assert.equal(result.diagnostics.providerDiagnostics.googlePlaces.retryCount, 1);
    assert.equal(result.leads[0]?.businessName, "Retry Roofing");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetDiscoveryThrottleForTests();
  }
});

test("provider calls run sequentially for a single trade search", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    AZURE_MAPS_API_KEY: process.env.AZURE_MAPS_API_KEY,
    YELP_API_KEY: process.env.YELP_API_KEY,
    DISCOVERY_PROVIDER_DELAY_MS: process.env.DISCOVERY_PROVIDER_DELAY_MS,
  };
  process.env.GOOGLE_PLACES_API_KEY = "google-test-key";
  process.env.AZURE_MAPS_API_KEY = "azure-test-key";
  process.env.YELP_API_KEY = "yelp-test-key";
  process.env.DISCOVERY_PROVIDER_DELAY_MS = "0";
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim")) {
      calls.push("geocode");
      return new Response(JSON.stringify([{ lat: "41.6528", lon: "-83.5379" }]), { status: 200 });
    }
    if (url.includes("overpass")) {
      calls.push("osm");
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    }
    if (url.includes("googleapis")) {
      calls.push("google");
      return new Response(JSON.stringify({ places: [] }), { status: 200 });
    }
    if (url.includes("atlas.microsoft")) {
      calls.push("azure");
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    if (url.includes("yelp")) {
      calls.push("yelp");
      return new Response(JSON.stringify({ businesses: [] }), { status: 200 });
    }
    return new Response("unavailable", { status: 503 });
  };
  resetDiscoveryThrottleForTests();
  try {
    await discoverContractorsWithDiagnostics({ city: "Toledo", state: "OH", trade: "Roofing", radiusKm: 25, limit: 10 });

    assert.deepEqual(calls, ["geocode", "osm", "osm", "google", "azure", "yelp"]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetDiscoveryThrottleForTests();
  }
});

test("provider diagnostics distinguish zero results, failures, timeouts, and missing keys", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    GOOGLE_PLACES_API_KEY: process.env.GOOGLE_PLACES_API_KEY,
    AZURE_MAPS_API_KEY: process.env.AZURE_MAPS_API_KEY,
    YELP_API_KEY: process.env.YELP_API_KEY,
  };
  process.env.GOOGLE_PLACES_API_KEY = "google-test-key";
  process.env.AZURE_MAPS_API_KEY = "azure-test-key";
  process.env.YELP_API_KEY = "yelp-test-key";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim")) return new Response(JSON.stringify([{ lat: "41.6528", lon: "-83.5379" }]), { status: 200 });
    if (url.includes("overpass")) return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    if (url.includes("googleapis")) return new Response(JSON.stringify({ places: [{}] }), { status: 200 });
    if (url.includes("atlas.microsoft")) return new Response("unavailable", { status: 503 });
    if (url.includes("yelp")) throw new DOMException("Timed out", "TimeoutError");
    return new Response("unavailable", { status: 503 });
  };
  resetDiscoveryThrottleForTests();
  try {
    const result = await discoverContractorsWithDiagnostics({ city: "Toledo", state: "OH", trade: "Roofing", radiusKm: 50, limit: 50 });

    assert.equal(result.diagnostics.providerDiagnostics.osm.status, "zero_results");
    assert.equal(result.diagnostics.providerDiagnostics.osm.canRunWithoutApiKey, true);
    assert.equal(result.diagnostics.providerDiagnostics.azureMaps.status, "failed");
    assert.equal(result.diagnostics.providerDiagnostics.azureMaps.httpStatus, 503);
    assert.equal(result.diagnostics.providerDiagnostics.azureMaps.failureType, "http_error");
    assert.match(result.diagnostics.providerDiagnostics.azureMaps.safeErrorMessage ?? "", /HTTP 503/);
    assert.equal(result.diagnostics.providerDiagnostics.googlePlaces.status, "succeeded");
    assert.equal(result.diagnostics.providerDiagnostics.yelp.status, "timed_out");
    assert.equal(result.diagnostics.providerDiagnostics.yelp.failureType, "timeout");
    assert.match(result.diagnostics.providerDiagnostics.yelp.safeErrorMessage ?? "", /timed out/i);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetDiscoveryThrottleForTests();
  }
});

test("new core service trades produce discovery category signals", () => {
  assert.match(buildTradeDiscoveryQueries("Painting", 10_000, 41.65, -83.54).primary, /craft"="painter/);
  assert.match(buildTradeDiscoveryQueries("Painting", 10_000, 41.65, -83.54).enrichment ?? "", /paint\|painting/);
  assert.match(buildTradeDiscoveryQueries("Tree Service", 10_000, 41.65, -83.54).primary, /tree service\|tree care\|arborist/);
  assert.match(buildTradeDiscoveryQueries("Flooring", 10_000, 41.65, -83.54).primary, /flooring\|floor installation/);
});

test("discovery source failures retain safe geocoding and provider classifications", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("location unavailable", { status: 503 });
    resetDiscoveryThrottleForTests();
    await assert.rejects(
      discoverContractorsWithDiagnostics({ city: "Toledo", state: "OH", trade: "Roofing", radiusKm: 10 }),
      (error) => error instanceof TopProspectStageError && error.classification === "geocoding_error" && /HTTP 503/.test(error.safeReason),
    );

    let request = 0;
    globalThis.fetch = async () => {
      request += 1;
      return request === 1
        ? new Response(JSON.stringify([{ lat: "41.6528", lon: "-83.5379" }]), { status: 200 })
        : new Response("provider unavailable", { status: 504 });
    };
    resetDiscoveryThrottleForTests();
    const result = await discoverContractorsWithDiagnostics({ city: "Toledo", state: "OH", trade: "Roofing", radiusKm: 10 });
    assert.equal(result.diagnostics.providerDiagnostics.osm.status, "failed");
    assert.equal(result.diagnostics.providerDiagnostics.osm.httpStatus, 504);
    assert.equal(result.diagnostics.providerDiagnostics.osm.failureType, "http_error");
    assert.match(result.diagnostics.providerDiagnostics.osm.safeErrorMessage ?? "", /HTTP 504/);
    assert.equal(result.leads.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    resetDiscoveryThrottleForTests();
  }
});

test("saved discovery payload parsing remains compatible with old lead arrays and new diagnostics envelopes", () => {
  const lead: DiscoveredLead = {
    businessName: "Compatibility Roofing",
    website: "https://compatibility.example/",
    phone: "",
    email: "",
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    serviceArea: "Toledo and nearby communities",
  };
  const envelope: DiscoveryResult = {
    leads: [lead],
    diagnostics: {
      rawProviderCount: 3,
      afterDistanceFilteringCount: 3,
      afterDuplicateFilteringCount: 2,
      afterQualificationFilteringCount: 1,
      returnedCount: 1,
      radiusKm: 10,
      categorySignals: ["craft=roofer", "name~roof|roofing"],
      sourceCounts: { osm: 3, google: 0, bing: 0, yelp: 0, yellowPages: 0 },
      providerDiagnostics: {
        osm: { configured: true, queryExecuted: true, status: "succeeded", returnedCount: 3, withinRadiusCount: 3, afterDeduplicationCount: 2, usableWebsiteCount: 1 },
        azureMaps: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        googlePlaces: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
        yelp: { configured: false, queryExecuted: false, status: "not_configured", returnedCount: 0, withinRadiusCount: 0, afterDeduplicationCount: 0, usableWebsiteCount: 0 },
      },
      finalMergedCount: 2,
    },
  };

  assert.deepEqual(discoveryLeadsFromJson([lead]), [lead]);
  assert.deepEqual(discoveryLeadsFromJson(envelope), [lead]);
  assert.equal(discoveryDiagnosticsFromJson([lead]), null);
  const parsedDiagnostics = discoveryDiagnosticsFromJson(envelope);
  assert.equal(parsedDiagnostics?.providerDiagnostics.osm.status, "succeeded");
  assert.equal(parsedDiagnostics?.providerDiagnostics.osm.canRunWithoutApiKey, true);
  assert.equal(parsedDiagnostics?.providerDiagnostics.azureMaps.envVarName, "AZURE_MAPS_API_KEY or BING_MAPS_API_KEY");

  const legacyEnvelope = {
    ...envelope,
    diagnostics: Object.fromEntries(Object.entries(envelope.diagnostics).filter(([key]) => key !== "providerDiagnostics")),
  };
  assert.equal(discoveryDiagnosticsFromJson(legacyEnvelope)?.providerDiagnostics.azureMaps.status, "not_recorded");
});
