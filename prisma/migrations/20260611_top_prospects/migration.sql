CREATE TABLE "TopProspectJob" (
  "id" TEXT NOT NULL,
  "tradeCategory" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "radiusKm" INTEGER NOT NULL,
  "businessesToScan" INTEGER NOT NULL DEFAULT 50,
  "finalProspectsWanted" INTEGER NOT NULL DEFAULT 10,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "stage" TEXT NOT NULL DEFAULT 'DISCOVER',
  "discoveredLeads" JSONB,
  "nextLeadIndex" INTEGER NOT NULL DEFAULT 0,
  "scannedCount" INTEGER NOT NULL DEFAULT 0,
  "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "skipSummary" JSONB,
  "errorMessage" TEXT,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TopProspectJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TopProspectResult" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "prospectId" TEXT NOT NULL,
  "rank" INTEGER,
  "selected" BOOLEAN NOT NULL DEFAULT false,
  "opportunityScore" INTEGER NOT NULL,
  "mainWeakness" TEXT NOT NULL,
  "whyMayBuy" TEXT NOT NULL,
  "pitchAngle" TEXT NOT NULL,
  "buildPrompt" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TopProspectResult_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TopProspectJob_status_createdAt_idx" ON "TopProspectJob"("status", "createdAt");
CREATE UNIQUE INDEX "TopProspectResult_jobId_prospectId_key" ON "TopProspectResult"("jobId", "prospectId");
CREATE INDEX "TopProspectResult_jobId_selected_rank_idx" ON "TopProspectResult"("jobId", "selected", "rank");
CREATE INDEX "TopProspectResult_prospectId_createdAt_idx" ON "TopProspectResult"("prospectId", "createdAt");
ALTER TABLE "TopProspectResult" ADD CONSTRAINT "TopProspectResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "TopProspectJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TopProspectResult" ADD CONSTRAINT "TopProspectResult_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
