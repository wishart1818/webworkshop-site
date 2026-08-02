import assert from "node:assert/strict";
import test from "node:test";
import {
  WEBWORKSHOP_OUTREACH_COPY_VERSION,
  webworkshopFirstTouchOpening,
} from "../lib/outreach-style-guide";

test("contextual first-touch opening uses stored trade and market without inventing details", () => {
  assert.equal(
    webworkshopFirstTouchOpening("Pressure Washing", "Toledo"),
    "I came across your pressure washing business while looking at companies around Toledo.",
  );
  assert.equal(
    webworkshopFirstTouchOpening("HVAC", "Tampa"),
    "I came across your HVAC business while looking at companies around Tampa.",
  );
});

test("contextual first-touch opening falls back safely when context is incomplete", () => {
  assert.equal(webworkshopFirstTouchOpening("Roofing", ""), "I came across your roofing business.");
  assert.equal(webworkshopFirstTouchOpening("", "Findlay"), "I came across your business while looking at companies around Findlay.");
  assert.equal(webworkshopFirstTouchOpening("", ""), "I came across your business.");
  assert.equal(WEBWORKSHOP_OUTREACH_COPY_VERSION, "manual_lovable_permission_first_v4");
});
