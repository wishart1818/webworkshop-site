import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  NO_WEBSITE_PROSPECT_MIGRATION_CHECKSUM,
  NO_WEBSITE_PROSPECT_MIGRATION_ID,
  NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS,
  OUTREACH_PACKAGE_MIGRATION_CHECKSUM,
  OUTREACH_PACKAGE_MIGRATION_ID,
  OUTREACH_PACKAGE_MIGRATION_STATEMENTS,
  PUBLIC_PREVIEW_TOKEN_MIGRATION_CHECKSUM,
  PUBLIC_PREVIEW_TOKEN_MIGRATION_ID,
  PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS,
  PROSPECT_CLASSIFICATION_MIGRATION_CHECKSUM,
  PROSPECT_CLASSIFICATION_MIGRATION_ID,
  PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS,
  TOP_PROSPECT_MIGRATION_CHECKSUM,
  TOP_PROSPECT_MIGRATION_ID,
  TOP_PROSPECT_MIGRATION_STATEMENTS,
  TOP_PROSPECT_UPGRADE_MIGRATION_CHECKSUM,
  TOP_PROSPECT_UPGRADE_MIGRATION_ID,
  TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS,
} from "@/lib/top-prospect-schema";

const REQUIRED_TABLES = [
  "Activity",
  "Analysis",
  "AuditEvent",
  "Note",
  "OutreachDraft",
  "PreviewConcept",
  "Prospect",
  "RateLimitBucket",
  "StatusHistory",
  "TopProspectJob",
  "TopProspectResult",
] as const;
const ADDITIVE_TOP_PROSPECT_TABLES = new Set(["TopProspectJob", "TopProspectResult"]);

const MIGRATIONS = [
  {
    id: "20260607_initial",
    checksum: "fa8d9c1edad7ffc89b8a4b534745e2309f4b69c1e9ff634944b208f6a562b591",
    statements: [
      `CREATE SCHEMA IF NOT EXISTS "public"`,
      `CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST')`,
      `CREATE TABLE "Prospect" ("id" TEXT NOT NULL, "businessName" TEXT NOT NULL, "website" TEXT NOT NULL, "phone" TEXT, "publicEmail" TEXT, "city" TEXT NOT NULL, "state" TEXT NOT NULL, "tradeCategory" TEXT NOT NULL, "serviceArea" TEXT, "sizeIndicator" TEXT, "priorityScore" INTEGER NOT NULL DEFAULT 0, "status" "ProspectStatus" NOT NULL DEFAULT 'NEW', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "Analysis" ("id" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "overallScore" INTEGER NOT NULL, "opportunityRating" TEXT NOT NULL, "categoryScores" JSONB NOT NULL, "strengths" JSONB NOT NULL, "weaknesses" JSONB NOT NULL, "summary" TEXT NOT NULL, "redesignDirection" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "OutreachDraft" ("id" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "subjectLines" JSONB NOT NULL, "conciseBody" TEXT NOT NULL, "detailedBody" TEXT NOT NULL, "followUps" JSONB NOT NULL, "approvedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "PreviewConcept" ("id" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "content" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PreviewConcept_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "Note" ("id" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Note_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "Activity" ("id" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "type" TEXT NOT NULL, "label" TEXT NOT NULL, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Activity_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "StatusHistory" ("id" TEXT NOT NULL, "prospectId" TEXT NOT NULL, "fromStatus" "ProspectStatus", "toStatus" "ProspectStatus" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX "Prospect_website_key" ON "Prospect"("website")`,
      `CREATE INDEX "Prospect_status_priorityScore_idx" ON "Prospect"("status", "priorityScore")`,
      `CREATE INDEX "Prospect_tradeCategory_state_city_idx" ON "Prospect"("tradeCategory", "state", "city")`,
      `CREATE INDEX "Analysis_prospectId_createdAt_idx" ON "Analysis"("prospectId", "createdAt")`,
      `CREATE INDEX "OutreachDraft_prospectId_createdAt_idx" ON "OutreachDraft"("prospectId", "createdAt")`,
      `CREATE INDEX "PreviewConcept_prospectId_createdAt_idx" ON "PreviewConcept"("prospectId", "createdAt")`,
      `CREATE INDEX "Note_prospectId_createdAt_idx" ON "Note"("prospectId", "createdAt")`,
      `CREATE INDEX "Activity_prospectId_createdAt_idx" ON "Activity"("prospectId", "createdAt")`,
      `CREATE INDEX "StatusHistory_prospectId_createdAt_idx" ON "StatusHistory"("prospectId", "createdAt")`,
      `ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "PreviewConcept" ADD CONSTRAINT "PreviewConcept_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "Note" ADD CONSTRAINT "Note_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "Activity" ADD CONSTRAINT "Activity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
      `ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    ],
  },
  {
    id: "20260607_history_integrity",
    checksum: "7434a2fa20ea304cea3c292a7a3ad7de4dd0e73ec1969af2b7030d59a1f1c75c",
    statements: [
      `CREATE UNIQUE INDEX "Analysis_prospectId_createdAt_key" ON "Analysis"("prospectId", "createdAt")`,
      `CREATE UNIQUE INDEX "OutreachDraft_prospectId_createdAt_key" ON "OutreachDraft"("prospectId", "createdAt")`,
      `CREATE UNIQUE INDEX "PreviewConcept_prospectId_createdAt_key" ON "PreviewConcept"("prospectId", "createdAt")`,
    ],
  },
  {
    id: "20260607_operational_controls",
    checksum: "244046576975f9e05c6fb4758fd8cbbe570694a58326adef4e6138140bd039ed",
    statements: [
      `CREATE TABLE "RateLimitBucket" ("id" TEXT NOT NULL, "action" TEXT NOT NULL, "subject" TEXT NOT NULL, "windowStart" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id"))`,
      `CREATE TABLE "AuditEvent" ("id" TEXT NOT NULL, "action" TEXT NOT NULL, "outcome" TEXT NOT NULL, "subject" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"))`,
      `CREATE UNIQUE INDEX "RateLimitBucket_action_subject_windowStart_key" ON "RateLimitBucket"("action", "subject", "windowStart")`,
      `CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart")`,
      `CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt")`,
      `CREATE INDEX "AuditEvent_outcome_createdAt_idx" ON "AuditEvent"("outcome", "createdAt")`,
    ],
  },
  {
    id: TOP_PROSPECT_MIGRATION_ID,
    checksum: TOP_PROSPECT_MIGRATION_CHECKSUM,
    statements: TOP_PROSPECT_MIGRATION_STATEMENTS,
  },
  {
    id: TOP_PROSPECT_UPGRADE_MIGRATION_ID,
    checksum: TOP_PROSPECT_UPGRADE_MIGRATION_CHECKSUM,
    statements: TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS,
  },
  {
    id: NO_WEBSITE_PROSPECT_MIGRATION_ID,
    checksum: NO_WEBSITE_PROSPECT_MIGRATION_CHECKSUM,
    statements: NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS,
  },
  {
    id: OUTREACH_PACKAGE_MIGRATION_ID,
    checksum: OUTREACH_PACKAGE_MIGRATION_CHECKSUM,
    statements: OUTREACH_PACKAGE_MIGRATION_STATEMENTS,
  },
  {
    id: PUBLIC_PREVIEW_TOKEN_MIGRATION_ID,
    checksum: PUBLIC_PREVIEW_TOKEN_MIGRATION_CHECKSUM,
    statements: PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS,
  },
  {
    id: PROSPECT_CLASSIFICATION_MIGRATION_ID,
    checksum: PROSPECT_CLASSIFICATION_MIGRATION_CHECKSUM,
    statements: PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS,
  },
] as const;

const CREATE_MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`;
const SETUP_LOCK_KEY = 928641307;
const SETUP_LOCK_ATTEMPTS = 5;
const SETUP_LOCK_RETRY_MS = 500;

type SetupTransaction = {
  $executeRawUnsafe(query: string): Promise<unknown>;
  $queryRawUnsafe<T>(query: string): Promise<T>;
};

type SetupDatabase = {
  $transaction<T>(
    callback: (transaction: SetupTransaction) => Promise<T>,
    options: { maxWait: number; timeout: number },
  ): Promise<T>;
  $disconnect(): Promise<void>;
};

export type SetupFailureClassification =
  | "missing_database_url"
  | "connection_refused"
  | "ssl_issue"
  | "permissions_issue"
  | "partial_schema"
  | "lock_failure"
  | "migration_sql_error"
  | "unknown_database_error";

type SetupPhase = "connection" | "lock" | "schema_inspection" | "migration_sql" | "verification";

export class PartialProductionSchemaError extends Error {
  constructor() {
    super("The production database contains only part of the required schema.");
    this.name = "PartialProductionSchemaError";
  }
}

export class ProductionSetupLockUnavailableError extends Error {
  constructor() {
    super("Another production database setup transaction currently holds the setup lock.");
    this.name = "ProductionSetupLockUnavailableError";
  }
}

class ProductionSetupPhaseError extends Error {
  constructor(
    readonly phase: SetupPhase,
    readonly original: unknown,
  ) {
    super(`Production database setup failed during ${phase}.`);
    this.name = "ProductionSetupPhaseError";
  }
}

function errorSignals(error: unknown) {
  const signals: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof Error) signals.push(current.name, current.message);
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      for (const key of ["code", "sqlState", "kind"]) {
        if (typeof record[key] === "string") signals.push(record[key]);
      }
      current = record.cause ?? (current instanceof ProductionSetupPhaseError ? current.original : undefined);
    } else {
      break;
    }
  }
  return signals.join(" ").toLowerCase();
}

export function classifySetupFailure(error: unknown): SetupFailureClassification {
  if (error instanceof PartialProductionSchemaError) return "partial_schema";
  if (error instanceof ProductionSetupLockUnavailableError) return "lock_failure";
  const phase = error instanceof ProductionSetupPhaseError ? error.phase : "connection";
  const signals = errorSignals(error);

  if (
    /\bp1011\b|tls handshake|ssl (error|failure|failed|certificate|connection)|certificate (error|failure|failed|verify)|self signed|secure connection failed/.test(
      signals,
    )
  ) {
    return "ssl_issue";
  }
  if (
    /\bp1001\b|\bp1002\b|\bp1003\b|\bp2024\b|econnrefused|connection refused|can't reach database|cannot reach database|connection closed|connection pool timeout/.test(
      signals,
    )
  ) {
    return "connection_refused";
  }
  if (/\bp1000\b|\bp1010\b|\b42501\b|permission denied|access denied|not authorized|authentication failed/.test(signals)) {
    return "permissions_issue";
  }
  if (phase === "lock") return "lock_failure";
  if (phase === "migration_sql" || phase === "verification" || phase === "schema_inspection") {
    return "migration_sql_error";
  }
  return "unknown_database_error";
}

async function runSetupPhase<T>(phase: SetupPhase, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (
      error instanceof PartialProductionSchemaError
      || error instanceof ProductionSetupLockUnavailableError
      || error instanceof ProductionSetupPhaseError
    ) {
      throw error;
    }
    throw new ProductionSetupPhaseError(phase, error);
  }
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireSetupLock(
  transaction: SetupTransaction,
  pause: (milliseconds: number) => Promise<void> = wait,
) {
  for (let attempt = 1; attempt <= SETUP_LOCK_ATTEMPTS; attempt += 1) {
    const rows = await transaction.$queryRawUnsafe<Array<{ acquired: boolean }>>(
      `SELECT pg_try_advisory_xact_lock(${SETUP_LOCK_KEY}) AS "acquired"`,
    );
    if (rows[0]?.acquired === true) return;
    if (attempt < SETUP_LOCK_ATTEMPTS) await pause(SETUP_LOCK_RETRY_MS);
  }
  throw new ProductionSetupLockUnavailableError();
}

export function setupTokenConfigured(token = process.env.ENGINE_SETUP_TOKEN) {
  return Boolean(token?.trim() && token.trim().length >= 32);
}

export function setupTokenMatches(provided: string | null, expected = process.env.ENGINE_SETUP_TOKEN) {
  if (!provided || !setupTokenConfigured(expected)) return false;
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected!.trim()).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export function productionSetupDatabaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  return environment.DATABASE_URL_UNPOOLED?.trim() || environment.DATABASE_URL?.trim();
}

async function presentRequiredTables(transaction: SetupTransaction) {
  const names = REQUIRED_TABLES.map((table) => `'${table}'`).join(", ");
  const rows = await transaction.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${names})`,
  );
  return new Set(rows.map((row) => row.table_name));
}

function isExistingEngineSchema(existing: Set<string>) {
  return (
    REQUIRED_TABLES.every((table) => ADDITIVE_TOP_PROSPECT_TABLES.has(table) || existing.has(table))
    && [...ADDITIVE_TOP_PROSPECT_TABLES].every((table) => !existing.has(table))
  );
}

function migrationRecord(migration: (typeof MIGRATIONS)[number], index: number) {
  const suffix = String(index + 1).padStart(12, "0");
  return `INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES ('00000000-0000-4000-8000-${suffix}', '${migration.checksum}', now(), '${migration.id}', now(), 1)`;
}

export async function initializeProductionDatabase(
  database: SetupDatabase = new PrismaClient({
    datasourceUrl: productionSetupDatabaseUrl(),
  }) as unknown as SetupDatabase,
) {
  try {
    return await runSetupPhase("connection", () => database.$transaction(
      async (transaction) => {
        await runSetupPhase("lock", () => acquireSetupLock(transaction));
        const existing = await runSetupPhase("schema_inspection", () => presentRequiredTables(transaction));
        if (existing.size === REQUIRED_TABLES.length) return "already_initialized" as const;
        const additiveUpgrade = isExistingEngineSchema(existing);
        if (existing.size > 0 && !additiveUpgrade) throw new PartialProductionSchemaError();

        await runSetupPhase("migration_sql", async () => {
          await transaction.$executeRawUnsafe(CREATE_MIGRATION_TABLE);
          const topProspectMigrationIndex = MIGRATIONS.findIndex((migration) => migration.id === TOP_PROSPECT_MIGRATION_ID);
          const migrations = additiveUpgrade ? MIGRATIONS.slice(topProspectMigrationIndex) : MIGRATIONS;
          for (const migration of migrations) {
            const index = MIGRATIONS.indexOf(migration);
            // These statements are fixed, repository-owned migration DDL. No request data reaches raw SQL.
            for (const statement of migration.statements) {
              await transaction.$executeRawUnsafe(statement);
            }
            await transaction.$executeRawUnsafe(migrationRecord(migration, index));
          }
        });

        await runSetupPhase("verification", async () => {
          const created = await presentRequiredTables(transaction);
          if (created.size !== REQUIRED_TABLES.length) {
            throw new Error("Production database setup verification failed.");
          }
        });
        return additiveUpgrade ? "upgraded" as const : "initialized" as const;
      },
      { maxWait: 5_000, timeout: 60_000 },
    ));
  } finally {
    await database.$disconnect();
  }
}

type Initialize = typeof initializeProductionDatabase;

export async function handleDatabaseSetup(request: Request, initialize: Initialize = initializeProductionDatabase) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ error: "Database setup is available only in Vercel Production." }, { status: 403 });
  }
  if (!setupTokenConfigured()) {
    return NextResponse.json({ error: "Database setup is not configured." }, { status: 503 });
  }
  if (!setupTokenMatches(request.headers.get("x-engine-setup-token"))) {
    return NextResponse.json({ error: "Database setup authorization failed." }, { status: 403 });
  }
  if (!productionSetupDatabaseUrl()) {
    return NextResponse.json(
      { error: "Production database is not configured.", classification: "missing_database_url" },
      { status: 503 },
    );
  }

  try {
    const result = await initialize();
    if (result === "already_initialized") {
      return NextResponse.json(
        { status: result, message: "Required production database tables already exist. No changes were made." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        status: result,
        message: result === "upgraded"
          ? "The existing production schema was upgraded and verified."
          : "Required production database tables were created and verified.",
      },
      { status: 201 },
    );
  } catch (error) {
    const classification = classifySetupFailure(error);
    if (classification === "partial_schema") {
      return NextResponse.json(
        {
          error: "Database setup stopped because a partial schema already exists. No changes were committed.",
          classification,
        },
        { status: 409 },
      );
    }
    if (error instanceof ProductionSetupLockUnavailableError) {
      return NextResponse.json(
        {
          error: "Another database setup attempt is still active. No changes were made.",
          classification,
          retryable: true,
          retryAfterSeconds: 10,
        },
        { status: 409, headers: { "Retry-After": "10" } },
      );
    }
    console.error(`[engine-setup] Production database setup failed: ${classification}`);
    return NextResponse.json(
      { error: "Production database setup failed. No secret details were returned.", classification },
      { status: 503 },
    );
  }
}

export const productionSetupManifest = {
  requiredTables: [...REQUIRED_TABLES],
  migrations: MIGRATIONS.map((migration) => ({ id: migration.id, checksum: migration.checksum })),
};
