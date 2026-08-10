import assert from "node:assert/strict";
import test from "node:test";
import { discoverContractorsWithDiagnostics, resetDiscoveryThrottleForTests } from "../lib/lead-discovery";

test("Azure street-level address evidence merges with the matching Google no-site business", async () => {
  const originalFetch = globalThis.fetch;
  const originalGoogleKey = process.env.GOOGLE_PLACES_API_KEY;
  const originalAzureKey = process.env.AZURE_MAPS_API_KEY;
  const originalDelay = process.env.DISCOVERY_PROVIDER_DELAY_MS;
  const originalYelpKey = process.env.YELP_API_KEY;

  process.env.GOOGLE_PLACES_API_KEY = "google-test-key";
  process.env.AZURE_MAPS_API_KEY = "azure-test-key";
  process.env.DISCOVERY_PROVIDER_DELAY_MS = "0";
  delete process.env.YELP_API_KEY;

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim")) {
      return new Response(JSON.stringify([{ lat: "33.2148", lon: "-97.1331" }]), { status: 200 });
    }
    if (url.includes("overpass")) {
      return new Response("gateway timeout", { status: 504 });
    }
    if (url.includes("places.googleapis.com")) {
      return new Response(JSON.stringify({
        places: [{
          displayName: { text: "Jurassic Pressure Washing LLC" },
          googleMapsUri: "https://www.google.com/maps/place/Jurassic+Pressure+Washing",
          formattedAddress: "1200 Example Street, Denton, TX 76201, USA",
          addressComponents: [
            { longText: "Denton", shortText: "Denton", types: ["locality"] },
            { longText: "Texas", shortText: "TX", types: ["administrative_area_level_1"] },
          ],
          location: { latitude: 33.2148, longitude: -97.1331 },
          rating: 4.8,
          userRatingCount: 12,
        }],
      }), { status: 200 });
    }
    if (url.includes("atlas.microsoft.com")) {
      return new Response(JSON.stringify({
        results: [{
          poi: { name: "Jurassic Pressure Washing" },
          address: {
            freeformAddress: "1200 Example St, Denton, TX 76201",
            streetNumber: "1200",
            streetName: "Example St",
            localName: "Denton",
            municipality: "Denton",
            countrySubdivisionCode: "TX",
            postalCode: "76201",
          },
          position: { lat: 33.2200, lon: -97.1400 },
        }],
      }), { status: 200 });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };

  resetDiscoveryThrottleForTests();
  try {
    const result = await discoverContractorsWithDiagnostics({
      city: "Denton",
      state: "TX",
      trade: "Pressure Washing",
      radiusKm: 25,
      limit: 20,
      prospectType: "no_website_social_only",
      skipThrottle: true,
    });

    assert.equal(result.diagnostics.rawProviderCount, 2);
    assert.equal(result.diagnostics.afterDuplicateFilteringCount, 1);
    assert.equal(result.diagnostics.finalMergedCount, 1);
    assert.equal(result.diagnostics.qualificationBreakdown?.noOwnedWebsiteCandidates, 1);
    assert.equal(result.diagnostics.qualificationBreakdown?.eligibleLeads, 1);
    assert.equal(result.leads.length, 1);
    assert.deepEqual(new Set(result.leads[0]?.sources), new Set(["google", "bing"]));
    const azureEvidence = result.leads[0]?.providerIdentityEvidence?.find((evidence) => evidence.source === "bing");
    assert.equal(azureEvidence?.address, "1200 Example St, Denton, TX 76201");
    assert.equal(azureEvidence?.city, "Denton");
    assert.equal(azureEvidence?.state, "TX");
  } finally {
    globalThis.fetch = originalFetch;
    resetDiscoveryThrottleForTests();
    if (originalGoogleKey === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = originalGoogleKey;
    if (originalAzureKey === undefined) delete process.env.AZURE_MAPS_API_KEY;
    else process.env.AZURE_MAPS_API_KEY = originalAzureKey;
    if (originalDelay === undefined) delete process.env.DISCOVERY_PROVIDER_DELAY_MS;
    else process.env.DISCOVERY_PROVIDER_DELAY_MS = originalDelay;
    if (originalYelpKey === undefined) delete process.env.YELP_API_KEY;
    else process.env.YELP_API_KEY = originalYelpKey;
  }
});
