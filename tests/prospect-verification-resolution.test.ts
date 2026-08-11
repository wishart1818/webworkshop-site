import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import {
  mergeResolvedWebsiteEvidence,
  verifyProspectWebsiteWithSecondPass,
} from "../lib/prospect-verification-resolution";

const now = new Date("2026-08-10T14:00:00.000Z");

function prospect(overrides: Partial<Prospect> = {}) {
  return {
    ...createProspect({
      businessName: "Perfect Green Lawn and Landscape",
      website: "https://perfectgreen.example",
      phone: "419-555-0144",
      email: "",
      city: "Toledo",
      state: "OH",
      trade: "Landscaping",
      serviceArea: "Toledo, OH",
      sizeIndicator: "Growing",
      status: "New",
    }),
    ...overrides,
  } satisfies Prospect;
}

function rootHtml() {
  return `<!doctype html><html><head><title>Perfect Green Lawn and Landscape | Toledo</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav>
    <h1>Perfect Green Lawn and Landscape</h1><p>Lawn care, planting, landscape maintenance, and outdoor projects for Toledo homes.</p>
    <a href="tel:+14195550144">(419) 555-0144</a><form><button>Request an estimate</button></form>
    <img src="/landscape-project.jpg" alt="Completed residential landscape project" /></body></html>`;
}

test("shared second pass can resolve crawler-blocked first-party evidence without weakening identity", async () => {
  let calls = 0;
  const result = await verifyProspectWebsiteWithSecondPass(prospect(), {
    fetch: (async (input) => {
      calls += 1;
      if (calls <= 4) {
        return new Response("<html><title>Checking your browser</title><body>Verify you are human.</body></html>", {
          status: 403,
          headers: { "content-type": "text/html" },
        });
      }
      const path = new URL(String(input)).pathname;
      return new Response(path === "/contact"
        ? "<html><title>Contact Perfect Green Lawn and Landscape</title><body><h1>Contact Perfect Green Lawn and Landscape</h1><a href='tel:+14195550144'>(419) 555-0144</a></body></html>"
        : rootHtml(), { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 1,
  });

  assert.equal(result.initialResult.report.status, "crawler_blocked");
  assert.equal(result.secondPassAttempted, true);
  assert.equal(result.result.report.ownershipDecision, "owned");
  assert.ok(["adequate_existing_website", "strong_existing_website"].includes(result.result.prospect.fitDisposition));
  assert.equal(result.outcome, "safe_exclusion");
  assert.ok(calls <= 7);
});

test("shared second pass rejects a provider domain that conflicts with the stored business domain", async () => {
  const calls: string[] = [];
  const candidate = "https://other-perfect-green.example";
  const result = await verifyProspectWebsiteWithSecondPass(prospect({
    activitySignals: [discoveryIdentityEvidenceSignal({
      source: "google",
      businessName: "Perfect Green Lawn and Landscape",
      website: candidate,
      profileUrl: "",
      phone: "419-555-0144",
      address: "100 Main Street, Toledo, OH",
      city: "Toledo",
      state: "OH",
      latitude: 41.65,
      longitude: -83.54,
    })],
  }), {
    fetch: (async (input) => {
      calls.push(String(input));
      return new Response("Service unavailable", { status: 503, headers: { "content-type": "text/html" } });
    }) as typeof fetch,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxVerificationAttempts: 1,
  });

  assert.equal(result.reasonCode, "PROVIDER_WEBSITE_CONFLICT");
  assert.equal(result.outcome, "still_manual");
  assert.equal(result.secondPassAttempted, false);
  assert.equal(calls.some((url) => url.includes("other-perfect-green.example")), false);
});

test("shared second pass keeps missing website data manual when no-site evidence is insufficient", async () => {
  let calls = 0;
  const result = await verifyProspectWebsiteWithSecondPass(prospect({
    website: "",
    prospectType: "no_website_social_only",
    profileUrl: "https://facebook.com/perfectgreentoledo",
  }), {
    fetch: (async () => {
      calls += 1;
      throw new Error("No website fetch should run.");
    }) as typeof fetch,
    now: () => now,
  });

  assert.equal(result.outcome, "still_manual");
  assert.equal(result.reasonCode, "LIKELY_NO_SITE_EVIDENCE_INCOMPLETE");
  assert.equal(result.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(calls, 0);
});

test("authoritative provider binding safely excludes a complete site when strict root branding is incomplete", async () => {
  const website = "https://johnlocke.example";
  const phone = "419-555-0144";
  const address = "100 Main Street, Toledo, OH 43604";
  const value = prospect({
    businessName: "John Locke Painting, Inc",
    website,
    phone,
    address,
    city: "Toledo",
    trade: "Painting",
    activitySignals: [discoveryIdentityEvidenceSignal({
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
    })],
  });
  const fetchImpl = (async () => new Response(`<!doctype html><html><head>
      <title>Home - John Locke Painting</title><meta name="viewport" content="width=device-width" />
    </head><body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav>
      <h1>Painting Services</h1><p>John Locke Painting provides residential and commercial painting services throughout Toledo and nearby communities. Our experienced team handles interior painting, exterior painting, preparation, and project cleanup for homes and businesses.</p>
      <a href="tel:+14195550144">(419) 555-0144</a><form><button>Request an appointment</button></form>
      <img src="/crew.jpg" alt="Painting crew completing a local project" /></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  })) as typeof fetch;

  const result = await verifyProspectWebsiteWithSecondPass(value, {
    fetch: fetchImpl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 1,
  });

  assert.equal(result.secondPassAttempted, false);
  assert.equal(result.outcome, "safe_exclusion");
  assert.equal(result.result.report.ownershipDecision, "owned");
  assert.equal(result.result.report.fit?.disposition, "adequate_existing_website");
  assert.equal(result.result.report.fit?.confidence, "high");
  assert.equal(result.result.prospect.fitDisposition, "adequate_existing_website");
  assert.match(result.result.report.identityEvidence?.join(" ") ?? "", /authoritative provider website binding/i);
  assert.equal(result.result.report.identitySignals?.includes("canonical_root_business_identity"), false);
});

test("provider-bound exclusion fails closed when the authoritative identity does not match phone or address", async () => {
  const website = "https://johnlocke.example";
  const value = prospect({
    businessName: "John Locke Painting, Inc",
    website,
    phone: "419-555-0144",
    address: "100 Main Street, Toledo, OH 43604",
    city: "Toledo",
    trade: "Painting",
    activitySignals: [discoveryIdentityEvidenceSignal({
      source: "google",
      businessName: "John Locke Painting",
      website,
      profileUrl: "https://www.google.com/maps/place/John+Locke+Painting",
      phone: "419-555-9999",
      address: "999 Other Street, Toledo, OH 43604",
      city: "Toledo",
      state: "OH",
      latitude: 41.65,
      longitude: -83.54,
    })],
  });
  const fetchImpl = (async () => new Response(`<!doctype html><html><head>
      <title>Home - John Locke Painting</title><meta name="viewport" content="width=device-width" />
    </head><body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav>
      <h1>Painting Services</h1><p>John Locke Painting provides residential and commercial painting services throughout Toledo and nearby communities. Our experienced team handles interior painting, exterior painting, preparation, and project cleanup for homes and businesses.</p>
      <a href="tel:+14195550144">(419) 555-0144</a><form><button>Request an appointment</button></form>
      <img src="/crew.jpg" alt="Painting crew completing a local project" /></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html" },
  })) as typeof fetch;

  const result = await verifyProspectWebsiteWithSecondPass(value, {
    fetch: fetchImpl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 1,
  });

  assert.equal(result.outcome, "still_manual");
  assert.equal(result.result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.notEqual(result.result.report.ownershipDecision, "owned");
});

test("an existing prospect accepts resolved website evidence without overwriting contact identity", () => {
  const existing = prospect({
    email: "office@perfectgreen.example",
    contactPersonName: "Verified Contact",
    contactFormUrl: "https://perfectgreen.example/estimate",
  });
  const resolved = prospect({
    website: "https://www.perfectgreen.example",
    email: "conflicting@vendor.example",
    phone: "567-555-0199",
    contactPersonName: "Unverified Person",
    contactFormUrl: "https://www.perfectgreen.example/contact",
    websiteStatus: "usable",
    websiteStatusDetail: "The owned website was verified.",
    fitDisposition: "adequate_existing_website",
  });
  const merged = mergeResolvedWebsiteEvidence(existing, resolved);

  assert.equal(merged.website, resolved.website);
  assert.equal(merged.fitDisposition, "adequate_existing_website");
  assert.equal(merged.email, existing.email);
  assert.equal(merged.phone, existing.phone);
  assert.equal(merged.contactPersonName, existing.contactPersonName);
  assert.equal(merged.contactFormUrl, existing.contactFormUrl);
});

test("a production-shaped 20-business fresh sample resolves evidence without promoting uncertainty", async () => {
  const fixtures = Array.from({ length: 20 }, (_, index) => {
    const businessName = `Fresh Local Contractor ${index + 1}`;
    const phone = `419555${String(1000 + index).slice(-4)}`;
    if (index >= 10 && index < 18) {
      const profileUrl = `https://facebook.com/freshlocalcontractor${index + 1}`;
      const signals = index < 14
        ? [
            discoveryIdentityEvidenceSignal({ source: "google", businessName, website: "", profileUrl, phone, address: `${100 + index} Main Street, Toledo, OH`, city: "Toledo", state: "OH", latitude: 41.65 + index / 10_000, longitude: -83.54 }),
            discoveryIdentityEvidenceSignal({ source: "osm", businessName, website: profileUrl, profileUrl, phone, address: `${100 + index} Main St, Toledo, Ohio`, city: "Toledo", state: "OH", latitude: 41.65 + index / 10_000, longitude: -83.54 }),
          ]
        : [discoveryIdentityEvidenceSignal({ source: "google", businessName, website: "", profileUrl, phone, address: `${100 + index} Main Street, Toledo, OH`, city: "Toledo", state: "OH", latitude: 41.65, longitude: -83.54 })];
      const value = prospect({ businessName, website: "", phone, profileUrl, facebookUrl: profileUrl, prospectType: "no_website_social_only", activitySignals: signals });
      value.createdAt = now.toISOString();
      return { kind: index < 14 ? "verified_no_site" as const : "ambiguous_no_site" as const, prospect: value };
    }
    return {
      kind: index < 5 ? "owned" as const : index < 8 ? "blocked" as const : "timeout" as const,
      prospect: prospect({ businessName, phone, website: `https://fresh-${index + 1}.example` }),
    };
  });
  let calls = 0;
  const results = [];
  for (const fixture of fixtures) {
    const result = await verifyProspectWebsiteWithSecondPass(fixture.prospect, {
      fetch: (async (input) => {
        calls += 1;
        if (fixture.kind === "blocked") {
          return new Response("<html><title>Checking your browser</title><body>Verify you are human.</body></html>", { status: 403, headers: { "content-type": "text/html" } });
        }
        if (fixture.kind === "timeout") throw new DOMException("Timed out", "TimeoutError");
        const url = new URL(String(input));
        const emailDomain = url.hostname;
        const html = url.pathname === "/contact"
          ? `<html><title>Contact ${fixture.prospect.businessName}</title><body><h1>Contact ${fixture.prospect.businessName}</h1><a href="tel:${fixture.prospect.phone}">${fixture.prospect.phone}</a><a href="mailto:info@${emailDomain}">Email</a></body></html>`
          : `<html><head><title>${fixture.prospect.businessName} | Toledo</title><meta name="viewport" content="width=device-width"></head><body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav><h1>${fixture.prospect.businessName}</h1><p>Local exterior and property services for Toledo homeowners.</p><a href="tel:${fixture.prospect.phone}">${fixture.prospect.phone}</a><form><button>Request an estimate</button></form><img src="/project.jpg" alt="Completed local project"></body></html>`;
        return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
      }) as typeof fetch,
      lookup: async () => [{ address: "93.184.216.34" }],
      robotsPolicy: async () => true,
      now: () => now,
      maxContactPages: 1,
    });
    results.push({ kind: fixture.kind, result });
  }

  assert.equal(results.length, 20);
  assert.equal(results.filter(({ result }) => result.outcome === "safe_exclusion").length, 5);
  assert.equal(results.filter(({ result }) => result.outcome === "reviewable_rebuild_opportunity").length, 4);
  assert.equal(results.filter(({ result }) => result.outcome === "still_manual").length, 11);
  assert.equal(results.filter(({ kind, result }) => ["blocked", "timeout", "ambiguous_no_site"].includes(kind) && result.outcome !== "still_manual").length, 0);
  assert.ok(calls <= 80, `expected bounded verification calls, received ${calls}`);
});
