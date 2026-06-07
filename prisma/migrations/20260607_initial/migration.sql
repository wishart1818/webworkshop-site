-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('NEW', 'REVIEWED', 'CONTACTED', 'INTERESTED', 'PROPOSAL_SENT', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "phone" TEXT,
    "publicEmail" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "tradeCategory" TEXT NOT NULL,
    "serviceArea" TEXT,
    "sizeIndicator" TEXT,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "status" "ProspectStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "opportunityRating" TEXT NOT NULL,
    "categoryScores" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "redesignDirection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDraft" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "subjectLines" JSONB NOT NULL,
    "conciseBody" TEXT NOT NULL,
    "detailedBody" TEXT NOT NULL,
    "followUps" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewConcept" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewConcept_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "fromStatus" "ProspectStatus",
    "toStatus" "ProspectStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_website_key" ON "Prospect"("website");

-- CreateIndex
CREATE INDEX "Prospect_status_priorityScore_idx" ON "Prospect"("status", "priorityScore");

-- CreateIndex
CREATE INDEX "Prospect_tradeCategory_state_city_idx" ON "Prospect"("tradeCategory", "state", "city");

-- CreateIndex
CREATE INDEX "Analysis_prospectId_createdAt_idx" ON "Analysis"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachDraft_prospectId_createdAt_idx" ON "OutreachDraft"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "PreviewConcept_prospectId_createdAt_idx" ON "PreviewConcept"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "Note_prospectId_createdAt_idx" ON "Note"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_prospectId_createdAt_idx" ON "Activity"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "StatusHistory_prospectId_createdAt_idx" ON "StatusHistory"("prospectId", "createdAt");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDraft" ADD CONSTRAINT "OutreachDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewConcept" ADD CONSTRAINT "PreviewConcept_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
