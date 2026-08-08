import assert from "node:assert/strict";
import test from "node:test";
import {
  WEBWORKSHOP_OUTREACH_COPY_VERSION,
  webworkshopCleanBusinessName,
  webworkshopFirstEmail,
  webworkshopFirstTouchOpening,
  webworkshopPreviewValueLine,
  webworkshopRecipientFirstName,
  webworkshopShouldMentionFindlay,
} from "../lib/outreach-style-guide";

// These tests lock the approved final existing-site and no-full-website paths plus the regional location rule.
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
  assert.equal(WEBWORKSHOP_OUTREACH_COPY_VERSION, "verified_rebuild_permission_first_v7");
});

test("Findlay is mentioned for nearby prospects and omitted for distant markets", () => {
  assert.equal(webworkshopShouldMentionFindlay("Toledo"), true);
  assert.equal(webworkshopShouldMentionFindlay("Findlay, OH"), true);
  assert.equal(webworkshopShouldMentionFindlay("Tampa"), false);
  assert.equal(webworkshopShouldMentionFindlay("St. Augustine"), false);
});


test("recipient greeting uses only a safe recorded first name", () => {
  assert.equal(webworkshopRecipientFirstName("Nick Smith"), "Nick");
  assert.equal(webworkshopRecipientFirstName("Dr. Ana-María Lopez"), "Ana-María");
  assert.equal(webworkshopRecipientFirstName("NICK"), "Nick");
  assert.equal(webworkshopRecipientFirstName("Owner"), "");
  assert.equal(webworkshopRecipientFirstName("nick@pinnacle419.com"), "");
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
  assert.match(email, /I can rebuild your current website with a more modern design that better represents your business and makes your services, contact information, and quote request easier for customers to find\./);
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
    factualMiddleLine: "I couldn't find a dedicated website linked from the business's public profiles.",
  });

  assert.match(email, /^Hi Tampa Bay Pro Wash team,/);
  assert.match(email, /I'm Brendan, and I build websites for local service businesses\./);
  assert.doesNotMatch(email, /based in Findlay/);
  assert.match(email, /I couldn't find a dedicated website linked from the business's public profiles\./);
  assert.match(email, /I can build you a modern website from the ground up that clearly presents your services and makes it easier for customers to call or request a quote\./);
  assert.match(email, /Would you be interested in seeing what that could look like\?/);
  assert.doesNotMatch(email, /already built|finished preview|here's the preview/i);
});

test("the two core offer lines stay centralized", () => {
  assert.equal(
    webworkshopPreviewValueLine("has_website"),
    "I can rebuild your current website with a more modern design that better represents your business and makes your services, contact information, and quote request easier for customers to find.",
  );
  assert.equal(
    webworkshopPreviewValueLine("no_website"),
    "I can build you a modern website from the ground up that clearly presents your services and makes it easier for customers to call or request a quote.",
  );
});

test("business-team fallback removes only safe legal suffixes", () => {
  assert.equal(webworkshopCleanBusinessName("Smith Landscaping LLC"), "Smith Landscaping");
  assert.equal(webworkshopCleanBusinessName("ABC Roofing & Construction Inc."), "ABC Roofing & Construction");
  assert.equal(webworkshopCleanBusinessName("The Co. Roofing Company"), "The Co. Roofing Company");
});
