import assert from "node:assert/strict";
import test from "node:test";
import {
  WEBWORKSHOP_OUTREACH_COPY_VERSION,
  webworkshopFirstEmail,
  webworkshopFirstTouchOpening,
  webworkshopPreviewValueLine,
  webworkshopShouldMentionFindlay,
} from "../lib/outreach-style-guide";

test("contextual first-touch opening names the business, trade, and market without inventing details", () => {
  assert.equal(
    webworkshopFirstTouchOpening("Pressure Washing", "Toledo", "Pinnacle Pressure Washing"),
    "I came across Pinnacle Pressure Washing while looking at pressure-washing businesses around Toledo.",
  );
  assert.equal(
    webworkshopFirstTouchOpening("HVAC", "Tampa", "Bay Air"),
    "I came across Bay Air while looking at HVAC businesses around Tampa.",
  );
});

test("contextual first-touch opening falls back safely when context is incomplete", () => {
  assert.equal(
    webworkshopFirstTouchOpening("Roofing", "", "Reliable Roofing"),
    "I came across Reliable Roofing while looking at roofing businesses.",
  );
  assert.equal(
    webworkshopFirstTouchOpening("", "Findlay", "Smith Services"),
    "I came across Smith Services while looking at local service businesses around Findlay.",
  );
  assert.equal(webworkshopFirstTouchOpening("", "", "Smith Services"), "I came across Smith Services.");
  assert.equal(WEBWORKSHOP_OUTREACH_COPY_VERSION, "manual_lovable_permission_first_v5");
});

test("Findlay is mentioned for nearby prospects and omitted for distant markets", () => {
  assert.equal(webworkshopShouldMentionFindlay("Toledo"), true);
  assert.equal(webworkshopShouldMentionFindlay("Findlay, OH"), true);
  assert.equal(webworkshopShouldMentionFindlay("Tampa"), false);
  assert.equal(webworkshopShouldMentionFindlay("St. Augustine"), false);
});

test("existing-site email clearly offers a refreshed website and asks permission to show it", () => {
  const email = webworkshopFirstEmail({
    businessName: "Pinnacle Pressure Washing",
    trade: "Pressure Washing",
    city: "Toledo",
    kind: "has_website",
    footer: "Thanks,\nBrendan\nWebWorkshop",
    recipientName: "Nick",
  });

  assert.match(email, /^Hi Nick,/);
  assert.match(email, /I'm Brendan, based in Findlay, and I build websites for local service businesses\./);
  assert.match(email, /I came across Pinnacle Pressure Washing while looking at pressure-washing businesses around Toledo\./);
  assert.match(email, /I can build you a refreshed, more modern website designed to help bring in more calls and quote requests\./);
  assert.match(email, /Would you be interested in seeing what that could look like\?/);
  assert.doesNotMatch(email, /https?:\/\//);
});

test("no-website email uses the verified no-full-website path without claiming a preview exists", () => {
  const email = webworkshopFirstEmail({
    businessName: "Tampa Bay Pro Wash",
    trade: "Pressure Washing",
    city: "Tampa",
    kind: "no_website",
    footer: "Thanks,\nBrendan\nWebWorkshop",
  });

  assert.match(email, /^Hi there,/);
  assert.match(email, /I'm Brendan, and I build websites for local service businesses\./);
  assert.doesNotMatch(email, /based in Findlay/);
  assert.match(email, /It looks like you don't currently have a full website up\./);
  assert.match(email, /I can build you a modern one designed to help bring in more calls and quote requests\./);
  assert.match(email, /Would you be interested in seeing what that could look like\?/);
  assert.doesNotMatch(email, /already built|finished preview|here's the preview/i);
});

test("the two core offer lines stay centralized", () => {
  assert.equal(
    webworkshopPreviewValueLine("has_website"),
    "I can build you a refreshed, more modern website designed to help bring in more calls and quote requests.",
  );
  assert.equal(
    webworkshopPreviewValueLine("no_website"),
    "It looks like you don't currently have a full website up. I can build you a modern one designed to help bring in more calls and quote requests.",
  );
});
