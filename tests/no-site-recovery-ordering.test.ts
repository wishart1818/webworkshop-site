import assert from "node:assert/strict";
import test from "node:test";
import { createProspect, type Prospect } from "../lib/prospect-engine";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import { verifyProspectWebsiteWithSecondPass } from "../lib/prospect-verification-resolution";

const now = new Date("2026-08-11T18:00:00.000Z");
const phone = "260-446-2693";
const address = "7418 Hessen Cassel Rd, Fort Wayne, IN 46816";
const recoveredWebsite = "https://mjrconcretellc.example/";

function prospect(): Prospect {
  return {
    ...createProspect({
      businessName: "MJR CONCRETE LLC",
      website: "",
      phone,
      email: "",
      city: "Fort Wayne",
      state: "IN",
      trade: "Concrete",
      serviceArea: "Fort Wayne, IN",
      sizeIndicator: "Growing",
      status: "New",
      prospectType: "no_website_social_only",
    }),
    address,
    prospectType: "no_website_social_only",
    createdAt: "2026-08-11T17:55:00.000Z",
    activitySignals: [discoveryIdentityEvidenceSignal({
      source: "google",
      businessName: "MJR Concrete",
      website: "",
      profileUrl: "https://www.google.com/maps/place/MJR+Concrete+LLC",
      phone,
      address,
      city: "Fort Wayne",
      state: "IN",
      latitude: 41.0123,
      longitude: -85.0912,
    })],
  };
}

function businessHtml(pathname: string) {
  const title = pathname === "/contact" ? "Contact MJR Concrete" : "MJR Concrete | Fort Wayne Concrete";
  return `<!doctype html><html><head><title>${title}</title><meta name="viewport" content="width=device-width" /></head>
    <body><nav><a href="/services">Services</a><a href="/contact">Contact</a></nav>
    <h1>MJR Concrete</h1><p>MJR Concrete provides concrete installation, driveways, patios, flatwork and repair services for Fort Wayne homes and businesses.</p>
    <a href="tel:+12604462693">(260) 446-2693</a><form><button>Request an estimate</button></form>
    <img src="/concrete-project.jpg" alt="Concrete project" /></body></html>`;
}

function providerResponseFetch(websiteResponse: () => Response): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "atlas.microsoft.com") {
      return new Response(JSON.stringify({ results: [{
        poi: { name: "MJR Concrete", phone: "+1 260-446-2693" },
        position: { lat: 41.0123, lon: -85.0912 },
        address: {
          freeformAddress: "7418 Hessen Cassel Rd, Fort Wayne, IN 46816",
          localName: "Fort Wayne",
          countrySubdivisionCode: "IN",
        },
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.hostname === "places.googleapis.com") {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ places: [{
        displayName: { text: "MJR Concrete LLC" },
        formattedAddress: "7418 Hessen Cassel Rd, Fort Wayne, IN 46816, USA",
        nationalPhoneNumber: "(260) 446-2693",
        websiteUri: recoveredWebsite,
        googleMapsUri: "https://www.google.com/maps/place/MJR+Concrete+LLC",
      }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.hostname.replace(/^www\./, "") === "mjrconcretellc.example") return websiteResponse();
    throw new Error(`Unexpected test URL: ${url.href}`);
  };
}

test("exact provider corroboration cannot accept no-site before an exact Google owned-site recovery candidate is checked", async () => {
  let websiteCalls = 0;
  const result = await verifyProspectWebsiteWithSecondPass(prospect(), {
    fetch: providerResponseFetch(() => {
      websiteCalls += 1;
      return new Response(businessHtml("/"), { status: 200, headers: { "Content-Type": "text/html" } });
    }),
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 1,
    googlePlacesApiKey: "google-test-key",
    azureMapsApiKey: "azure-test-key",
  });

  assert.ok(websiteCalls >= 1);
  assert.equal(result.secondPassAttempted, true);
  assert.ok(result.candidateUrlsConsidered.includes(recoveredWebsite));
  assert.notEqual(result.result.prospect.fitDisposition, "no_owned_website");
  assert.notEqual(result.result.report.status, "no_owned_website");
});

test("an exact recovered owned-site candidate that crawler-blocks remains manual instead of falling back to no-site", async () => {
  const result = await verifyProspectWebsiteWithSecondPass(prospect(), {
    fetch: providerResponseFetch(() => new Response("Access denied", {
      status: 403,
      headers: { "Content-Type": "text/html" },
    })),
    lookup: async () => [{ address: "93.184.216.34" }],
    robotsPolicy: async () => true,
    now: () => now,
    maxContactPages: 1,
    googlePlacesApiKey: "google-test-key",
    azureMapsApiKey: "azure-test-key",
  });

  assert.equal(result.secondPassAttempted, true);
  assert.equal(result.outcome, "still_manual");
  assert.equal(result.reasonCode, "CRAWLER_BLOCKED");
  assert.equal(result.result.report.status, "crawler_blocked");
  assert.notEqual(result.result.prospect.fitDisposition, "no_owned_website");
});
