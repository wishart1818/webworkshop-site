import assert from "node:assert/strict";
import test from "node:test";
import { createProspect } from "../lib/prospect-engine";
import { parseWebsiteVerificationReport, validateProspect } from "../lib/prospect-validation";

const checkedAt = "2026-08-17T19:10:00.000Z";

function phoneConflictReport() {
  return {
    version: "website-verification-v2" as const,
    status: "usable" as const,
    confidence: "low" as const,
    canonicalUrl: "https://hkpressurewashing.com/",
    attempts: [],
    usableSignals: ["HTML response was usable."],
    explanation: "The website was reachable, but published phone evidence conflicts with the prospect record.",
    checkedAt,
    ownershipDecision: "uncertain" as const,
    identityEvidence: ["The verified website publishes complete phone numbers, but none match the prospect's stored business phone."],
    identitySignals: [
      "prominent_business_name",
      "stored_website_host_match",
      "canonical_root_business_identity",
      "first_party_site_structure",
      "business_domain_email_match",
      "public_phone_conflict",
    ],
  };
}

test("website verification decoder accepts persisted public_phone_conflict", () => {
  const parsed = parseWebsiteVerificationReport(JSON.parse(JSON.stringify(phoneConflictReport())));
  assert.ok(parsed);
  assert.equal(parsed.ownershipDecision, "uncertain");
  assert.equal(parsed.identitySignals?.includes("public_phone_conflict"), true);
});

test("prospect runtime validation round-trips a saved public_phone_conflict report", () => {
  const prospect = createProspect({
    businessName: "HK Pressure Washing",
    website: "https://hkpressurewashing.com/",
    phone: "+1 512-555-0123",
    email: "",
    city: "Georgetown",
    state: "TX",
    trade: "Pressure Washing",
    serviceArea: "Georgetown, TX",
    status: "New",
    sizeIndicator: "Small",
  });

  const payload = JSON.parse(JSON.stringify({
    ...prospect,
    websiteStatus: "usable",
    websiteVerification: phoneConflictReport(),
    fitDisposition: "inconclusive_requires_review",
  }));

  const result = validateProspect(payload);
  assert.equal(result.ok, true, result.ok ? undefined : result.error);
  if (!result.ok) return;
  assert.equal(result.value.websiteVerification?.identitySignals?.includes("public_phone_conflict"), true);
  assert.equal(result.value.websiteVerification?.ownershipDecision, "uncertain");
});
