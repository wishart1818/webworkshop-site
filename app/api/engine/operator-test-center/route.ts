import { NextResponse } from "next/server";
import {
  getOperatorTestCenterPayload,
  generateOneTestOutreachPackage,
  runEmailSafetyGatesCheck,
  runFullAutonomousReadinessTest,
  runOperatorMarketScoutDryRun,
  runOperatorSmartAutonomousDryRun,
  runOperatorSmartBackfillTest,
  sendOperatorTestNotification,
  sendOperatorTestSms,
  simulateNext24Hours,
} from "@/lib/operator-test-center";
import {
  regenerateOperatorUnsentOutreachCopyWithRecovery,
  runSafeReadinessRepairWithRecovery,
} from "@/lib/operator-readiness-recovery";
import {
  disableAllProspectEmailSending,
  enableControlledEmailPilot,
  runControlledOutreachLaunchReadiness,
  validateControlledPilotSend,
} from "@/lib/controlled-outreach-launch";

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
    const payload = await request.json() as { action?: string; confirmed?: boolean; confirmation?: string };
    if (payload.action === "generate_test_package") {
      return NextResponse.json(generateOneTestOutreachPackage());
    }
    if (payload.action === "regenerate_unsent_outreach_copy") {
      return NextResponse.json(await regenerateOperatorUnsentOutreachCopyWithRecovery());
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
    if (payload.action === "run_safe_readiness_repair") {
      if (payload.confirmed !== true) {
        return NextResponse.json({ error: "Confirm the safe readiness repair before changing records." }, { status: 409 });
      }
      return NextResponse.json(await runSafeReadinessRepairWithRecovery({ confirmed: true }));
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
      const emailSafety = await runEmailSafetyGatesCheck();
      return NextResponse.json({ ok: emailSafety.status === "Passed", message: emailSafety.summary, emailSafety });
    }
    if (payload.action === "run_controlled_outreach_launch_readiness") {
      const controlledReadiness = await runControlledOutreachLaunchReadiness();
      return NextResponse.json({
        ok: controlledReadiness.status === "READY FOR CONTROLLED PILOT",
        message: `Controlled Outreach Launch Readiness: ${controlledReadiness.status}. Nothing was sent.`,
        controlledReadiness,
      });
    }
    if (payload.action === "enable_controlled_email_pilot") {
      const controlledActivation = await enableControlledEmailPilot({
        confirmation: typeof payload.confirmation === "string" ? payload.confirmation : "",
      });
      return NextResponse.json({
        ok: controlledActivation.activated,
        message: controlledActivation.message,
        controlledReadiness: controlledActivation.readiness,
        controlledActivation,
      }, { status: controlledActivation.activated ? 200 : 409 });
    }
    if (payload.action === "disable_all_prospect_email_sending") {
      const emergencyStop = await disableAllProspectEmailSending();
      return NextResponse.json({
        ok: true,
        message: emergencyStop.message,
        emergencyStop,
      });
    }
    if (payload.action === "validate_controlled_pilot_send") {
      const postSendValidation = await validateControlledPilotSend();
      return NextResponse.json({
        ok: postSendValidation.status === "PILOT SEND VERIFIED",
        message: postSendValidation.status,
        postSendValidation,
      });
    }
    return NextResponse.json({ error: "Select a supported Operator Test Center action." }, { status: 400 });
  } catch (error) {
    console.error("[operator-test-center] Action failed safely.", { error: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Operator Test Center action failed safely." }, { status: 503 });
  }
}
