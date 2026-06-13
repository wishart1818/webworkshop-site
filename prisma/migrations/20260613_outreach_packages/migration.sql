ALTER TABLE "TopProspectResult"
  ADD COLUMN IF NOT EXISTS "packageStatus" TEXT NOT NULL DEFAULT 'NOT_GENERATED',
  ADD COLUMN IF NOT EXISTS "previewLink" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "packageGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "packageReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "packageApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "packageSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "packageSkippedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TopProspectResult_packageStatus_createdAt_idx"
  ON "TopProspectResult"("packageStatus", "createdAt");
