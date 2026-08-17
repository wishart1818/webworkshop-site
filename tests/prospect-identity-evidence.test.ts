import assert from "node:assert/strict";
import test from "node:test";
import { mergeDiscoveryCandidates } from "../lib/lead-discovery";
import { createProspect } from "../lib/prospect-engine";
import {
  affirmativeFirstPartyIdentity,
  authoritativeNoOwnedWebsiteEvidence,
  discoveryIdentityEvidenceSignal,
  discoverySameNameAmbiguitySignal,
  isSpecificBusinessSocialProfileUrl,
  isSpecificProviderBusinessProfileEvidence,
} from "../lib/prospect-identity-evidence";

const now = new Date("2026-08-10T12:00:00.000Z");

function noSiteProspect(activitySignals: string[], profileUrl = "https://facebook.com/precisionroofingtoledo") {
  const prospect = createProspect({
    businessName: "Precision Roofing",
    website: "",
    profileUrl,
    phone: "419-555-0199",
    email: "",
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    serviceArea: "Toledo, OH",
    sizeIndicator: "Growing",
    prospectType: "no_website_social_only",
    status: "New",
    activitySignals,
  });
  prospect.createdAt = now.toISOString();
  return prospect;
}

function identitySignal(source: "osm" | "google" | "bing" | "yelp", overrides: Record<string, unknown> = {}) {
  return discoveryIdentityEvidenceSignal({
    source,
    businessName: "Precision Roofing",
    website: "",
    profileUrl: "https://facebook.com/precisionroofingtoledo",
    phone: "419-555-0199",
    address: "120 Main Street, Toledo, OH",
    city: "Toledo",
    state: "OH",
    latitude: 41.6528,
    longitude: -83.5379,
    observedAt: now.toISOString(),
    ...overrides,
  });
}

function googleProfileEvidence(profileUrl: string) {
  return {
    source: "google" as const,
    businessName: "Precision Roofing",
    website: "",
    profileUrl,
    phone: "419-555-0199",
    address: "120 Main Street, Toledo, OH",
    city: "Toledo",
    state: "OH",
    latitude: 41.6528,
    longitude: -83.5379,
  };
}

test("Google provider-profile evidence accepts numeric CIDs without accepting generic map searches", () => {
  const accepted = [
    "https://maps.google.com/?cid=3545450935484072529",
    "https://www.google.com/maps/place/Precision+Roofing",
    "https://maps.app.goo.gl/precision-roofing",
    "https://g.page/precision-roofing",
  ];
  const rejected = [
    "https://maps.google.com/",
    "https://maps.google.com/?q=pressure+washing",
    "https://maps.google.com/?cid=",
    "https://maps.google.com/?cid=abc123",
    "https://www.google.com/maps/search/pressure+washing",
    "https://www.google.com/maps?q=pressure+washing",
    "https://www.google.com/search?q=pressure+washing",
  ];

  for (const profileUrl of accepted) {
    assert.equal(isSpecificProviderBusinessProfileEvidence(googleProfileEvidence(profileUrl)), true, profileUrl);
  }
  for (const profileUrl of rejected) {
    assert.equal(isSpecificProviderBusinessProfileEvidence(googleProfileEvidence(profileUrl)), false, profileUrl);
  }
});

test("numeric Google CID participates in the existing authoritative no-owned-website gate only with strong identity evidence", () => {
  const cidProfile = "https://maps.google.com/?cid=3545450935484072529";
  const verifiedProspect = noSiteProspect([
    identitySignal("google", { profileUrl: cidProfile }),
    identitySignal("bing", { profileUrl: "" }),
  ]);
  const original = structuredClone(verifiedProspect);
  const verified = authoritativeNoOwnedWebsiteEvidence(verifiedProspect, now);
  assert.equal(verified.verified, true);
  assert.equal(verified.reasonCode, "verified_provider_social_absence");
  assert.deepEqual(verifiedProspect, original);

  const conflicting = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    identitySignal("google", { profileUrl: cidProfile }),
    identitySignal("bing", {
      profileUrl: "",
      phone: "214-555-0110",
      address: "900 Commerce Street, Dallas, TX",
      city: "Dallas",
      state: "TX",
      latitude: 32.7767,
      longitude: -96.797,
    }),
  ]), now);
  assert.equal(conflicting.verified, false);
  assert.equal(conflicting.reasonCode, "identity_incomplete");

  const ambiguous = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    identitySignal("google", { profileUrl: cidProfile }),
    identitySignal("bing", { profileUrl: "" }),
    discoverySameNameAmbiguitySignal(),
  ]), now);
  assert.equal(ambiguous.verified, false);
  assert.equal(ambiguous.reasonCode, "identity_ambiguous");
});

test("NO_OWNED_WEBSITE requires fresh independent identity and a specific business profile", () => {
  const verified = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    identitySignal("google"),
    identitySignal("osm"),
  ]), now);
  assert.equal(verified.verified, true);
  assert.equal(verified.reasonCode, "verified_provider_social_absence");

  const oneSource = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([identitySignal("google")]), now);
  assert.equal(oneSource.verified, false);
  assert.equal(oneSource.reasonCode, "identity_incomplete");

  const unattestedProfile = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    identitySignal("google", { profileUrl: "" }),
    identitySignal("osm", { profileUrl: "" }),
  ]), now);
  assert.equal(unattestedProfile.verified, false);
  assert.equal(unattestedProfile.reasonCode, "public_presence_incomplete");

  const genericProfile = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    identitySignal("google", { profileUrl: "https://facebook.com/login" }),
    identitySignal("osm", { profileUrl: "https://facebook.com/login" }),
  ], "https://facebook.com/login"), now);
  assert.equal(genericProfile.verified, false);
  assert.equal(genericProfile.reasonCode, "public_presence_incomplete");
});

test("NO_OWNED_WEBSITE fails closed for same-name ambiguity, stale evidence, and an owned-domain candidate", () => {
  const evidence = [identitySignal("google"), identitySignal("osm")];
  const ambiguous = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    ...evidence,
    discoverySameNameAmbiguitySignal(),
  ]), now);
  assert.equal(ambiguous.verified, false);
  assert.equal(ambiguous.reasonCode, "identity_ambiguous");

  const withDomain = authoritativeNoOwnedWebsiteEvidence(noSiteProspect([
    identitySignal("google", { website: "https://precisionroofing.example" }),
    identitySignal("osm"),
  ]), now);
  assert.equal(withDomain.verified, false);
  assert.equal(withDomain.reasonCode, "owned_domain_candidate");

  const stale = noSiteProspect(evidence);
  stale.activitySignals = [
    identitySignal("google", { observedAt: "2026-07-01T12:00:00.000Z" }),
    identitySignal("osm", { observedAt: "2026-07-01T12:00:00.000Z" }),
  ];
  const staleDecision = authoritativeNoOwnedWebsiteEvidence(stale, now);
  assert.equal(staleDecision.verified, false);
  assert.equal(staleDecision.reasonCode, "identity_incomplete");

  const legacyWithoutObservationTime = noSiteProspect([
    identitySignal("google", { observedAt: "" }),
    identitySignal("osm", { observedAt: "" }),
  ]);
  legacyWithoutObservationTime.createdAt = now.toISOString();
  const legacyDecision = authoritativeNoOwnedWebsiteEvidence(legacyWithoutObservationTime, now);
  assert.equal(legacyDecision.verified, false);
  assert.equal(legacyDecision.reasonCode, "identity_incomplete");
});

test("same-name businesses with conflicting domains remain separate and visibly ambiguous", () => {
  const result = mergeDiscoveryCandidates({
    latitude: 41.6528,
    longitude: -83.5379,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 50,
    limit: 20,
    prospectType: "all",
    candidates: [
      { source: "google", businessName: "Summit Roofing", website: "https://summit-north.example", phone: "419-555-0101", latitude: 41.65, longitude: -83.54 },
      { source: "bing", businessName: "Summit Roofing", website: "https://summit-south.example", phone: "419-555-0202", latitude: 41.67, longitude: -83.55 },
    ],
  });

  assert.equal(result.leads.length, 2);
  assert.equal(result.leads.every((lead) => lead.activitySignals?.includes("discovery_identity_conflict:same_name")), true);
  assert.deepEqual(new Set(result.leads.map((lead) => lead.website)), new Set([
    "https://summit-north.example/",
    "https://summit-south.example/",
  ]));
});

test("complete identity merges provider duplicates while partial phones alone never merge", () => {
  const matched = mergeDiscoveryCandidates({
    latitude: 41.6528,
    longitude: -83.5379,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 50,
    limit: 20,
    candidates: [
      { source: "google", businessName: "Precision Roofing", website: "https://precisionroofing.example", phone: "419-555-0199" },
      { source: "osm", businessName: "Precision Roofing LLC", phone: "+1 (419) 555-0199" },
    ],
  });
  assert.equal(matched.leads.length, 1);
  assert.deepEqual(matched.leads[0]?.sources, ["google", "osm"]);
  assert.equal(matched.leads[0]?.providerIdentityEvidence?.length, 2);

  const partial = mergeDiscoveryCandidates({
    latitude: 41.6528,
    longitude: -83.5379,
    city: "Toledo",
    state: "OH",
    trade: "Roofing",
    radiusKm: 50,
    limit: 20,
    candidates: [
      { source: "google", businessName: "Precision Roofing", website: "https://precision-one.example", phone: "555-0199" },
      { source: "osm", businessName: "Precision Roofing", website: "https://precision-two.example", phone: "555-0199" },
    ],
  });
  assert.equal(partial.leads.length, 2);
});

test("affirmative first-party identity cannot be established by a name or partial evidence alone", () => {
  assert.equal(affirmativeFirstPartyIdentity([
    "prominent_business_name",
    "stored_website_host_match",
    "canonical_root_business_identity",
    "first_party_site_structure",
  ]), false);
  assert.equal(affirmativeFirstPartyIdentity([
    "prominent_business_name",
    "stored_website_host_match",
    "canonical_root_business_identity",
    "first_party_site_structure",
    "public_phone_match",
  ]), true);
  assert.equal(isSpecificBusinessSocialProfileUrl("https://facebook.com/login"), false);
  assert.equal(isSpecificBusinessSocialProfileUrl("https://instagram.com/accounts/login"), false);
  assert.equal(isSpecificBusinessSocialProfileUrl("https://facebook.com/precisionroofingtoledo"), true);
});
