ALTER TABLE "TopProspectResult"
  ADD COLUMN IF NOT EXISTS "publicPreviewToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TopProspectResult_publicPreviewToken_key"
  ON "TopProspectResult"("publicPreviewToken");
