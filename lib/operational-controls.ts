import { PrismaClient, type Prisma } from "@prisma/client";

type AuditInput = {
  action: string;
  outcome: "success" | "rejected" | "failure";
  subject?: string;
  metadata?: Prisma.InputJsonObject;
};

type MemoryBucket = { count: number; windowStart: number };
type MemoryAudit = AuditInput & { id: string; createdAt: string };

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
    await recordAudit({
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
