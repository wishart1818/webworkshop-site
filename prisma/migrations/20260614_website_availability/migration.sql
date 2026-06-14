ALTER TABLE "Prospect"
  ADD COLUMN IF NOT EXISTS "websiteStatus" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "websiteStatusDetail" TEXT,
  ADD COLUMN IF NOT EXISTS "websiteAnalysisAttemptedAt" TIMESTAMP(3);

UPDATE "Prospect"
SET "websiteStatus" = 'no_owned_website',
    "prospectType" = 'no_website_social_only'
WHERE ("website" IS NULL OR "website" = '')
  AND ("websiteStatus" = 'unknown' OR "prospectType" = 'redesign');
