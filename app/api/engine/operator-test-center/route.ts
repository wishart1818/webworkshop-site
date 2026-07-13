import { NextResponse } from "next/server";
import {
  getOperatorTestCenterPayload,
  generateOneTestOutreachPackage,
  regenerateOperatorUnsentOutreachCopy,
  runFullAutonomousReadinessTest,
  runOperatorMarketScoutDryRun,
  runOperatorSmartAutonomousDryRun,
  runOperatorSmartBackfillTest,
  sendOperatorTestNotification,
  sendOperatorTestSms,
  simulateNext24Hours,
} from "@/lib/operator-test-center";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getOperatorTestCenterPayload());
  } catch (error) {
    console.error("[operator-test-center] Load failed safely.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Operator Test Center is unavailable." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    const payload = await request.json() as { action?: string };
    if (payload.action === "generate_test_package") {
      return NextResponse.json(generateOneTestOutreachPackage());
    }
    if (payload.action === "regenerate_unsent_outreach_copy") {
      return NextResponse.json(await regenerateOperatorUnsentOutreachCopy());
    }
    if (payload.action === "run_smart_backfill_test") {
      return NextResponse.json(await runOperatorSmartBackfillTest());
    }
    if (payload.action === "run_market_scout_dry_run") {
      return NextResponse.json(await runOperatorMarketScoutDryRun());
    }
    if (payload.action === "run_smart_autonomous_dry_run") {
      return NextResponse.json(await runOperatorSmartAutonomousDryRun());
    }
    if (payload.action === "simulate_next_24_hours") {
      return NextResponse.json(await simulateNext24Hours());
    }
    if (payload.action === "run_full_autonomous_readiness_test") {
      return NextResponse.json(await runFullAutonomousReadinessTest());
    }
    if (payload.action === "send_internal_notification") {
      return NextResponse.json(await sendOperatorTestNotification("notification"));
    }
    if (payload.action === "send_internal_resend_test") {
      return NextResponse.json(await sendOperatorTestNotification("manual_email"));
    }
    if (payload.action === "send_internal_sms_test") {
      return NextResponse.json(await sendOperatorTestSms());
    }
    if (payload.action === "check_email_safety_gates") {
      const center = await getOperatorTestCenterPayload();
      return NextResponse.json({ ok: true, message: center.summaries.emailSafety });
    }
    return NextResponse.json({ error: "Select a supported Operator Test Center action." }, { status: 400 });
  } catch (error) {
    console.error("[operator-test-center] Action failed safely.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Operator Test Center action failed safely." }, { status: 503 });
  }
}
