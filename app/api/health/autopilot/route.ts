import { NextResponse } from "next/server";
import { getAutonomousGrowthDashboard } from "@/lib/autonomous-growth-repository";
import { listProspectsWithDiagnostics } from "@/lib/prospect-repository";

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

  const [dashboardResult, prospectListResult] = await Promise.allSettled([
    getAutonomousGrowthDashboard(),
    listProspectsWithDiagnostics(),
  ]);
  const queueReadable = dashboardResult.status === "fulfilled" && Array.isArray(dashboardResult.value.queue);
  const prospectsReadable = prospectListResult.status === "fulfilled" && Array.isArray(prospectListResult.value.prospects);
  const databaseConnected = queueReadable || prospectsReadable;
  const malformedProspectRecordsOmitted = prospectListResult.status === "fulfilled"
    ? prospectListResult.value.diagnostics.malformedRecordsOmitted
    : 0;
  const healthy = requiredEnvironmentReady && failClosed && queueReadable && prospectsReadable;

  return NextResponse.json(
    {
      ok: healthy,
      requiredEnvironmentReady,
      failClosed,
      databaseConnected,
      queueReadable,
      prospectsReadable,
      malformedProspectRecordsOmitted,
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
