import { verifyTopProspectsGitHubOidcToken } from "@/lib/github-actions-oidc";
import { getActiveTopProspectJobSummary } from "@/lib/top-prospect-repository";
import { processTopProspectJob } from "@/lib/top-prospect-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

const maxBatchesPerTick = 3;
const softRuntimeBudgetMs = 240_000;

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

async function authorized(request: Request) {
  const token = bearerToken(request);
  if (!token) return false;

  const fallbackSecret = process.env.CRON_SECRET?.trim();
  if (fallbackSecret && token === fallbackSecret) return true;
  if (token.split(".").length !== 3) return false;

  try {
    return await verifyTopProspectsGitHubOidcToken(token);
  } catch (error) {
    console.error("[top-prospects-cron] GitHub Actions OIDC verification failed safely.", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return false;
  }
}

export async function GET(request: Request) {
  if (!(await authorized(request))) {
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
