import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { classifyTopProspectFailure, topProspectRuntimeChecks } from "@/lib/top-prospect-diagnostics";
import { getProspectDatabase } from "@/lib/prospect-repository";
import { createTopProspectJob, listTopProspectJobs } from "@/lib/top-prospect-repository";
import { validateTopProspectInput } from "@/lib/top-prospects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function safeFailure(error: unknown) {
  const classification = classifyTopProspectFailure(error);
  let prismaModelsPresent = false;
  try {
    const database = getProspectDatabase() as unknown as Record<string, unknown>;
    prismaModelsPresent = Boolean(database.topProspectJob && database.topProspectResult);
  } catch {
    // Keep the diagnostic response available even when Prisma cannot initialize.
  }
  const checks = topProspectRuntimeChecks(prismaModelsPresent);
  console.error("[top-prospects] Request failed.", { classification, checks });
  return { classification, checks };
}

export async function GET() {
  try {
    return NextResponse.json({ jobs: await listTopProspectJobs() });
  } catch (error) {
    return NextResponse.json(
      { error: "Top Prospects requires a reachable PostgreSQL database.", ...safeFailure(error) },
      { status: 503 },
    );
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
    const failure = alreadyRunning ? {} : safeFailure(error);
    return NextResponse.json(
      { error: alreadyRunning ? error.message : "Unable to start Top Prospects. Confirm PostgreSQL is reachable.", ...failure },
      { status: alreadyRunning ? 409 : 503 },
    );
  }
}
