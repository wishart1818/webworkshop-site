import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import {
  discoveryIdentityEvidenceSignal,
} from "../lib/prospect-identity-evidence";
import { discoverIndependentNoSiteIdentityEvidence } from "../lib/no-site-owned-website-recovery";

const now = new Date("2026-08-11T22:55:00.000Z");
const phone = "260-446-2693";
const normalizedPhone = "2604462693";
const address = "7418 Hessen Cassel Rd, Fort Wayne, IN 46816";

function evidenceSignal(source: "google" | "bing") {
  return discoveryIdentityEvidenceSignal({
    source,
    businessName: "MJR Concrete",
    website: "",
    profileUrl: source === "google" ? "https://www.google.com/maps/place/MJR+Concrete+LLC" : "",
    phone,
    address,
    city: "Fort Wayne",
    state: "IN",
    latitude: 41.0123,
    longitude: -85.0912,
    observedAt: now.toISOString(),
  });
}

function prospect(source: "google" | "bing" = "google", overrides: Partial<Prospect> = {}) {
  return {
    ...createProspect({
      businessName: "MJR CONCRETE LLC",
      website: "",
      phone,
      email: "",
      city: "Fort Wayne",
      state: "IN",
      trade: "Concrete",
      serviceArea: "Fort Wayne, IN",
      sizeIndicator: "Growing",
      status: "New",
      prospectType: "no_website_social_only",
    }),
    address,
    prospectType: "no_website_social_only" as const,
    activitySignals: [evidenceSignal(source)],
    createdAt: "2026-08-11T22:50:00.000Z",
    ...overrides,
  } satisfies Prospect;
}

const azureExactResult = {
  poi: { name: "MJR Concrete", phone: "+1 260-446-2693" },
  position: { lat: 41.0123, lon: -85.0912 },
  address: {
    freeformAddress: address,
    localName: "Fort Wayne",
    countrySubdivisionCode: "IN",
    postalCode: "46816",
  },
};

test("Azure corroboration retries a bounded phone identity query when the address-heavy query misses", async () => {
  const queries: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const query = url.searchParams.get("query") ?? "";
    queries.push(query);
    const results = query.includes(normalizedPhone) ? [azureExactResult] : [];
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await discoverIndependentNoSiteIdentityEvidence(prospect(), {
    azureMapsApiKey: "azure-test-key",
    fetch: fetchImpl,
    now: () => now,
  });

  assert.equal(queries.length, 3);
  assert.ok(queries.some((query) => query.includes(address)));
  assert.ok(queries.some((query) => query === "MJR CONCRETE LLC Fort Wayne IN"));
  assert.ok(queries.some((query) => query.includes(normalizedPhone)));
  assert.equal(result.length, 1);
  assert.equal(result[0]?.source, "bing");
  assert.equal(result[0]?.phone, "+1 260-446-2693");
});

test("multiple distinct exact Azure identities across fallback queries still fail closed", async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const query = new URL(String(input)).searchParams.get("query") ?? "";
    if (query.includes(normalizedPhone)) {
      return new Response(JSON.stringify({ results: [{
        ...azureExactResult,
        address: {
          ...azureExactResult.address,
          freeformAddress: "999 Other Rd, Fort Wayne, IN 46816",
        },
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (query === "MJR CONCRETE LLC Fort Wayne IN") {
      return new Response(JSON.stringify({ results: [azureExactResult] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await discoverIndependentNoSiteIdentityEvidence(prospect(), {
    azureMapsApiKey: "azure-test-key",
    fetch: fetchImpl,
    now: () => now,
  });

  assert.deepEqual(result, []);
});

test("Bing-only corroboration uses the same bounded query variants for Google and preserves owned-site evidence", async () => {
  const queries: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://places.googleapis.com/v1/places:searchText");
    const body = JSON.parse(String(init?.body ?? "{}")) as { textQuery?: string };
    const query = body.textQuery ?? "";
    queries.push(query);
    const places = query.includes(normalizedPhone) ? [{
      displayName: { text: "MJR Concrete LLC" },
      formattedAddress: `${address}, USA`,
      websiteUri: "https://mjrconcretefortwayne.example/",
      googleMapsUri: "https://www.google.com/maps/place/MJR+Concrete+LLC",
      nationalPhoneNumber: "(260) 446-2693",
      location: { latitude: 41.0123, longitude: -85.0912 },
      addressComponents: [
        { longText: "Fort Wayne", types: ["locality"] },
        { shortText: "IN", types: ["administrative_area_level_1"] },
      ],
    }] : [];
    return new Response(JSON.stringify({ places }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await discoverIndependentNoSiteIdentityEvidence(prospect("bing"), {
    googlePlacesApiKey: "google-test-key",
    fetch: fetchImpl,
    now: () => now,
  });

  assert.equal(queries.length, 3);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.source, "google");
  assert.equal(result[0]?.website, "https://mjrconcretefortwayne.example/");
});
