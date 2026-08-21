import assert from "node:assert/strict";
import test from "node:test";
import {
  createProspect,
  generateEmailReviewOutreach,
  generateOutreach,
  prospectVerifiedEmailEvidence,
  prospectWebsiteVerificationBlockReason,
} from "../lib/prospect-engine";
import {
  outreachObservationForProspect,
  prospectQualificationBlockReasons,
  websiteFitAllowsAutonomousOutreach,
} from "../lib/prospect-qualification";
import { prospectEmailReviewEligibility, prospectRoutingDecision } from "../lib/prospect-review-routing";
import {
  extractContactDiscoveryFromPages,
  verifyProspectWebsite,
  type WebsiteVerificationDependencies,
} from "../lib/site-analysis";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import {
  assessOpportunity,
  evaluateOutreachEmailQuality,
  topProspectRejectionReason,
  topProspectResultBucket,
} from "../lib/top-prospects";

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

const magicPaintingHomepage = `
  <!doctype html>
  <html>
    <head>
      <title>Magic Painting | Nashville House Painters</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href="https://www.magicpainting.net/" />
    </head>
    <body>
      <header><nav><a href="/">Home</a><a href="/services/">Services</a><a href="/about/">About</a><a href="/contact/">Contact</a></nav></header>
      <main>
        <h1>Magic Painting</h1>
        <p>Interior and exterior painting for homes around Nashville, Brentwood, and Franklin.</p>
        <p>Our painters help homeowners plan residential painting projects and request a clear estimate.</p>
        <a href="tel:+16155061172">Call (615) 506-1172</a>
        <img src="/painting-project.jpg" alt="Magic Painting residential painting project" />
        <a href="https://www.facebook.com/nashvillemagicpaintingllc/">Facebook</a>
        <a href="https://www.instagram.com/magicpainting615_/">Instagram</a>
      </main>
    </body>
  </html>
`;

const magicPaintingContact = `
  <!doctype html>
  <html>
    <head><title>Contact Magic Painting</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
    <body>
      <nav><a href="/">Home</a><a href="/contact/">Contact</a></nav>
      <h1>Contact Magic Painting</h1>
      <p>Send the Magic Painting team a message about a project in Nashville, Brentwood, or Franklin.</p>
      <a href="tel:+16155061172">(615) 506-1172</a>
      <a href="alex@magicpaintingtn.com">alex@magicpaintingtn.com</a>
      <form action="/contact/">
        <label>Name <input name="name" /></label>
        <label>Email <input name="email" type="email" /></label>
        <label>Phone <input name="phone" type="tel" /></label>
        <label>Message <textarea name="message"></textarea></label>
        <button>Contact us</button>
      </form>
      <iframe src="https://magicpaintingllc.dripjobs.com/?ls=MagicPainting.net" title="Request a Quote"></iframe>
      <a href="https://www.facebook.com/nashvillemagicpaintingllc/">Facebook</a>
      <a href="https://www.instagram.com/magicpainting615_/">Instagram</a>
    </body>
  </html>
`;

function magicPaintingFetch(
  contactEmail = "alex@magicpaintingtn.com",
  publishedPhone = "+16155061172",
): typeof fetch {
  const homepage = magicPaintingHomepage
    .replaceAll("+16155061172", publishedPhone)
    .replaceAll("(615) 506-1172", publishedPhone);
  const contact = magicPaintingContact
    .replaceAll("alex@magicpaintingtn.com", contactEmail)
    .replaceAll("+16155061172", publishedPhone)
    .replaceAll("(615) 506-1172", publishedPhone);
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === "www.magicpainting.net") {
      return new Response(null, {
        status: 301,
        headers: { location: `https://magicpainting.net${url.pathname}${url.search}` },
      });
    }
    if (url.hostname !== "magicpainting.net") return htmlResponse("Not found", 404);
    if (url.pathname === "/") return htmlResponse(homepage);
    if (url.pathname === "/contact/") {
      return htmlResponse(contact);
    }
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;
}

function magicPaintingProspect() {
  return prospect({
    businessName: "Magic Painting",
    website: "https://www.magicpainting.net/",
    phone: "+16155061172",
    city: "Nashville",
    state: "TN",
    trade: "Painting",
    serviceArea: "Nashville, TN",
  });
}

function maxForceProspect(overrides: Partial<Parameters<typeof createProspect>[0]> = {}) {
  return prospect({
    businessName: "MaxForce Roofing and Siding LLC",
    website: "https://www.maxforceroofing.com/",
    phone: "+1-614-467-8910",
    email: "",
    city: "Columbus",
    state: "OH",
    trade: "Roofing",
    serviceArea: "Columbus, OH",
    ...overrides,
  });
}

function maxForceFetch(
  branding = "MaxForce Roofing and Siding",
  publishedPhone = "614-467-8910",
): typeof fetch {
  const homepage = `
    <!doctype html><html><head>
      <title>${branding} | Columbus Roofing</title>
      <meta property="og:site_name" content="${branding}" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href="https://maxforceroofing.com/" />
    </head><body>
      <header><nav><a href="/">Home</a><a href="/services/">Services</a><a href="/contact-us/">Contact Us</a></nav></header>
      <main><h1>${branding}</h1>
        <p>Roofing and siding services for homeowners in Columbus and surrounding central Ohio communities.</p>
        <p>Learn about roof replacement, roof repair, siding work, and how to request a project quote.</p>
        <a href="tel:+1${publishedPhone.replace(/\D/g, "")}">${publishedPhone}</a>
        <img src="/roofing-project.jpg" alt="Residential roofing project in Columbus" />
        <a href="https://facebook.com/maxforceroofing">Facebook</a>
      </main>
    </body></html>`;
  const contact = `
    <!doctype html><html><head><title>Contact Us | ${branding}</title></head><body>
      <nav><a href="/">Home</a><a href="/contact-us/">Contact Us</a></nav>
      <h1>${branding}</h1><p>Contact the Columbus roofing team about your property.</p>
      <a href="tel:+1${publishedPhone.replace(/\D/g, "")}">${publishedPhone}</a>
      <a href="mailto:info@maxforceroofing.com">info@maxforceroofing.com</a>
      <form action="/contact-us/"><input name="name" /><input name="email" /><textarea name="message"></textarea><button>Request a quote</button></form>
      <a href="https://facebook.com/maxforceroofing">Facebook</a>
    </body></html>`;
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === "www.maxforceroofing.com") {
      return new Response(null, { status: 301, headers: { location: `https://maxforceroofing.com${url.pathname}${url.search}` } });
    }
    if (url.hostname !== "maxforceroofing.com") return htmlResponse("Not found", 404);
    if (url.pathname === "/") return htmlResponse(homepage);
    if (url.pathname === "/contact-us/") return htmlResponse(contact);
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;
}

function bravoProspect(overrides: Partial<Parameters<typeof createProspect>[0]> = {}) {
  return prospect({
    businessName: "Bravo Concrete Contractors Indianapolis",
    website: "https://concretecontractorindianapolis.com/",
    phone: "+1 765-345-4141",
    email: "",
    city: "Indianapolis",
    state: "IN",
    trade: "Concrete",
    serviceArea: "Indianapolis, IN",
    ...overrides,
  });
}

function bravoFetch(
  structuredName = "Bravo Concrete Contractors Indianapolis Inc",
  publishedPhone = "765-345-4141",
): typeof fetch {
  const structuredIdentity = (withEmail = false) => `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: structuredName,
    url: "https://concretecontractorindianapolis.com/",
    telephone: publishedPhone,
    ...(withEmail ? { email: "info@concretecontractorindianapolis.com" } : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Indianapolis",
      addressRegion: "IN",
    },
  })}</script>`;
  const homepage = `
    <!doctype html><html><head>
      <title>Concrete Contractors Indianapolis | Free Estimates</title>
      <meta property="og:site_name" content="Concrete Contractor Indianapolis" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="canonical" href="https://concretecontractorindianapolis.com/" />
      ${structuredIdentity()}
    </head><body>
      <header><nav><a href="/">Home</a><a href="/about-us/">About Us</a><a href="/contact-us/">Contact Us</a></nav></header>
      <main><h1>Best Concrete Contractors In Indianapolis</h1>
        <p>Concrete installation and repair services for homes and businesses throughout Indianapolis.</p>
        <p>Review project options, service information, and contact details before requesting an estimate.</p>
        <a href="tel:+1${publishedPhone.replace(/\D/g, "")}">${publishedPhone}</a>
        <img src="/concrete-project.jpg" alt="Concrete project in Indianapolis" />
        <a href="https://facebook.com/bravoconcreteindy">Facebook</a>
      </main>
    </body></html>`;
  const contact = `
    <!doctype html><html><head><title>Contact</title><meta property="og:site_name" content="Concrete Contractor Indianapolis" />${structuredIdentity(true)}</head><body>
      <nav><a href="/">Home</a><a href="/contact-us/">Contact Us</a></nav>
      <h1>Contact Us</h1><p>Request concrete project information in Indianapolis.</p>
      <a href="tel:+1${publishedPhone.replace(/\D/g, "")}">${publishedPhone}</a>
      <p>info@concretecontractorindianapolis.com</p>
      <form action="/contact-us/"><input name="name" /><input name="email" /><textarea name="message"></textarea><button>Request an estimate</button></form>
    </body></html>`;
  const about = `
    <!doctype html><html><head><title>About Us</title><meta property="og:site_name" content="Concrete Contractor Indianapolis" />${structuredIdentity()}</head><body>
      <nav><a href="/">Home</a><a href="/about-us/">About Us</a></nav><h1>About Us</h1>
      <p>Concrete project information for Indianapolis property owners.</p>
    </body></html>`;
  return (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(requestUrl(input));
    if (url.hostname !== "concretecontractorindianapolis.com") return htmlResponse("Not found", 404);
    if (url.pathname === "/") return htmlResponse(homepage);
    if (url.pathname === "/contact-us/") return htmlResponse(contact);
    if (url.pathname === "/about-us/") return htmlResponse(about);
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;
}

const sparseOwnedHomepage = `
  <!doctype html>
  <html>
    <head>
      <title>True Clean Prowash</title>
      <link rel="canonical" href="https://truecleanprowash.com/" />
    </head>
    <body>
      <h1>True Clean Prowash</h1>
      <p>${"Local company information for Columbus property owners and nearby communities. ".repeat(8)}</p>
      <a href="/contact" aria-label="Details"></a>
    </body>
  </html>
`;

function sparseOwnedWebsiteFetch(contactMarkup: string): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0]) => {
    const pathname = new URL(requestUrl(input)).pathname;
    if (pathname === "/") return htmlResponse(sparseOwnedHomepage);
    if (pathname === "/contact") {
      return htmlResponse(`<html><head><title>True Clean Prowash</title></head><body><h1>True Clean Prowash</h1>${contactMarkup}</body></html>`);
    }
    return htmlResponse("<html><title>Not found</title><body>Not found</body></html>", 404);
  }) as typeof fetch;
}

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

test("Magic Painting www canonical retains verified contact evidence from the bare-domain redirect", async () => {
  const result = await verifyProspectWebsite(
    magicPaintingProspect(),
    verificationDependencies(magicPaintingFetch()),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.canonicalUrl, "https://magicpainting.net/");
  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), false);
  assert.equal(result.prospect.contactPageUrl, "https://magicpainting.net/contact/");
  assert.equal(result.prospect.contactFormDetected, true);
  assert.equal(result.prospect.contactFormUrl, "https://magicpainting.net/contact/");
  assert.equal(result.prospect.quoteFormDetected, true);
  assert.equal(result.prospect.quoteFormUrl, "https://magicpainting.net/contact/");
  assert.equal(result.prospect.facebookUrl, "https://www.facebook.com/nashvillemagicpaintingllc");
  assert.equal(result.prospect.instagramUrl, "https://www.instagram.com/magicpainting615_");
  const emailEvidence = result.prospect.contactEvidence.find((item) => item.value === "alex@magicpaintingtn.com");
  assert.equal(emailEvidence?.sourceUrl, "https://magicpainting.net/contact/");
  assert.equal(emailEvidence?.extractionMethod, "visible_text");
  assert.equal(emailEvidence?.decision, "manual_review_required");
  assert.equal(result.prospect.email, "");
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
  assert.equal(result.prospect.outreach, undefined);
  assert.equal(result.prospect.activities.some((item) => /sent/i.test(item.label) && !/nothing was sent/i.test(item.label)), false);
});

test("MaxForce legal-name suffix omission retains first-party ownership, phone, contact, and fit safety", async () => {
  const result = await verifyProspectWebsite(
    maxForceProspect(),
    verificationDependencies(maxForceFetch()),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.canonicalUrl, "https://maxforceroofing.com/");
  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.report.identitySignals?.includes("prominent_business_name"), true);
  assert.equal(result.report.identitySignals?.includes("canonical_root_business_identity"), true);
  assert.equal(result.report.identitySignals?.includes("first_party_site_structure"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), false);
  assert.equal(result.prospect.contactPageUrl?.startsWith("https://maxforceroofing.com/"), true);
  assert.equal(result.prospect.contactFormDetected || result.prospect.quoteFormDetected, true);
  assert.equal(result.prospect.quoteFormDetected, true);
  assert.equal(result.prospect.facebookUrl, "https://facebook.com/maxforceroofing");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(prospectEmailReviewEligibility(result.prospect, fixedNow).eligible, false);
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
  assert.equal(result.prospect.outreach, undefined);
  assert.equal(result.prospect.activities.some((item) => /sent/i.test(item.label) && !/nothing was sent/i.test(item.label)), false);
});

test("legal entity suffix variants match only the same substantive first-party brand", async () => {
  for (const suffix of ["LLC", "Inc.", "Incorporated", "Corp.", "Corporation", "Co.", "Company"]) {
    const result = await verifyProspectWebsite(
      maxForceProspect({ businessName: `Northstar Exteriors ${suffix}` }),
      verificationDependencies(maxForceFetch("Northstar Exteriors")),
    );
    assert.equal(result.report.ownershipDecision, "owned", suffix);
    assert.equal(result.report.identitySignals?.includes("public_phone_match"), true, suffix);
  }

  const differentCore = await verifyProspectWebsite(
    maxForceProspect({ businessName: "ABC Construction LLC" }),
    verificationDependencies(maxForceFetch("ABC Roofing")),
  );
  assert.equal(differentCore.report.ownershipDecision, "uncertain");

  const extendedName = await verifyProspectWebsite(
    maxForceProspect({ businessName: "Best Roofing LLC" }),
    verificationDependencies(maxForceFetch("Best Roofing of Texas")),
  );
  assert.equal(extendedName.report.ownershipDecision, "uncertain");

  const genericCore = await verifyProspectWebsite(
    maxForceProspect({ businessName: "Roofing LLC" }),
    verificationDependencies(maxForceFetch("Roofing")),
  );
  assert.equal(genericCore.report.ownershipDecision, "uncertain");
});

test("legal suffix equivalence never overrides a complete public-phone conflict", async () => {
  const result = await verifyProspectWebsite(
    maxForceProspect(),
    verificationDependencies(maxForceFetch("MaxForce Roofing and Siding", "713-555-0199")),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.identitySignals?.includes("prominent_business_name"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
  assert.equal(result.prospect.outreach, undefined);
});

test("Bravo first-party LocalBusiness identity establishes ownership despite generic SEO headings", async () => {
  const result = await verifyProspectWebsite(
    bravoProspect(),
    verificationDependencies(bravoFetch()),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.canonicalUrl, "https://concretecontractorindianapolis.com/");
  assert.equal(result.report.ownershipDecision, "owned");
  assert.deepEqual(new Set(result.report.identitySignals), new Set([
    "prominent_business_name",
    "stored_website_host_match",
    "market_location_match",
    "public_phone_match",
    "canonical_root_business_identity",
    "first_party_site_structure",
    "business_domain_email_match",
  ]));
  const emailEvidence = result.prospect.contactEvidence.find((item) => item.value === "info@concretecontractorindianapolis.com");
  assert.equal(emailEvidence?.sourceUrl, "https://concretecontractorindianapolis.com/contact-us/");
  assert.equal(emailEvidence?.extractionMethod, "json_ld");
  assert.equal(emailEvidence?.decision, "autonomous_eligible");
  assert.equal(result.prospect.contactFormDetected || result.prospect.quoteFormDetected, true);
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(prospectEmailReviewEligibility(result.prospect, fixedNow).eligible, false);
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
  assert.equal(result.prospect.outreach, undefined);
  assert.equal(result.prospect.activities.some((item) => /sent/i.test(item.label) && !/nothing was sent/i.test(item.label)), false);
});

test("first-party structured identity cannot promote a different core brand through phone and domain evidence", async () => {
  const result = await verifyProspectWebsite(
    bravoProspect(),
    verificationDependencies(bravoFetch("Indianapolis Concrete Specialists Inc")),
  );

  assert.equal(result.report.identitySignals?.includes("stored_website_host_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), true);
  assert.equal(result.report.identitySignals?.includes("business_domain_email_match"), true);
  assert.equal(result.report.identitySignals?.includes("prominent_business_name"), false);
  assert.equal(result.report.identitySignals?.includes("canonical_root_business_identity"), false);
  assert.equal(result.report.identitySignals?.includes("first_party_site_structure"), false);
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(result.prospect.outreach, undefined);
});

test("structured first-party identity never overrides a complete public-phone conflict", async () => {
  const result = await verifyProspectWebsite(
    bravoProspect(),
    verificationDependencies(bravoFetch("Bravo Concrete Contractors Indianapolis Inc", "713-555-0199")),
  );

  assert.equal(result.report.identitySignals?.includes("prominent_business_name"), true);
  assert.equal(result.report.identitySignals?.includes("business_domain_email_match"), true);
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
  assert.equal(result.prospect.outreach, undefined);
});

test("inconclusive owned-site review routing still requires every PR91 contact and safety gate", async () => {
  const verified = await verifyProspectWebsite(
    magicPaintingProspect(),
    verificationDependencies(magicPaintingFetch("info@magicpainting.net")),
  );
  const observation = {
    kind: "quote_path" as const,
    statement: "I noticed the quote request is separated from the main service information.",
    rebuildSentence: "I can rebuild your current website with a more modern design that places the quote request beside the main services, while also making your services, contact information, and quote request easier for customers to find.",
    evidence: ["A bounded rendered review confirmed the quote request is separated from the service content."],
    demoChecklist: ["Show the quote request beside the primary services"],
  };
  const reviewCandidate = {
    ...verified.prospect,
    fitDisposition: "inconclusive_requires_review" as const,
    websiteVerification: {
      ...verified.report,
      fit: {
        disposition: "inconclusive_requires_review" as const,
        reason: "Human review is required before describing one bounded redesign issue.",
        supportingEvidence: observation.evidence,
        confidence: "high" as const,
        analysisOrigin: "rendered_review" as const,
        evaluatedAt: fixedNow.toISOString(),
        observation,
      },
    },
  };

  assert.equal(prospectEmailReviewEligibility(reviewCandidate, fixedNow).eligible, true);
  assert.equal(prospectRoutingDecision(reviewCandidate, fixedNow).sending, "Review Only");
  assert.equal(websiteFitAllowsAutonomousOutreach(reviewCandidate), false);
  assert.equal(prospectEmailReviewEligibility({ ...reviewCandidate, status: "Contacted" }, fixedNow).eligible, false);
  assert.equal(prospectEmailReviewEligibility({ ...reviewCandidate, notes: ["Suppressed by operator."] }, fixedNow).eligible, false);
  assert.equal(reviewCandidate.outreach, undefined);
});

test("Magic Painting explicit public-phone conflict still vetoes first-party ownership", async () => {
  const result = await verifyProspectWebsite(
    magicPaintingProspect(),
    verificationDependencies(magicPaintingFetch("info@magicpainting.net", "+17135550123")),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.identitySignals?.includes("public_phone_match"), false);
  assert.equal(result.report.identitySignals?.includes("public_phone_conflict"), true);
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(prospectEmailReviewEligibility(result.prospect, fixedNow).eligible, false);
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
  assert.equal(result.prospect.outreach, undefined);
});

test("verified owned usable HTML with multiple objective structural deficiencies becomes a grounded weak-site opportunity", async () => {
  const result = await verifyProspectWebsite(
    prospect({ phone: "" }),
    verificationDependencies(sparseOwnedWebsiteFetch("<a href='mailto:info@truecleanprowash.com'>info@truecleanprowash.com</a>")),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "clearly_weak_or_outdated_website");
  assert.equal(result.report.fit?.analysisOrigin, "automated_html");
  assert.equal(result.report.fit?.observation?.kind, "service_clarity");
  assert.match(result.report.fit?.observation?.statement ?? "", /couldn't find clear service information/i);
  assert.match(result.report.fit?.observation?.rebuildSentence ?? "", /rebuild your current website with clear service information/i);
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), true);
  assert.ok(prospectVerifiedEmailEvidence(result.prospect));
  assert.equal(
    topProspectRejectionReason(result.prospect, assessOpportunity(result.prospect), "growth", "written_only"),
    null,
  );

  const outreach = generateOutreach(result.prospect, "", {
    NODE_ENV: "test",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  });
  assert.equal(outreach.approved, false);
  assert.match(outreach.concise, /couldn't find clear service information/i);
  assert.match(outreach.concise, /rebuild your current website with clear service information/i);
  assert.doesNotMatch(outreach.concise, /looks? (?:old|outdated)|old design|outdated design/i);
  assert.equal(result.prospect.outreach, undefined);
});

test("the same grounded weak-site fit remains blocked from written outreach when only a phone route is available", async () => {
  const result = await verifyProspectWebsite(
    prospect({ phone: "+16145550123" }),
    verificationDependencies(sparseOwnedWebsiteFetch("<a href='tel:+16145550123'>Call (614) 555-0123</a>")),
  );

  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "clearly_weak_or_outdated_website");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), true);
  assert.equal(prospectVerifiedEmailEvidence(result.prospect), null);
  assert.equal(
    topProspectRejectionReason(result.prospect, assessOpportunity(result.prospect), "growth", "written_only"),
    "Phone-only / written outreach blocked",
  );
  assert.equal(result.prospect.outreach, undefined);
});

test("one minor missing structural signal leaves a verified owned website adequate", async () => {
  const noImageHomepage = trueCleanHomepage.replace(
    '<img src="/crew-cleaning-siding.jpg" alt="Exterior cleaning crew washing residential siding" />',
    "",
  );
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (
    new URL(requestUrl(input)).pathname === "/" ? htmlResponse(noImageHomepage) : htmlResponse(trueCleanContact)
  )) as typeof fetch;
  const result = await verifyProspectWebsite(prospect(), verificationDependencies(fetchImpl));

  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "adequate_existing_website");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(outreachObservationForProspect(result.prospect), null);
  assert.equal(
    topProspectRejectionReason(result.prospect, assessOpportunity(result.prospect), "growth", "written_only"),
    "Confirmed usable website / not a fit",
  );
});

test("automated inconclusive owned-site verification creates a safe review-only Top Prospect", async () => {
  const reviewNow = new Date();
  const homepage = `<!doctype html><html><head><title>True Clean Prowash</title><meta name="viewport" content="width=device-width"></head><body><header><nav><a href="/contact">Contact</a></nav></header><h1>True Clean Prowash</h1><p>${"Local company information for Columbus property owners. ".repeat(8)}</p></body></html>`;
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (
    new URL(requestUrl(input)).pathname === "/"
      ? htmlResponse(homepage)
      : htmlResponse("<html><head><title>True Clean Prowash</title></head><body><h1>True Clean Prowash</h1><a href='mailto:info@truecleanprowash.com'>Email</a></body></html>")
  )) as typeof fetch;
  const result = await verifyProspectWebsite(prospect({ phone: "" }), {
    ...verificationDependencies(fetchImpl),
    now: () => reviewNow,
  });

  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
  assert.equal(result.report.fit?.analysisOrigin, "automated_html");
  assert.equal(result.report.fit?.observation?.kind, "general_rebuild");
  assert.match(result.report.fit?.observation?.statement ?? "", /had a couple of ideas/i);
  assert.doesNotMatch(result.report.fit?.observation?.statement ?? "", /old|outdated|bad|losing leads/i);

  const review = prospectEmailReviewEligibility(result.prospect, reviewNow);
  assert.equal(review.eligible, true);
  assert.ok(review.reviewSignals.length > 0);
  assert.equal(prospectRoutingDecision(result.prospect, reviewNow).sending, "Review Only");
  assert.ok(prospectQualificationBlockReasons(result.prospect, { now: reviewNow }).length > 0);
  assert.equal(
    topProspectRejectionReason(result.prospect, assessOpportunity(result.prospect), "growth", "written_only"),
    "Website verification required",
  );

  const environment = {
    NODE_ENV: "test",
    OUTREACH_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  } as NodeJS.ProcessEnv;
  const outreach = generateEmailReviewOutreach(result.prospect, environment);
  const prepared = { ...result.prospect, outreach };
  const quality = evaluateOutreachEmailQuality(prepared, "", "written_only", environment);
  assert.equal(outreach.approved, false);
  assert.match(outreach.concise, /Would you be interested in seeing what that could look like\?/i);
  assert.match(outreach.concise, /rebuild your current website with a modern design/i);
  assert.doesNotMatch(outreach.concise, /\b(?:old|outdated|bad|losing leads|customers cannot)\b/i);
  assert.equal(quality.ready, true);
  assert.equal(topProspectResultBucket({
    selected: false,
    rejectionReason: "Website verification required",
    packageStatus: "READY_FOR_REVIEW",
    emailQuality: quality,
    prospect: prepared,
  }), "reviewable_lower_priority");
  assert.equal(result.prospect.outreach, undefined);

  for (const blocked of [
    { ...result.prospect, status: "Contacted" as const },
    { ...result.prospect, notes: ["Suppressed by operator."] },
    { ...result.prospect, notes: ["Duplicate record."] },
    { ...result.prospect, email: "", contactEvidence: [] },
    {
      ...result.prospect,
      websiteVerification: {
        ...result.report,
        checkedAt: new Date(reviewNow.getTime() - 8 * 24 * 60 * 60 * 1_000).toISOString(),
        fit: { ...result.report.fit!, evaluatedAt: new Date(reviewNow.getTime() - 8 * 24 * 60 * 60 * 1_000).toISOString() },
      },
    },
  ]) {
    assert.equal(prospectEmailReviewEligibility(blocked, reviewNow).eligible, false);
    assert.equal(prospectRoutingDecision(blocked, reviewNow).sending, "Blocked");
  }
});

test("inconclusive owned-site HTML with no bounded review signal stays out of Human Email Review", async () => {
  const homepage = `<!doctype html><html lang="en"><head><title>True Clean Prowash</title><meta name="description" content="Exterior cleaning in Columbus"></head><body><header><nav><a href="/contact">Contact</a></nav></header><h1>True Clean Prowash</h1><p>${"Pressure washing services, repair, installation, and maintenance for Columbus property owners. Licensed and insured with a warranty and guarantee. Projects, portfolio, gallery, and recent work. Request a quote, get an estimate, schedule, or book service. ".repeat(3)}</p><a href="mailto:info@truecleanprowash.com">Email</a><form><button>Request a quote</button></form></body></html>`;
  const contact = "<html><head><title>True Clean Prowash</title></head><body><h1>True Clean Prowash</h1><a href='mailto:info@truecleanprowash.com'>Email</a></body></html>";
  const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => (
    new URL(requestUrl(input)).pathname === "/" ? htmlResponse(homepage) : htmlResponse(contact)
  )) as typeof fetch;
  const result = await verifyProspectWebsite(prospect({ phone: "" }), verificationDependencies(fetchImpl));

  assert.equal(result.report.ownershipDecision, "owned");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(result.report.fit?.observation, undefined);
  assert.equal(prospectEmailReviewEligibility(result.prospect, fixedNow).eligible, false);
  assert.equal(prospectRoutingDecision(result.prospect, fixedNow).sending, "Blocked");
});

test("weak usable HTML with uncertain ownership remains inconclusive", async () => {
  const result = await verifyProspectWebsite(
    prospect({ phone: "", website: "https://unverified-example.com" }),
    verificationDependencies((async () => htmlResponse(sparseOwnedHomepage.replaceAll("truecleanprowash.com", "unverified-example.com"))) as typeof fetch),
  );

  assert.equal(result.report.status, "usable");
  assert.equal(result.report.ownershipDecision, "uncertain");
  assert.equal(result.prospect.fitDisposition, "inconclusive_requires_review");
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
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
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
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
  assert.equal(websiteFitAllowsAutonomousOutreach(result.prospect), false);
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
        observedAt: fixedNow.toISOString(),
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
        observedAt: fixedNow.toISOString(),
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

test("contact discovery does not mistake an unlabeled embedded map for a form", () => {
  const result = extractContactDiscoveryFromPages("https://magicpainting.net", [{
    url: "https://magicpainting.net/contact/",
    html: `
      <h1>Contact Magic Painting</h1>
      <p>Nashville, Tennessee</p>
      <iframe src="https://maps.google.com/maps?q=Nashville&output=embed" title="Magic Painting location"></iframe>
    `,
  }], { businessName: "Magic Painting", website: "https://magicpainting.net" });

  assert.equal(result.contactPageUrl, "https://magicpainting.net/contact/");
  assert.equal(result.contactFormDetected, false);
  assert.equal(result.quoteFormDetected, false);
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
