import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { createTopProspectJob, listTopProspectJobs } from "@/lib/top-prospect-repository";
import { validateTopProspectInput } from "@/lib/top-prospects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json({ jobs: await listTopProspectJobs() });
  } catch (error) {
    console.error("[top-prospects] Unable to list jobs.", error);
    return NextResponse.json({ error: "Top Prospects requires a reachable PostgreSQL database." }, { status: 503 });
  }
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
    if (!alreadyRunning) console.error("[top-prospects] Unable to start job.", error);
    return NextResponse.json(
      { error: alreadyRunning ? error.message : "Unable to start Top Prospects. Confirm PostgreSQL is reachable." },
      { status: alreadyRunning ? 409 : 503 },
    );
  }
}
