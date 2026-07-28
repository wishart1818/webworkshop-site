ALTER TABLE "Prospect"
ADD COLUMN IF NOT EXISTS "contactEvidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS "websiteVerification" JSONB,
ADD COLUMN IF NOT EXISTS "fitDisposition" TEXT NOT NULL DEFAULT 'unreviewed';
