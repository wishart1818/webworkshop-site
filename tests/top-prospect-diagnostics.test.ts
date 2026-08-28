import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTopProspectFailure,
  classifyTopProspectJobFailure,
  encodeTopProspectJobFailure,
  parseTopProspectJobFailure,
  safeTopProspectJobFailure,
  topProspectWorkerInternalFailure,
  topProspectWorkerOperationError,
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

test("candidate failures retain server-only checkpoint context without changing the safe UI failure", () => {
  const internal = new Error(
    "Invalid provider payload from https://provider.example/path?api_key=secret for owner@example.com\nsecond line",
  );
  const wrapped = topProspectWorkerOperationError(internal, {
    savedLeadIndex: 49,
    candidateIndex: 50,
    businessName: "Safe Example Cleaning",
    phase: "written_contact_enrichment",
  });

  assert.deepEqual(safeTopProspectJobFailure(wrapped), {
    classification: "unexpected_exception",
    reason: "The Top Prospects worker stopped because of an unexpected server error.",
  });
  assert.deepEqual(topProspectWorkerInternalFailure(wrapped), {
    savedLeadIndex: 49,
    candidateIndex: 50,
    businessName: "Safe Example Cleaning",
    phase: "written_contact_enrichment",
    errorName: "Error",
    errorMessage: "Invalid provider payload from [url] for [email] second line",
  });
});

test("worker diagnostic wrapping preserves the first operation boundary", () => {
  const candidate = topProspectWorkerOperationError(new Error("candidate failure"), {
    savedLeadIndex: 49,
    candidateIndex: 51,
    businessName: "Third Candidate",
    phase: "result_persistence",
  });
  const outer = topProspectWorkerOperationError(candidate, {
    savedLeadIndex: 49,
    phase: "lease_write",
  });
  assert.equal(outer, candidate);
  assert.equal(topProspectWorkerInternalFailure(outer).candidateIndex, 51);
  assert.equal(topProspectWorkerInternalFailure(outer).phase, "result_persistence");
});

test("diagnostic context does not weaken established safe failure classifications", () => {
  const provider = topProspectWorkerOperationError(
    new TopProspectStageError("discovery_provider_error", "The provider failed safely."),
    { savedLeadIndex: 49, candidateIndex: 49, phase: "website_verification" },
  );
  assert.equal(classifyTopProspectJobFailure(provider), "discovery_provider_error");
  assert.equal(safeTopProspectJobFailure(provider).reason, "The provider failed safely.");
});
