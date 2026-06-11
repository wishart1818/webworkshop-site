import assert from "node:assert/strict";
import test from "node:test";
import {
  initializeTopProspectSchema,
  TOP_PROSPECT_MIGRATION_ID,
  TOP_PROSPECT_MIGRATION_STATEMENTS,
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
            if (query.includes("pg_advisory_xact_lock")) {
              statements.push(query);
              return [{ pg_advisory_xact_lock: null }] as R;
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
  assert.match(fake.statements[0], /pg_advisory_xact_lock/);
  assert.ok(TOP_PROSPECT_MIGRATION_STATEMENTS.every((statement) => fake.statements.includes(statement)));
  assert.ok(fake.statements.some((statement) => statement.includes(TOP_PROSPECT_MIGRATION_ID)));
  assert.equal(fake.disconnected(), true);
});

test("Top Prospects schema initializer is idempotent and refuses partial schema", async () => {
  const ready = fakeDatabase(["TopProspectJob", "TopProspectResult"]);
  assert.equal(await initializeTopProspectSchema(ready.database), "ready");
  assert.equal(ready.statements.length, 1);

  const partial = fakeDatabase(["TopProspectJob"]);
  await assert.rejects(initializeTopProspectSchema(partial.database), /partially initialized/);
  assert.equal(partial.statements.length, 1);
});
