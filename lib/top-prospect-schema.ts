import { PrismaClient } from "@prisma/client";

export const TOP_PROSPECT_TABLES = ["TopProspectJob", "TopProspectResult"] as const;
export const TOP_PROSPECT_MIGRATION_ID = "20260611_top_prospects";
export const TOP_PROSPECT_MIGRATION_CHECKSUM = "d89d591749bba50e2d279e45ec69008746c8c87deacde4e72cf2f61bd760538c";
export const TOP_PROSPECT_MIGRATION_STATEMENTS = [
  `CREATE TABLE "TopProspectJob" ("id" TEXT NOT NULL, "tradeCategory" TEXT NOT NULL, "city" TEXT NOT NULL, "state" TEXT NOT NULL, "radiusKm" INTEGER NOT NULL, "businessesToScan" INTEGER NOT NULL DEFAULT 50, "finalProspectsWanted" INTEGER NOT NULL DEFAULT 10, "status" TEXT NOT NULL DEFAULT 'QUEUED', "stage" TEXT NOT NULL DEFAULT 'DISCOVER', "discoveredLeads" JSONB, "nextLeadIndex" INTEGER NOT NULL DEFAULT 0, "scannedCount" INTEGER NOT NULL DEFAULT 0, "qualifiedCount" INTEGER NOT NULL DEFAULT 0, "skippedCount" INTEGER NOT NULL DEFAULT 0, "skipSummary" JSONB, "errorMessage" TEXT, "leaseToken" TEXT, "leaseUntil" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "TopProspectJob_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE "TopProspectResult" ("id" TEXT NOT NULL, "jobId" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "rank" INTEGER, "selected" BOOLEAN NOT NULL DEFAULT false, "opportunityScore" INTEGER NOT NULL, "mainWeakness" TEXT NOT NULL, "whyMayBuy" TEXT NOT NULL, "pitchAngle" TEXT NOT NULL, "buildPrompt" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TopProspectResult_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX "TopProspectJob_status_createdAt_idx" ON "TopProspectJob"("status", "createdAt")`,
  `CREATE UNIQUE INDEX "TopProspectResult_jobId_prospectId_key" ON "TopProspectResult"("jobId", "prospectId")`,
  `CREATE INDEX "TopProspectResult_jobId_selected_rank_idx" ON "TopProspectResult"("jobId", "selected", "rank")`,
  `CREATE INDEX "TopProspectResult_prospectId_createdAt_idx" ON "TopProspectResult"("prospectId", "createdAt")`,
  `ALTER TABLE "TopProspectResult" ADD CONSTRAINT "TopProspectResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TopProspectJob"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
  `ALTER TABLE "TopProspectResult" ADD CONSTRAINT "TopProspectResult_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
] as const;

const TOP_PROSPECT_SCHEMA_LOCK = 928641311;
const TOP_PROSPECT_SCHEMA_LOCK_ATTEMPTS = 5;
const TOP_PROSPECT_SCHEMA_LOCK_RETRY_MS = 250;
const globalSchema = globalThis as typeof globalThis & { topProspectSchemaReady?: Promise<void> };

function topProspectDatabaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  return environment.DATABASE_URL_UNPOOLED?.trim() || environment.DATABASE_URL?.trim();
}

type SchemaTransaction = {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T>(query: string): Promise<T>;
};

type SchemaDatabase = {
  $transaction<T>(callback: (transaction: SchemaTransaction) => Promise<T>, options: { maxWait: number; timeout: number }): Promise<T>;
  $disconnect(): Promise<void>;
};

async function presentTables(transaction: SchemaTransaction) {
  const rows = await transaction.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('TopProspectJob', 'TopProspectResult')`,
  );
  return new Set(rows.map((row) => row.table_name));
}

async function recordMigration(transaction: SchemaTransaction) {
  await transaction.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") SELECT '00000000-0000-4000-8000-000000000004', '${TOP_PROSPECT_MIGRATION_CHECKSUM}', now(), '${TOP_PROSPECT_MIGRATION_ID}', now(), 1 WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '${TOP_PROSPECT_MIGRATION_ID}') ON CONFLICT ("id") DO NOTHING`,
  );
}

export class TopProspectSchemaLockUnavailableError extends Error {
  constructor() {
    super("Another Top Prospects schema initialization currently holds the transaction lock.");
    this.name = "TopProspectSchemaLockUnavailableError";
  }
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireSchemaLock(
  transaction: SchemaTransaction,
  pause: (milliseconds: number) => Promise<void> = wait,
) {
  for (let attempt = 1; attempt <= TOP_PROSPECT_SCHEMA_LOCK_ATTEMPTS; attempt += 1) {
    const rows = await transaction.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(${TOP_PROSPECT_SCHEMA_LOCK}) AS "acquired"`,
    );
    if (rows[0]?.acquired === true) return;
    if (attempt < TOP_PROSPECT_SCHEMA_LOCK_ATTEMPTS) await pause(TOP_PROSPECT_SCHEMA_LOCK_RETRY_MS);
  }
  throw new TopProspectSchemaLockUnavailableError();
}

export async function initializeTopProspectSchema(
  database: SchemaDatabase = new PrismaClient({ datasourceUrl: topProspectDatabaseUrl() }) as unknown as SchemaDatabase,
) {
  try {
    return await database.$transaction(async (transaction) => {
      await acquireSchemaLock(transaction);
      const existing = await presentTables(transaction);
      if (existing.size === TOP_PROSPECT_TABLES.length) {
        await recordMigration(transaction);
        return "ready" as const;
      }
      if (existing.size > 0) throw new Error("Top Prospects schema is partially initialized.");

      for (const statement of TOP_PROSPECT_MIGRATION_STATEMENTS) {
        await transaction.$executeRawUnsafe(statement);
      }
      await recordMigration(transaction);
      const created = await presentTables(transaction);
      if (created.size !== TOP_PROSPECT_TABLES.length) throw new Error("Top Prospects schema verification failed.");
      return "initialized" as const;
    }, { maxWait: 5_000, timeout: 30_000 });
  } finally {
    await database.$disconnect();
  }
}

export async function ensureTopProspectSchema() {
  if (!globalSchema.topProspectSchemaReady) {
    globalSchema.topProspectSchemaReady = initializeTopProspectSchema()
      .then(() => undefined)
      .catch((error) => {
        globalSchema.topProspectSchemaReady = undefined;
        throw error;
      });
  }
  return globalSchema.topProspectSchemaReady;
}

export function resetTopProspectSchemaForTests() {
  globalSchema.topProspectSchemaReady = undefined;
}
