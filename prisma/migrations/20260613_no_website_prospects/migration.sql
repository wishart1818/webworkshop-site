ALTER TABLE "Prospect"
  ALTER COLUMN "website" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "profileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "prospectType" TEXT NOT NULL DEFAULT 'redesign',
  ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "recentReviewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sourceConfidence" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TopProspectJob"
  ADD COLUMN IF NOT EXISTS "prospectType" TEXT NOT NULL DEFAULT 'redesign';

ALTER TABLE "TopProspectResult"
  ADD COLUMN IF NOT EXISTS "prospectType" TEXT NOT NULL DEFAULT 'redesign',
  ADD COLUMN IF NOT EXISTS "onlinePresenceGapScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "businessActivityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "websiteNeedScore" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Prospect_prospectType_priorityScore_idx"
  ON "Prospect"("prospectType", "priorityScore");

CREATE INDEX IF NOT EXISTS "TopProspectJob_prospectType_createdAt_idx"
  ON "TopProspectJob"("prospectType", "createdAt");
