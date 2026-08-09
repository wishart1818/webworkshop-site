CREATE TABLE IF NOT EXISTS "WebsiteRepairAuditRun" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "accessTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUDITING',
    "candidateIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "reviewedItems" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "nextIndex" INTEGER NOT NULL DEFAULT 0,
    "totalCandidates" INTEGER NOT NULL DEFAULT 0,
    "inspectedCount" INTEGER NOT NULL DEFAULT 0,
    "safeExclusionCount" INTEGER NOT NULL DEFAULT 0,
    "manualReviewCount" INTEGER NOT NULL DEFAULT 0,
    "protectedCount" INTEGER NOT NULL DEFAULT 0,
    "manualReasonCounts" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "applyStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "applyNextIndex" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "remainingCandidatesBefore" INTEGER NOT NULL DEFAULT 0,
    "remainingCandidatesAfter" INTEGER,
    "applyStartedAt" TIMESTAMP(3),
    "applyCompletedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteRepairAuditRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WebsiteRepairAuditRun_status_createdAt_idx" ON "WebsiteRepairAuditRun"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WebsiteRepairAuditRun_expiresAt_idx" ON "WebsiteRepairAuditRun"("expiresAt");
