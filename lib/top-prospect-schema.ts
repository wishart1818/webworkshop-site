import { PrismaClient } from "@prisma/client";

export const TOP_PROSPECT_TABLES = ["TopProspectJob", "TopProspectResult"] as const;
export const TOP_PROSPECT_MIGRATION_ID = "20260611_top_prospects";
export const TOP_PROSPECT_MIGRATION_CHECKSUM = "d89d591749bba50e2d279e45ec69008746c8c87deacde4e72cf2f61bd760538c";
export const TOP_PROSPECT_UPGRADE_MIGRATION_ID = "20260613_prospect_modes";
export const TOP_PROSPECT_UPGRADE_MIGRATION_CHECKSUM = "b395a67f047dd33f76c615c4476ca8e15f6dc8faeff7b8bef23a79293fafc477";
export const NO_WEBSITE_PROSPECT_MIGRATION_ID = "20260613_no_website_prospects";
export const NO_WEBSITE_PROSPECT_MIGRATION_CHECKSUM = "283a230d1dc9e7a6fc460c9e088387e73b954cdf9299afbaf80fab44ccbdcf13";
export const OUTREACH_PACKAGE_MIGRATION_ID = "20260613_outreach_packages";
export const OUTREACH_PACKAGE_MIGRATION_CHECKSUM = "cc5c987efa4a1c20ff8cd09521e9a80ec5be6775aff0dd4d2fc60ae1d18fd1fe";
export const PUBLIC_PREVIEW_TOKEN_MIGRATION_ID = "20260613_public_preview_tokens";
export const PUBLIC_PREVIEW_TOKEN_MIGRATION_CHECKSUM = "699fdb67a629417516fcd8016b41762d4326720bc8e252440bb2b347ffe1f929";
export const PROSPECT_CLASSIFICATION_MIGRATION_ID = "20260614_prospect_classification";
export const PROSPECT_CLASSIFICATION_MIGRATION_CHECKSUM = "f63819f822780092faba697cdbaab90366dcb7abdd859819a501c5f21da6689b";
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
export const TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS = [
  `ALTER TABLE "TopProspectJob" ADD COLUMN IF NOT EXISTS "prospectMode" TEXT NOT NULL DEFAULT 'strict', ADD COLUMN IF NOT EXISTS "workflowType" TEXT NOT NULL DEFAULT 'search'`,
  `ALTER TABLE "TopProspectResult" ADD COLUMN IF NOT EXISTS "websiteQualityScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "revenueOpportunityScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "contactabilityScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "localMarketCompetitivenessScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "aiReplacementConfidenceScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "weightedSalesScore" INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS "TopProspectResult_jobId_weightedSalesScore_idx" ON "TopProspectResult"("jobId", "weightedSalesScore")`,
] as const;
export const NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS = [
  `ALTER TABLE "Prospect" ALTER COLUMN "website" DROP NOT NULL, ADD COLUMN IF NOT EXISTS "profileUrl" TEXT, ADD COLUMN IF NOT EXISTS "prospectType" TEXT NOT NULL DEFAULT 'redesign', ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "recentReviewCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "sourceConfidence" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "TopProspectJob" ADD COLUMN IF NOT EXISTS "prospectType" TEXT NOT NULL DEFAULT 'redesign'`,
  `ALTER TABLE "TopProspectResult" ADD COLUMN IF NOT EXISTS "prospectType" TEXT NOT NULL DEFAULT 'redesign', ADD COLUMN IF NOT EXISTS "onlinePresenceGapScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "businessActivityScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "websiteNeedScore" INTEGER NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS "Prospect_prospectType_priorityScore_idx" ON "Prospect"("prospectType", "priorityScore")`,
  `CREATE INDEX IF NOT EXISTS "TopProspectJob_prospectType_createdAt_idx" ON "TopProspectJob"("prospectType", "createdAt")`,
] as const;
export const OUTREACH_PACKAGE_MIGRATION_STATEMENTS = [
  `ALTER TABLE "TopProspectResult" ADD COLUMN IF NOT EXISTS "packageStatus" TEXT NOT NULL DEFAULT 'NOT_GENERATED', ADD COLUMN IF NOT EXISTS "previewLink" TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "packageGeneratedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "packageReviewedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "packageApprovedAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "packageSentAt" TIMESTAMP(3), ADD COLUMN IF NOT EXISTS "packageSkippedAt" TIMESTAMP(3)`,
  `CREATE INDEX IF NOT EXISTS "TopProspectResult_packageStatus_createdAt_idx" ON "TopProspectResult"("packageStatus", "createdAt")`,
] as const;
export const PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS = [
  `ALTER TABLE "TopProspectResult" ADD COLUMN IF NOT EXISTS "publicPreviewToken" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "TopProspectResult_publicPreviewToken_key" ON "TopProspectResult"("publicPreviewToken")`,
] as const;
export const PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS = [
  `ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "classification" TEXT NOT NULL DEFAULT 'not_enough_contact_info', ADD COLUMN IF NOT EXISTS "contactFormUrl" TEXT, ADD COLUMN IF NOT EXISTS "address" TEXT, ADD COLUMN IF NOT EXISTS "activitySignals" JSONB NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "recommendedContactMethod" TEXT NOT NULL DEFAULT 'needs_manual_contact_research', ADD COLUMN IF NOT EXISTS "inactive" BOOLEAN NOT NULL DEFAULT false`,
  `UPDATE "Prospect" SET "classification" = CASE WHEN "website" IS NOT NULL AND "website" <> '' THEN 'website_redesign' WHEN "profileUrl" ~* '(facebook|fb|instagram)\\.com' THEN 'social_only' WHEN "profileUrl" IS NOT NULL AND "profileUrl" <> '' THEN 'listing_only' WHEN "phone" IS NOT NULL AND "phone" <> '' AND ("publicEmail" IS NULL OR "publicEmail" = '') THEN 'phone_only' WHEN ("phone" IS NOT NULL AND "phone" <> '') OR ("publicEmail" IS NOT NULL AND "publicEmail" <> '') THEN 'no_website' ELSE 'not_enough_contact_info' END WHERE "classification" = 'not_enough_contact_info'`,
  `UPDATE "Prospect" SET "recommendedContactMethod" = CASE WHEN "inactive" THEN 'do_not_contact' WHEN "publicEmail" IS NOT NULL AND "publicEmail" <> '' THEN 'send_email' WHEN "contactFormUrl" IS NOT NULL AND "contactFormUrl" <> '' THEN 'submit_contact_form' WHEN "profileUrl" ~* '(facebook|fb)\\.com' THEN 'message_on_facebook' WHEN "phone" IS NOT NULL AND "phone" <> '' THEN 'call_first' ELSE 'needs_manual_contact_research' END WHERE "recommendedContactMethod" = 'needs_manual_contact_research'`,
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

async function recordMigration(transaction: SchemaTransaction, id: string, checksum: string, suffix: string) {
  await transaction.$executeRawUnsafe(
    `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") SELECT '00000000-0000-4000-8000-${suffix}', '${checksum}', now(), '${id}', now(), 1 WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '${id}') ON CONFLICT ("id") DO NOTHING`,
  );
}

async function applyTopProspectUpgrade(transaction: SchemaTransaction) {
  for (const statement of TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, TOP_PROSPECT_UPGRADE_MIGRATION_ID, TOP_PROSPECT_UPGRADE_MIGRATION_CHECKSUM, "000000000005");
}

async function applyNoWebsiteProspectUpgrade(transaction: SchemaTransaction) {
  for (const statement of NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, NO_WEBSITE_PROSPECT_MIGRATION_ID, NO_WEBSITE_PROSPECT_MIGRATION_CHECKSUM, "000000000006");
}

async function applyOutreachPackageUpgrade(transaction: SchemaTransaction) {
  for (const statement of OUTREACH_PACKAGE_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, OUTREACH_PACKAGE_MIGRATION_ID, OUTREACH_PACKAGE_MIGRATION_CHECKSUM, "000000000007");
}

async function applyPublicPreviewTokenUpgrade(transaction: SchemaTransaction) {
  for (const statement of PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, PUBLIC_PREVIEW_TOKEN_MIGRATION_ID, PUBLIC_PREVIEW_TOKEN_MIGRATION_CHECKSUM, "000000000008");
}

async function applyProspectClassificationUpgrade(transaction: SchemaTransaction) {
  for (const statement of PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, PROSPECT_CLASSIFICATION_MIGRATION_ID, PROSPECT_CLASSIFICATION_MIGRATION_CHECKSUM, "000000000009");
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
        await recordMigration(transaction, TOP_PROSPECT_MIGRATION_ID, TOP_PROSPECT_MIGRATION_CHECKSUM, "000000000004");
        await applyTopProspectUpgrade(transaction);
        await applyNoWebsiteProspectUpgrade(transaction);
        await applyOutreachPackageUpgrade(transaction);
        await applyPublicPreviewTokenUpgrade(transaction);
        await applyProspectClassificationUpgrade(transaction);
        return "ready" as const;
      }
      if (existing.size > 0) throw new Error("Top Prospects schema is partially initialized.");

      for (const statement of TOP_PROSPECT_MIGRATION_STATEMENTS) {
        await transaction.$executeRawUnsafe(statement);
      }
      await recordMigration(transaction, TOP_PROSPECT_MIGRATION_ID, TOP_PROSPECT_MIGRATION_CHECKSUM, "000000000004");
      await applyTopProspectUpgrade(transaction);
      await applyNoWebsiteProspectUpgrade(transaction);
      await applyOutreachPackageUpgrade(transaction);
      await applyPublicPreviewTokenUpgrade(transaction);
      await applyProspectClassificationUpgrade(transaction);
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
