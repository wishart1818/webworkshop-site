import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { handleTopProspectList, safeTopProspectFailure } from "@/lib/top-prospect-list-route";
import { createTopProspectJob } from "@/lib/top-prospect-repository";
import { validateTopProspectInput } from "@/lib/top-prospects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  return handleTopProspectList(request);
}

export async function POST(request: Request) {
  try {
    const validation = validateTopProspectInput(await request.json());
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
    const job = await createTopProspectJob(validation.value);
    continueTopProspectJobAfterResponse(request, job.id);
    return NextResponse.json({ jobId: job.id }, { status: 202 });
  } catch (error) {
    const alreadyRunning = error instanceof Error && error.message === "A Top Prospects search is already running.";
    const failure = alreadyRunning ? {} : safeTopProspectFailure(error);
    return NextResponse.json(
      { error: alreadyRunning ? error.message : "Unable to start Top Prospects. Confirm PostgreSQL is reachable.", ...failure },
      { status: alreadyRunning ? 409 : 503 },
    );
  }
}
