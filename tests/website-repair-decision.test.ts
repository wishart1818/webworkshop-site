import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect, type WebsiteAvailabilityStatus, type WebsiteFitDisposition } from "../lib/prospect-engine";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import { parseWebsiteVerificationReport } from "../lib/prospect-validation";
import { safeHighConfidenceWebsiteExclusion } from "../lib/website-repair-decision";

const checkedAt = "2026-08-09T12:00:00.000Z";

function verifiedProspect(input: {
  businessName?: string;
  website?: string;
  canonicalUrl?: string;
  city?: string;
  phone?: string;
  disposition?: WebsiteFitDisposition;
  status?: WebsiteAvailabilityStatus;
  signals?: NonNullable<Prospect["websiteVerification"]>["identitySignals"];
  contactPageUrl?: string;
}) {
  const website = input.website ?? "https://examplecontractor.com";
  const disposition = input.disposition ?? "adequate_existing_website";
  const status = input.status ?? "usable";
  return createProspect({
    businessName: input.businessName ?? "Example Contractor",
    website,
    phone: input.phone ?? "+14195550123",
    city: input.city ?? "Toledo",
    state: "OH",
    trade: "Pressure Washing",
    status: "Reviewed",
    websiteStatus: status,
    websiteStatusDetail: "Current bounded website evidence was reviewed.",
    fitDisposition: disposition,
    contactPageUrl: input.contactPageUrl ?? "",
    websiteVerification: {
      version: "website-verification-v2",
      status,
      confidence: "high",
      canonicalUrl: input.canonicalUrl ?? `${website}/`,
      attempts: [],
      usableSignals: ["business name", "navigation", "service content"],
      explanation: "Current bounded website evidence was reviewed.",
      checkedAt,
      ownershipDecision: "owned",
      identityEvidence: ["The business identity is grounded in first-party website evidence."],
      identitySignals: input.signals ?? [
        "prominent_business_name",
        "stored_website_host_match",
        "market_location_match",
        "canonical_root_business_identity",
        "first_party_site_structure",
        "public_phone_match",
      ],
      fit: {
        disposition,
        reason: "The owned website is already suitable for the current offer.",
        supportingEvidence: ["The site has meaningful business content and a clear contact path."],
        confidence: "high",
        analysisOrigin: "rendered_review",
        evaluatedAt: checkedAt,
      },
    },
  });
}

function decision(verified: Prospect, before = verifiedProspect({ website: verified.website })) {
  return safeHighConfidenceWebsiteExclusion({
    before,
    verified,
    protectedReason: "",
    websiteMutationRequired: true,
    websiteEvidenceSufficient: true,
  });
}

test("adequate and strong exact first-party websites are safe exclusions", () => {
  assert.equal(decision(verifiedProspect({ disposition: "adequate_existing_website" })).eligible, true);
  assert.equal(decision(verifiedProspect({ disposition: "strong_existing_website" })).eligible, true);
});

test("weak, broken, crawler-blocked, and temporary websites never auto-exclude", () => {
  assert.equal(decision(verifiedProspect({ disposition: "clearly_weak_or_outdated_website" })).eligible, false);
  assert.equal(decision(verifiedProspect({ disposition: "broken_or_inactive_website", status: "confirmed_broken" })).eligible, false);
  assert.equal(decision(verifiedProspect({ disposition: "inconclusive_requires_review", status: "crawler_blocked" })).reasonCode, "crawler_blocked");
  assert.equal(decision(verifiedProspect({ disposition: "inconclusive_requires_review", status: "temporarily_unavailable" })).reasonCode, "temporarily_unavailable");
});

test("Otter Creek wrong-domain, directories, and generic social URLs remain manual", () => {
  const otter = verifiedProspect({
    businessName: "Otter Creek Landscaping",
    website: "https://ottercreeklandscaping.com",
    canonicalUrl: "https://wreathfactoryonline.com/",
  });
  assert.equal(decision(otter, verifiedProspect({ businessName: "Otter Creek Landscaping", website: "https://ottercreeklandscaping.com" })).reasonCode, "cross_domain_mismatch");
  for (const website of [
    "https://www.yelp.com/biz/example-contractor",
    "https://facebook.com/profile.php?id=1",
    "https://facebook.com/sharer/sharer.php?u=https://example.com",
    "https://instagram.com/accounts/login/",
  ]) {
    const candidate = verifiedProspect({ website, canonicalUrl: website });
    assert.equal(decision(candidate, candidate).reasonCode, "suspicious_third_party");
  }
});

test("Pinnacle-style wrong-host evidence cannot authorize an exclusion", () => {
  const stored = verifiedProspect({
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: "https://pinnaclepressurewashingoftoledo.com",
  });
  const wrongHost = verifiedProspect({
    businessName: "Pinnacle Pressure Washing of Toledo",
    website: stored.website,
    canonicalUrl: "https://toledoserviceproviders.example/pinnacle-pressure-washing",
  });
  assert.equal(decision(wrongHost, stored).reasonCode, "cross_domain_mismatch");
});

test("unsupported or credential-bearing canonical URLs cannot establish first-party ownership", () => {
  for (const website of [
    "ftp://examplecontractor.com/",
    "https://operator:secret@examplecontractor.com/",
    "https://examplecontractor.com:8443/",
  ]) {
    const candidate = verifiedProspect({ website, canonicalUrl: website });
    assert.equal(decision(candidate, candidate).reasonCode, "suspicious_third_party");
  }
});

test("Gator contact discoveries cannot establish ownership or invalidate independent first-party proof", () => {
  const insufficient = verifiedProspect({
    businessName: "Gator Plumbing",
    website: "https://voxservices.net/gator-plumbing",
    canonicalUrl: "https://voxservices.net/gator-plumbing",
    signals: ["prominent_business_name", "stored_website_host_match"],
  });
  assert.equal(decision(insufficient, insufficient).reasonCode, "suspicious_third_party");

  const firstParty = verifiedProspect({
    businessName: "Gator Plumbing",
    website: "https://gatorplumbing.com",
    canonicalUrl: "https://gatorplumbing.com/",
    contactPageUrl: "https://voxservices.net/gator-plumbing",
  });
  assert.equal(decision(firstParty, firstParty).eligible, true);
});

test("unknown directory and lead-generation hosts fail closed without affirmative first-party evidence", () => {
  for (const website of [
    "https://bestlocalcontractors.example/example-plumbing-toledo",
    "https://findaplumber.example/providers/example-plumbing",
    "https://localservices.example/toledo/example-plumbing",
  ]) {
    const candidate = verifiedProspect({
      businessName: "Example Plumbing",
      website,
      canonicalUrl: website,
      signals: ["prominent_business_name", "stored_website_host_match", "market_location_match"],
    });
    assert.equal(decision(candidate, candidate).eligible, false);
    assert.equal(decision(candidate, candidate).reasonCode, "insufficient_identity");
  }
});

test("a city mention alone cannot bind same-name or multi-location listings", () => {
  for (const businessName of ["Titan Pro Wash", "National Home Services Toledo"]) {
    const candidate = verifiedProspect({
      businessName,
      website: `https://${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
      signals: [
        "prominent_business_name",
        "stored_website_host_match",
        "market_location_match",
        "canonical_root_business_identity",
        "first_party_site_structure",
      ],
    });
    assert.equal(decision(candidate, candidate).reasonCode, "ambiguous_same_name");
  }
});

test("Titan same-name evidence requires affirmative root structure and an independent binding", () => {
  const ambiguous = verifiedProspect({
    businessName: "Titan Pro Wash",
    website: "https://titanprowash.com",
    signals: [
      "prominent_business_name",
      "stored_website_host_match",
      "canonical_root_business_identity",
      "first_party_site_structure",
    ],
  });
  assert.equal(decision(ambiguous, ambiguous).reasonCode, "ambiguous_same_name");
  const exact = verifiedProspect({
    businessName: "Titan Pro Wash",
    website: "https://titanprowash.com",
    signals: [
      "prominent_business_name",
      "stored_website_host_match",
      "canonical_root_business_identity",
      "first_party_site_structure",
      "public_phone_match",
    ],
  });
  assert.equal(decision(exact, exact).eligible, true);
});

test("an abbreviated first-party domain can pass with strong independent evidence", () => {
  const abbreviated = verifiedProspect({
    businessName: "Example Plumbing",
    website: "https://ep419.com",
    canonicalUrl: "https://ep419.com/",
    signals: [
      "prominent_business_name",
      "stored_website_host_match",
      "canonical_root_business_identity",
      "first_party_site_structure",
      "public_phone_match",
    ],
  });
  assert.equal(decision(abbreviated, abbreviated).eligible, true);
});

test("authoritative provider binding can safely exclude a complete site without strict root-brand signals", () => {
  const website = "https://johnlocke.example";
  const phone = "+14195550123";
  const address = "100 Main Street, Toledo, OH 43604";
  const candidate = verifiedProspect({
    businessName: "John Locke Painting, Inc",
    website,
    canonicalUrl: `${website}/`,
    phone,
    signals: ["stored_website_host_match", "market_location_match", "public_phone_match"],
  });
  candidate.address = address;
  candidate.activitySignals = [discoveryIdentityEvidenceSignal({
    source: "google",
    businessName: "John Locke Painting",
    website,
    profileUrl: "https://www.google.com/maps/place/John+Locke+Painting",
    phone,
    address,
    city: "Toledo",
    state: "OH",
    latitude: 41.65,
    longitude: -83.54,
  })];
  candidate.websiteVerification!.usableSignals = [
    "meaningful page title",
    "navigation",
    "service content",
    "mobile viewport",
    "business imagery",
  ];

  const result = decision(candidate, candidate);
  assert.equal(result.eligible, true);
  assert.equal(result.identitySafe, true);
  assert.match(result.identitySummary, /authoritative provider/i);
});

test("provider-bound exclusion still fails closed on a mismatched authoritative phone and address", () => {
  const website = "https://johnlocke.example";
  const candidate = verifiedProspect({
    businessName: "John Locke Painting, Inc",
    website,
    canonicalUrl: `${website}/`,
    phone: "+14195550123",
    signals: ["stored_website_host_match", "market_location_match", "public_phone_match"],
  });
  candidate.address = "100 Main Street, Toledo, OH 43604";
  candidate.activitySignals = [discoveryIdentityEvidenceSignal({
    source: "google",
    businessName: "John Locke Painting",
    website,
    profileUrl: "https://www.google.com/maps/place/John+Locke+Painting",
    phone: "+14195559999",
    address: "999 Other Street, Toledo, OH 43604",
    city: "Toledo",
    state: "OH",
    latitude: 41.65,
    longitude: -83.54,
  })];
  candidate.websiteVerification!.usableSignals = [
    "meaningful page title",
    "navigation",
    "service content",
    "mobile viewport",
    "business imagery",
  ];

  const result = decision(candidate, candidate);
  assert.equal(result.eligible, false);
  assert.equal(result.identitySafe, false);
});

test("identity signals survive saved website-report validation", () => {
  const report = verifiedProspect({}).websiteVerification!;
  assert.deepEqual(parseWebsiteVerificationReport(report)?.identitySignals, report.identitySignals);
  assert.throws(() => parseWebsiteVerificationReport({ ...report, identitySignals: ["client_tampered_signal"] }), /not supported/);
});
