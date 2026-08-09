import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ensureTopProspectSchema } from "@/lib/top-prospect-schema";
import { getProspectDatabase, persistenceMode } from "@/lib/prospect-repository";
import type { ExistingWebsiteRepairReviewedItem } from "@/lib/website-verification-operations";

// A 20-record audit chunk can require seven bounded verification waves at
// three-way concurrency. Keep the lease above that worst-case network budget.
export const websiteRepairAuditLeaseMs = 5 * 60 * 1_000;
export const websiteRepairApplyLeaseMs = 2 * 60 * 1_000;

export type WebsiteRepairAuditRunStatus = "AUDITING" | "READY" | "AUDIT_FAILED" | "APPLYING" | "APPLIED" | "PARTIAL_NEEDS_REVIEW" | "APPLY_FAILED";

export type WebsiteRepairAuditRun = {
  id: string;
  version: 1;
  accessTokenHash: string;
  status: WebsiteRepairAuditRunStatus;
  candidateIds: string[];
  reviewedItems: ExistingWebsiteRepairReviewedItem[];
  nextIndex: number;
  totalCandidates: number;
  inspectedCount: number;
  safeExclusionCount: number;
  manualReviewCount: number;
  protectedCount: number;
  manualReasonCounts: Record<string, number>;
  leaseToken: string;
  leaseUntil: string;
  expiresAt: string;
  completedAt: string;
  applyStatus: "NOT_STARTED" | "APPLYING" | "COMPLETED" | "FAILED" | "PARTIAL_NEEDS_REVIEW";
  applyNextIndex: number;
  appliedCount: number;
  remainingCandidatesBefore: number;
  remainingCandidatesAfter: number | null;
  applyStartedAt: string;
  applyCompletedAt: string;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
  updatedAt: string;
};

const globalRuns = globalThis as typeof globalThis & { websiteRepairAuditRuns?: WebsiteRepairAuditRun[] };

function memoryRuns() {
  if (!globalRuns.websiteRepairAuditRuns) globalRuns.websiteRepairAuditRuns = [];
  return globalRuns.websiteRepairAuditRuns;
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function tokenMatches(token: string, expectedHash: string) {
  const actual = Buffer.from(tokenHash(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function jsonArray<T>(value: Prisma.JsonValue | null | undefined): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function jsonRecord(value: Prisma.JsonValue | null | undefined): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, count]) => (
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? [[key, count]] : []
  )));
}

function rowToRun(row: {
  id: string;
  version: number;
  accessTokenHash: string;
  status: string;
  candidateIds: Prisma.JsonValue;
  reviewedItems: Prisma.JsonValue;
  nextIndex: number;
  totalCandidates: number;
  inspectedCount: number;
  safeExclusionCount: number;
  manualReviewCount: number;
  protectedCount: number;
  manualReasonCounts: Prisma.JsonValue;
  leaseToken: string | null;
  leaseUntil: Date | null;
  expiresAt: Date;
  completedAt: Date | null;
  applyStatus: string;
  applyNextIndex: number;
  appliedCount: number;
  remainingCandidatesBefore: number;
  remainingCandidatesAfter: number | null;
  applyStartedAt: Date | null;
  applyCompletedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WebsiteRepairAuditRun {
  return {
    ...row,
    version: row.version as 1,
    status: row.status as WebsiteRepairAuditRunStatus,
    candidateIds: jsonArray<string>(row.candidateIds),
    reviewedItems: jsonArray<ExistingWebsiteRepairReviewedItem>(row.reviewedItems),
    manualReasonCounts: jsonRecord(row.manualReasonCounts),
    leaseToken: row.leaseToken ?? "",
    leaseUntil: row.leaseUntil?.toISOString() ?? "",
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? "",
    applyStatus: row.applyStatus as WebsiteRepairAuditRun["applyStatus"],
    applyStartedAt: row.applyStartedAt?.toISOString() ?? "",
    applyCompletedAt: row.applyCompletedAt?.toISOString() ?? "",
    errorCode: row.errorCode ?? "",
    errorMessage: row.errorMessage ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertRunAccess(run: WebsiteRepairAuditRun | null, accessToken: string, now: Date) {
  if (!run || !accessToken || !tokenMatches(accessToken, run.accessTokenHash)) {
    throw new Error("The Full Legacy Cleanup run reference is invalid.");
  }
  const validStatuses: WebsiteRepairAuditRunStatus[] = ["AUDITING", "READY", "AUDIT_FAILED", "APPLYING", "APPLIED", "PARTIAL_NEEDS_REVIEW", "APPLY_FAILED"];
  const validApplyStatuses: WebsiteRepairAuditRun["applyStatus"][] = ["NOT_STARTED", "APPLYING", "COMPLETED", "FAILED", "PARTIAL_NEEDS_REVIEW"];
  const countValues = [
    run.nextIndex,
    run.totalCandidates,
    run.inspectedCount,
    run.safeExclusionCount,
    run.manualReviewCount,
    run.protectedCount,
    run.applyNextIndex,
    run.appliedCount,
    run.remainingCandidatesBefore,
  ];
  const candidateIds = new Set(run.candidateIds);
  const expiresAt = Date.parse(run.expiresAt);
  if (
    run.version !== 1
    || !validStatuses.includes(run.status)
    || !validApplyStatuses.includes(run.applyStatus)
    || countValues.some((value) => !Number.isSafeInteger(value) || value < 0)
    || run.totalCandidates !== run.candidateIds.length
    || run.remainingCandidatesBefore !== run.totalCandidates
    || run.totalCandidates > 1_000
    || candidateIds.size !== run.candidateIds.length
    || run.candidateIds.some((id) => typeof id !== "string" || !id || id.length > 100)
    || run.nextIndex !== run.inspectedCount
    || run.reviewedItems.length !== run.inspectedCount
    || run.safeExclusionCount + run.manualReviewCount + run.protectedCount !== run.inspectedCount
    || run.nextIndex > run.totalCandidates
    || run.applyNextIndex > run.safeExclusionCount
    || run.appliedCount > run.applyNextIndex
    || (run.remainingCandidatesAfter !== null && (!Number.isSafeInteger(run.remainingCandidatesAfter) || run.remainingCandidatesAfter < 0))
    || !Number.isFinite(expiresAt)
    || run.reviewedItems.some((item, index) => item?.prospectId !== run.candidateIds[index] || item.record?.prospectId !== item.prospectId)
  ) {
    throw new Error("The Full Legacy Cleanup persisted run state is invalid.");
  }
  if (expiresAt <= now.getTime()) {
    throw new Error("The Full Legacy Cleanup review expired. Run a fresh audit.");
  }
  return run;
}

async function rawRun(id: string): Promise<WebsiteRepairAuditRun | null> {
  if (persistenceMode() === "memory") {
    return structuredClone(memoryRuns().find((run) => run.id === id) ?? null);
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().websiteRepairAuditRun.findUnique({ where: { id } });
  return row ? rowToRun(row) : null;
}

export async function createWebsiteRepairAuditRun(input: {
  accessToken: string;
  candidateIds: string[];
  expiresAt: Date;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!input.accessToken || input.candidateIds.length > 1_000 || new Set(input.candidateIds).size !== input.candidateIds.length) {
    throw new Error("The Full Legacy Cleanup candidate snapshot is invalid.");
  }
  if (persistenceMode() === "memory") {
    const run: WebsiteRepairAuditRun = {
      id: `website-repair-${randomUUID()}`,
      version: 1,
      accessTokenHash: tokenHash(input.accessToken),
      status: input.candidateIds.length ? "AUDITING" : "READY",
      candidateIds: structuredClone(input.candidateIds),
      reviewedItems: [],
      nextIndex: 0,
      totalCandidates: input.candidateIds.length,
      inspectedCount: 0,
      safeExclusionCount: 0,
      manualReviewCount: 0,
      protectedCount: 0,
      manualReasonCounts: {},
      leaseToken: "",
      leaseUntil: "",
      expiresAt: input.expiresAt.toISOString(),
      completedAt: input.candidateIds.length ? "" : now.toISOString(),
      applyStatus: "NOT_STARTED",
      applyNextIndex: 0,
      appliedCount: 0,
      remainingCandidatesBefore: input.candidateIds.length,
      remainingCandidatesAfter: null,
      applyStartedAt: "",
      applyCompletedAt: "",
      errorCode: "",
      errorMessage: "",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    memoryRuns().unshift(run);
    return structuredClone(run);
  }
  await ensureTopProspectSchema();
  const row = await getProspectDatabase().websiteRepairAuditRun.create({
    data: {
      version: 1,
      accessTokenHash: tokenHash(input.accessToken),
      status: input.candidateIds.length ? "AUDITING" : "READY",
      candidateIds: input.candidateIds,
      reviewedItems: [],
      totalCandidates: input.candidateIds.length,
      remainingCandidatesBefore: input.candidateIds.length,
      expiresAt: input.expiresAt,
      completedAt: input.candidateIds.length ? null : now,
    },
  });
  return rowToRun(row);
}

export async function getAuthorizedWebsiteRepairAuditRun(id: string, accessToken: string, now = new Date()) {
  return assertRunAccess(await rawRun(id), accessToken, now);
}

export async function claimWebsiteRepairAuditWork(input: {
  id: string;
  accessToken: string;
  now?: Date;
  leaseMs?: number;
}) {
  const now = input.now ?? new Date();
  await getAuthorizedWebsiteRepairAuditRun(input.id, input.accessToken, now);
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + (input.leaseMs ?? websiteRepairAuditLeaseMs));
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id)!;
    if (run.status !== "AUDITING" || (run.leaseUntil && Date.parse(run.leaseUntil) > now.getTime())) return null;
    run.leaseToken = leaseToken;
    run.leaseUntil = leaseUntil.toISOString();
    run.updatedAt = now.toISOString();
    return { run: structuredClone(run), leaseToken };
  }
  const database = getProspectDatabase();
  const claimed = await database.websiteRepairAuditRun.updateMany({
    where: {
      id: input.id,
      status: "AUDITING",
      expiresAt: { gt: now },
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
    },
    data: { leaseToken, leaseUntil, errorCode: null, errorMessage: null },
  });
  if (claimed.count !== 1) return null;
  const run = await database.websiteRepairAuditRun.findUniqueOrThrow({ where: { id: input.id } });
  return { run: rowToRun(run), leaseToken };
}

export async function completeWebsiteRepairAuditChunk(input: {
  id: string;
  leaseToken: string;
  expectedNextIndex: number;
  reviewedItems: ExistingWebsiteRepairReviewedItem[];
  safeExclusionCount: number;
  manualReviewCount: number;
  protectedCount: number;
  manualReasonCounts: Record<string, number>;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id);
    if (!run || run.leaseToken !== input.leaseToken || run.nextIndex !== input.expectedNextIndex) {
      throw new Error("The Full Legacy Cleanup audit lease changed. Resume the run.");
    }
    run.reviewedItems.push(...structuredClone(input.reviewedItems));
    run.nextIndex += input.reviewedItems.length;
    run.inspectedCount = run.nextIndex;
    run.safeExclusionCount += input.safeExclusionCount;
    run.manualReviewCount += input.manualReviewCount;
    run.protectedCount += input.protectedCount;
    for (const [reason, count] of Object.entries(input.manualReasonCounts)) {
      run.manualReasonCounts[reason] = (run.manualReasonCounts[reason] ?? 0) + count;
    }
    const complete = run.nextIndex >= run.totalCandidates;
    run.status = complete ? "READY" : "AUDITING";
    run.completedAt = complete ? now.toISOString() : "";
    run.leaseToken = "";
    run.leaseUntil = "";
    run.updatedAt = now.toISOString();
    return structuredClone(run);
  }
  const database = getProspectDatabase();
  return database.$transaction(async (transaction) => {
    const row = await transaction.websiteRepairAuditRun.findUniqueOrThrow({ where: { id: input.id } });
    if (row.leaseToken !== input.leaseToken || row.nextIndex !== input.expectedNextIndex || row.status !== "AUDITING") {
      throw new Error("The Full Legacy Cleanup audit lease changed. Resume the run.");
    }
    const reviewedItems = [...jsonArray<ExistingWebsiteRepairReviewedItem>(row.reviewedItems), ...input.reviewedItems];
    const manualReasonCounts = jsonRecord(row.manualReasonCounts);
    for (const [reason, count] of Object.entries(input.manualReasonCounts)) {
      manualReasonCounts[reason] = (manualReasonCounts[reason] ?? 0) + count;
    }
    const nextIndex = row.nextIndex + input.reviewedItems.length;
    const complete = nextIndex >= row.totalCandidates;
    const updated = await transaction.websiteRepairAuditRun.update({
      where: { id: input.id },
      data: {
        reviewedItems: reviewedItems as unknown as Prisma.InputJsonValue,
        manualReasonCounts,
        nextIndex,
        inspectedCount: nextIndex,
        safeExclusionCount: { increment: input.safeExclusionCount },
        manualReviewCount: { increment: input.manualReviewCount },
        protectedCount: { increment: input.protectedCount },
        status: complete ? "READY" : "AUDITING",
        completedAt: complete ? now : null,
        leaseToken: null,
        leaseUntil: null,
      },
    });
    return rowToRun(updated);
  }, { isolationLevel: "Serializable" });
}

export async function releaseWebsiteRepairAuditLease(input: {
  id: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
}) {
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id);
    if (run?.leaseToken === input.leaseToken) {
      run.leaseToken = "";
      run.leaseUntil = "";
      run.errorCode = input.errorCode;
      run.errorMessage = input.errorMessage;
      run.updatedAt = new Date().toISOString();
    }
    return;
  }
  await getProspectDatabase().websiteRepairAuditRun.updateMany({
    where: { id: input.id, leaseToken: input.leaseToken },
    data: { leaseToken: null, leaseUntil: null, errorCode: input.errorCode, errorMessage: input.errorMessage },
  });
}

export async function beginWebsiteRepairAuditApply(input: {
  id: string;
  accessToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const authorized = await getAuthorizedWebsiteRepairAuditRun(input.id, input.accessToken, now);
  if (authorized.status === "APPLIED") return authorized;
  if (authorized.status !== "READY" || authorized.applyStatus !== "NOT_STARTED") {
    throw new Error("This Full Legacy Cleanup run is not ready to Apply.");
  }
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id)!;
    run.status = "APPLYING";
    run.applyStatus = "APPLYING";
    run.applyStartedAt = now.toISOString();
    run.updatedAt = now.toISOString();
    return structuredClone(run);
  }
  const updated = await getProspectDatabase().websiteRepairAuditRun.updateMany({
    where: { id: input.id, status: "READY", applyStatus: "NOT_STARTED", expiresAt: { gt: now } },
    data: { status: "APPLYING", applyStatus: "APPLYING", applyStartedAt: now, errorCode: null, errorMessage: null },
  });
  if (updated.count !== 1) throw new Error("This Full Legacy Cleanup run changed before Apply. Reload the run.");
  return (await rawRun(input.id))!;
}

export async function claimWebsiteRepairApplyWork(input: {
  id: string;
  accessToken: string;
  now?: Date;
  leaseMs?: number;
}) {
  const now = input.now ?? new Date();
  const authorized = await getAuthorizedWebsiteRepairAuditRun(input.id, input.accessToken, now);
  if (authorized.status === "APPLIED") return { run: authorized, leaseToken: "" };
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + (input.leaseMs ?? websiteRepairApplyLeaseMs));
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id)!;
    if (run.status !== "APPLYING" || (run.leaseUntil && Date.parse(run.leaseUntil) > now.getTime())) return null;
    run.leaseToken = leaseToken;
    run.leaseUntil = leaseUntil.toISOString();
    return { run: structuredClone(run), leaseToken };
  }
  const database = getProspectDatabase();
  const claimed = await database.websiteRepairAuditRun.updateMany({
    where: { id: input.id, status: "APPLYING", expiresAt: { gt: now }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
    data: { leaseToken, leaseUntil },
  });
  if (claimed.count !== 1) return null;
  return {
    run: rowToRun(await database.websiteRepairAuditRun.findUniqueOrThrow({ where: { id: input.id } })),
    leaseToken,
  };
}

export async function completeWebsiteRepairApplyGroup(input: {
  id: string;
  leaseToken: string;
  expectedApplyNextIndex: number;
  processedCount: number;
  changedCount: number;
  remainingCandidatesAfter?: number;
  done: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id);
    if (!run || run.leaseToken !== input.leaseToken || run.applyNextIndex !== input.expectedApplyNextIndex) {
      throw new Error("The Full Legacy Cleanup Apply lease changed. Resume the run.");
    }
    run.applyNextIndex += input.processedCount;
    run.appliedCount += input.changedCount;
    run.status = input.done ? "APPLIED" : "APPLYING";
    run.applyStatus = input.done ? "COMPLETED" : "APPLYING";
    run.remainingCandidatesAfter = input.remainingCandidatesAfter ?? run.remainingCandidatesAfter;
    run.applyCompletedAt = input.done ? now.toISOString() : "";
    run.leaseToken = "";
    run.leaseUntil = "";
    run.updatedAt = now.toISOString();
    return structuredClone(run);
  }
  const database = getProspectDatabase();
  const updated = await database.websiteRepairAuditRun.updateMany({
    where: { id: input.id, leaseToken: input.leaseToken, applyNextIndex: input.expectedApplyNextIndex, status: "APPLYING" },
    data: {
      applyNextIndex: { increment: input.processedCount },
      appliedCount: { increment: input.changedCount },
      status: input.done ? "APPLIED" : "APPLYING",
      applyStatus: input.done ? "COMPLETED" : "APPLYING",
      remainingCandidatesAfter: input.remainingCandidatesAfter,
      applyCompletedAt: input.done ? now : null,
      leaseToken: null,
      leaseUntil: null,
    },
  });
  if (updated.count !== 1) throw new Error("The Full Legacy Cleanup Apply lease changed. Resume the run.");
  return (await rawRun(input.id))!;
}

export async function releaseWebsiteRepairApplyLease(input: {
  id: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
}) {
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id);
    if (run?.leaseToken === input.leaseToken && run.status === "APPLYING") {
      run.leaseToken = "";
      run.leaseUntil = "";
      run.errorCode = input.errorCode;
      run.errorMessage = input.errorMessage;
      run.updatedAt = new Date().toISOString();
    }
    return;
  }
  await getProspectDatabase().websiteRepairAuditRun.updateMany({
    where: { id: input.id, leaseToken: input.leaseToken, status: "APPLYING" },
    data: { leaseToken: null, leaseUntil: null, errorCode: input.errorCode, errorMessage: input.errorMessage },
  });
}

export async function recordWebsiteRepairRemainingCandidates(input: {
  id: string;
  remainingCandidatesAfter: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!Number.isSafeInteger(input.remainingCandidatesAfter) || input.remainingCandidatesAfter < 0) {
    throw new Error("The Full Legacy Cleanup remaining inventory count is invalid.");
  }
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id);
    if (!run || run.status !== "APPLIED") return rawRun(input.id);
    run.remainingCandidatesAfter = input.remainingCandidatesAfter;
    run.updatedAt = now.toISOString();
    return structuredClone(run);
  }
  await getProspectDatabase().websiteRepairAuditRun.updateMany({
    where: { id: input.id, status: "APPLIED" },
    data: { remainingCandidatesAfter: input.remainingCandidatesAfter, updatedAt: now },
  });
  return rawRun(input.id);
}

export async function failWebsiteRepairApply(input: {
  id: string;
  leaseToken: string;
  errorCode: string;
  errorMessage: string;
}) {
  if (persistenceMode() === "memory") {
    const run = memoryRuns().find((candidate) => candidate.id === input.id);
    if (run?.leaseToken === input.leaseToken) {
      run.status = run.applyNextIndex > 0 ? "PARTIAL_NEEDS_REVIEW" : "APPLY_FAILED";
      run.applyStatus = run.applyNextIndex > 0 ? "PARTIAL_NEEDS_REVIEW" : "FAILED";
      run.leaseToken = "";
      run.leaseUntil = "";
      run.errorCode = input.errorCode;
      run.errorMessage = input.errorMessage;
      run.updatedAt = new Date().toISOString();
    }
    return;
  }
  const row = await getProspectDatabase().websiteRepairAuditRun.findUnique({ where: { id: input.id } });
  if (!row || row.leaseToken !== input.leaseToken) return;
  await getProspectDatabase().websiteRepairAuditRun.updateMany({
    where: { id: input.id, leaseToken: input.leaseToken },
    data: {
      status: row.applyNextIndex > 0 ? "PARTIAL_NEEDS_REVIEW" : "APPLY_FAILED",
      applyStatus: row.applyNextIndex > 0 ? "PARTIAL_NEEDS_REVIEW" : "FAILED",
      leaseToken: null,
      leaseUntil: null,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    },
  });
}

export function resetWebsiteRepairAuditRunsForTests() {
  globalRuns.websiteRepairAuditRuns = [];
}
