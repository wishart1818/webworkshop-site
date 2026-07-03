CREATE TABLE IF NOT EXISTS "AutonomousGrowthSettings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "mode" TEXT NOT NULL DEFAULT 'off',
  "killSwitch" BOOLEAN NOT NULL DEFAULT true,
  "targetCities" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "targetServiceAreas" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "targetTrades" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "excludedTrades" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "maxProspectsScannedPerDay" INTEGER NOT NULL DEFAULT 25,
  "maxPreviewsGeneratedPerDay" INTEGER NOT NULL DEFAULT 10,
  "maxEmailsQueuedPerDay" INTEGER NOT NULL DEFAULT 5,
  "maxEmailsSentPerDay" INTEGER NOT NULL DEFAULT 5,
  "emailCooldownMinutes" INTEGER NOT NULL DEFAULT 7,
  "followUpsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AutonomousGrowthSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OutreachQueueItem" (
  "id" TEXT NOT NULL,
  "prospectId" TEXT,
  "topProspectResultId" TEXT,
  "businessName" TEXT NOT NULL,
  "trade" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "website" TEXT,
  "email" TEXT,
  "contactSource" TEXT NOT NULL,
  "contactConfidence" INTEGER NOT NULL DEFAULT 0,
  "previewLink" TEXT NOT NULL,
  "previewQualityScore" INTEGER NOT NULL DEFAULT 0,
  "subjectLine" TEXT NOT NULL,
  "emailBody" TEXT NOT NULL,
  "dmScript" TEXT NOT NULL,
  "loomTalkingPoints" TEXT NOT NULL,
  "eligibilityReason" TEXT NOT NULL,
  "blockedReason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'Draft',
  "sourceProvider" TEXT,
  "queuedDate" TIMESTAMP(3),
  "sentDate" TIMESTAMP(3),
  "followUpDate" TIMESTAMP(3),
  "replyStatus" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutreachQueueItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OutreachQueueItem_topProspectResultId_key" ON "OutreachQueueItem"("topProspectResultId");
CREATE INDEX IF NOT EXISTS "OutreachQueueItem_status_createdAt_idx" ON "OutreachQueueItem"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "OutreachQueueItem_trade_city_idx" ON "OutreachQueueItem"("trade", "city");
CREATE INDEX IF NOT EXISTS "OutreachQueueItem_prospectId_idx" ON "OutreachQueueItem"("prospectId");
