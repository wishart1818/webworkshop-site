import { createHash, timingSafeEqual } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

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
] as const;

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
] as const;

const CREATE_MIGRATION_TABLE = `CREATE TABLE IF NOT EXISTS "_prisma_migrations" ("id" VARCHAR(36) PRIMARY KEY NOT NULL, "checksum" VARCHAR(64) NOT NULL, "finished_at" TIMESTAMPTZ, "migration_name" VARCHAR(255) NOT NULL, "logs" TEXT, "rolled_back_at" TIMESTAMPTZ, "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "applied_steps_count" INTEGER NOT NULL DEFAULT 0)`;

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
    if (error instanceof PartialProductionSchemaError || error instanceof ProductionSetupPhaseError) throw error;
    throw new ProductionSetupPhaseError(phase, error);
  }
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
        await runSetupPhase("lock", () => transaction.$queryRawUnsafe("SELECT pg_advisory_xact_lock(928641307)"));
        const existing = await runSetupPhase("schema_inspection", () => presentRequiredTables(transaction));
        if (existing.size === REQUIRED_TABLES.length) return "already_initialized" as const;
        if (existing.size > 0) throw new PartialProductionSchemaError();

        await runSetupPhase("migration_sql", async () => {
          await transaction.$executeRawUnsafe(CREATE_MIGRATION_TABLE);
          for (const [index, migration] of MIGRATIONS.entries()) {
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
        return "initialized" as const;
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
      { status: result, message: "Required production database tables were created and verified." },
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
