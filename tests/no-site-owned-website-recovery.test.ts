import assert from "node:assert/strict";
import test from "node:test";
import type { Prospect } from "../lib/prospect-engine";
import { discoverGoogleOwnedWebsiteCandidates } from "../lib/no-site-owned-website-recovery";

function prospect(overrides: Partial<Prospect> = {}) {
  return {
    businessName: "Rees Parking Lot Striping & Powerwashing",
    website: "",
    phone: "214-755-9736",
    address: "3813 Atlas Dr, Denton, TX 76209",
    city: "Denton",
    state: "TX",
    inactive: false,
    activitySignals: [],
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
