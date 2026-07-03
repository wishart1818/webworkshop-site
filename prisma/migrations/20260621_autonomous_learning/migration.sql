ALTER TABLE "AutonomousGrowthSettings"
  ADD COLUMN IF NOT EXISTS "styleProfiles" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "OutreachQueueItem"
  ADD COLUMN IF NOT EXISTS "reviewScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "reviewSummary" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "improvementSuggestions" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "detectedIssues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "recommendedNextAction" TEXT NOT NULL DEFAULT 'Needs Human Review',
  ADD COLUMN IF NOT EXISTS "regenerationPlan" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rewritePlan" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "feedbackLabels" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS "AutonomousFeedbackEvent" (
  "id" TEXT NOT NULL,
  "queueItemId" TEXT NOT NULL,
  "topProspectResultId" TEXT,
  "businessName" TEXT NOT NULL,
  "trade" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "feedbackLabel" TEXT NOT NULL,
  "feedbackCategory" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutonomousFeedbackEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutonomousLearningEvent" (
  "id" TEXT NOT NULL,
  "queueItemId" TEXT NOT NULL,
  "topProspectResultId" TEXT,
  "trade" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "leadSource" TEXT NOT NULL,
  "previewStyle" TEXT NOT NULL,
  "subjectLineAngle" TEXT NOT NULL,
  "outreachAngle" TEXT NOT NULL,
  "contactMethod" TEXT NOT NULL,
  "previewQualityScore" INTEGER NOT NULL,
  "reviewScore" INTEGER NOT NULL DEFAULT 0,
  "replyStatus" TEXT,
  "positiveReplyStatus" TEXT,
  "lostReason" TEXT,
  "manualNote" TEXT,
  "feedbackLabels" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutonomousLearningEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutonomousRunReview" (
  "id" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "prospectsScanned" INTEGER NOT NULL DEFAULT 0,
  "prospectsKept" INTEGER NOT NULL DEFAULT 0,
  "prospectsBlocked" INTEGER NOT NULL DEFAULT 0,
  "previewsGenerated" INTEGER NOT NULL DEFAULT 0,
  "previewsPassed" INTEGER NOT NULL DEFAULT 0,
  "previewsFailed" INTEGER NOT NULL DEFAULT 0,
  "commonPreviewIssues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "commonLeadIssues" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "outreachQualityNotes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "recommendedFixes" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "summary" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutonomousRunReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AutonomousFeedbackEvent_queueItemId_createdAt_idx" ON "AutonomousFeedbackEvent"("queueItemId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutonomousFeedbackEvent_trade_city_idx" ON "AutonomousFeedbackEvent"("trade", "city");
CREATE INDEX IF NOT EXISTS "AutonomousFeedbackEvent_feedbackLabel_createdAt_idx" ON "AutonomousFeedbackEvent"("feedbackLabel", "createdAt");
CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_trade_city_idx" ON "AutonomousLearningEvent"("trade", "city");
CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_leadSource_createdAt_idx" ON "AutonomousLearningEvent"("leadSource", "createdAt");
CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_previewStyle_createdAt_idx" ON "AutonomousLearningEvent"("previewStyle", "createdAt");
CREATE INDEX IF NOT EXISTS "AutonomousLearningEvent_createdAt_idx" ON "AutonomousLearningEvent"("createdAt");
CREATE INDEX IF NOT EXISTS "AutonomousRunReview_mode_createdAt_idx" ON "AutonomousRunReview"("mode", "createdAt");
