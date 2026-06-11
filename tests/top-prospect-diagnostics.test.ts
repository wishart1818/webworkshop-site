import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTopProspectFailure,
  classifyTopProspectJobFailure,
  encodeTopProspectJobFailure,
  parseTopProspectJobFailure,
  safeTopProspectJobFailure,
  TopProspectStageError,
  topProspectRuntimeChecks,
} from "../lib/top-prospect-diagnostics";
import { TopProspectSchemaLockUnavailableError } from "../lib/top-prospect-schema";

test("Top Prospects failures are classified without returning exception details", () => {
  assert.equal(classifyTopProspectFailure(new TopProspectSchemaLockUnavailableError()), "schema_lock_busy");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("relation does not exist"), { code: "P2021" })), "missing_tables");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("column does not exist"), { code: "P2022" })), "schema_mismatch");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("Can't reach database server"), { code: "P1001" })), "database_connection");
  assert.equal(classifyTopProspectFailure(Object.assign(new Error("permission denied"), { code: "42501" })), "database_permissions");
  assert.equal(classifyTopProspectFailure(new Error("Cannot read properties of undefined (reading 'findFirst')")), "stale_prisma_client");
});

test("failed Top Prospects jobs use visible safe worker classifications", () => {
  const provider = new TopProspectStageError(
    "discovery_provider_error",
    "The public business discovery provider returned HTTP 504.",
  );
  assert.deepEqual(safeTopProspectJobFailure(provider), {
    classification: "discovery_provider_error",
    reason: "The public business discovery provider returned HTTP 504.",
  });
  assert.equal(classifyTopProspectJobFailure(Object.assign(new Error("Can't reach database"), { code: "P1001" })), "database_error");
  assert.equal(classifyTopProspectJobFailure(new DOMException("Timed out", "TimeoutError")), "worker_timeout");
  assert.equal(classifyTopProspectJobFailure(new Error("private internal detail")), "unexpected_exception");

  const encoded = encodeTopProspectJobFailure("geocoding_error", "The requested city and state could not be resolved.");
  assert.deepEqual(parseTopProspectJobFailure(encoded), {
    classification: "geocoding_error",
    reason: "The requested city and state could not be resolved.",
  });
  assert.deepEqual(parseTopProspectJobFailure("Legacy safe failure"), {
    classification: null,
    reason: "Legacy safe failure",
  });
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
