import assert from "node:assert/strict";
import test from "node:test";
import { classifyTopProspectFailure, topProspectRuntimeChecks } from "../lib/top-prospect-diagnostics";
import { TopProspectSchemaLockUnavailableError } from "../lib/top-prospect-schema";

test("Top Prospects failures are classified without returning exception details", () => {
  assert.equal(classifyTopProspectFailure(new TopProspectSchemaLockUnavailableError()), "schema_lock_busy");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("relation does not exist"), { code: "P2021" })), "missing_tables");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("column does not exist"), { code: "P2022" })), "schema_mismatch");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("Can't reach database server"), { code: "P1001" })), "database_connection");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("permission denied"), { code: "42501" })), "database_permissions");
  assert.equal(classifyTopProspectFailure(new Error("Cannot read properties of undefined (reading 'findFirst')")), "stale_prisma_client");
});

test("Top Prospects runtime checks compare pooled and direct database targets safely", () => {
  assert.deepEqual(
    topProspectRuntimeChecks(true, {
      DATABASE_URL: "postgresql://user:secret@ep-example-pooler.us-east-2.aws.neon.tech/neondb",
      DATABASE_URL_UNPOOLED: "postgresql://user:other-secret@ep-example.us-east-2.aws.neon.tech/neondb",
    }),
    {
      hasDatabaseUrl: true,
      hasUnpooledDatabaseUrl: true,
      prismaModelsPresent: true,
      databaseTargetsMatch: true,
    },
  );
  assert.equal(
    topProspectRuntimeChecks(true, {
      DATABASE_URL: "postgresql://user:secret@ep-one-pooler.example.com/one",
      DATABASE_URL_UNPOOLED: "postgresql://user:secret@ep-two.example.com/two",
    }).databaseTargetsMatch,
    false,
  );
});
