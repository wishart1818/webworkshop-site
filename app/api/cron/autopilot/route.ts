import { processExistingQualifiedProspects } from "@/lib/autonomous-growth-repository";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processExistingQualifiedProspects({ dryRun: false });
    return Response.json({
      ok: true,
      attempted: result.autoEmailPilot.attempted,
      sent: result.autoEmailPilot.sent,
      blocked: result.autoEmailPilot.blocked,
      approvedQueued: result.autoEmailPilot.approvedQueued,
      blockedReasons: result.autoEmailPilot.blockedReasons,
      message: result.message,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[autopilot-cron] Scheduled Auto Email Pilot run failed.", error);
    return Response.json(
      { ok: false, error: "Scheduled Auto Email Pilot run failed safely." },
      { status: 500 },
    );
  }
}
