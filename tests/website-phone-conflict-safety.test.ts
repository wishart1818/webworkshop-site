import assert from "node:assert/strict";
import test from "node:test";
import { createProspect } from "../lib/prospect-engine";
import { affirmativeFirstPartyIdentity } from "../lib/prospect-identity-evidence";
import { websiteFitAllowsAutonomousOutreach } from "../lib/prospect-qualification";
import { verifyProspectWebsite, type WebsiteVerificationDependencies } from "../lib/site-analysis";

const fixedNow = new Date("2026-08-17T16:00:00.000Z");

function htmlResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
}

function hkProspect(phone = "+1 512-555-0123") {
  return createProspect({
    businessName: "HK Pressure Washing",
    website: "https://hkpressurewashing.com",
    phone,
    email: "",
    city: "Georgetown",
    state: "TX",
    trade: "Pressure Washing",
    serviceArea: "Georgetown, TX",
    status: "New",
    sizeIndicator: "Small",
  });
}

function hkWebsiteFetch(phones: string[]): typeof fetch {
  const phoneMarkup = phones.map((phone) => `<a href="tel:${phone.replace(/\D/g, "")}">${phone}</a>`).join(" ");
  const root = `
    <!doctype html>
    <html>
      <head>
        <title>HK Pressure Washing</title>
        <link rel="canonical" href="https://hkpressurewashing.com/" />
      </head>
      <body>
        <h1>HK Pressure Washing</h1>
        <p>${"Exterior property washing for homes and businesses around Houston. ".repeat(8)}</p>
        ${phoneMarkup}
        <a href="mailto:info@hkpressurewashing.com">info@hkpressurewashing.com</a>
        <a href="/contact" aria-label="Details"></a>
      </body>
    </html>
  `;
  const contact = `
    <!doctype html>
    <html>
      <head><title>HK Pressure Washing</title></head>
      <body>
        <h1>HK Pressure Washing</h1>
        ${phoneMarkup}
        <a href="mailto:info@hkpressurewashing.com">info@hkpressurewashing.com</a>
      </body>
    </html>
  `;
  return (async (input: Parameters<typeof fetch>[0]) => {
    const pathname = new URL(requestUrl(input)).pathname;
    if (pathname === "/") return htmlResponse(root);
    if (pathname === "/contact") return htmlResponse(contact);
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;
}

function dependencies(fetchImpl: typeof fetch): WebsiteVerificationDependencies {
  return {
    fetch: fetchImpl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => fixedNow,
    maxContactPages: 1,
  };
}

test("explicit complete-phone conflict vetoes same-name domain-email website ownership", async () => {
  const result = await verifyProspectWebsite(
    hkProspect("+1 512-555-0123"),
    dependencies(hkWebsiteFetch(["(713) 555-0199"])),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
  assert.equal(result.report.identitySignals?.includes("business_domain_email_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.match(result.report.fit?.reason ?? "", /phone numbers conflict/i);
});

test("one matching complete phone among multiple published numbers preserves first-party ownership", async () => {
  const result = await verifyProspectWebsite(
    hkProspect("(512) 555-0123"),
    dependencies(hkWebsiteFetch(["(713) 555-0199", "+1 (512) 555-0123"])),
  );

  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), false);
  assert.equal(result.prospect.fitDisposition, "clearly_weak_or_outdated_website");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), true);
});

test("absence of a published website phone is not treated as a conflict", async () => {
  const result = await verifyProspectWebsite(
    hkProspect("+1 512-555-0123"),
    dependencies(hkWebsiteFetch([])),
  );

  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), false);
  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "clearly_weak_or_outdated_website");
});

test("first-party identity helper never lets a business-domain email override an explicit phone conflict", () => {
  assert.equal(affirmativeFirstPartyIdentity([
    "prominent_business_name",
    "stored_website_host_match",
    "canonical_root_business_identity",
    "first_party_site_structure",
    "business_domain_email_match",
    "public_phone_conflict",
  ]), false);
});
