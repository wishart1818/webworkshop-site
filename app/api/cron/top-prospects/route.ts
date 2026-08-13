import { getActiveTopProspectJobSummary } from "@/lib/top-prospect-repository";
import { processTopProspectJob } from "@/lib/top-prospect-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

const maxBatchesPerTick = 3;
const softRuntimeBudgetMs = 240_000;

function authorized(request: Request) {
  const secret = process.env.TOP_PROSPECT_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const active = await getActiveTopProspectJobSummary();
    if (!active?.id) {
      return Response.json({ ok: true, status: "idle", processedBatches: 0, completedAt: new Date().toISOString() });
    }

    const startedAt = Date.now();
    let processedBatches = 0;
    let lastResult: Awaited<ReturnType<typeof processTopProspectJob>> | null = null;

    while (processedBatches < maxBatchesPerTick && Date.now() - startedAt < softRuntimeBudgetMs) {
      lastResult = await processTopProspectJob(active.id);
      processedBatches += 1;
      if (!lastResult.shouldContinue || lastResult.status === "busy_or_complete") break;
    }

    return Response.json({
      ok: true,
      jobId: active.id,
      status: lastResult?.status ?? active.status,
      shouldContinue: lastResult?.shouldContinue ?? true,
      processedBatches,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[top-prospects-cron] Persisted Top Prospects continuation failed safely.", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json({ ok: false, error: "Top Prospects continuation failed safely." }, { status: 500 });
  }
}
