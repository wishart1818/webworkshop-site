import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { processTopProspectJob } from "@/lib/top-prospect-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const result = await processTopProspectJob(jobId);
  if (result.shouldContinue) continueTopProspectJobAfterResponse(request, jobId);
  return NextResponse.json(result);
}
