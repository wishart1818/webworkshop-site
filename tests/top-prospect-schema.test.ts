import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTONOMOUS_GROWTH_MIGRATION_ID,
  AUTONOMOUS_GROWTH_MIGRATION_STATEMENTS,
  initializeTopProspectSchema,
  NO_WEBSITE_PROSPECT_MIGRATION_ID,
  NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS,
  OUTREACH_PACKAGE_MIGRATION_ID,
  OUTREACH_PACKAGE_MIGRATION_STATEMENTS,
  OUTREACH_PREFERENCE_MIGRATION_ID,
  OUTREACH_PREFERENCE_MIGRATION_STATEMENTS,
  PUBLIC_PREVIEW_TOKEN_MIGRATION_ID,
  PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS,
  PROSPECT_CLASSIFICATION_MIGRATION_ID,
  PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS,
  WEBSITE_AVAILABILITY_MIGRATION_ID,
  WEBSITE_AVAILABILITY_MIGRATION_STATEMENTS,
  TopProspectSchemaLockUnavailableError,
  TOP_PROSPECT_MIGRATION_ID,
  TOP_PROSPECT_MIGRATION_STATEMENTS,
  TOP_PROSPECT_UPGRADE_MIGRATION_ID,
  TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS,
} from "../lib/top-prospect-schema";

function fakeDatabase(existingTables: string[], createdTables = ["TopProspectJob", "TopProspectResult"]) {
  const statements: string[] = [];
  let inspection = 0;
  let disconnected = false;
  return {
    database: {
      async $transaction<T>(callback: (transaction: {
        $executeRawUnsafe(query: string): Promise<unknown>;
        $queryRawUnsafe<R>(query: string): Promise<R>;
      }) => Promise<T>) {
        return callback({
          async $executeRawUnsafe(query: string) {
            statements.push(query);
            return 0;
          },
          async $queryRawUnsafe<R>(query: string) {
            if (query.includes("pg_try_advisory_xact_lock")) {
              statements.push(query);
              return [{ acquired: true }] as R;
            }
            inspection += 1;
            const tables = inspection === 1 ? existingTables : createdTables;
            return tables.map((table_name) => ({ table_name })) as R;
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

test("Top Prospects schema initializer creates only its additive tables under a transaction lock", async () => {
  const fake = fakeDatabase([]);
  assert.equal(await initializeTopProspectSchema(fake.database), "initialized");
  assert.match(fake.statements[0], /pg_try_advisory_xact_lock/);
  assert.ok(TOP_PROSPECT_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(OUTREACH_PACKAGE_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(WEBSITE_AVAILABILITY_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(OUTREACH_PREFERENCE_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(AUTONOMOUS_GROWTH_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(fake.statements.some((statement) => statement.includes(TOP_PROSPECT_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(TOP_PROSPECT_UPGRADE_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(NO_WEBSITE_PROSPECT_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(OUTREACH_PACKAGE_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(PUBLIC_PREVIEW_TOKEN_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(PROSPECT_CLASSIFICATION_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(WEBSITE_AVAILABILITY_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(OUTREACH_PREFERENCE_MIGRATION_ID)));
  assert.ok(fake.statements.some((statement) => statement.includes(AUTONOMOUS_GROWTH_MIGRATION_ID)));
  assert.equal(fake.disconnected(), true);
});

test("Top Prospects schema initializer repairs migration bookkeeping and refuses partial schema", async () => {
  const ready = fakeDatabase(["TopProspectJob", "TopProspectResult"]);
  assert.equal(await initializeTopProspectSchema(ready.database), "ready");
  assert.equal(ready.statements.length, 36);
  assert.ok(ready.statements.some((statement) => statement.includes(TOP_PROSPECT_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(TOP_PROSPECT_UPGRADE_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(NO_WEBSITE_PROSPECT_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(OUTREACH_PACKAGE_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(PUBLIC_PREVIEW_TOKEN_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(PROSPECT_CLASSIFICATION_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(WEBSITE_AVAILABILITY_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(OUTREACH_PREFERENCE_MIGRATION_ID)));
  assert.ok(ready.statements.some((statement) => statement.includes(AUTONOMOUS_GROWTH_MIGRATION_ID)));
  assert.ok(TOP_PROSPECT_UPGRADE_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(NO_WEBSITE_PROSPECT_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(OUTREACH_PACKAGE_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(PUBLIC_PREVIEW_TOKEN_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(PROSPECT_CLASSIFICATION_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(WEBSITE_AVAILABILITY_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(OUTREACH_PREFERENCE_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));
  assert.ok(AUTONOMOUS_GROWTH_MIGRATION_STATEMENTS.every((statement) => ready.statements.includes(statement)));

  const partial = fakeDatabase(["TopProspectJob"]);
  await assert.rejects(initializeTopProspectSchema(partial.database), /partially initialized/);
  assert.equal(partial.statements.length, 1);
});

test("Top Prospects schema initializer stops before DDL when its lock remains busy", async () => {
  const fake = fakeDatabase([]);
  fake.database.$transaction = async (callback) => callback({
    async $executeRawUnsafe(query: string) {
      fake.statements.push(query);
      return 0;
    },
    async $queryRawUnsafe<R>(query: string) {
      fake.statements.push(query);
      return [{ acquired: false }] as R;
    },
  });

  await assert.rejects(initializeTopProspectSchema(fake.database), TopProspectSchemaLockUnavailableError);
  assert.equal(fake.statements.length, 5);
});
