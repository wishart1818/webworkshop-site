import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createProspect, type Prospect, type WebsiteVerificationReport } from "../lib/prospect-engine";
import {
  authoritativeNoOwnedWebsiteEvidence,
  discoveryIdentityEvidenceSignal,
} from "../lib/prospect-identity-evidence";
import {
  legacyDeterministicWebsiteRepairInput,
  legacyUnverifiedDeterministicWebsiteNeedsRepair,
  noSiteEnrichmentDiagnosticSignal,
  verifyProspectWebsiteWithSecondPass,
} from "../lib/prospect-verification-resolution";
import { assessNoWebsiteOpportunity, topProspectRejectionReason } from "../lib/top-prospects";

const now = new Date("2026-08-17T12:00:00.000Z");
const candidateUrl = "https://hkpressurewashing.com/";
const actualProviderUrl = "https://hkpressurewashingtx.example/";
const phone = "512-555-0142";
const address = "120 Main Street, Georgetown, TX 78626";

function unresolvedReport(): WebsiteVerificationReport {
  return {
    version: "website-verification-v2",
    status: "inconclusive",
    confidence: "low",
    canonicalUrl: candidateUrl,
    attempts: [],
    usableSignals: [],
    explanation: "Website ownership remains unresolved.",
    checkedAt: "2026-07-01T12:00:00.000Z",
    ownershipDecision: "uncertain",
    identityEvidence: [],
    fit: {
      disposition: "inconclusive_requires_review",
      reason: "Current ownership and fit evidence are incomplete.",
      supportingEvidence: [],
      confidence: "low",
      analysisOrigin: "automated_html",
      evaluatedAt: "2026-07-01T12:00:00.000Z",
    },
  };
}

function legacyDiagnostic(websiteCandidate = candidateUrl) {
  return noSiteEnrichmentDiagnosticSignal({
    version: "no-site-enrichment-v2",
    outcome: "unresolved",
    reason: "A bounded website candidate was retained for manual review.",
    checkedAt: "2026-07-01T12:00:00.000Z",
    providerSources: ["google", "bing"],
    websiteCandidate,
    websiteVerificationStatus: "inconclusive",
    websiteFitDisposition: "inconclusive_requires_review",
  });
}

function legacyProspect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    ...createProspect({
      businessName: "HK Pressure Washing",
      website: candidateUrl,
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
    createdAt: "2026-05-01T12:00:00.000Z",
    websiteStatus: "inconclusive",
    fitDisposition: "inconclusive_requires_review",
    websiteVerification: unresolvedReport(),
    activitySignals: [legacyDiagnostic()],
    ...overrides,
  };
}

type Scenario = {
  googleWebsite?: string;
  googlePhone?: string;
  googleAddress?: string;
  azurePhone?: string;
  azureAddress?: string;
  azureAvailable?: boolean;
  googleAvailable?: boolean;
  candidateHtml?: string;
  candidateStatus?: number;
  providerHtml?: string;
};

function ownedHtml(input: {
  city?: string;
  publishedPhone?: string;
  domain?: string;
} = {}) {
  const city = input.city ?? "Georgetown";
  const publishedPhone = input.publishedPhone ?? phone;
  const domain = input.domain ?? "hkpressurewashing.com";
  return `<!doctype html><html><head><title>HK Pressure Washing | ${city}</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/contact">Contact</a><a href="/about">About</a></nav><h1>HK Pressure Washing</h1>
    <p>Residential exterior care and pressure washing for ${city} properties. Request details from the local team.</p>
    <a href="tel:${publishedPhone}">${publishedPhone}</a><a href="mailto:info@${domain}">info@${domain}</a>
    <form><button>Request an estimate</button></form><img src="/project.jpg" alt="Completed project" /></body></html>`;
}

function providerFetch(scenario: Scenario = {}) {
  const calls = { google: 0, azure: 0, website: [] as string[] };
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "atlas.microsoft.com") {
      calls.azure += 1;
      if (scenario.azureAvailable === false) return new Response("Unavailable", { status: 503 });
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
      if (scenario.googleAvailable === false) return new Response("Unavailable", { status: 503 });
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
    calls.website.push(url.href);
    const providerSite = url.hostname === "hkpressurewashingtx.example";
    return new Response(
      providerSite ? scenario.providerHtml ?? ownedHtml({ domain: "hkpressurewashingtx.example" }) : scenario.candidateHtml ?? "Not found",
      {
        status: providerSite ? 200 : scenario.candidateStatus ?? 404,
        headers: { "Content-Type": "text/html" },
      },
    );
  };
  return { calls, fetchImpl };
}

async function repair(prospect: Prospect, scenario: Scenario = {}, includeAzure = true) {
  const input = legacyDeterministicWebsiteRepairInput(prospect);
  assert.ok(input);
  const mocked = providerFetch(scenario);
  const resolution = await verifyProspectWebsiteWithSecondPass(input.prospect, {
    fetch: mocked.fetchImpl,
    googlePlacesApiKey: "google-test-key",
    azureMapsApiKey: includeAzure ? "azure-test-key" : "",
    forceNoSiteEvidenceRefresh: true,
    allowHistoricalNoSiteLookup: true,
    legacyDeterministicCandidateUrl: input.candidateUrl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    maxContactPages: 1,
    now: () => now,
  });
  return { ...mocked, resolution };
}

test("legacy HK deterministic contamination enters current two-provider no-site refresh", async () => {
  const prospect = legacyProspect();
  assert.equal(legacyUnverifiedDeterministicWebsiteNeedsRepair(prospect), true);
  const input = legacyDeterministicWebsiteRepairInput(prospect);
  assert.equal(input?.prospect.website, "");
  assert.equal(input?.candidateUrl, candidateUrl);
  assert.equal(prospect.website, candidateUrl);

  const { calls, resolution } = await repair(prospect);

  assert.ok(calls.google > 0);
  assert.ok(calls.azure > 0);
  assert.equal(resolution.result.report.status, "no_owned_website");
  assert.equal(resolution.result.prospect.website, "");
  assert.equal(authoritativeNoOwnedWebsiteEvidence(resolution.result.prospect, now).verified, true);
  assert.equal(resolution.noSiteEnrichment?.legacyDeterministicCandidateRepaired, true);
  assert.equal(resolution.noSiteEnrichment?.legacyDeterministicCandidateUrl, candidateUrl);
  assert.equal(resolution.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
  assert.deepEqual(new Set(resolution.noSiteEnrichment?.providerSources), new Set(["google", "bing"]));
});

test("legacy deterministic candidate is retained when current strict ownership matches the prospect phone", async () => {
  const { resolution } = await repair(legacyProspect(), {
    candidateHtml: ownedHtml(),
    candidateStatus: 200,
  });

  assert.equal(resolution.result.report.status, "usable");
  assert.equal(resolution.result.report.ownershipDecision, "owned");
  assert.equal(resolution.result.prospect.website, candidateUrl);
  assert.equal(resolution.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
  assert.equal(resolution.noSiteEnrichment?.websiteOwnershipVerified, true);
});

test("current provider-supplied website replaces the old deterministic candidate", async () => {
  const { resolution } = await repair(legacyProspect(), { googleWebsite: actualProviderUrl });

  assert.equal(resolution.result.report.status, "usable");
  assert.equal(resolution.result.report.ownershipDecision, "owned");
  assert.equal(resolution.result.prospect.website, actualProviderUrl);
  assert.equal(resolution.noSiteEnrichment?.websiteCandidateProvenance, "provider_supplied");
  assert.equal(resolution.noSiteEnrichment?.legacyDeterministicCandidateUrl, candidateUrl);
});

test("same-name wrong-market legacy candidate cannot override fresh no-site evidence", async () => {
  const { resolution } = await repair(legacyProspect(), {
    candidateHtml: ownedHtml({ city: "Houston", publishedPhone: "713-555-0199" }),
    candidateStatus: 200,
  });

  assert.equal(resolution.result.report.status, "no_owned_website");
  assert.equal(resolution.result.prospect.website, "");
  assert.equal(resolution.noSiteEnrichment?.websiteCandidateProvenance, "deterministic_guess");
});

test("dead or transient legacy candidate does not invalidate fresh no-site evidence", async () => {
  for (const candidateStatus of [404, 503]) {
    const { resolution } = await repair(legacyProspect(), { candidateStatus });
    assert.equal(resolution.result.report.status, "no_owned_website");
    assert.equal(resolution.result.prospect.website, "");
  }
});

test("conflicting current providers keep a legacy record unresolved and package-free", async () => {
  const { resolution } = await repair(legacyProspect(), {
    azurePhone: "713-555-0199",
    azureAddress: "900 Commerce Street, Houston, TX",
  });

  assert.equal(resolution.outcome, "still_manual");
  assert.equal(resolution.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(resolution.result.prospect.outreach, undefined);
});

test("one current provider cannot combine with stale history during legacy repair", async () => {
  const { calls, resolution } = await repair(legacyProspect(), {}, false);

  assert.ok(calls.google > 0);
  assert.equal(calls.azure, 0);
  assert.equal(resolution.outcome, "still_manual");
  assert.equal(resolution.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(resolution.result.prospect.outreach, undefined);
});

test("unavailable current providers keep the legacy record unresolved", async () => {
  const { resolution } = await repair(legacyProspect(), {
    googleAvailable: false,
    azureAvailable: false,
  });

  assert.equal(resolution.outcome, "still_manual");
  assert.equal(resolution.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(resolution.result.prospect.outreach, undefined);
});

test("owned, provider-associated, ordinary redesign, and nonlegacy records never enter repair", () => {
  const owned = legacyProspect({
    websiteStatus: "usable",
    websiteVerification: { ...unresolvedReport(), status: "usable", ownershipDecision: "owned" },
  });
  const providerAssociated = legacyProspect({
    activitySignals: [
      legacyDiagnostic(),
      discoveryIdentityEvidenceSignal({
        source: "google",
        businessName: "HK Pressure Washing",
        website: candidateUrl,
        profileUrl: "https://maps.google.com/?cid=3545450935484072529",
        phone,
        address,
        city: "Georgetown",
        state: "TX",
        latitude: 30.6333,
        longitude: -97.6779,
        observedAt: now.toISOString(),
      }),
    ],
  });
  const providerProvenance = legacyProspect({
    activitySignals: [noSiteEnrichmentDiagnosticSignal({
      version: "no-site-enrichment-v2",
      outcome: "unresolved",
      reason: "Provider supplied candidate.",
      checkedAt: now.toISOString(),
      providerSources: ["google"],
      websiteCandidate: candidateUrl,
      websiteVerificationStatus: "inconclusive",
      websiteFitDisposition: "inconclusive_requires_review",
      websiteCandidateProvenance: "provider_supplied",
    })],
  });
  const ordinaryRedesign = legacyProspect({
    prospectType: "redesign",
    activitySignals: [],
  });

  for (const prospect of [owned, providerAssociated, providerProvenance, ordinaryRedesign]) {
    assert.equal(legacyUnverifiedDeterministicWebsiteNeedsRepair(prospect), false);
    assert.equal(legacyDeterministicWebsiteRepairInput(prospect), null);
  }
});

test("Tundra-style deterministic host requires a matching legacy no-site diagnostic", () => {
  const tundra = legacyProspect({
    businessName: "Tundra Pressure Washing",
    website: "https://tundrapressurewashing.com/",
    websiteVerification: { ...unresolvedReport(), canonicalUrl: "https://tundrapressurewashing.com/" },
    activitySignals: [legacyDiagnostic("https://tundrapressurewashing.com/")],
  });
  assert.equal(legacyUnverifiedDeterministicWebsiteNeedsRepair(tundra), true);
  assert.equal(
    legacyUnverifiedDeterministicWebsiteNeedsRepair({ ...tundra, activitySignals: [] }),
    false,
  );
});

test("worker protections remain ahead of legacy repair and current-job idempotency remains first", () => {
  const source = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const processLead = source.indexOf("async function processLead(");
  const currentJobResult = source.indexOf("if (existingResult) return", processLead);
  const contacted = source.indexOf("if (contactedStatuses.has(existing.status))", currentJobResult);
  const suppressed = source.indexOf("if (prospectIsSuppressed(existing))", contacted);
  const reviewed = source.indexOf("if (excludePreviouslyReviewed && previouslyReviewed)", suppressed);
  const repair = source.indexOf("legacyDeterministicWebsiteRepairInput(existing)", reviewed);

  assert.ok(processLead >= 0);
  assert.ok(currentJobResult > processLead);
  assert.ok(contacted > currentJobResult);
  assert.ok(suppressed > contacted);
  assert.ok(reviewed > suppressed);
  assert.ok(repair > reviewed);
});

test("phone-only legacy repair reaches the real written-contact gate without outreach", async () => {
  const { resolution } = await repair(legacyProspect());
  const repaired = resolution.result.prospect;

  assert.equal(repaired.websiteStatus, "no_owned_website");
  assert.equal(
    topProspectRejectionReason(repaired, assessNoWebsiteOpportunity(repaired), "growth", "written_only"),
    "Phone-only / written outreach blocked",
  );
  assert.equal(repaired.outreach, undefined);
});
