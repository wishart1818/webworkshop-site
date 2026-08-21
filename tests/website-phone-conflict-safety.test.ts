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

function dependableProspect() {
  return createProspect({
    businessName: "Dependable Painting & Remodeling",
    website: "https://www.dependablepaint.net/",
    phone: "+1-470-655-3997",
    email: "",
    city: "Atlanta",
    state: "GA",
    trade: "Painting",
    serviceArea: "Atlanta, GA",
    status: "New",
    sizeIndicator: "Small",
  });
}

function dependablePage(phone: string, extraLinks = "") {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Dependable Painting & Remodeling | Atlanta Painters</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href="https://www.dependablepaint.net/" />
      </head>
      <body>
        <nav><a href="/">Home</a><a href="/contact">Contact</a>${extraLinks}</nav>
        <h1>Dependable Painting & Remodeling</h1>
        <p>${"Interior and exterior painting and remodeling services for Atlanta property owners. ".repeat(6)}</p>
        <a href="tel:${phone.replace(/\D/g, "")}">${phone}</a>
        <a href="mailto:derek@dependablepaint.net">derek@dependablepaint.net</a>
        <form action="/contact"><input name="name" /><button>Request an estimate</button></form>
        <img src="/painting-project.jpg" alt="Dependable Painting project" />
      </body>
    </html>
  `;
}

function dependableDependencies(fetchImpl: typeof fetch): WebsiteVerificationDependencies {
  return {
    ...dependencies(fetchImpl),
    maxContactPages: 2,
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

test("a bounded first-party market page phone match overrides other legitimate company numbers", async () => {
  const requestedPaths: string[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    requestedPaths.push(url.pathname);
    if (url.pathname === "/") {
      return htmlResponse(dependablePage(
        "470-322-7107",
        '<a href="/house-painting/atlanta-ga/">Atlanta painting</a>',
      ));
    }
    if (url.pathname === "/house-painting/atlanta-ga/") {
      return htmlResponse(dependablePage("470-655-3997"));
    }
    if (url.pathname === "/contact") return htmlResponse(dependablePage("470-322-7107"));
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;

  const result = await verifyProspectWebsite(dependableProspect(), dependableDependencies(fetchImpl));

  assert.equal(requestedPaths.includes("/house-painting/atlanta-ga/"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), false);
  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "adequate_existing_website");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(result.prospect.outreach, undefined);
});

test("complete bounded first-party phone evidence still conflicts when no number matches", async () => {
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const pathname = new URL(requestUrl(input)).pathname;
    if (pathname === "/") {
      return htmlResponse(dependablePage(
        "470-322-7107",
        '<a href="/house-painting/atlanta-ga/">Atlanta painting</a>',
      ));
    }
    if (pathname === "/house-painting/atlanta-ga/") return htmlResponse(dependablePage("404-407-7767"));
    if (pathname === "/contact") return htmlResponse(dependablePage("470-322-7107"));
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;

  const result = await verifyProspectWebsite(dependableProspect(), dependableDependencies(fetchImpl));

  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
});

test("a foreign-domain market page cannot provide first-party phone identity evidence", async () => {
  let foreignPageFetched = false;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === "profiles.example") {
      foreignPageFetched = true;
      return htmlResponse(dependablePage("470-655-3997"));
    }
    if (url.pathname === "/") {
      return htmlResponse(dependablePage(
        "470-322-7107",
        '<a href="https://profiles.example/house-painting/atlanta-ga/">Atlanta painting</a>',
      ));
    }
    if (url.pathname === "/contact") return htmlResponse(dependablePage("470-322-7107"));
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;

  const result = await verifyProspectWebsite(dependableProspect(), dependableDependencies(fetchImpl));

  assert.equal(foreignPageFetched, false);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
});

test("an unverified cross-origin redirect cannot provide first-party phone identity evidence", async () => {
  let redirectedPageFetched = false;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === "profiles.example") {
      redirectedPageFetched = true;
      return htmlResponse(dependablePage("470-655-3997"));
    }
    if (url.pathname === "/") {
      return htmlResponse(dependablePage(
        "470-322-7107",
        '<a href="/house-painting/atlanta-ga/">Atlanta painting</a>',
      ));
    }
    if (url.pathname === "/house-painting/atlanta-ga/") {
      return new Response(null, {
        status: 302,
        headers: { location: "https://profiles.example/dependable-painting" },
      });
    }
    if (url.pathname === "/contact") return htmlResponse(dependablePage("470-322-7107"));
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;

  const result = await verifyProspectWebsite(dependableProspect(), dependableDependencies(fetchImpl));

  assert.equal(redirectedPageFetched, false);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
});
