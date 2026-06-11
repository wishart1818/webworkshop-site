import type { Prisma } from "@prisma/client";
import { getProspectDatabase, getProspect } from "@/lib/prospect-repository";
import type { TopProspectInput, TopProspectJob, TopProspectResult } from "@/lib/top-prospects";

const resultInclude = { prospect: true } satisfies Prisma.TopProspectResultInclude;
const jobInclude = {
  results: { where: { selected: true }, orderBy: { rank: "asc" as const }, include: resultInclude },
} satisfies Prisma.TopProspectJobInclude;

type JobRow = Prisma.TopProspectJobGetPayload<{ include: typeof jobInclude }>;

function recordValue(value: Prisma.JsonValue | null): Record<string, number> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

async function toResult(row: JobRow["results"][number]): Promise<TopProspectResult> {
  const prospect = await getProspect(row.prospectId);
  if (!prospect) throw new Error("Top prospect result references a missing prospect.");
  return {
    id: row.id,
    rank: row.rank,
    selected: row.selected,
    opportunityScore: row.opportunityScore,
    mainWeakness: row.mainWeakness,
    whyMayBuy: row.whyMayBuy,
    pitchAngle: row.pitchAngle,
    buildPrompt: row.buildPrompt,
    prospect,
  };
}

async function toJob(row: JobRow): Promise<TopProspectJob> {
  return {
    id: row.id,
    input: {
      trade: row.tradeCategory as TopProspectInput["trade"],
      city: row.city,
      state: row.state,
      radiusKm: row.radiusKm,
      businessesToScan: row.businessesToScan,
      finalProspectsWanted: row.finalProspectsWanted,
    },
    status: row.status as TopProspectJob["status"],
    stage: row.stage,
    discoveredCount: Array.isArray(row.discoveredLeads) ? row.discoveredLeads.length : 0,
    scannedCount: row.scannedCount,
    qualifiedCount: row.qualifiedCount,
    skippedCount: row.skippedCount,
    skipSummary: recordValue(row.skipSummary),
    results: await Promise.all(row.results.map(toResult)),
    errorMessage: row.errorMessage ?? "",
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createTopProspectJob(input: TopProspectInput) {
  const database = getProspectDatabase();
  const active = await database.topProspectJob.findFirst({ where: { status: { in: ["QUEUED", "RUNNING"] } }, select: { id: true } });
  if (active) throw new Error("A Top Prospects search is already running.");
  return database.topProspectJob.create({
    data: {
      tradeCategory: input.trade,
      city: input.city,
      state: input.state,
      radiusKm: input.radiusKm,
      businessesToScan: input.businessesToScan,
      finalProspectsWanted: input.finalProspectsWanted,
    },
  });
}

export async function getTopProspectJob(id: string) {
  const row = await getProspectDatabase().topProspectJob.findUnique({ where: { id }, include: jobInclude });
  return row ? toJob(row) : null;
}

export async function listTopProspectJobs() {
  const rows = await getProspectDatabase().topProspectJob.findMany({ include: jobInclude, orderBy: { createdAt: "desc" }, take: 10 });
  return Promise.all(rows.map(toJob));
}
