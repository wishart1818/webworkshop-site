import assert from "node:assert/strict";
import test from "node:test";
import { extractContactDiscoveryFromPages } from "../lib/site-analysis";

test("contact discovery extracts visible and mailto emails while ignoring fake addresses", () => {
  const result = extractContactDiscoveryFromPages("https://localservice.example", [
    {
      url: "https://localservice.example/contact",
      html: `
        <footer>test@example.com noreply@localservice.example service@localservice.example</footer>
        <a href="mailto:office@localservice.example">Email us</a>
      `,
    },
  ]);

  assert.equal(result.email, "office@localservice.example");
  assert.equal(result.contactEvidence.find((item) => item.value === result.email)?.extractionMethod, "mailto");
  assert.equal(result.contactConfidence, "high");
  assert.equal(result.bestManualContactMethod, "email");
});

test("contact discovery excludes suspicious unrelated theme/admin emails", () => {
  const suspiciousOnly = extractContactDiscoveryFromPages("https://tampapressurepros.com", [
    {
      url: "https://tampapressurepros.com/contact",
      html: `<footer>Email admin@totalwptheme.com for site admin help.</footer>`,
    },
  ], { businessName: "Tampa Pressure Pros", website: "https://tampapressurepros.com" });

  assert.equal(suspiciousOnly.email, "");
  assert.equal(suspiciousOnly.contactConfidence, "low");
  assert.equal(suspiciousOnly.bestManualContactMethod, "unknown");
  assert.equal(suspiciousOnly.contactEvidence.some((item) => item.value === "admin@totalwptheme.com"), false);

  const betterEmail = extractContactDiscoveryFromPages("https://tampapressurepros.com", [
    {
      url: "https://tampapressurepros.com/contact",
      html: `<footer>admin@totalwptheme.com estimates@tampapressurepros.com</footer>`,
    },
  ], { businessName: "Tampa Pressure Pros", website: "https://tampapressurepros.com" });

  assert.equal(betterEmail.email, "estimates@tampapressurepros.com");
  assert.equal(betterEmail.contactConfidence, "high");
  assert.equal(betterEmail.bestManualContactMethod, "email");
});


test("contact discovery detects contact and quote forms without submitting anything", () => {
  const result = extractContactDiscoveryFromPages("https://tampapros.example", [
    {
      url: "https://tampapros.example/contact",
      html: `
        <form>
          <label>Name</label><input name="name" />
          <label>Email</label><input name="email" />
          <label>Message</label><textarea name="message"></textarea>
          <button>Send</button>
        </form>
      `,
    },
    {
      url: "https://tampapros.example/free-estimate",
      html: `
        <form>
          <input placeholder="Name" />
          <input placeholder="Phone" />
          <textarea placeholder="Project address and service needed"></textarea>
          <button>Request quote</button>
        </form>
      `,
    },
  ]);

  assert.equal(result.contactFormDetected, true);
  assert.equal(result.contactFormUrl, "https://tampapros.example/contact");
  assert.equal(result.quoteFormDetected, true);
  assert.equal(result.quoteFormUrl, "https://tampapros.example/free-estimate");
  assert.equal(result.bestManualContactMethod, "quote_form");
  assert.ok(result.contactDiscoveryNotes.every((note) => /not submitted|profile link/i.test(note)));
});

test("contact discovery extracts public social profile links only", () => {
  const result = extractContactDiscoveryFromPages("https://crew.example", [
    {
      url: "https://crew.example/about-us",
      html: `
        <a href="https://facebook.com/crewservice?utm_source=site">Facebook</a>
        <a href="https://instagram.com/crewservice/">Instagram</a>
        <a href="https://linkedin.com/company/crewservice?trk=public">LinkedIn</a>
        <a href="https://x.com/crewservice?ref=site">X</a>
        <a href="https://youtube.com/@crewservice?si=123">YouTube</a>
      `,
    },
  ]);

  assert.equal(result.facebookUrl, "https://facebook.com/crewservice");
  assert.equal(result.instagramUrl, "https://instagram.com/crewservice");
  assert.equal(result.linkedinUrl, "https://linkedin.com/company/crewservice");
  assert.equal(result.xUrl, "https://x.com/crewservice");
  assert.equal(result.youtubeUrl, "https://youtube.com/@crewservice");
  assert.equal(result.bestManualContactMethod, "facebook");
  assert.equal(result.contactConfidence, "medium");
});

test("contact discovery accepts explicit public contact metadata and ignores unrelated metadata", () => {
  const result = extractContactDiscoveryFromPages("https://localservice.example", [
    {
      url: "https://localservice.example/service-area",
      html: `
        <meta name="email" content="info@localservice.example" />
        <meta property="business:contact_data:phone_number" content="+14195550123" />
        <meta name="author" content="vendor@unrelated-agency.com" />
      `,
    },
  ]);

  assert.equal(result.email, "info@localservice.example");
  assert.equal(result.phone, "+14195550123");
  assert.equal(result.contactEvidence.find((item) => item.value === result.email)?.extractionMethod, "metadata");
  assert.equal(result.contactEvidence.some((item) => item.value === "vendor@unrelated-agency.com"), false);
});
