import assert from "node:assert/strict";
import test from "node:test";
import {
  createProspect,
  prospectVerifiedEmailEvidence,
  prospectWebsiteVerificationBlockReason,
} from "../lib/prospect-engine";
import {
  extractContactDiscoveryFromPages,
  verifyProspectWebsite,
  type WebsiteVerificationDependencies,
} from "../lib/site-analysis";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";

const fixedNow = new Date("2026-07-28T12:00:00.000Z");

function prospect(overrides: Partial<Parameters<typeof createProspect>[0]> = {}) {
  return createProspect({
    businessName: "True Clean Prowash",
    website: "https://truecleanprowash.com",
    phone: "",
    email: "",
    city: "Columbus",
    state: "OH",
    trade: "Pressure Washing",
    serviceArea: "Columbus, OH",
    status: "New",
    sizeIndicator: "Small",
    ...overrides,
  });
}

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

function verificationDependencies(fetchImpl: typeof fetch): WebsiteVerificationDependencies {
  return {
    fetch: fetchImpl,
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => fixedNow,
  };
}

function requestUrl(input: Parameters<typeof fetch>[0]) {
  return input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
}

function userAgent(init?: RequestInit) {
  return new Headers(init?.headers).get("user-agent") ?? "";
}

const trueCleanHomepage = `
  <!doctype html>
  <html>
    <head>
      <title>True Clean Prowash | Exterior Cleaning in Columbus</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href="https://truecleanprowash.com/" />
    </head>
    <body>
      <header><nav><a href="/">Home</a><a href="/services">Services</a><a href="/contact">Contact</a></nav></header>
      <main>
        <h1>True Clean Prowash</h1>
        <p>Residential pressure washing, house washing, and concrete cleaning for homeowners around Columbus.</p>
        <p>Our exterior cleaning services remove dirt and buildup from siding, walkways, patios, and driveways.</p>
        <a href="tel:+16145550123">Call (614) 555-0123</a>
        <form action="/request-a-quote"><label>Project details<input name="project" /></label><button>Request a quote</button></form>
        <img src="/crew-cleaning-siding.jpg" alt="Exterior cleaning crew washing residential siding" />
        <a href="https://facebook.com/truecleanprowash">Facebook</a>
        <a href="https://instagram.com/truecleanprowash">Instagram</a>
      </main>
    </body>
  </html>
`;

const trueCleanContact = `
  <!doctype html>
  <html>
    <head><title>Contact True Clean Prowash</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
    <body>
      <nav><a href="/">Home</a><a href="/contact">Contact</a></nav>
      <h1>Request exterior cleaning in Columbus</h1>
      <p>Tell the True Clean Prowash team which exterior surfaces need attention.</p>
      <a href="mailto:info@truecleanprowash.com">info@truecleanprowash.com</a>
      <a href="tel:+16145550123">(614) 555-0123</a>
      <form><input name="name" /><input name="email" /><textarea name="message"></textarea><button>Request estimate</button></form>
    </body>
  </html>
`;

test("True Clean crawler-specific 508 is overridden by bounded usable-site and contact evidence", async () => {
  const calls: Array<{ url: string; browserHeaders: boolean }> = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = requestUrl(input);
    const browserHeaders = userAgent(init).startsWith("Mozilla/");
    calls.push({ url, browserHeaders });
    const pathname = new URL(url).pathname;
    if (url === "https://truecleanprowash.com/" && !browserHeaders) {
      return htmlResponse("<html><title>Loop detected</title><body>Error 508</body></html>", 508);
    }
    if (url === "https://truecleanprowash.com/" && browserHeaders) return htmlResponse(trueCleanHomepage);
    if (pathname === "/contact") return htmlResponse(trueCleanContact);
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;

  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.canonicalUrl, "https://truecleanprowash.com/");
  assert.equal(result.report.attempts[0]?.httpStatus, 508);
  assert.equal(result.report.attempts[0]?.failureCategory, "http_transient");
  assert.equal(result.report.attempts[1]?.httpStatus, 200);
  assert.equal(result.report.attempts[1]?.browserCompatibleHeaders, true);
  assert.equal(result.prospect.email, "info@truecleanprowash.com");
  assert.equal(result.prospect.contactFormDetected || result.prospect.quoteFormDetected, true);
  assert.equal(result.prospect.prospectType, "redesign");
  assert.equal(result.prospect.classification, "website_redesign");
  assert.equal(result.prospect.fitDisposition, "adequate_existing_website");
  assert.equal(result.report.ownershipDecision, "owned");
  assert.notEqual(result.prospect.recommendedContactMethod, "call_first");
  assert.notEqual(result.prospect.websiteStatus, "no_owned_website");
  const emailEvidence = result.prospect.contactEvidence.find((item) => item.value === "info@truecleanprowash.com");
  assert.equal(emailEvidence?.sourceUrl, "https://truecleanprowash.com/contact");
  assert.equal(emailEvidence?.extractionMethod, "mailto");
  assert.equal(emailEvidence?.domainMatchesBusiness, true);
  assert.equal(emailEvidence?.firstParty, true);
  assert.equal(emailEvidence?.sourceType, "owned_website");
  assert.equal(emailEvidence?.decision, "autonomous_eligible");
  assert.ok(calls.length <= 10);
  assert.equal(result.prospect.activities.some((item) => /sent/i.test(item.label) && !/nothing was sent/i.test(item.label)), false);
});

test("website identity requires one complete published phone instead of concatenated page digits", async () => {
  const body = `
    <!doctype html>
    <html>
      <head><title>True Clean Prowash | Exterior Cleaning in Columbus</title><meta name="viewport" content="width=device-width" /></head>
      <body>
        <nav><a href="/">Home</a><a href="/services">Services</a></nav>
        <main>
          <h1>True Clean Prowash</h1>
          <p>Exterior cleaning and pressure washing for Columbus properties.</p>
          <p>Project 614</p><p>Service code 555</p><p>Reference 0123</p>
          <form><input name="name" /><button>Request an estimate</button></form>
        </main>
      </body>
    </html>
  `;
  const result = await verifyProspectWebsite(
    prospect({ phone: "+16145550123" }),
    verificationDependencies((async () => htmlResponse(body)) as typeof fetch),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("prominent_business_name"), true);
  assert.equal(result.report.identitySignals?.includes("stored_website_host_match"), true);
});

test("a branded directory profile does not become affirmative first-party ownership evidence", async () => {
  const directoryRoot = `
    <!doctype html><html><head><title>Best Local Contractors</title></head><body>
      <h1>Find local contractors</h1><a href="/example-plumbing-toledo">Example Plumbing</a>
    </body></html>
  `;
  const profile = `
    <!doctype html><html><head><title>Example Plumbing in Toledo</title>
      <link rel="canonical" href="https://bestlocalcontractors.example/example-plumbing-toledo" />
      <meta name="viewport" content="width=device-width" />
    </head><body><nav><a href="/">Directory</a><a href="/contact">Contact</a></nav>
      <h1>Example Plumbing</h1><p>Plumbing services in Toledo.</p>
      <a href="tel:+14195550123">(419) 555-0123</a><form><button>Request information</button></form>
    </body></html>
  `;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (
    new URL(requestUrl(input)).pathname === "/example-plumbing-toledo"
      ? htmlResponse(profile)
      : htmlResponse(directoryRoot)
  )) as typeof fetch;
  const result = await verifyProspectWebsite(prospect({
    businessName: "Example Plumbing",
    website: "https://bestlocalcontractors.example/example-plumbing-toledo",
    phone: "+14195550123",
    city: "Toledo",
    trade: "Plumbing",
  }), verificationDependencies(fetchImpl));

  assert.equal(result.report.identitySignals?.includes("prominent_business_name"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("canonical_root_business_identity"), false);
  assert.equal(result.report.identitySignals?.includes("first_party_site_structure"), false);
});

test("an abbreviated first-party domain records strong root, structure, phone, and domain-email evidence", async () => {
  const homepage = `
    <!doctype html><html><head><title>Example Plumbing | Toledo</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav><h1>Example Plumbing</h1>
      <p>Plumbing service for Toledo homes.</p><a href="tel:+14195550123">(419) 555-0123</a>
      <form><button>Request service</button></form><img src="/truck.jpg" alt="Example Plumbing service truck" />
    </body></html>
  `;
  const contact = `<!doctype html><html><head><title>Contact Example Plumbing</title></head><body>
    <h1>Contact Example Plumbing</h1><a href="mailto:info@ep419.com">info@ep419.com</a></body></html>`;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (
    new URL(requestUrl(input)).pathname === "/contact" ? htmlResponse(contact) : htmlResponse(homepage)
  )) as typeof fetch;
  const result = await verifyProspectWebsite(prospect({
    businessName: "Example Plumbing",
    website: "https://ep419.com",
    phone: "+14195550123",
    city: "Toledo",
    trade: "Plumbing",
  }), verificationDependencies(fetchImpl));

  assert.equal(result.report.identitySignals?.includes("canonical_root_business_identity"), true);
  assert.equal(result.report.identitySignals?.includes("first_party_site_structure"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("business_domain_email_match"), true);
});

test("repeated transient failures remain temporary and never become a no-website prospect", async () => {
  const fetchImpl = (async () => htmlResponse("<html><title>Service unavailable</title><body>Service unavailable</body></html>", 503)) as typeof fetch;
  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "temporarily_unavailable");
  assert.equal(result.prospect.websiteStatus, "temporarily_unavailable");
  assert.equal(result.prospect.prospectType, "redesign");
  assert.equal(result.prospect.recommendedContactMethod, "needs_manual_contact_research");
  assert.ok(result.report.attempts.every((attempt) => attempt.failureCategory === "http_transient"));
});

test("bot-blocked pages remain crawler blocked without an access-control bypass", async () => {
  const fetchImpl = (async () => htmlResponse(
    "<html><title>Checking your browser</title><body>Verify you are human. Cloudflare Ray ID.</body></html>",
    403,
  )) as typeof fetch;
  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "crawler_blocked");
  assert.equal(result.prospect.recommendedContactMethod, "needs_manual_contact_research");
  assert.ok(result.report.attempts.every((attempt) => attempt.botBlocked));
  assert.ok(result.report.attempts.length <= 6);
});

test("independent 404 variants are required before a site becomes confirmed inactive", async () => {
  const fetchImpl = (async () => htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404)) as typeof fetch;
  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "confirmed_inactive");
  assert.equal(result.prospect.websiteStatus, "confirmed_inactive");
  assert.equal(result.prospect.prospectType, "no_website_social_only");
  assert.ok(new Set(result.report.attempts.map((attempt) => attempt.normalizedUrl)).size >= 2);
});

test("independent definite inactive pages are required before a site becomes confirmed broken", async () => {
  const fetchImpl = (async () => htmlResponse(`
    <!doctype html>
    <html>
      <head><title>Domain not configured</title></head>
      <body><main><h1>This hosting account has expired</h1><p>This domain is not configured.</p></main></body>
    </html>
  `)) as typeof fetch;
  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "confirmed_broken");
  assert.equal(result.report.confidence, "high");
  assert.ok(result.report.attempts.filter((attempt) => attempt.failureCategory === "empty_or_error_page").length >= 2);
  assert.equal(result.prospect.fitDisposition, "broken_or_inactive_website");
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.match(prospectWebsiteVerificationBlockReason(result.prospect, { requireStructuredEvidence: true }), /ownership|not eligible/i);
  assert.equal(result.prospect.email, "");
});

test("a successful canonical variant overrides an earlier 404", async () => {
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = requestUrl(input);
    if (new URL(url).hostname === "www.truecleanprowash.com") return htmlResponse(trueCleanHomepage);
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;
  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "usable");
  assert.ok(result.report.attempts.some((attempt) => attempt.httpStatus === 404));
  assert.ok(result.report.attempts.some((attempt) => attempt.httpStatus === 200));
});

test("an unstored website is inconclusive until owned-site absence has structured verification", async () => {
  const result = await verifyProspectWebsite(prospect({ website: "" }), verificationDependencies(
    (async () => {
      throw new Error("No request should run without a stored website.");
    }) as typeof fetch,
  ));

  assert.equal(result.report.status, "inconclusive");
  assert.equal(result.prospect.websiteStatus, "inconclusive");
  assert.equal(result.prospect.prospectType, "redesign");
  assert.equal(result.prospect.recommendedContactMethod, "needs_manual_contact_research");
});

test("bounded provider and official social evidence preserves a discovered no-website opportunity", async () => {
  const result = await verifyProspectWebsite(prospect({
    website: "",
    prospectType: "no_website_social_only",
    profileUrl: "https://www.facebook.com/truecleanprowash",
    activitySignals: [
      "discovery_source:google",
      "public_profile",
      discoveryIdentityEvidenceSignal({
        source: "google",
        businessName: "True Clean Prowash",
        website: "",
        profileUrl: "https://www.facebook.com/truecleanprowash",
        phone: "614-555-0123",
        address: "123 Clean Way, Columbus, OH",
        city: "Columbus",
        state: "OH",
        latitude: 39.9612,
        longitude: -82.9988,
      }),
      discoveryIdentityEvidenceSignal({
        source: "osm",
        businessName: "True Clean Prowash",
        website: "https://www.facebook.com/truecleanprowash",
        profileUrl: "https://www.facebook.com/truecleanprowash",
        phone: "+1 (614) 555-0123",
        address: "123 Clean Way Columbus Ohio",
        city: "Columbus",
        state: "OH",
        latitude: 39.9612,
        longitude: -82.9988,
      }),
    ],
    sourceConfidence: 42,
    contactEvidence: [{
      kind: "facebook",
      value: "https://www.facebook.com/truecleanprowash",
      sourceUrl: "https://www.facebook.com/truecleanprowash",
      extractionMethod: "visible_text",
      confidence: "high",
      domainMatchesBusiness: false,
      discoveredAt: fixedNow.toISOString(),
      sourceType: "official_social",
      firstParty: true,
      decisionReason: "The official profile was manually verified for this business.",
    }],
  }), verificationDependencies(
    (async () => {
      throw new Error("No website request should run for bounded provider absence evidence.");
    }) as typeof fetch,
  ));

  assert.equal(result.report.status, "no_owned_website");
  assert.equal(result.report.confidence, "high");
  assert.match(result.report.explanation, /google/i);
  assert.equal(result.prospect.prospectType, "no_website_social_only");
  assert.equal(result.prospect.websiteStatus, "no_owned_website");
});

test("a foreign canonical declaration cannot replace the verified owned website", async () => {
  const homepage = trueCleanHomepage.replace(
    "https://truecleanprowash.com/",
    "https://unrelated-example.net/",
  );
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (
    new URL(requestUrl(input)).pathname === "/"
      ? htmlResponse(homepage)
      : htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404)
  )) as typeof fetch;

  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.canonicalUrl, "https://truecleanprowash.com/");
});

test("a rich cross-domain redirect cannot replace the prospect website without matching business identity", async () => {
  const unrelatedHomepage = `
    <!doctype html><html>
      <head><title>Another Exterior Services Company</title><meta name="viewport" content="width=device-width" /></head>
      <body>
        <nav>Home Services About Contact</nav>
        <h1>Another Exterior Services Company</h1>
        <p>Residential pressure washing, exterior cleaning, roof cleaning, and concrete cleaning for local homeowners.</p>
        <p>Browse our services, request an estimate, or contact our team for more information about your property.</p>
        <p>Our directory also includes a listing for True Clean Prowash.</p>
        <a href="tel:+14195550199">Call our office</a>
        <a href="mailto:info@unrelated-example.net">info@unrelated-example.net</a>
        <form><input name="email" /><button>Request a quote</button></form>
      </body>
    </html>
  `;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    if (url.hostname.endsWith("truecleanprowash.com")) {
      return htmlResponse("", 302, { location: "https://unrelated-example.net/" });
    }
    return htmlResponse(unrelatedHomepage);
  }) as typeof fetch;

  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.status, "inconclusive");
  assert.ok(result.report.attempts.every((attempt) => attempt.failureCategory === "redirect"));
  assert.equal(result.prospect.website, "https://truecleanprowash.com");
  assert.equal(result.prospect.email, "");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
});

test("robots policy is evaluated for each contact path rather than inherited from the homepage", async () => {
  const robotsPaths: string[] = [];
  const fetchedPaths: string[] = [];
  const dependencies = verificationDependencies((async (input: Parameters<typeof fetch>[0]) => {
    const pathname = new URL(requestUrl(input)).pathname;
    fetchedPaths.push(pathname);
    if (pathname === "/") return htmlResponse(trueCleanHomepage);
    if (pathname === "/contact") return htmlResponse(trueCleanContact);
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch);
  dependencies.robotsPolicy = async (url) => {
    robotsPaths.push(url.pathname);
    return url.pathname !== "/contact";
  };

  const result = await verifyProspectWebsite(prospect(), dependencies);

  assert.equal(result.report.status, "usable");
  assert.ok(robotsPaths.includes("/"));
  assert.ok(robotsPaths.includes("/contact"));
  assert.equal(fetchedPaths.filter((path) => path === "/contact").length, 0);
  assert.equal(result.prospect.email, "");
});

test("a usable page without business-identity evidence remains blocked from provider dispatch", async () => {
  const genericHtml = `
    <html>
      <head><title>Residential Exterior Services</title><meta name="viewport" content="width=device-width" /></head>
      <body>
        <header><nav>Home Services About Contact</nav></header>
        <main>
          <h1>Exterior cleaning for local homeowners</h1>
          <p>Residential service, repair, cleaning, and estimate information for siding and concrete projects.</p>
          <p>Request service using the contact form or call the office for project details and scheduling.</p>
          <a href="tel:+16145550123">Call</a>
          <form><input name="email" /><textarea name="message"></textarea><button>Request estimate</button></form>
          <img src="/service.jpg" alt="Exterior service" />
        </main>
      </body>
    </html>
  `;
  const result = await verifyProspectWebsite(
    prospect(),
    verificationDependencies((async () => htmlResponse(genericHtml)) as typeof fetch),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.usableSignals.includes("business name"), false);
  assert.match(
    prospectWebsiteVerificationBlockReason(result.prospect, { requireStructuredEvidence: true }),
    /did not confirm that the site belongs/i,
  );
});

test("contact discovery prefers grounded business mailboxes and filters unsafe candidates", () => {
  const result = extractContactDiscoveryFromPages("https://truecleanprowash.com", [
    {
      url: "https://truecleanprowash.com/contact",
      html: `
        <p>test@example.com noreply@truecleanprowash.com tracker@analytics-vendor.com</p>
        <p>design@unrelated-agency.com</p>
        <script>const asset = "icon@email.svg"; const vendor = "support@sitebuilder.example";</script>
        <a href="mailto:info@truecleanprowash.com">Email True Clean</a>
        <a href="tel:+16145550123">Call</a>
        <form><input name="email" /><textarea name="message"></textarea><button>Request estimate</button></form>
        <a href="https://facebook.com/truecleanprowash">Facebook</a>
      `,
    },
    {
      url: "https://truecleanprowash.com/about",
      html: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","email":"office@truecleanprowash.com"}</script>`,
    },
  ], { businessName: "True Clean Prowash", website: "https://truecleanprowash.com" });

  assert.equal(result.email, "info@truecleanprowash.com");
  assert.equal(result.phone, "+16145550123");
  assert.equal(result.contactFormDetected || result.quoteFormDetected, true);
  assert.equal(result.facebookUrl, "https://facebook.com/truecleanprowash");
  assert.equal(result.contactEvidence.some((item) => item.value.includes("example.com")), false);
  assert.equal(result.contactEvidence.some((item) => /noreply|sitebuilder|email\.svg/i.test(item.value)), false);
  const vendor = result.contactEvidence.find((item) => item.value === "tracker@analytics-vendor.com");
  assert.equal(vendor?.decision, "rejected");
  const unrelated = result.contactEvidence.find((item) => item.value === "design@unrelated-agency.com");
  assert.equal(unrelated?.decision, "manual_review_required");
  assert.equal(result.contactEvidence.some((item) => /sitebuilder|email\.svg/i.test(item.value)), false);
});

test("stale contact evidence is not re-verified unless the current crawl observes it", async () => {
  const stale = prospect({
    email: "info@truecleanprowash.com",
    contactEvidence: [{
      kind: "email",
      value: "info@truecleanprowash.com",
      sourceUrl: "https://truecleanprowash.com/contact",
      extractionMethod: "mailto",
      confidence: "high",
      domainMatchesBusiness: true,
      discoveredAt: "2026-01-01T12:00:00.000Z",
    }],
  });
  const result = await verifyProspectWebsite(stale, verificationDependencies(async () => htmlResponse(`
    <!doctype html>
    <html>
      <head><title>True Clean Prowash Exterior Cleaning</title><meta name="viewport" content="width=device-width"></head>
      <body><nav>Services About</nav><main><h1>True Clean Prowash</h1><p>Residential pressure washing and exterior cleaning in Columbus, Ohio.</p></main></body>
    </html>
  `)));
  const evidence = result.prospect.contactEvidence.find((item) => item.kind === "email");

  assert.equal(result.report.status, "usable");
  assert.equal(evidence?.extractionMethod, "existing_provider");
  assert.equal(evidence?.confidence, "low");
  assert.equal(prospectVerifiedEmailEvidence(result.prospect), null);
});
