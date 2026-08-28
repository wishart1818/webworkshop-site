import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("target search reserves provider attempts atomically under the current worker lease", () => {
  const repository = readFileSync(new URL("../lib/top-prospect-repository.ts", import.meta.url), "utf8");
  assert.match(repository, /reserveTopProspectProviderAttempt/);
  assert.match(repository, /\$transaction[\s\S]*TransactionIsolationLevel\.Serializable/);
  assert.match(repository, /row\.leaseToken\s*!==\s*leaseToken/);
  assert.match(repository, /providerQueriesUsed\s*>=\s*progress\.maxProviderQueries/);
  assert.match(repository, /providerQueriesUsed:\s*progress\.providerQueriesUsed\s*\+\s*1/);
  assert.match(repository, /updateMany[\s\S]*where:\s*\{\s*id:\s*jobId,\s*leaseToken\s*\}/);
  assert.match(repository, /updated\.count\s*!==\s*1/);
});

test("target worker keeps durable analysis batches at three and persists bounded continuation state", () => {
  const worker = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const contracts = readFileSync(new URL("../lib/top-prospects.ts", import.meta.url), "utf8");
  assert.match(worker, /const BATCH_SIZE = 3/);
  assert.match(worker, /reserveTopProspectProviderAttempt\(jobId, leaseToken\)/);
  assert.match(worker, /leads\.slice\(row\.nextLeadIndex,[\s\S]*Math\.min\(BATCH_SIZE, remainingCapacity\)/);
  assert.match(worker, /qualifiedProspectIds:\s*await reconcileTargetQualifiedProspectIds/);
  assert.match(worker, /stopReason === "QUALIFIED_TARGET_REACHED"[\s\S]*qualifiedProspectIds\.length < progress\.qualifiedTarget/);
  assert.match(worker, /lease changed while continuing after target reconciliation/);
  assert.match(worker, /new Set\(\[\.\.\.progress\.qualifiedProspectIds/);
  assert.match(worker, /consecutiveZeroYieldStages[\s\S]*>= 2/);
  assert.match(worker, /"SEARCH_SPACE_EXHAUSTED"/);
  assert.match(worker, /"PROVIDER_BUDGET_REACHED"/);
  assert.match(contracts, /"TARGET_NOT_REACHED_SAFELY"/);
  assert.match(worker, /"QUALIFIED_TARGET_REACHED"/);
  assert.match(worker, /TransactionIsolationLevel\.Serializable/);
  assert.match(worker, /lease changed while advancing target analysis/);
  assert.match(worker, /lease changed while saving target discovery/);
});

test("target search remains discovery-only and fixed-budget jobs retain their legacy branch", () => {
  const worker = readFileSync(new URL("../lib/top-prospect-worker.ts", import.meta.url), "utf8");
  const targetBranch = worker.indexOf("if (targetSearchProgressFromJson(job.discoveredLeads))");
  const legacyBranch = worker.indexOf("const savedLeadCount = savedDiscoveryLeadCount(job.discoveredLeads)");
  assert.ok(targetBranch >= 0 && legacyBranch > targetBranch);
  assert.doesNotMatch(worker, /sendProspectEmail|sendEmailThroughProvider|approveOutreach|APPROVED_TO_SEND/);

  const workspace = readFileSync(new URL("../components/engine/TopProspectsWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /Search until a qualified target or safe limit/);
  assert.match(workspace, /Provider requests:/);
  assert.match(workspace, /0 automatic approvals and 0 automatic outreach/);
  assert.match(workspace, /searchUntilQualified\s*\?\s*\{/);
});

test("target-search persistence uses the existing JSON envelope and adds no schema field", () => {
  const repository = readFileSync(new URL("../lib/top-prospect-repository.ts", import.meta.url), "utf8");
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  assert.match(repository, /discoveredLeads:[\s\S]*targetSearch/);
  assert.doesNotMatch(schema, /targetSearch/i);
});
