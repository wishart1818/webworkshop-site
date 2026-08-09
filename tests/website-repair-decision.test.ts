import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect, type WebsiteAvailabilityStatus, type WebsiteFitDisposition } from "../lib/prospect-engine";
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
      identitySignals: input.signals ?? ["prominent_business_name", "stored_website_host_match", "market_location_match"],
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

test("Titan same-name evidence requires an exact market or public-phone binding", () => {
  const ambiguous = verifiedProspect({
    businessName: "Titan Pro Wash",
    website: "https://titanprowash.com",
    signals: ["prominent_business_name", "stored_website_host_match"],
  });
  assert.equal(decision(ambiguous, ambiguous).reasonCode, "ambiguous_same_name");
  const exact = verifiedProspect({
    businessName: "Titan Pro Wash",
    website: "https://titanprowash.com",
    signals: ["prominent_business_name", "stored_website_host_match", "public_phone_match"],
  });
  assert.equal(decision(exact, exact).eligible, true);
});

test("identity signals survive saved website-report validation", () => {
  const report = verifiedProspect({}).websiteVerification!;
  assert.deepEqual(parseWebsiteVerificationReport(report)?.identitySignals, report.identitySignals);
  assert.throws(() => parseWebsiteVerificationReport({ ...report, identitySignals: ["client_tampered_signal"] }), /not supported/);
});
