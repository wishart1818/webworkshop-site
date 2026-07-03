import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import {
  classifySetupFailure,
  handleDatabaseSetup,
  initializeProductionDatabase,
  PartialProductionSchemaError,
  ProductionSetupLockUnavailableError,
  productionSetupManifest,
  productionSetupDatabaseUrl,
  setupTokenConfigured,
  setupTokenMatches,
} from "../lib/production-database-setup";

const setupToken = "production-setup-token-that-is-long-enough";

function restoreEnvironment(previous: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function normalizeSql(statement: string) {
  return statement
    .replace(/^--.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

function normalizedMigrationStatements() {
  return productionSetupManifest.migrations.flatMap(({ id }) => {
    const sql = readFileSync(path.join(process.cwd(), "prisma", "migrations", id, "migration.sql"), "utf8");
    return sql
      .split(";")
      .map(normalizeSql)
      .filter(Boolean);
  });
}

function fakeDatabase(existingTables: string[] = [], createdTables = productionSetupManifest.requiredTables) {
  const statements: string[] = [];
  let queryCount = 0;
  let disconnected = false;
  return {
    database: {
      async $transaction<T>(
        callback: (transaction: {
          $executeRawUnsafe(query: string): Promise<unknown>;
          $queryRawUnsafe<R>(query: string): Promise<R>;
        }) => Promise<T>,
      ) {
        return callback({
          async $executeRawUnsafe(query: string) {
            statements.push(query);
            return 0;
          },
          async $queryRawUnsafe<R>(query: string) {
            if (query.includes("pg_try_advisory_xact_lock")) return [{ acquired: true }] as R;
            queryCount += 1;
            const names = queryCount === 1 ? existingTables : createdTables;
            return names.map((table_name) => ({ table_name })) as R;
          },
        });
      },
      async $disconnect() {
        disconnected = true;
      },
    },
    statements,
    disconnected: () => disconnected,
  };
}

test("database setup token checks are secret-safe and require a strong temporary token", () => {
  assert.equal(setupTokenConfigured("short"), false);
  assert.equal(setupTokenConfigured(setupToken), true);
  assert.equal(setupTokenMatches(setupToken, setupToken), true);
  assert.equal(setupTokenMatches("wrong-token", setupToken), false);
  assert.equal(setupTokenMatches(null, setupToken), false);
});

test("database setup prefers the direct Neon URL and falls back to DATABASE_URL", () => {
  assert.equal(
    productionSetupDatabaseUrl({
      DATABASE_URL: "postgresql://pooled",
      DATABASE_URL_UNPOOLED: "postgresql://direct",
    }),
    "postgresql://direct",
  );
  assert.equal(productionSetupDatabaseUrl({ DATABASE_URL: "postgresql://pooled" }), "postgresql://pooled");
  assert.equal(productionSetupDatabaseUrl({}), undefined);
});

test("database setup failure classification covers safe production categories", async () => {
  assert.equal(classifySetupFailure(Object.assign(new Error("Can't reach database server"), { code: "P1001" })), "connection_refused");
  assert.equal(classifySetupFailure(Object.assign(new Error("Connection pool timeout"), { code: "P2024" })), "connection_refused");
  assert.equal(classifySetupFailure(Object.assign(new Error("TLS handshake failed"), { code: "P1011" })), "ssl_issue");
  assert.equal(classifySetupFailure(new Error("Query failed for postgresql://host/db?sslmode=require")), "unknown_database_error");
  assert.equal(classifySetupFailure(Object.assign(new Error("permission denied"), { code: "42501" })), "permissions_issue");
  assert.equal(classifySetupFailure(new PartialProductionSchemaError()), "partial_schema");

  const lockFailure = fakeDatabase();
  lockFailure.database.$transaction = async (callback) => callback({
    async $executeRawUnsafe() {
      return 0;
    },
    async $queryRawUnsafe() {
      throw new Error("lock failed with postgresql://secret");
    },
  });
  await assert.rejects(
    initializeProductionDatabase(lockFailure.database),
    (error) => classifySetupFailure(error) === "lock_failure",
  );

  const migrationFailure = fakeDatabase();
  migrationFailure.database.$transaction = async (callback) => callback({
    async $executeRawUnsafe() {
      throw new Error("migration failed with postgresql://secret");
    },
    async $queryRawUnsafe<R>(query: string) {
      if (query.includes("pg_try_advisory_xact_lock")) return [{ acquired: true }] as R;
      return [] as R;
    },
  });
  await assert.rejects(
    initializeProductionDatabase(migrationFailure.database),
    (error) => classifySetupFailure(error) === "migration_sql_error",
  );
});

test("database setup retries a busy transaction lock and proceeds only after acquisition", async () => {
  const fake = fakeDatabase();
  let lockAttempts = 0;
  const originalTransaction = fake.database.$transaction;
  fake.database.$transaction = async (callback, options) => originalTransaction(async (transaction) => callback({
    ...transaction,
    async $queryRawUnsafe<R>(query: string) {
      if (query.includes("pg_try_advisory_xact_lock")) {
        lockAttempts += 1;
        return [{ acquired: lockAttempts === 3 }] as R;
      }
      return transaction.$queryRawUnsafe<R>(query);
    },
  }), options);

  assert.equal(await initializeProductionDatabase(fake.database), "initialized");
  assert.equal(lockAttempts, 3);
  assert.ok(fake.statements.some((statement) => statement.includes('CREATE TABLE "Prospect"')));
});

test("database setup executes no DDL when the transaction lock remains busy", async () => {
  const fake = fakeDatabase();
  let lockAttempts = 0;
  fake.database.$transaction = async (callback) => callback({
    async $executeRawUnsafe(query: string) {
      fake.statements.push(query);
      return 0;
    },
    async $queryRawUnsafe<R>(query: string) {
      if (query.includes("pg_try_advisory_xact_lock")) {
        lockAttempts += 1;
        return [{ acquired: false }] as R;
      }
      return [] as R;
    },
  });

  await assert.rejects(initializeProductionDatabase(fake.database), ProductionSetupLockUnavailableError);
  assert.equal(lockAttempts, 5);
  assert.deepEqual(fake.statements, []);
});

test("database setup returns a safe retry response while another transaction owns the lock", async () => {
  const keys = ["VERCEL_ENV", "ENGINE_SETUP_TOKEN", "DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    VERCEL_ENV: "production",
    ENGINE_SETUP_TOKEN: setupToken,
    DATABASE_URL_UNPOOLED: "postgresql://operator:database-secret@example.com/production",
  });
  try {
    const response = await handleDatabaseSetup(
      new Request("https://www.webworkshop.dev/api/engine/setup-database", {
        method: "POST",
        headers: { "x-engine-setup-token": setupToken },
      }),
      async () => {
        throw new ProductionSetupLockUnavailableError();
      },
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(response.headers.get("retry-after"), "10");
    assert.deepEqual(payload, {
      error: "Another database setup attempt is still active. No changes were made.",
      classification: "lock_failure",
      retryable: true,
      retryAfterSeconds: 10,
    });
    assert.doesNotMatch(JSON.stringify(payload), /database-secret|postgresql:/);
  } finally {
    restoreEnvironment(previous);
  }
});

test("database setup route remains protected by engine Basic authentication", () => {
  const previous = {
    username: process.env.ENGINE_USERNAME,
    password: process.env.ENGINE_PASSWORD,
  };
  process.env.ENGINE_USERNAME = "setup-operator";
  process.env.ENGINE_PASSWORD = "setup-password";
  try {
    const unauthenticated = middleware(new NextRequest("https://example.com/api/engine/setup-database"));
    assert.equal(unauthenticated?.status, 401);
    const token = Buffer.from("setup-operator:setup-password").toString("base64");
    const authenticated = middleware(new NextRequest("https://example.com/api/engine/setup-database", {
      headers: { authorization: `Basic ${token}` },
    }));
    assert.equal(authenticated, null);
  } finally {
    restoreEnvironment({
      ENGINE_USERNAME: previous.username,
      ENGINE_PASSWORD: previous.password,
    });
  }
});

test("database initializer creates and records the complete schema once", async () => {
  const fake = fakeDatabase();
  const result = await initializeProductionDatabase(fake.database);

  assert.equal(result, "initialized");
  assert.equal(fake.disconnected(), true);
  assert.ok(fake.statements.some((statement) => statement.includes('CREATE TABLE "Prospect"')));
  assert.ok(fake.statements.some((statement) => statement.includes('CREATE TABLE "AuditEvent"')));
  assert.deepEqual(
    fake.statements
      .filter((statement) => !statement.includes('"_prisma_migrations"'))
      .map(normalizeSql),
    normalizedMigrationStatements(),
  );
  assert.deepEqual(
    fake.statements
      .filter((statement) => statement.startsWith('INSERT INTO "_prisma_migrations"'))
      .map((statement) => productionSetupManifest.migrations.find(({ id }) => statement.includes(id))?.id),
    productionSetupManifest.migrations.map(({ id }) => id),
  );
});

test("database initializer checksums match the reviewed Prisma migration files", () => {
  for (const migration of productionSetupManifest.migrations) {
    const sql = readFileSync(path.join(process.cwd(), "prisma", "migrations", migration.id, "migration.sql"), "utf8")
      .replaceAll("\r\n", "\n");
    assert.equal(createHash("sha256").update(sql).digest("hex"), migration.checksum);
  }
});

test("database initializer refuses completed and partial schemas without applying DDL", async () => {
  const completed = fakeDatabase(productionSetupManifest.requiredTables);
  assert.equal(await initializeProductionDatabase(completed.database), "already_initialized");
  assert.deepEqual(completed.statements, []);

  const partial = fakeDatabase(["Prospect"]);
  await assert.rejects(initializeProductionDatabase(partial.database), PartialProductionSchemaError);
  assert.deepEqual(partial.statements, []);
  assert.equal(partial.disconnected(), true);
});

test("database initializer safely upgrades the complete legacy engine schema", async () => {
  const legacyTables = productionSetupManifest.requiredTables.filter(
    (table) => !["TopProspectJob", "TopProspectResult", "AutonomousGrowthSettings", "OutreachQueueItem"].includes(table),
  );
  const upgrade = fakeDatabase(legacyTables);

  assert.equal(await initializeProductionDatabase(upgrade.database), "upgraded");
  assert.ok(upgrade.statements.some((statement) => statement.includes('CREATE TABLE "TopProspectJob"')));
  assert.ok(upgrade.statements.some((statement) => statement.includes('CREATE TABLE "TopProspectResult"')));
  assert.ok(upgrade.statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "AutonomousGrowthSettings"')));
  assert.ok(upgrade.statements.some((statement) => statement.includes('CREATE TABLE IF NOT EXISTS "OutreachQueueItem"')));
  assert.ok(!upgrade.statements.some((statement) => statement.includes('CREATE TABLE "Prospect"')));
  assert.equal(
    upgrade.statements.filter((statement) => statement.startsWith('INSERT INTO "_prisma_migrations"')).length,
    9,
  );
});

test("production setup endpoint requires Vercel Production, setup token, and database configuration", async () => {
  const keys = ["VERCEL_ENV", "ENGINE_SETUP_TOKEN", "DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const request = (token?: string) => new Request("https://www.webworkshop.dev/api/engine/setup-database", {
    method: "POST",
    headers: token ? { "x-engine-setup-token": token } : undefined,
  });
  try {
    process.env.VERCEL_ENV = "preview";
    process.env.ENGINE_SETUP_TOKEN = setupToken;
    process.env.DATABASE_URL = "postgresql://secret";
    assert.equal((await handleDatabaseSetup(request(setupToken), async () => "initialized")).status, 403);

    process.env.VERCEL_ENV = "production";
    delete process.env.ENGINE_SETUP_TOKEN;
    assert.equal((await handleDatabaseSetup(request(), async () => "initialized")).status, 503);

    process.env.ENGINE_SETUP_TOKEN = setupToken;
    assert.equal((await handleDatabaseSetup(request("incorrect"), async () => "initialized")).status, 403);

    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_UNPOOLED;
    const missingDatabase = await handleDatabaseSetup(request(setupToken), async () => "initialized");
    assert.equal(missingDatabase.status, 503);
    assert.equal((await missingDatabase.json()).classification, "missing_database_url");
  } finally {
    restoreEnvironment(previous);
  }
});

test("production setup endpoint returns only safe one-time setup results", async () => {
  const keys = ["VERCEL_ENV", "ENGINE_SETUP_TOKEN", "DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.VERCEL_ENV = "production";
  process.env.ENGINE_SETUP_TOKEN = setupToken;
  process.env.DATABASE_URL = "postgresql://operator:database-secret@example.com/production";
  const request = new Request("https://www.webworkshop.dev/api/engine/setup-database", {
    method: "POST",
    headers: { "x-engine-setup-token": setupToken },
  });
  try {
    const initialized = await handleDatabaseSetup(request, async () => "initialized");
    assert.equal(initialized.status, 201);
    assert.doesNotMatch(await initialized.text(), /production-setup-token|database-secret|postgresql:/);

    const completed = await handleDatabaseSetup(request, async () => "already_initialized");
    assert.equal(completed.status, 409);
    assert.doesNotMatch(await completed.text(), /production-setup-token|database-secret|postgresql:/);
  } finally {
    restoreEnvironment(previous);
  }
});

test("production setup endpoint suppresses unexpected database error details", async () => {
  const keys = ["VERCEL_ENV", "ENGINE_SETUP_TOKEN", "DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const previousConsoleError = console.error;
  const logs: string[] = [];
  process.env.VERCEL_ENV = "production";
  process.env.ENGINE_SETUP_TOKEN = setupToken;
  process.env.DATABASE_URL = "postgresql://operator:database-secret@example.com/production";
  console.error = (message) => logs.push(String(message));
  try {
    const response = await handleDatabaseSetup(
      new Request("https://www.webworkshop.dev/api/engine/setup-database", {
        method: "POST",
        headers: { "x-engine-setup-token": setupToken },
      }),
      async () => {
        throw new Error("postgresql://operator:database-secret@example.com/production");
      },
    );
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.classification, "unknown_database_error");
    assert.doesNotMatch(JSON.stringify(payload), /database-secret|postgresql:/);
    assert.doesNotMatch(logs.join(" "), /database-secret|postgresql:/);
  } finally {
    console.error = previousConsoleError;
    restoreEnvironment(previous);
  }
});
