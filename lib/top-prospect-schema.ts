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
export const WEBSITE_AVAILABILITY_MIGRATION_ID = "20260614_website_availability";
export const WEBSITE_AVAILABILITY_MIGRATION_CHECKSUM = "5b7c9ac49943bee6694553f1d36f8f0fa13ddcb6ea64e8b1e65dd7da48b39715";
export const OUTREACH_PREFERENCE_MIGRATION_ID = "20260619_outreach_preference";
export const OUTREACH_PREFERENCE_MIGRATION_CHECKSUM = "171b83b3229e6bae9328cd5448b08b7ac4c7d5d3fd7af591e6b990f0fa7569a6";
export const AUTONOMOUS_GROWTH_MIGRATION_ID = "20260620_autonomous_growth";
export const AUTONOMOUS_GROWTH_MIGRATION_CHECKSUM = "f5ed776c260e24514be1b14dc2d92f3a966a1ba8c647497bc83ba73a8ae0c7d8";
export const AUTONOMOUS_LEARNING_MIGRATION_ID = "20260621_autonomous_learning";
export const AUTONOMOUS_LEARNING_MIGRATION_CHECKSUM = "6b436396a015ec47e43ae39c2ae8a6e6c98f31ae050e0cd25a00191a7cf864b3";
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
export const WEBSITE_AVAILABILITY_MIGRATION_STATEMENTS = [
  `ALTER TABLE "Prospect" ADD COLUMN IF NOT EXISTS "websiteStatus" TEXT NOT NULL DEFAULT 'unknown', ADD COLUMN IF NOT EXISTS "websiteStatusDetail" TEXT, ADD COLUMN IF NOT EXISTS "websiteAnalysisAttemptedAt" TIMESTAMP(3)`,
  `UPDATE "Prospect" SET "websiteStatus" = 'no_owned_website', "prospectType" = 'no_website_social_only' WHERE ("website" IS NULL OR "website" = '') AND ("websiteStatus" = 'unknown' OR "prospectType" = 'redesign')`,
] as const;
export const OUTREACH_PREFERENCE_MIGRATION_STATEMENTS = [
  `ALTER TABLE "TopProspectJob" ADD COLUMN IF NOT EXISTS "outreachPreference" TEXT NOT NULL DEFAULT 'written_only'`,
  `UPDATE "Prospect" SET "recommendedContactMethod" = 'message_on_social' WHERE "recommendedContactMethod" = 'needs_manual_contact_research' AND "profileUrl" ~* 'instagram\\.com' AND ("publicEmail" IS NULL OR "publicEmail" = '') AND ("contactFormUrl" IS NULL OR "contactFormUrl" = '')`,
  `UPDATE "Prospect" SET "recommendedContactMethod" = 'needs_manual_contact_research' WHERE "recommendedContactMethod" = 'call_first' AND ("publicEmail" IS NULL OR "publicEmail" = '') AND ("contactFormUrl" IS NULL OR "contactFormUrl" = '') AND ("profileUrl" IS NULL OR "profileUrl" !~* '(facebook|fb|instagram)\\.com')`,
] as const;
export const AUTONOMOUS_GROWTH_MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "AutonomousGrowthSettings" ("id" TEXT NOT NULL DEFAULT 'default', "mode" TEXT NOT NULL DEFAULT 'off', "killSwitch" BOOLEAN NOT NULL DEFAULT true, "targetCities" JSONB NOT NULL DEFAULT '[]'::jsonb, "targetServiceAreas" JSONB NOT NULL DEFAULT '[]'::jsonb, "targetTrades" JSONB NOT NULL DEFAULT '[]'::jsonb, "excludedTrades" JSONB NOT NULL DEFAULT '[]'::jsonb, "maxProspectsScannedPerDay" INTEGER NOT NULL DEFAULT 25, "maxPreviewsGeneratedPerDay" INTEGER NOT NULL DEFAULT 10, "maxEmailsQueuedPerDay" INTEGER NOT NULL DEFAULT 5, "maxEmailsSentPerDay" INTEGER NOT NULL DEFAULT 5, "emailCooldownMinutes" INTEGER NOT NULL DEFAULT 7, "followUpsEnabled" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AutonomousGrowthSettings_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "OutreachQueueItem" ("id" TEXT NOT NULL, "prospectId" TEXT, "topProspectResultId" TEXT, "businessName" TEXT NOT NULL, "trade" TEXT NOT NULL, "city" TEXT NOT NULL, "website" TEXT, "email" TEXT, "contactSource" TEXT NOT NULL, "contactConfidence" INTEGER NOT NULL DEFAULT 0, "previewLink" TEXT NOT NULL, "previewQualityScore" INTEGER NOT NULL DEFAULT 0, "subjectLine" TEXT NOT NULL, "emailBody" TEXT NOT NULL, "dmScript" TEXT NOT NULL, "loomTalkingPoints" TEXT NOT NULL, "eligibilityReason" TEXT NOT NULL, "blockedReason" TEXT, "status" TEXT NOT NULL DEFAULT 'Draft', "sourceProvider" TEXT, "queuedDate" TIMESTAMP(3), "sentDate" TIMESTAMP(3), "followUpDate" TIMESTAMP(3), "replyStatus" TEXT, "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "OutreachQueueItem_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "OutreachQueueItem_topProspectResultId_key" ON "OutreachQueueItem"("topProspectResultId")`,
  `CREATE INDEX IF NOT EXISTS "OutreachQueueItem_status_createdAt_idx" ON "OutreachQueueItem"("status", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "OutreachQueueItem_trade_city_idx" ON "OutreachQueueItem"("trade", "city")`,
  `CREATE INDEX IF NOT EXISTS "OutreachQueueItem_prospectId_idx" ON "OutreachQueueItem"("prospectId")`,
] as const;
export const AUTONOMOUS_LEARNING_MIGRATION_STATEMENTS = [
  `ALTER TABLE "AutonomousGrowthSettings" ADD COLUMN IF NOT EXISTS "styleProfiles" JSONB NOT NULL DEFAULT '{}'::jsonb`,
  `ALTER TABLE "OutreachQueueItem" ADD COLUMN IF NOT EXISTS "reviewScore" INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS "reviewSummary" TEXT NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS "improvementSuggestions" JSONB NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "detectedIssues" JSONB NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "recommendedNextAction" TEXT NOT NULL DEFAULT 'Needs Human Review', ADD COLUMN IF NOT EXISTS "regenerationPlan" JSONB NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "rewritePlan" JSONB NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN IF NOT EXISTS "feedbackLabels" JSONB NOT NULL DEFAULT '[]'::jsonb`,
  `CREATE TABLE IF NOT EXISTS "AutonomousFeedbackEvent" ("id" TEXT NOT NULL, "queueItemId" TEXT NOT NULL, "topProspectResultId" TEXT, "businessName" TEXT NOT NULL, "trade" TEXT NOT NULL, "city" TEXT NOT NULL, "feedbackLabel" TEXT NOT NULL, "feedbackCategory" TEXT NOT NULL, "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AutonomousFeedbackEvent_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "AutonomousLearningEvent" ("id" TEXT NOT NULL, "queueItemId" TEXT NOT NULL, "topProspectResultId" TEXT, "trade" TEXT NOT NULL, "city" TEXT NOT NULL, "leadSource" TEXT NOT NULL, "previewStyle" TEXT NOT NULL, "subjectLineAngle" TEXT NOT NULL, "outreachAngle" TEXT NOT NULL, "contactMethod" TEXT NOT NULL, "previewQualityScore" INTEGER NOT NULL, "reviewScore" INTEGER NOT NULL DEFAULT 0, "replyStatus" TEXT, "positiveReplyStatus" TEXT, "lostReason" TEXT, "manualNote" TEXT, "feedbackLabels" JSONB NOT NULL DEFAULT '[]'::jsonb, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AutonomousLearningEvent_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "AutonomousRunReview" ("id" TEXT NOT NULL, "mode" TEXT NOT NULL, "prospectsScanned" INTEGER NOT NULL DEFAULT 0, "prospectsKept" INTEGER NOT NULL DEFAULT 0, "prospectsBlocked" INTEGER NOT NULL DEFAULT 0, "previewsGenerated" INTEGER NOT NULL DEFAULT 0, "previewsPassed" INTEGER NOT NULL DEFAULT 0, "previewsFailed" INTEGER NOT NULL DEFAULT 0, "commonPreviewIssues" JSONB NOT NULL DEFAULT '[]'::jsonb, "commonLeadIssues" JSONB NOT NULL DEFAULT '[]'::jsonb, "outreachQualityNotes" JSONB NOT NULL DEFAULT '[]'::jsonb, "recommendedFixes" JSONB NOT NULL DEFAULT '[]'::jsonb, "summary" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AutonomousRunReview_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "AutonomousFeedbackEvent_queueItemId_createdAt_idx" ON "AutonomousFeedbackEvent"("queueItemId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousFeedbackEvent_trade_city_idx" ON "AutonomousFeedbackEvent"("trade", "city")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousFeedbackEvent_feedbackLabel_createdAt_idx" ON "AutonomousFeedbackEvent"("feedbackLabel", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_trade_city_idx" ON "AutonomousLearningEvent"("trade", "city")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_leadSource_createdAt_idx" ON "AutonomousLearningEvent"("leadSource", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_previewStyle_createdAt_idx" ON "AutonomousLearningEvent"("previewStyle", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_createdAt_idx" ON "AutonomousLearningEvent"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "AutonomousRunReview_mode_createdAt_idx" ON "AutonomousRunReview"("mode", "createdAt")`,
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

async function applyWebsiteAvailabilityUpgrade(transaction: SchemaTransaction) {
  for (const statement of WEBSITE_AVAILABILITY_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, WEBSITE_AVAILABILITY_MIGRATION_ID, WEBSITE_AVAILABILITY_MIGRATION_CHECKSUM, "000000000010");
}

async function applyOutreachPreferenceUpgrade(transaction: SchemaTransaction) {
  for (const statement of OUTREACH_PREFERENCE_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, OUTREACH_PREFERENCE_MIGRATION_ID, OUTREACH_PREFERENCE_MIGRATION_CHECKSUM, "000000000011");
}

async function applyAutonomousGrowthUpgrade(transaction: SchemaTransaction) {
  for (const statement of AUTONOMOUS_GROWTH_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, AUTONOMOUS_GROWTH_MIGRATION_ID, AUTONOMOUS_GROWTH_MIGRATION_CHECKSUM, "000000000012");
}

async function applyAutonomousLearningUpgrade(transaction: SchemaTransaction) {
  for (const statement of AUTONOMOUS_LEARNING_MIGRATION_STATEMENTS) {
    await transaction.$executeRawUnsafe(statement);
  }
  await recordMigration(transaction, AUTONOMOUS_LEARNING_MIGRATION_ID, AUTONOMOUS_LEARNING_MIGRATION_CHECKSUM, "000000000013");
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
        await applyWebsiteAvailabilityUpgrade(transaction);
        await applyOutreachPreferenceUpgrade(transaction);
        await applyAutonomousGrowthUpgrade(transaction);
        await applyAutonomousLearningUpgrade(transaction);
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
      await applyWebsiteAvailabilityUpgrade(transaction);
      await applyOutreachPreferenceUpgrade(transaction);
      await applyAutonomousGrowthUpgrade(transaction);
      await applyAutonomousLearningUpgrade(transaction);
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
