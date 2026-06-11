import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTradeDiscoveryQueries,
  discoverContractorsWithDiagnostics,
  discoveryDiagnosticsFromJson,
  discoveryLeadsFromJson,
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

  assert.deepEqual(result.diagnostics, {
    rawProviderCount: 6,
    afterDistanceFilteringCount: 5,
    afterDuplicateFilteringCount: 4,
    afterQualificationFilteringCount: 2,
    returnedCount: 2,
    radiusKm: 10,
    categorySignals: ["craft=roofer", "name~roof|roofing"],
  });
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
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    resetDiscoveryThrottleForTests();
  }
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
    await assert.rejects(
      discoverContractorsWithDiagnostics({ city: "Toledo", state: "OH", trade: "Roofing", radiusKm: 10 }),
      (error) => error instanceof TopProspectStageError
        && error.classification === "discovery_provider_error"
        && /HTTP 504/.test(error.safeReason),
    );
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
    },
  };

  assert.deepEqual(discoveryLeadsFromJson([lead]), [lead]);
  assert.deepEqual(discoveryLeadsFromJson(envelope), [lead]);
  assert.equal(discoveryDiagnosticsFromJson([lead]), null);
  assert.deepEqual(discoveryDiagnosticsFromJson(envelope), envelope.diagnostics);
});
