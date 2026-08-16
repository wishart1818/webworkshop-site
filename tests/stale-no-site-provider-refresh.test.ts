import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import {
  authoritativeNoOwnedWebsiteEvidence,
  discoveryIdentityEvidenceFromSignals,
  discoveryIdentityEvidenceSignal,
} from "../lib/prospect-identity-evidence";
import {
  verifyProspectWebsiteWithSecondPass,
} from "../lib/prospect-verification-resolution";

const now = new Date("2026-08-16T14:00:00.000Z");
const oldObservedAt = "2026-07-01T14:00:00.000Z";
const phone = "512-555-0142";
const address = "120 Main Street, Georgetown, TX 78626";

function evidence(source: "google" | "bing", observedAt = oldObservedAt) {
  return discoveryIdentityEvidenceSignal({
    source,
    businessName: "HK Pressure Washing",
    website: "",
    profileUrl: source === "google" ? "https://maps.google.com/?cid=3545450935484072529" : "",
    phone,
    address,
    city: "Georgetown",
    state: "TX",
    latitude: 30.6333,
    longitude: -97.6779,
    observedAt,
  });
}

function staleProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    ...createProspect({
      businessName: "HK Pressure Washing",
      website: "",
      phone,
      email: "",
      address,
      city: "Georgetown",
      state: "TX",
      trade: "Pressure Washing",
      serviceArea: "Georgetown, TX",
      sizeIndicator: "Small",
      status: "New",
      prospectType: "no_website_social_only",
    }),
    createdAt: "2026-05-01T14:00:00.000Z",
    prospectType: "no_website_social_only",
    activitySignals: [evidence("google"), evidence("bing")],
    ...overrides,
  };
}

type ProviderScenario = {
  googleWebsite?: string;
  googlePhone?: string;
  googleAddress?: string;
  azureEnabled?: boolean;
  azurePhone?: string;
  azureAddress?: string;
  websiteHtml?: string;
  websiteStatus?: number;
};

function providerFetch(scenario: ProviderScenario = {}) {
  const calls = { google: 0, azure: 0, website: 0 };
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "atlas.microsoft.com") {
      calls.azure += 1;
      if (scenario.azureEnabled === false) return new Response("Unavailable", { status: 503 });
      return new Response(JSON.stringify({ results: [{
        poi: { name: "HK Pressure Washing", phone: scenario.azurePhone ?? phone },
        position: { lat: 30.6333, lon: -97.6779 },
        address: {
          freeformAddress: scenario.azureAddress ?? address,
          localName: "Georgetown",
          countrySubdivisionCode: "TX",
        },
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.hostname === "places.googleapis.com") {
      calls.google += 1;
      return new Response(JSON.stringify({ places: [{
        displayName: { text: "HK Pressure Washing" },
        formattedAddress: scenario.googleAddress ?? `${address}, USA`,
        nationalPhoneNumber: scenario.googlePhone ?? phone,
        websiteUri: scenario.googleWebsite,
        googleMapsUri: "https://maps.google.com/?cid=3545450935484072529",
        location: { latitude: 30.6333, longitude: -97.6779 },
        addressComponents: [
          { longText: "Georgetown", types: ["locality"] },
          { shortText: "TX", types: ["administrative_area_level_1"] },
        ],
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    calls.website += 1;
    return new Response(scenario.websiteHtml ?? "Not found", {
      status: scenario.websiteStatus ?? 404,
      headers: { "Content-Type": "text/html" },
    });
  };
  return { calls, fetchImpl };
}

function ownedWebsiteHtml(businessName = "HK Pressure Washing", publishedPhone = phone) {
  return `<!doctype html><html><head><title>${businessName} | Georgetown</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav><h1>${businessName}</h1>
    <p>Residential pressure washing, house washing, and concrete cleaning for Georgetown properties.</p>
    <a href="tel:${publishedPhone}">${publishedPhone}</a><form><button>Request an estimate</button></form>
    <img src="/project.jpg" alt="Pressure washing project" /></body></html>`;
}

function sameNameWrongMarketWebsiteHtml() {
  return `<!doctype html><html><head><title>HK Pressure Washing | Houston</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav><h1>HK Pressure Washing</h1>
    <p>Pressure washing services for Houston, TX properties.</p>
    <a href="tel:713-555-0199">713-555-0199</a><a href="mailto:info@hkpressurewashing.com">info@hkpressurewashing.com</a>
    <form><button>Request an estimate</button></form><img src="/project.jpg" alt="Pressure washing project" /></body></html>`;
}

function refreshDependencies(fetchImpl: typeof fetch, includeAzure = true) {
  return {
    fetch: fetchImpl,
    googlePlacesApiKey: "google-test-key",
    azureMapsApiKey: includeAzure ? "azure-test-key" : "",
    forceNoSiteEvidenceRefresh: true,
    allowHistoricalNoSiteLookup: true,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    maxContactPages: 1,
    now: () => now,
  };
}

test("old prospect refresh uses current Google and Bing observations without changing prospect creation time", async () => {
  const original = staleProspect();
  assert.equal(authoritativeNoOwnedWebsiteEvidence(original, now).verified, false);
  const { calls, fetchImpl } = providerFetch();

  const result = await verifyProspectWebsiteWithSecondPass(original, refreshDependencies(fetchImpl));
  const currentEvidence = discoveryIdentityEvidenceFromSignals(result.result.prospect.activitySignals);

  assert.ok(calls.google > 0);
  assert.ok(calls.azure > 0);
  assert.equal(result.result.report.status, "no_owned_website");
  assert.equal(result.result.prospect.createdAt, original.createdAt);
  assert.deepEqual(new Set(currentEvidence.map((item) => item.source)), new Set(["bing", "google"]));
  assert.equal(currentEvidence.every((item) => item.observedAt === now.toISOString()), true);
  assert.equal(result.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
  assert.match(result.noSiteEnrichment?.reason ?? "", /deterministic domain candidate was checked/i);
});

test("a current matched provider website is verified and overrides the no-site path", async () => {
  const website = "https://hkpressurewashing.example/";
  const { fetchImpl } = providerFetch({ googleWebsite: website, websiteHtml: ownedWebsiteHtml(), websiteStatus: 200 });

  const result = await verifyProspectWebsiteWithSecondPass(staleProspect(), refreshDependencies(fetchImpl));

  assert.equal(result.result.report.status, "usable");
  assert.equal(result.result.report.ownershipDecision, "owned");
  assert.equal(result.result.prospect.website, website);
  assert.notEqual(result.result.prospect.fitDisposition, "no_owned_website");
  assert.equal(result.noSiteEnrichment?.websiteCandidateProvenance, "provider_supplied");
});

test("conflicting current provider identity remains unresolved", async () => {
  const { fetchImpl } = providerFetch({
    azurePhone: "214-555-0199",
    azureAddress: "900 Commerce Street, Dallas, TX",
  });

  const result = await verifyProspectWebsiteWithSecondPass(staleProspect(), refreshDependencies(fetchImpl));

  assert.equal(result.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.notEqual(result.result.report.status, "no_owned_website");
  assert.equal(result.result.prospect.website, "");
});

test("one current provider cannot combine with a stale second provider to establish no-site", async () => {
  const { calls, fetchImpl } = providerFetch();

  const result = await verifyProspectWebsiteWithSecondPass(staleProspect(), refreshDependencies(fetchImpl, false));

  assert.ok(calls.google > 0);
  assert.equal(calls.azure, 0);
  assert.equal(result.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.notEqual(result.result.report.status, "no_owned_website");
  assert.equal(result.result.prospect.website, "");
});

test("HK-style unrelated deterministic domain is never attached as an owned website", async () => {
  const unrelated = ownedWebsiteHtml("HK Power Wash of Houston", "713-555-0199");
  const { fetchImpl } = providerFetch({ websiteHtml: unrelated, websiteStatus: 200 });

  const result = await verifyProspectWebsiteWithSecondPass(staleProspect(), refreshDependencies(fetchImpl));

  assert.equal(result.result.report.status, "no_owned_website");
  assert.equal(result.result.prospect.website, "");
  assert.equal(result.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
  assert.doesNotMatch(result.noSiteEnrichment?.reason ?? "", /provider supplied/i);
});

test("same-name wrong-market deterministic domain cannot establish ownership from its domain email", async () => {
  const { fetchImpl } = providerFetch({ websiteHtml: sameNameWrongMarketWebsiteHtml(), websiteStatus: 200 });

  const result = await verifyProspectWebsiteWithSecondPass(staleProspect(), refreshDependencies(fetchImpl));

  assert.equal(result.result.report.status, "no_owned_website");
  assert.equal(result.result.report.ownershipDecision, "not_owned");
  assert.equal(result.result.prospect.website, "");
  assert.equal(authoritativeNoOwnedWebsiteEvidence(result.result.prospect, now).verified, true);
  assert.equal(result.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
  assert.match(result.noSiteEnrichment?.reason ?? "", /did not establish first-party ownership/i);
});

test("matching prospect phone allows a legitimate deterministic candidate to establish ownership", async () => {
  const { fetchImpl } = providerFetch({ websiteHtml: ownedWebsiteHtml(), websiteStatus: 200 });

  const result = await verifyProspectWebsiteWithSecondPass(staleProspect(), refreshDependencies(fetchImpl));

  assert.equal(result.result.report.status, "usable");
  assert.equal(result.result.report.ownershipDecision, "owned");
  assert.equal(result.result.prospect.website, "https://hkpressurewashing.com/");
  assert.notEqual(result.result.prospect.fitDisposition, "no_owned_website");
  assert.equal(result.result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
  assert.match(result.noSiteEnrichment?.reason ?? "", /strict first-party ownership verification/i);
});
