import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { internalNotificationBody, internalNotificationEnvironment, sendInternalOperatorNotification } from "../lib/internal-notifications";
import { generateOneTestOutreachPackage, getOperatorTestCenterPayload } from "../lib/operator-test-center";
import { OperatorTestCenterWorkspace } from "../components/engine/OperatorTestCenterWorkspace";

test("internal notification test only sends to INTERNAL_NOTIFY_EMAIL", async () => {
  const calls: Array<{ to?: string[]; subject?: string; text?: string; authorization?: string }> = [];
  const result = await sendInternalOperatorNotification({
    kind: "operator_test",
    title: "Internal notification test",
    marketTrade: "Operator Test Center",
    resultCount: 1,
    attention: "Operator needs to verify alerts.",
    nextAction: "Check the internal inbox.",
    pagePath: "/engine?tab=operator-test-center",
  }, {
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
    RESEND_API_KEY: "secret-resend-key",
  } as NodeJS.ProcessEnv, async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { to?: string[]; subject?: string; text?: string };
    calls.push({
      ...body,
      authorization: String((init?.headers as Record<string, string>).Authorization ?? ""),
    });
    return new Response(JSON.stringify({ id: "internal-test-1" }), { status: 200 });
  });

  assert.equal(result.sent, true);
  assert.equal(result.toOperatorOnly, true);
  assert.deepEqual(calls[0].to, ["operator@example.com"]);
  assert.doesNotMatch(calls[0].text ?? "", /prospect@example\.com|DATABASE_URL|secret-resend-key/i);
  assert.match(calls[0].authorization ?? "", /Bearer secret-resend-key/);
});
test("internal notification env is separate from prospect email kill switches", () => {
  const env = internalNotificationEnvironment({
    INTERNAL_NOTIFICATIONS_ENABLED: "true",
    INTERNAL_NOTIFY_EMAIL: "operator@example.com",
    INTERNAL_NOTIFY_FROM_EMAIL: "WebWorkshop Alerts <hello@webworkshop.dev>",
    RESEND_API_KEY: "secret-resend-key",
    OUTREACH_EMAIL_DISABLED: "true",
    OUTREACH_FULL_AUTO_SEND_ENABLED: "false",
  } as NodeJS.ProcessEnv);

  assert.equal(env.configured, true);
  assert.equal(env.hasNotifyEmail, true);
  assert.equal(env.hasNotifyFromEmail, true);
});

test("Operator Test Center summaries expose gate statuses without secrets", async () => {
  const originalEnv = { ...process.env };
  try {
    process.env.RESEND_API_KEY = "secret-resend-key";
    process.env.OUTREACH_SEND_PROVIDER = "resend";
    process.env.OUTREACH_FROM_EMAIL = "Brendan <hello@webworkshop.dev>";
    process.env.OUTREACH_REPLY_TO_EMAIL = "brendan@webworkshop.dev";
    process.env.OUTREACH_POSTAL_ADDRESS = "147 George St, Findlay, OH 45840";
    process.env.OUTREACH_EMAIL_DISABLED = "true";
    process.env.OUTREACH_AUTO_SEND_ENABLED = "false";
    process.env.OUTREACH_FULL_AUTO_SEND_ENABLED = "false";
    process.env.INTERNAL_NOTIFICATIONS_ENABLED = "false";

    const payload = await getOperatorTestCenterPayload();
    const summaryBlob = JSON.stringify(payload.summaries);

    assert.match(payload.summaries.emailSafety, /OUTREACH_EMAIL_DISABLED/i);
    assert.match(payload.summaries.emailSafety, /Full auto: blocked/i);
    assert.match(payload.summaries.fullStatus, /Provider coverage/i);
    assert.match(payload.nextRecommendedTest, /Internal notifications|Provider coverage|Top Prospects|First-touch/i);
    assert.doesNotMatch(summaryBlob, /secret-resend-key|DATABASE_URL|postgres:\/\/|operator@example.com/i);
    assert.ok(payload.statusCards.some((card) => card.label === "Internal notifications"));
  } finally {
    process.env = originalEnv;
  }
});

test("Operator Test Center fake package keeps first touch link-free and yes reply public", () => {
  const result = generateOneTestOutreachPackage({
    WEBWORKSHOP_POSTAL_ADDRESS: "147 George St, Findlay, OH 45840",
  } as NodeJS.ProcessEnv);

  assert.equal(result.ok, true);
  assert.equal(result.packagePreview?.firstEmailLinkFree, true);
  assert.equal(result.packagePreview?.firstDmLinkFree, true);
  assert.equal(result.packagePreview?.yesReplyIncludesPublicPreview, true);
  assert.match(result.packagePreview?.publicPreviewLink ?? "", /^https:\/\/webworkshop\.dev\/p\//);
});

test("operator notification body is short, phone-friendly, and secret-safe", () => {
  const body = internalNotificationBody({
    kind: "provider_issue",
    title: "Provider coverage is weak",
    marketTrade: "Pressure Washing in Tampa, FL",
    resultCount: 0,
    attention: "Google Places timed out.",
    nextAction: "Run Provider Smoke Test before Autopilot.",
    pagePath: "/engine?tab=operator-test-center",
  });

  assert.match(body, /Provider coverage is weak/);
  assert.match(body, /Market\/trade: Pressure Washing in Tampa, FL/);
  assert.match(body, /Next action: Run Provider Smoke Test/);
  assert.doesNotMatch(body, /RESEND_API_KEY|DATABASE_URL|secret/i);
});

test("Test Center renders a protected loading shell without real provider keys", () => {
  const html = renderToStaticMarkup(createElement(OperatorTestCenterWorkspace));

  assert.match(html, /Loading Operator Test Center/);
  assert.doesNotMatch(html, /RESEND_API_KEY|DATABASE_URL|GOOGLE_PLACES_API_KEY|secret/i);
});
