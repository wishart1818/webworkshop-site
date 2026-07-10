import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { recordEmailSuppression, type EmailSuppressionReason } from "@/lib/autonomous-growth-repository";
import { safeRecordAudit } from "@/lib/operational-controls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SuppressionEvent = {
  type?: string;
  event?: string;
  email?: string;
  recipient?: string;
  to?: string | string[];
  data?: {
    email?: string;
    recipient?: string;
    to?: string | string[];
  };
};

function configuredToken() {
  return process.env.OUTREACH_SUPPRESSION_WEBHOOK_TOKEN?.trim() ?? "";
}

function requestToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? "";
  return bearer || request.headers.get("x-webworkshop-webhook-token")?.trim() || "";
}

function tokenMatches(expected: string, actual: string) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function eventReason(value: string): EmailSuppressionReason | null {
  const normalized = value.trim().toLowerCase();
  if (/\bbounce|bounced|delivery_failed|delivery\.bounced\b/.test(normalized)) return "bounce";
  if (/\bcomplaint|complained|spam|report_spam\b/.test(normalized)) return "complaint";
  if (/\bunsubscribe|unsubscribed|opt[_-]?out\b/.test(normalized)) return "unsubscribe";
  return null;
}

function firstEmail(value: unknown): string {
  if (Array.isArray(value)) return firstEmail(value[0]);
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function eventEmail(payload: SuppressionEvent) {
  return firstEmail(payload.email)
    || firstEmail(payload.recipient)
    || firstEmail(payload.to)
    || firstEmail(payload.data?.email)
    || firstEmail(payload.data?.recipient)
    || firstEmail(payload.data?.to);
}

export async function POST(request: Request) {
  const expectedToken = configuredToken();
  if (!expectedToken) {
    await safeRecordAudit({
      action: "outreach_suppression_webhook",
      outcome: "rejected",
      subject: "missing-token",
      metadata: { reason: "OUTREACH_SUPPRESSION_WEBHOOK_TOKEN is not configured." },
    });
    return NextResponse.json({ error: "Suppression webhook is not configured." }, { status: 503 });
  }
  if (!tokenMatches(expectedToken, requestToken(request))) {
    await safeRecordAudit({
      action: "outreach_suppression_webhook",
      outcome: "rejected",
      subject: "invalid-token",
      metadata: { reason: "Invalid suppression webhook token." },
    });
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: SuppressionEvent;
  try {
    payload = await request.json() as SuppressionEvent;
  } catch {
    return NextResponse.json({ error: "Send a JSON suppression event." }, { status: 400 });
  }

  const reason = eventReason(payload.type ?? payload.event ?? "");
  const email = eventEmail(payload);
  if (!reason || !email) {
    await safeRecordAudit({
      action: "outreach_suppression_webhook",
      outcome: "rejected",
      subject: email || "missing-email",
      metadata: { reason: reason ?? "unsupported_event", event: payload.type ?? payload.event ?? "" },
    });
    return NextResponse.json({ error: "Unsupported suppression event or missing email." }, { status: 400 });
  }

  const suppression = await recordEmailSuppression(email, reason, "suppression_webhook");
  await safeRecordAudit({
    action: "outreach_suppression_webhook",
    outcome: "success",
    subject: email,
    metadata: { reason, matched: suppression.matched, updated: suppression.updated },
  });
  return NextResponse.json({
    received: true,
    reason,
    matched: suppression.matched,
    updated: suppression.updated,
  });
}
