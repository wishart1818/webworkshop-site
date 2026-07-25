import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getAutonomousGrowthDashboard,
  runFakeAutopilotSmokeTestForDashboard,
} from "@/lib/autonomous-growth-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requiredProductionVariables = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "OUTREACH_FROM_EMAIL",
  "OUTREACH_REPLY_TO_EMAIL",
  "WEBWORKSHOP_POSTAL_ADDRESS",
] as const;

function present(name: string) {
  return Boolean(process.env[name]?.trim());
}

function failClosed() {
  return (
    process.env.AUTOPILOT_DISABLED === "true" &&
    process.env.OUTREACH_AUTO_SEND_ENABLED === "false" &&
    process.env.OUTREACH_FULL_AUTO_SEND_ENABLED === "false" &&
    process.env.OUTREACH_EMAIL_DISABLED === "true" &&
    process.env.OUTREACH_DAILY_CAP === "1"
  );
}

function verificationTokenMatches(request: Request) {
  const expected = process.env.AUTOPILOT_VERIFICATION_TOKEN?.trim() ?? "";
  const supplied = request.headers.get("x-webworkshop-verification-token")?.trim() ?? "";
  if (!expected || !supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function GET() {
  const requiredEnvironmentReady = requiredProductionVariables.every(present);
  const safelyDisabled = failClosed();

  try {
    const dashboard = await getAutonomousGrowthDashboard();
    const queueReadable = Array.isArray(dashboard.queue);

    return NextResponse.json(
      {
        ok: requiredEnvironmentReady && safelyDisabled && queueReadable,
        requiredEnvironmentReady,
        failClosed: safelyDisabled,
        databaseConnected: true,
        queueReadable,
      },
      {
        status: requiredEnvironmentReady && safelyDisabled && queueReadable ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        requiredEnvironmentReady,
        failClosed: safelyDisabled,
        databaseConnected: false,
        queueReadable: false,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: Request) {
  if (!verificationTokenMatches(request)) {
    return NextResponse.json({ ok: false, error: "Verification is not authorized." }, { status: 401 });
  }
  if (!requiredProductionVariables.every(present) || !failClosed()) {
    return NextResponse.json({ ok: false, error: "Production is not in the required fail-closed state." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as { mode?: unknown };
  if (body.mode === "smoke") {
    try {
      const smokeTest = await runFakeAutopilotSmokeTestForDashboard();
      return NextResponse.json(
        {
          ok: smokeTest.passed === true,
          smokeTest,
          prospectContacted: false,
        },
        {
          status: smokeTest.passed === true ? 200 : 503,
          headers: { "Cache-Control": "no-store" },
        },
      );
    } catch {
      return NextResponse.json(
        { ok: false, error: "Production fake-pipeline verification failed.", prospectContacted: false },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const replyTo = process.env.OUTREACH_REPLY_TO_EMAIL!.trim();
  const verificationToken = process.env.AUTOPILOT_VERIFICATION_TOKEN!.trim();
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `webworkshop-controlled-provider-test-${createHash("sha256").update(verificationToken).digest("hex")}`,
      },
      body: JSON.stringify({
        from: process.env.OUTREACH_FROM_EMAIL!.trim(),
        to: [replyTo],
        reply_to: replyTo,
        subject: "[WebWorkshop] Controlled Auto Email Pilot verification",
        text: "This controlled verification was sent only to the configured WebWorkshop operator reply-to address. No prospect was contacted. Outreach remains disabled and the daily cap remains 1.",
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ ok: false, error: `Resend rejected the controlled verification with HTTP ${response.status}.` }, { status: 502 });
    }
    const payload = await response.json() as { id?: unknown };
    if (typeof payload.id !== "string" || !payload.id.trim()) {
      return NextResponse.json({ ok: false, error: "Resend did not return a valid provider message ID." }, { status: 502 });
    }
    return NextResponse.json(
      { ok: true, providerMessageId: payload.id.trim(), prospectContacted: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Controlled provider verification failed." }, { status: 502 });
  }
}
