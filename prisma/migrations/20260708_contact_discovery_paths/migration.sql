ALTER TABLE "Prospect"
  ADD COLUMN IF NOT EXISTS "contactPageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "quoteFormUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "contactFormDetected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "quoteFormDetected" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "facebookUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "instagramUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "linkedinUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "xUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "youtubeUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "contactPersonName" TEXT,
  ADD COLUMN IF NOT EXISTS "contactConfidence" TEXT NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS "bestManualContactMethod" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "contactDiscoveryNotes" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "Prospect"
SET "contactFormDetected" = true
WHERE "contactFormUrl" IS NOT NULL AND "contactFormUrl" <> '';

UPDATE "Prospect"
SET "bestManualContactMethod" = CASE
  WHEN "publicEmail" IS NOT NULL AND "publicEmail" <> '' THEN 'email'
  WHEN "contactFormUrl" IS NOT NULL AND "contactFormUrl" <> '' THEN 'contact_form'
  WHEN "profileUrl" ~* '(facebook|fb)\.com' THEN 'facebook'
  WHEN "profileUrl" ~* 'instagram\.com' THEN 'instagram'
  WHEN "phone" IS NOT NULL AND "phone" <> '' THEN 'phone_only'
  ELSE 'unknown'
END
WHERE "bestManualContactMethod" = 'unknown';
