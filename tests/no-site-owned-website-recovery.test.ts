import assert from "node:assert/strict";
import test from "node:test";
import type { Prospect } from "../lib/prospect-engine";
import { discoveryIdentityEvidenceSignal } from "../lib/prospect-identity-evidence";
import { discoverGoogleOwnedWebsiteCandidates } from "../lib/no-site-owned-website-recovery";

const businessName = "Rees Parking Lot Striping & Powerwashing";
const phone = "214-755-9736";
const address = "3813 Atlas Dr, Denton, TX 76209";

function googleEvidence() {
  return discoveryIdentityEvidenceSignal({
    source: "google",
    businessName,
    website: "",
    profileUrl: "https://www.google.com/maps/place/rees-example",
    phone,
    address,
    city: "Denton",
    state: "TX",
    latitude: 33.2148,
    longitude: -97.1331,
  });
}

function prospect(overrides: Partial<Prospect> = {}) {
  return {
    businessName,
    website: "",
    prospectType: "no_website_social_only",
    phone,
    address,
    city: "Denton",
    state: "TX",
    inactive: false,
    activitySignals: [googleEvidence()],
    createdAt: new Date().toISOString(),
    ...overrides,
  } as Prospect;
}

function googleResponse(places: unknown[]) {
  const fetchImpl: typeof fetch = async (_input, init) => {
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Goog-Api-Key"), "test-key");
    assert.match(headers.get("X-Goog-FieldMask") ?? "", /places\.websiteUri/);
    return new Response(JSON.stringify({ places }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return fetchImpl;
}

test("exact Google Places recovery can restore a missing owned website only with a stored identity binding", async () => {
  const result = await discoverGoogleOwnedWebsiteCandidates(prospect(), {
    apiKey: "test-key",
    fetch: googleResponse([{
      displayName: { text: "Rees Parking Lot Striping and Power Washing LLC" },
      formattedAddress: "3813 Atlas Dr, Denton, TX 76209, USA",
      nationalPhoneNumber: "(214) 755-9736",
      websiteUri: "https://reesstriping.com/",
      googleMapsUri: "https://www.google.com/maps/place/example",
    }]),
  });

  assert.deepEqual(result, ["https://reesstriping.com/"]);
});

test("same-name Google result with a different phone and address is not promoted", async () => {
  const result = await discoverGoogleOwnedWebsiteCandidates(prospect(), {
    apiKey: "test-key",
    fetch: googleResponse([{
      displayName: { text: "Rees Parking Lot Striping & Powerwashing" },
      formattedAddress: "1000 Wrong Rd, Dallas, TX 75001, USA",
      nationalPhoneNumber: "(972) 555-0101",
      websiteUri: "https://wrong-business.example/",
    }]),
  });

  assert.deepEqual(result, []);
});

test("conflicting owned website hosts for the same bound identity fail closed", async () => {
  const result = await discoverGoogleOwnedWebsiteCandidates(prospect(), {
    apiKey: "test-key",
    fetch: googleResponse([
      {
        displayName: { text: "Rees Parking Lot Striping & Powerwashing" },
        formattedAddress: "3813 Atlas Dr, Denton, TX 76209",
        nationalPhoneNumber: "2147559736",
        websiteUri: "https://reesstriping.com/",
      },
      {
        displayName: { text: "Rees Parking Lot Striping & Powerwashing" },
        formattedAddress: "3813 Atlas Dr, Denton, TX 76209",
        nationalPhoneNumber: "2147559736",
        websiteUri: "https://rees-powerwash.example/",
      },
    ]),
  });

  assert.deepEqual(result, []);
});

test("stale or non-Google no-site records do not trigger recovery queries", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    throw new Error("should not be called");
  };

  const stale = await discoverGoogleOwnedWebsiteCandidates(prospect({
    createdAt: "2026-01-01T00:00:00.000Z",
  }), {
    apiKey: "test-key",
    fetch: fetchImpl,
    now: () => new Date("2026-08-11T00:00:00.000Z"),
  });
  const noGoogleEvidence = await discoverGoogleOwnedWebsiteCandidates(prospect({
    activitySignals: [],
  }), {
    apiKey: "test-key",
    fetch: fetchImpl,
  });

  assert.deepEqual(stale, []);
  assert.deepEqual(noGoogleEvidence, []);
  assert.equal(called, false);
});

test("missing API key performs no recovery network request", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    throw new Error("should not be called");
  };

  const result = await discoverGoogleOwnedWebsiteCandidates(prospect(), {
    apiKey: "",
    fetch: fetchImpl,
  });

  assert.deepEqual(result, []);
  assert.equal(called, false);
});
