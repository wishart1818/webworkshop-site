import { NextResponse } from "next/server";
import { continueTopProspectJobAfterResponse } from "@/lib/top-prospect-continuation";
import { classifyTopProspectFailure, topProspectRuntimeChecks } from "@/lib/top-prospect-diagnostics";
import { getProspectDatabase } from "@/lib/prospect-repository";
import { findResumableTopProspectJobId, listTopProspectJobs } from "@/lib/top-prospect-repository";

export function safeTopProspectFailure(error: unknown) {
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

type ListDependencies = {
  continueJob: typeof continueTopProspectJobAfterResponse;
  findResumableJobId: typeof findResumableTopProspectJobId;
  listJobs: typeof listTopProspectJobs;
};

const listDependencies: ListDependencies = {
  continueJob: continueTopProspectJobAfterResponse,
  findResumableJobId: findResumableTopProspectJobId,
  listJobs: listTopProspectJobs,
};

export function topProspectBuildVersion(environment: NodeJS.ProcessEnv = process.env) {
  const commit = environment.VERCEL_GIT_COMMIT_SHA?.trim();
  if (commit) return `outreach-package-v1-${commit.slice(0, 7)}`;
  const deployment = environment.VERCEL_DEPLOYMENT_ID?.trim();
  if (deployment) return `outreach-package-v1-${deployment.slice(0, 12)}`;
  return "outreach-package-v1";
}

export async function handleTopProspectList(request: Request, dependencies: ListDependencies = listDependencies) {
  try {
    const jobs = await dependencies.listJobs();
    const resumableJobId = await dependencies.findResumableJobId();
    if (resumableJobId) dependencies.continueJob(request, resumableJobId);
    return NextResponse.json({ jobs, buildVersion: topProspectBuildVersion() });
  } catch (error) {
    return NextResponse.json(
      { error: "Top Prospects requires a reachable PostgreSQL database.", ...safeTopProspectFailure(error) },
      { status: 503 },
    );
  }
}
