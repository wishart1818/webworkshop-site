import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { safeTopProspectJobFailure, topProspectRuntimeChecks } from "@/lib/top-prospect-diagnostics";
import { getProspectDatabase } from "@/lib/prospect-repository";
import { processTopProspectJob } from "@/lib/top-prospect-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  try {
    const result = await processTopProspectJob(jobId);
    if (result.shouldContinue) continueTopProspectJobAfterResponse(request, jobId);
    return NextResponse.json(result);
  } catch (error) {
    const failure = safeTopProspectJobFailure(error);
    let prismaModelsPresent = false;
    try {
      const database = getProspectDatabase() as unknown as Record<string, unknown>;
      prismaModelsPresent = Boolean(database.topProspectJob && database.topProspectResult);
    } catch {
      // Keep the diagnostic response available even when Prisma cannot initialize.
    }
    const checks = topProspectRuntimeChecks(prismaModelsPresent);
    console.error("[top-prospects] Worker could not start.", { ...failure, checks });
    return NextResponse.json({ status: "failed", shouldContinue: false, ...failure, checks }, { status: 503 });
  }
}
