CREATE UNIQUE INDEX "Analysis_prospectId_createdAt_key" ON "Analysis"("prospectId", "createdAt");

CREATE UNIQUE INDEX "OutreachDraft_prospectId_createdAt_key" ON "OutreachDraft"("prospectId", "createdAt");

CREATE UNIQUE INDEX "PreviewConcept_prospectId_createdAt_key" ON "PreviewConcept"("prospectId", "createdAt");
