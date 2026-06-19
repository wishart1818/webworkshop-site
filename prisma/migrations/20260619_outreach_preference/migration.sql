ALTER TABLE "TopProspectJob"
  ADD COLUMN IF NOT EXISTS "outreachPreference" TEXT NOT NULL DEFAULT 'written_only';

UPDATE "Prospect"
SET "recommendedContactMethod" = 'message_on_social'
WHERE "recommendedContactMethod" = 'needs_manual_contact_research'
  AND "profileUrl" ~* 'instagram\.com'
  AND ("publicEmail" IS NULL OR "publicEmail" = '')
  AND ("contactFormUrl" IS NULL OR "contactFormUrl" = '');

UPDATE "Prospect"
SET "recommendedContactMethod" = 'needs_manual_contact_research'
WHERE "recommendedContactMethod" = 'call_first'
  AND ("publicEmail" IS NULL OR "publicEmail" = '')
  AND ("contactFormUrl" IS NULL OR "contactFormUrl" = '')
  AND ("profileUrl" IS NULL OR "profileUrl" !~* '(facebook|fb|instagram)\.com');
