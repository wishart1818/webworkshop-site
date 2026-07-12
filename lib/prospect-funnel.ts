import {
  OUTREACH_COPY_VERSION,
  prospectWrittenContactMethodIsUsable,
  type Prospect,
} from "@/lib/prospect-engine";

export const prospectExclusiveBucketKeys = [
  "ready_email",
  "ready_facebook",
  "ready_instagram",
  "ready_contact_form",
  "needs_manual_research",
  "phone_only",
  "website_already_strong",
  "bad_fit",
  "suppressed_do_not_contact",
  "already_contacted",
  "duplicate",
  "other_not_actionable",
] as const;

export const prospectAttributeKeys = [
  "qualified",
  "unsent",
  "high_priority",
  "has_public_email",
  "has_facebook",
  "has_instagram",
  "has_contact_form",
  "has_quote_form",
  "has_phone",
  "has_public_preview",
  "current_outreach_copy_version",
  "needs_copy_refresh",
] as const;

export const prospectFunnelFilterKeys = [...prospectExclusiveBucketKeys, ...prospectAttributeKeys] as const;

export type ProspectExclusiveBucketKey = (typeof prospectExclusiveBucketKeys)[number];
export type ProspectAttributeKey = (typeof prospectAttributeKeys)[number];
export type ProspectFunnelFilterKey = (typeof prospectFunnelFilterKeys)[number];

export const prospectFunnelLabels: Record<ProspectFunnelFilterKey, string> = {
  ready_email: "Ready for Email Review",
  ready_facebook: "Ready for Facebook DM",
  ready_instagram: "Ready for Instagram DM",
  ready_contact_form: "Ready for Contact Form Review",
  needs_manual_research: "Needs Manual Research",
  phone_only: "Phone Only",
  website_already_strong: "Website Already Strong / Low Opportunity",
  bad_fit: "Bad Fit / Blocked",
  suppressed_do_not_contact: "Suppressed / Do Not Contact",
  already_contacted: "Already Contacted",
  duplicate: "Duplicate",
  other_not_actionable: "Other / Not Currently Actionable",
  qualified: "Qualified",
  unsent: "Unsent",
  high_priority: "High Priority",
  has_public_email: "Has Public Email",
  has_facebook: "Has Facebook",
  has_instagram: "Has Instagram",
  has_contact_form: "Has Contact Form",
  has_quote_form: "Has Quote Form",
  has_phone: "Has Phone",
  has_public_preview: "Has Public Preview",
  current_outreach_copy_version: "Current Outreach Copy Version",
  needs_copy_refresh: "Needs Copy Refresh",
};

const contactedStatuses = new Set<Prospect["status"]>(["Contacted", "Interested", "Proposal Sent", "Closed Won", "Closed Lost"]);

function noteText(prospect: Prospect) {
  return [
    ...prospect.notes,
    ...prospect.activities.map((item) => item.label),
    ...prospect.contactDiscoveryNotes,
  ].join(" ");
}

export function prospectIsSuppressed(prospect: Prospect) {
  return prospect.recommendedContactMethod === "do_not_contact"
    || /\b(opted out|do not contact|never contact|unsubscribe|complaint|bounced|suppressed|not interested)\b/i.test(noteText(prospect));
}

export function prospectIsContacted(prospect: Prospect) {
  return contactedStatuses.has(prospect.status);
}

export function prospectIsDuplicate(prospect: Prospect) {
  return prospect.classification === "duplicate_bad_fit" || /\bduplicate\b/i.test(noteText(prospect));
}

export function prospectIsBadFit(prospect: Prospect) {
  return prospect.inactive
    || prospect.classification === "national_large_brand"
    || /\b(bad fit|blocked|national|large brand|institution|supplier|distributor|mismatch)\b/i.test(noteText(prospect));
}

export function prospectHasFacebookPath(prospect: Prospect) {
  return Boolean(prospect.facebookUrl)
    || prospect.recommendedContactMethod === "message_on_facebook"
    || /facebook\.com/i.test(prospect.profileUrl);
}

export function prospectHasInstagramPath(prospect: Prospect) {
  return Boolean(prospect.instagramUrl)
    || (prospect.recommendedContactMethod === "message_on_social" && /instagram\.com/i.test(`${prospect.instagramUrl} ${prospect.profileUrl}`));
}

export function prospectHasLinkedInPath(prospect: Prospect) {
  return Boolean(prospect.linkedinUrl)
    || (prospect.recommendedContactMethod === "message_on_social" && /linkedin\.com/i.test(`${prospect.linkedinUrl} ${prospect.profileUrl}`));
}

export function prospectHasContactFormPath(prospect: Prospect) {
  return Boolean(prospect.contactFormUrl || prospect.contactFormDetected)
    || prospect.recommendedContactMethod === "submit_contact_form";
}

export function prospectHasQuoteFormPath(prospect: Prospect) {
  return Boolean(prospect.quoteFormUrl || prospect.quoteFormDetected);
}

export function prospectHasUsablePublicEmail(prospect: Prospect) {
  return Boolean(prospect.email) && prospect.recommendedContactMethod !== "verify_email_manually";
}

export function prospectHasUsableWrittenContactPath(prospect: Prospect) {
  return prospectHasUsablePublicEmail(prospect)
    || prospectHasFacebookPath(prospect)
    || prospectHasInstagramPath(prospect)
    || prospectHasLinkedInPath(prospect)
    || prospectHasContactFormPath(prospect)
    || prospectHasQuoteFormPath(prospect)
    || prospectWrittenContactMethodIsUsable(prospect);
}

export function prospectIsPhoneOnly(prospect: Prospect) {
  return Boolean(prospect.phone) && !prospectHasUsableWrittenContactPath(prospect);
}

export function prospectIsWebsiteAlreadyStrong(prospect: Prospect) {
  return Boolean(prospect.analysis && prospect.analysis.overallScore >= 85 && prospect.analysis.opportunityRating === "Low")
    || /\balready strong website|website already strong|strong website\b/i.test(noteText(prospect));
}

export function prospectIsQualified(prospect: Prospect) {
  if (prospectIsSuppressed(prospect) || prospectIsDuplicate(prospect) || prospectIsBadFit(prospect)) return false;
  if (prospectIsWebsiteAlreadyStrong(prospect)) return false;
  return prospect.status === "Reviewed"
    || prospect.priorityScore >= 50
    || Boolean(prospect.analysis || prospect.preview || prospect.outreach)
    || prospectHasUsableWrittenContactPath(prospect);
}

export function prospectIsUnsent(prospect: Prospect) {
  return !prospectIsContacted(prospect) && !prospectIsSuppressed(prospect);
}

export function prospectIsQualifiedUnsent(prospect: Prospect) {
  return prospectIsQualified(prospect) && prospectIsUnsent(prospect);
}

export function prospectAttributeMatches(prospect: Prospect, attribute: ProspectAttributeKey) {
  if (attribute === "qualified") return prospectIsQualified(prospect);
  if (attribute === "unsent") return prospectIsUnsent(prospect);
  if (attribute === "high_priority") return prospect.priorityScore >= 70;
  if (attribute === "has_public_email") return prospectHasUsablePublicEmail(prospect);
  if (attribute === "has_facebook") return prospectHasFacebookPath(prospect);
  if (attribute === "has_instagram") return prospectHasInstagramPath(prospect);
  if (attribute === "has_contact_form") return prospectHasContactFormPath(prospect);
  if (attribute === "has_quote_form") return prospectHasQuoteFormPath(prospect);
  if (attribute === "has_phone") return Boolean(prospect.phone);
  if (attribute === "has_public_preview") return Boolean(prospect.preview);
  if (attribute === "current_outreach_copy_version") return prospect.outreach?.outreachCopyVersion === OUTREACH_COPY_VERSION;
  return Boolean(prospect.outreach && prospect.outreach.outreachCopyVersion !== OUTREACH_COPY_VERSION && prospectIsUnsent(prospect));
}

export function prospectCurrentBucket(prospect: Prospect): ProspectExclusiveBucketKey {
  if (prospectIsSuppressed(prospect)) return "suppressed_do_not_contact";
  if (prospectIsContacted(prospect)) return "already_contacted";
  if (prospectIsDuplicate(prospect)) return "duplicate";
  if (prospectIsBadFit(prospect)) return "bad_fit";
  if (prospectIsWebsiteAlreadyStrong(prospect)) return "website_already_strong";
  if (prospectIsQualifiedUnsent(prospect) && prospectHasUsablePublicEmail(prospect)) return "ready_email";
  if (prospectIsQualifiedUnsent(prospect) && prospectHasFacebookPath(prospect)) return "ready_facebook";
  if (prospectIsQualifiedUnsent(prospect) && prospectHasInstagramPath(prospect)) return "ready_instagram";
  if (prospectIsQualifiedUnsent(prospect) && (prospectHasContactFormPath(prospect) || prospectHasQuoteFormPath(prospect))) return "ready_contact_form";
  if (prospectIsPhoneOnly(prospect)) return "phone_only";
  if (!prospectHasUsableWrittenContactPath(prospect)) return "needs_manual_research";
  return "other_not_actionable";
}

export function prospectMatchesFunnelFilter(prospect: Prospect, filter: ProspectFunnelFilterKey | "all") {
  if (filter === "all") return true;
  if ((prospectExclusiveBucketKeys as readonly string[]).includes(filter)) return prospectCurrentBucket(prospect) === filter;
  return prospectAttributeMatches(prospect, filter as ProspectAttributeKey);
}

export function explainProspectBucket(prospect: Prospect) {
  const currentBucket = prospectCurrentBucket(prospect);
  const contactPaths = {
    email: prospectHasUsablePublicEmail(prospect),
    facebook: prospectHasFacebookPath(prospect),
    instagram: prospectHasInstagramPath(prospect),
    linkedin: prospectHasLinkedInPath(prospect),
    contactForm: prospectHasContactFormPath(prospect),
    quoteForm: prospectHasQuoteFormPath(prospect),
    phone: Boolean(prospect.phone),
  };
  const qualification = {
    qualified: prospectIsQualified(prospect),
    unsent: prospectIsUnsent(prospect),
    suppressed: prospectIsSuppressed(prospect),
    contacted: prospectIsContacted(prospect),
    duplicate: prospectIsDuplicate(prospect),
    badFit: prospectIsBadFit(prospect),
  };
  const otherAttributes = prospectAttributeKeys
    .filter((attribute) => prospectAttributeMatches(prospect, attribute))
    .map((attribute) => prospectFunnelLabels[attribute]);

  const reasons: string[] = [];
  if (qualification.qualified) reasons.push("Qualified");
  if (qualification.unsent) reasons.push("Unsent");
  if (contactPaths.email) reasons.push("Public business email found");
  if (contactPaths.facebook) reasons.push("Facebook path found");
  if (contactPaths.instagram) reasons.push("Instagram path found");
  if (contactPaths.linkedin) reasons.push("LinkedIn path found");
  if (contactPaths.contactForm || contactPaths.quoteForm) reasons.push("Contact or quote form found");
  if (contactPaths.phone) reasons.push("Phone number found");
  if (prospect.analysis) reasons.push(`${prospect.analysis.opportunityRating} website opportunity`);
  if (prospect.priorityScore >= 70) reasons.push("High priority");

  const primaryReason =
    currentBucket === "suppressed_do_not_contact" ? "Suppressed, opted out, bounced, complained, or marked do-not-contact."
      : currentBucket === "already_contacted" ? "Already contacted or closed in the pipeline."
        : currentBucket === "duplicate" ? "Existing business already stored or marked duplicate."
          : currentBucket === "bad_fit" ? "Not a clear local service-business fit."
            : currentBucket === "website_already_strong" ? "Website already appears strong enough that outreach is low priority."
              : currentBucket === "ready_email" ? "Qualified, unsent, and a usable public business email was found."
                : currentBucket === "ready_facebook" ? "Qualified, unsent, Facebook found, and no usable public email took priority."
                  : currentBucket === "ready_instagram" ? "Qualified, unsent, Instagram found, and no email or Facebook path took priority."
                    : currentBucket === "ready_contact_form" ? "Qualified, unsent, contact or quote form found, and no higher-priority written path took priority."
                      : currentBucket === "phone_only" ? "Phone exists, but no usable written contact path was found."
                        : currentBucket === "needs_manual_research" ? "No usable written contact path is recorded yet."
                          : "Needs more review before it can enter a clear outreach bucket.";

  const nextStep =
    currentBucket === "ready_email" ? "Review the package, verify the email, then approve manual email only if it is accurate."
      : currentBucket === "ready_facebook" ? "Open Facebook and manually send the link-free first DM if the package looks accurate."
        : currentBucket === "ready_instagram" ? "Open Instagram and manually send the link-free first DM if the package looks accurate."
          : currentBucket === "ready_contact_form" ? "Review the contact-form draft and submit manually only if appropriate."
            : currentBucket === "phone_only" || currentBucket === "needs_manual_research" ? "Find a written contact path or leave it blocked."
              : currentBucket === "website_already_strong" ? "Skip unless you find a specific conversion issue worth a manual note."
                : currentBucket === "already_contacted" ? "Continue from the pipeline history instead of starting new outreach."
                  : currentBucket === "suppressed_do_not_contact" ? "Do not contact."
                    : currentBucket === "duplicate" ? "Use the existing stored business record."
                      : currentBucket === "bad_fit" ? "Leave blocked unless the business fit is manually corrected."
                        : "Review manually and update contact/path details.";

  return {
    currentBucket,
    currentBucketLabel: prospectFunnelLabels[currentBucket],
    contactPaths,
    qualification,
    eligibleFor: {
      email: currentBucket === "ready_email",
      facebook: currentBucket === "ready_facebook",
      instagram: currentBucket === "ready_instagram",
      contactForm: currentBucket === "ready_contact_form",
    },
    reasons: reasons.length ? reasons : [prospectFunnelLabels[currentBucket]],
    blockedBecause: ["ready_email", "ready_facebook", "ready_instagram", "ready_contact_form"].includes(currentBucket)
      ? ["Human review is still required before any outreach."]
      : [primaryReason],
    primaryReason,
    otherAttributes,
    nextStep,
  };
}

export function buildProspectFunnel(prospects: Prospect[]) {
  const exclusiveBuckets = Object.fromEntries(prospectExclusiveBucketKeys.map((key) => [key, 0])) as Record<ProspectExclusiveBucketKey, number>;
  const attributes = Object.fromEntries(prospectAttributeKeys.map((key) => [key, 0])) as Record<ProspectAttributeKey, number>;
  const bucketIds = prospectExclusiveBucketKeys.reduce((result, key) => {
    result[key] = [];
    return result;
  }, {} as Record<ProspectExclusiveBucketKey, string[]>);

  for (const prospect of prospects) {
    const bucket = prospectCurrentBucket(prospect);
    exclusiveBuckets[bucket] += 1;
    bucketIds[bucket].push(prospect.id);
    for (const attribute of prospectAttributeKeys) {
      if (prospectAttributeMatches(prospect, attribute)) attributes[attribute] += 1;
    }
  }

  const exclusiveTotal = Object.values(exclusiveBuckets).reduce((sum, count) => sum + count, 0);
  const difference = prospects.length - exclusiveTotal;
  const actionableTotal = exclusiveBuckets.ready_email
    + exclusiveBuckets.ready_facebook
    + exclusiveBuckets.ready_instagram
    + exclusiveBuckets.ready_contact_form;
  const blockedTotal = exclusiveBuckets.bad_fit
    + exclusiveBuckets.phone_only
    + exclusiveBuckets.needs_manual_research
    + exclusiveBuckets.duplicate
    + exclusiveBuckets.website_already_strong
    + exclusiveBuckets.other_not_actionable;
  const recommendation = actionableTotal > 0
    ? `You have ${prospects.length} total prospects. The exclusive actionable inventory is ${exclusiveBuckets.ready_email} email-review, ${exclusiveBuckets.ready_facebook} Facebook-DM, ${exclusiveBuckets.ready_instagram} Instagram-DM, and ${exclusiveBuckets.ready_contact_form} contact-form-review prospects. Another ${exclusiveBuckets.phone_only} are phone-only, ${exclusiveBuckets.website_already_strong} have strong websites, and ${exclusiveBuckets.bad_fit + exclusiveBuckets.suppressed_do_not_contact} are blocked or suppressed.`
    : `You have ${prospects.length} total prospects, but no exclusive actionable review bucket is ready. ${exclusiveBuckets.needs_manual_research} need manual research and ${exclusiveBuckets.phone_only} are phone-only.`;

  return {
    counts: {
      total: prospects.length,
      ...exclusiveBuckets,
      ...attributes,
    },
    exclusiveBuckets,
    attributes,
    bucketIds,
    currentInventory: {
      totalProspects: prospects.length,
      qualifiedProspects: attributes.qualified,
      qualifiedUnsent: prospects.filter(prospectIsQualifiedUnsent).length,
      emailReady: exclusiveBuckets.ready_email,
      facebookReady: exclusiveBuckets.ready_facebook,
      instagramReady: exclusiveBuckets.ready_instagram,
      contactFormReady: exclusiveBuckets.ready_contact_form,
      needsManualResearch: exclusiveBuckets.needs_manual_research,
      alreadyContacted: exclusiveBuckets.already_contacted,
      blocked: blockedTotal,
      suppressed: exclusiveBuckets.suppressed_do_not_contact,
      highPriority: attributes.high_priority,
    },
    diagnostics: {
      totalProspects: prospects.length,
      exclusiveTotal,
      difference,
      reconciles: difference === 0,
      duplicateIdsWithinBuckets: Object.fromEntries(
        Object.entries(bucketIds).map(([bucket, ids]) => [bucket, ids.filter((id, index) => ids.indexOf(id) !== index)]),
      ) as Record<ProspectExclusiveBucketKey, string[]>,
      removedAtEachStage: {
        duplicate: exclusiveBuckets.duplicate,
        badFit: exclusiveBuckets.bad_fit,
        needsManualResearch: exclusiveBuckets.needs_manual_research,
        strongWebsite: exclusiveBuckets.website_already_strong,
        suppressed: exclusiveBuckets.suppressed_do_not_contact,
        contacted: exclusiveBuckets.already_contacted,
        phoneOnly: exclusiveBuckets.phone_only,
        qualified: attributes.qualified,
        readyForOutreach: actionableTotal,
      },
    },
    recommendation,
  };
}
