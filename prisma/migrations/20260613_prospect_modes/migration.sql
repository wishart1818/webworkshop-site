ALTER TABLE "TopProspectJob"
  ADD COLUMN IF NOT EXISTS "prospectMode" TEXT NOT NULL DEFAULT 'strict',
  ADD COLUMN IF NOT EXISTS "workflowType" TEXT NOT NULL DEFAULT 'search';

ALTER TABLE "TopProspectResult"
  ADD COLUMN IF NOT EXISTS "websiteQualityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "revenueOpportunityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "contactabilityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "localMarketCompetitivenessScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiReplacementConfidenceScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "weightedSalesScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "TopProspectResult_jobId_weightedSalesScore_idx"
  ON "TopProspectResult"("jobId", "weightedSalesScore");
