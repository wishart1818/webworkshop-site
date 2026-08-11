import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import {
  authoritativeNoOwnedWebsiteEvidence,
  discoveryIdentityEvidenceSignal,
} from "../lib/prospect-identity-evidence";
import { discoverIndependentNoSiteIdentityEvidence } from "../lib/no-site-owned-website-recovery";
import { mergeResolvedWebsiteEvidence } from "../lib/prospect-verification-resolution";

const now = new Date("2026-08-11T18:00:00.000Z");
const phone = "260-446-2693";
const address = "7418 Hessen Cassel Rd, Fort Wayne, IN 46816";

function googleSignal(overrides: Partial<{
  website: string;
  phone: string;
  address: string;
}> = {}) {
  return discoveryIdentityEvidenceSignal({
    source: "google",
    businessName: "MJR Concrete",
    website: overrides.website ?? "",
    profileUrl: "https://www.google.com/maps/place/MJR+Concrete+LLC",
    phone: overrides.phone ?? phone,
    address: overrides.address ?? address,
    city: "Fort Wayne",
    state: "IN",
    latitude: 41.0123,
    longitude: -85.0912,
  });
}

function bingSignal() {
  return discoveryIdentityEvidenceSignal({
    source: "bing",
    businessName: "MJR Concrete",
    website: "",
    profileUrl: "",
    phone,
    address,
    city: "Fort Wayne",
    state: "IN",
    latitude: 41.0123,
    longitude: -85.0912,
  });
}

function prospect(overrides: Partial<Prospect> = {}) {
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
    activitySignals: [googleSignal()],
    createdAt: "2026-08-11T17:55:00.000Z",
    ...overrides,
  } satisfies Prospect;
}

function azureResponse(results: unknown[]) {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "atlas.microsoft.com");
    assert.equal(url.searchParams.get("subscription-key"), "azure-test-key");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.match(url.searchParams.get("query") ?? "", /MJR CONCRETE LLC/i);
    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return fetchImpl;
}

test("Google-only no-site candidate can gain exact independent Azure identity evidence without weakening the two-provider rule", async () => {
  const value = prospect();
  const evidence = await discoverIndependentNoSiteIdentityEvidence(value, {
    azureMapsApiKey: "azure-test-key",
    fetch: azureResponse([{
      poi: { name: "MJR Concrete", phone: "+1 260-446-2693" },
      position: { lat: 41.0123, lon: -85.0912 },
      address: {
        freeformAddress: "7418 Hessen Cassel Rd, Fort Wayne, IN 46816",
        localName: "Fort Wayne",
        countrySubdivisionCode: "IN",
        postalCode: "46816",
      },
    }]),
    now: () => now,
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.source, "bing");
  assert.equal(evidence[0]?.website, "");

  const augmented = {
    ...value,
    activitySignals: [...value.activitySignals, discoveryIdentityEvidenceSignal(evidence[0]!)],
  };
  const decision = authoritativeNoOwnedWebsiteEvidence(augmented, now);
  assert.equal(decision.verified, true);
  assert.deepEqual(decision.sources, ["bing", "google"]);
});

test("exact-name Azure result with a different phone and address cannot corroborate a Google-only no-site candidate", async () => {
  const value = prospect();
  const evidence = await discoverIndependentNoSiteIdentityEvidence(value, {
    azureMapsApiKey: "azure-test-key",
    fetch: azureResponse([{
      poi: { name: "MJR Concrete", phone: "+1 260-555-9999" },
      position: { lat: 41.5, lon: -85.5 },
      address: {
        freeformAddress: "999 Other Rd, Fort Wayne, IN 46816",
        localName: "Fort Wayne",
        countrySubdivisionCode: "IN",
      },
    }]),
    now: () => now,
  });

  assert.deepEqual(evidence, []);
  assert.equal(authoritativeNoOwnedWebsiteEvidence(value, now).verified, false);
});

test("a corroborating provider-owned website candidate blocks a no-site conclusion for normal website verification", async () => {
  const value = prospect();
  const evidence = await discoverIndependentNoSiteIdentityEvidence(value, {
    azureMapsApiKey: "azure-test-key",
    fetch: azureResponse([{
      poi: {
        name: "MJR Concrete",
        phone: "+1 260-446-2693",
        url: "https://mjrconcretellc.example/",
      },
      position: { lat: 41.0123, lon: -85.0912 },
      address: {
        freeformAddress: "7418 Hessen Cassel Rd, Fort Wayne, IN 46816",
        localName: "Fort Wayne",
        countrySubdivisionCode: "IN",
      },
    }]),
    now: () => now,
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.website, "https://mjrconcretellc.example/");
  const decision = authoritativeNoOwnedWebsiteEvidence({
    ...value,
    activitySignals: [...value.activitySignals, discoveryIdentityEvidenceSignal(evidence[0]!)],
  }, now);
  assert.equal(decision.verified, false);
  assert.equal(decision.reasonCode, "owned_domain_candidate");
});

test("Bing-only no-site candidate can gain exact Google evidence including the provider public profile", async () => {
  const value = prospect({ activitySignals: [bingSignal()] });
  const fetchImpl: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://places.googleapis.com/v1/places:searchText");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Goog-Api-Key"), "google-test-key");
    assert.match(headers.get("X-Goog-FieldMask") ?? "", /places\.googleMapsUri/);
    return new Response(JSON.stringify({ places: [{
      displayName: { text: "MJR Concrete LLC" },
      formattedAddress: "7418 Hessen Cassel Rd, Fort Wayne, IN 46816, USA",
      nationalPhoneNumber: "(260) 446-2693",
      googleMapsUri: "https://www.google.com/maps/place/MJR+Concrete+LLC",
      location: { latitude: 41.0123, longitude: -85.0912 },
      addressComponents: [
        { longText: "Fort Wayne", types: ["locality"] },
        { shortText: "IN", types: ["administrative_area_level_1"] },
      ],
    }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const evidence = await discoverIndependentNoSiteIdentityEvidence(value, {
    googlePlacesApiKey: "google-test-key",
    fetch: fetchImpl,
    now: () => now,
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0]?.source, "google");
  assert.match(evidence[0]?.profileUrl ?? "", /google\.com\/maps\/place/i);
  const decision = authoritativeNoOwnedWebsiteEvidence({
    ...value,
    activitySignals: [...value.activitySignals, discoveryIdentityEvidenceSignal(evidence[0]!)],
  }, now);
  assert.equal(decision.verified, true);
});

test("ambiguous or already multi-provider records do not trigger another corroboration request", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls += 1;
    throw new Error("should not be called");
  };

  const ambiguous = await discoverIndependentNoSiteIdentityEvidence(prospect({
    activitySignals: [googleSignal(), "discovery_identity_conflict:same_name"],
  }), {
    azureMapsApiKey: "azure-test-key",
    fetch: fetchImpl,
    now: () => now,
  });
  const alreadyCorroborated = await discoverIndependentNoSiteIdentityEvidence(prospect({
    activitySignals: [googleSignal(), bingSignal()],
  }), {
    azureMapsApiKey: "azure-test-key",
    fetch: fetchImpl,
    now: () => now,
  });

  assert.deepEqual(ambiguous, []);
  assert.deepEqual(alreadyCorroborated, []);
  assert.equal(calls, 0);
});

test("resolved provider evidence is persisted when website-only resolution merges into an existing prospect", () => {
  const existing = prospect({ activitySignals: [googleSignal()] });
  const resolved = prospect({ activitySignals: [googleSignal(), bingSignal()] });
  const merged = mergeResolvedWebsiteEvidence(existing, resolved);

  assert.ok(merged.activitySignals.includes(googleSignal()));
  assert.ok(merged.activitySignals.includes(bingSignal()));
});
