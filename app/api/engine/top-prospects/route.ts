import { NextResponse } from "next/server";
import { handleTopProspectList, safeTopProspectFailure } from "@/lib/top-prospect-list-route";
import { startTopProspectSearch, TopProspectInputValidationError } from "@/lib/top-prospect-start";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  return handleTopProspectList(request);
}

export async function POST(request: Request) {
  try {
    const result = await startTopProspectSearch(request, await request.json());
    return NextResponse.json({ jobId: result.jobId }, { status: 202 });
  } catch (error) {
    if (error instanceof TopProspectInputValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const alreadyRunning = error instanceof Error && error.message === "A Top Prospects search is already running.";
    const failure = alreadyRunning ? {} : safeTopProspectFailure(error);
    return NextResponse.json(
      { error: alreadyRunning ? error.message : "Unable to start Top Prospects. Confirm PostgreSQL is reachable.", ...failure },
      { status: alreadyRunning ? 409 : 503 },
    );
  }
}
