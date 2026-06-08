import { PrismaClient, type Prisma } from "@prisma/client";

type AuditInput = {
  action: string;
  outcome: "success" | "rejected" | "failure";
  subject?: string;
  metadata?: Prisma.InputJsonObject;
};

type MemoryBucket = { count: number; windowStart: number };
type MemoryAudit = AuditInput & { id: string; createdAt: string };
export type AuditEventView = AuditInput & { id: string; createdAt: string };

const globalOperations = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
  rateLimitBuckets?: Map<string, MemoryBucket>;
  auditEvents?: MemoryAudit[];
};

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function prismaClient() {
  if (!globalOperations.prisma) globalOperations.prisma = new PrismaClient();
  return globalOperations.prisma;
}

function bucketStart(windowMs: number) {
  return Math.floor(Date.now() / windowMs) * windowMs;
}

export async function enforceRateLimit(input: {
  action: string;
  subject: string;
  limit: number;
  windowMs: number;
}) {
  const windowStart = bucketStart(input.windowMs);
  let count: number;

  if (hasDatabase()) {
    const prisma = prismaClient();
    const bucket = await prisma.rateLimitBucket.upsert({
      where: {
        action_subject_windowStart: {
          action: input.action,
          subject: input.subject,
          windowStart: new Date(windowStart),
        },
      },
      create: {
        action: input.action,
        subject: input.subject,
        windowStart: new Date(windowStart),
        count: 1,
      },
      update: { count: { increment: 1 } },
      select: { count: true },
    });
    count = bucket.count;
    if (Math.random() < 0.02) {
      await prisma.rateLimitBucket.deleteMany({
        where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      });
    }
  } else {
    const buckets = globalOperations.rateLimitBuckets ?? new Map<string, MemoryBucket>();
    globalOperations.rateLimitBuckets = buckets;
    const key = `${input.action}:${input.subject}:${windowStart}`;
    const bucket = buckets.get(key) ?? { count: 0, windowStart };
    bucket.count += 1;
    buckets.set(key, bucket);
    count = bucket.count;
  }

  if (count > input.limit) {
    await safeRecordAudit({
      action: input.action,
      outcome: "rejected",
      subject: input.subject,
      metadata: { reason: "rate_limit", count, limit: input.limit },
    });
    throw new Error("Rate limit reached. Please wait before trying again.");
  }

  return { count, remaining: input.limit - count, resetsAt: new Date(windowStart + input.windowMs).toISOString() };
}

export async function recordAudit(input: AuditInput) {
  if (hasDatabase()) {
    await prismaClient().auditEvent.create({ data: input });
    return;
  }

  const events = globalOperations.auditEvents ?? [];
  globalOperations.auditEvents = events;
  events.unshift({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  if (events.length > 500) events.length = 500;
}

export async function safeRecordAudit(
  input: AuditInput,
  write: (event: AuditInput) => Promise<void> = recordAudit,
  report: (message: string, error: unknown) => void = console.error,
) {
  try {
    await write(input);
    return true;
  } catch (error) {
    report("Unable to record operational audit event.", error);
    return false;
  }
}

export function operationalMode() {
  return hasDatabase() ? "postgresql" : "memory";
}

export function resetOperationalMemoryForTests() {
  globalOperations.rateLimitBuckets = new Map();
  globalOperations.auditEvents = [];
}

export function memoryAuditEventsForTests() {
  return structuredClone(globalOperations.auditEvents ?? []);
}

export async function listAuditEvents(limit = 50): Promise<AuditEventView[]> {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  if (hasDatabase()) {
    const events = await prismaClient().auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: boundedLimit,
    });
    return events.map((event) => ({
      id: event.id,
      action: event.action,
      outcome: event.outcome as AuditInput["outcome"],
      subject: event.subject ?? undefined,
      metadata: (event.metadata ?? undefined) as Prisma.InputJsonObject | undefined,
      createdAt: event.createdAt.toISOString(),
    }));
  }
  return structuredClone((globalOperations.auditEvents ?? []).slice(0, boundedLimit));
}

export async function safeListAuditEvents(
  database: { configured: boolean; reachable?: boolean },
  loadEvents = () => listAuditEvents(50),
) {
  if (database.configured && !database.reachable) return [];
  try {
    return await loadEvents();
  } catch {
    return [];
  }
}

export async function databaseHealth() {
  if (!hasDatabase()) {
    return {
      configured: false,
      reachable: false,
      message: process.env.NODE_ENV === "production"
        ? "DATABASE_URL is required before production use."
        : "Development memory mode is active.",
    };
  }
  try {
    const prisma = prismaClient();
    await prisma.$transaction([
      prisma.prospect.count(),
      prisma.auditEvent.count(),
      prisma.rateLimitBucket.count(),
    ]);
    return { configured: true, reachable: true, message: "PostgreSQL and required Prospect Engine tables are reachable." };
  } catch {
    return { configured: true, reachable: false, message: "PostgreSQL is configured, but required tables are not reachable. Check connectivity and migrations." };
  }
}
