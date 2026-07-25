import { NextResponse } from "next/server";
import { getAutonomousGrowthDashboard } from "@/lib/autonomous-growth-repository";

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

export async function GET() {
  const requiredEnvironmentReady = requiredProductionVariables.every(present);
  const failClosed =
    process.env.AUTOPILOT_DISABLED === "true" &&
    process.env.OUTREACH_AUTO_SEND_ENABLED === "false" &&
    process.env.OUTREACH_FULL_AUTO_SEND_ENABLED === "false" &&
    process.env.OUTREACH_EMAIL_DISABLED === "true" &&
    process.env.OUTREACH_DAILY_CAP === "1";

  try {
    const dashboard = await getAutonomousGrowthDashboard();
    const queueReadable = Array.isArray(dashboard.queue);

    return NextResponse.json(
      {
        ok: requiredEnvironmentReady && failClosed && queueReadable,
        requiredEnvironmentReady,
        failClosed,
        databaseConnected: true,
        queueReadable,
      },
      {
        status: requiredEnvironmentReady && failClosed && queueReadable ? 200 : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        requiredEnvironmentReady,
        failClosed,
        databaseConnected: false,
        queueReadable: false,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
